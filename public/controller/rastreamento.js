app.controller('rastreamentoCtrl', function ($scope, $timeout, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = {};
    $scope._fluxos = [];
    $scope._fluxoId = '';
    $scope._linhas = [];
    $scope._carregando = false;
    $scope._erro = '';
    $scope._dataHoraTopo = '';
    $scope._ultimaAtualizacao = '';
    $scope._intervaloSeg = 5;
    $scope._janelaHoras = 2;
    $scope._pausado = false;

    var timerPoll = null;
    var timerRelogio = null;
    var JANELA_MS = 2 * 60 * 60 * 1000;
    var LS_INTERVALO = 'rastreamento_intervalo_seg';

    function podeAcessar(colaborador) {
        if (!colaborador) return false;
        if (String(colaborador.perfil || '').toLowerCase() === 'admin') return true;
        var mods = Array.isArray(colaborador.acesso_modulos) ? colaborador.acesso_modulos : [];
        return mods.some(function (m) {
            var v = String(m || '').toLowerCase();
            return v === 'trackingfluxo' || v === 'tracking' || v === 'rastreamento';
        });
    }

    function strId(v) {
        if (v == null) return '';
        if (typeof v === 'object' && v._id) return String(v._id).trim();
        return String(v).trim();
    }

    function nivelValor(reg, campo) {
        return strId(reg && reg[campo]);
    }

    function parseData(v) {
        if (!v && v !== 0) return null;
        var d = v instanceof Date ? v : new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }

    function registroNaEtapa(reg, etapa) {
        if (!reg || !etapa) return false;
        var niveis = ['id_nivel_loc1', 'id_nivel_loc2', 'id_nivel_loc3', 'id_nivel_loc4'];
        var definiu = false;
        for (var i = 0; i < niveis.length; i++) {
            var esperado = strId(etapa[niveis[i]]);
            if (!esperado) continue;
            definiu = true;
            if (nivelValor(reg, niveis[i]) !== esperado) return false;
        }
        return definiu;
    }

    function ordenarEtapas(fluxo) {
        var etapas = Array.isArray(fluxo.etapas) ? fluxo.etapas.slice() : [];
        etapas.sort(function (a, b) {
            var na = Number(a.etapa_numero) || 0;
            var nb = Number(b.etapa_numero) || 0;
            return na - nb || String(a.etapa_descricao || '').localeCompare(String(b.etapa_descricao || ''));
        });
        etapas.forEach(function (e, idx) {
            if (!e.etapa_numero) e.etapa_numero = idx + 1;
        });
        return etapas;
    }

    function fluxoAtivo(f) {
        if (!f) return false;
        var a = f.ativo;
        return a === 1 || a === '1' || a === true;
    }

    function idCategoriaRegistro(reg) {
        if (!reg) return '';
        return strId(reg.id_categoria) || strId(reg.id_item && reg.id_item.id_categoria);
    }

    function fluxoParaTag(fluxos, reg) {
        var cat = idCategoriaRegistro(reg);
        var candidatos = (fluxos || []).filter(fluxoAtivo);
        if ($scope._fluxoId) {
            var escolhido = candidatos.find(function (f) { return String(f._id) === String($scope._fluxoId); });
            if (escolhido) return escolhido;
        }
        for (var i = 0; i < candidatos.length; i++) {
            var fc = strId(candidatos[i].id_categoria);
            if (!fc) return candidatos[i];
            if (fc === cat) return candidatos[i];
        }
        return candidatos.length === 1 ? candidatos[0] : null;
    }

    function minutosEntre(de, ate) {
        if (!de || !ate) return null;
        var a = parseData(de);
        var b = parseData(ate);
        if (!a || !b) return null;
        return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
    }

    /** Instantâneo em que o item deixou a etapa (fim da permanência na leitura). */
    function instanteFimNaEtapa(reg) {
        if (!reg) return null;
        var dp = parseData(reg.data_permanecia);
        var dr = parseData(reg.data_registro);
        if (dp && dr && dp.getTime() > dr.getTime()) return reg.data_permanecia;
        if (dp && !dr) return reg.data_permanecia;
        return reg.data_registro;
    }

    function formatHora(d) {
        var dt = parseData(d);
        return dt ? moment(dt).format('HH:mm') : '—';
    }

    function fmtMinutos(min) {
        if (min == null || min === '') return '—';
        var n = Math.round(Number(min));
        if (!Number.isFinite(n)) return '—';
        return n + ' min';
    }

  /** Índice da etapa do fluxo contemplada pelo registro (-1 se nenhuma). */
    function indiceEtapaRegistro(reg, etapas) {
        if (!reg || !etapas || !etapas.length) return -1;
        for (var e = 0; e < etapas.length; e++) {
            if (registroNaEtapa(reg, etapas[e])) return e;
        }
        return -1;
    }

    function fatiaTemEtapaFluxo(fatia, etapas) {
        return (fatia || []).some(function (r) {
            return indiceEtapaRegistro(r, etapas) >= 0;
        });
    }

    /**
     * Divide leituras da tag em ciclos do fluxo.
     * Novo ciclo quando há leitura em etapa anterior à maior já alcançada no ciclo atual.
     */
    function fatiarCiclos(regs, etapas) {
        if (!regs || !regs.length || !etapas || !etapas.length) return [];

        var segmentos = [];
        var inicio = 0;
        var pico = -1;

        for (var i = 0; i < regs.length; i++) {
            var idx = indiceEtapaRegistro(regs[i], etapas);

            if (idx >= 0 && pico >= 0 && idx < pico) {
                var anteriores = regs.slice(inicio, i);
                if (fatiaTemEtapaFluxo(anteriores, etapas)) segmentos.push(anteriores);
                inicio = i;
                pico = idx;
                continue;
            }

            if (idx > pico) pico = idx;
        }

        var ultimos = regs.slice(inicio);
        if (fatiaTemEtapaFluxo(ultimos, etapas)) segmentos.push(ultimos);

        return segmentos;
    }

    function tituloTag(regs) {
        var reg = regs[regs.length - 1] || regs[0];
        var item = reg && reg.id_item;
        if (item && typeof item === 'object') {
            if (item.descricao) return item.descricao;
            if (item.inf_compl1) return item.inf_compl1;
        }
        var tag = reg && reg.tag ? String(reg.tag) : '';
        if (tag.length > 8) return 'Tag …' + tag.slice(-6);
        return tag || 'Sem tag';
    }

    function indiceUltimaEtapa(regs, etapas) {
        var ultimo = -1;
        for (var i = regs.length - 1; i >= 0; i--) {
            for (var e = 0; e < etapas.length; e++) {
                if (registroNaEtapa(regs[i], etapas[e])) return e;
            }
        }
        return ultimo;
    }

    function analisarTag(regs, fluxo, agora, numeroCiclo) {
        var etapas = ordenarEtapas(fluxo);
        if (!etapas.length) return null;

        var ciclo = Math.max(1, Number(numeroCiclo) || 1);
        var ultimaLeitura = parseData(regs[regs.length - 1] && regs[regs.length - 1].data_registro);
        var etapaAtualIdx = indiceUltimaEtapa(regs, etapas);

        var primeiraComMatch = -1;
        for (var pe = 0; pe < etapas.length; pe++) {
            for (var ri = 0; ri < regs.length; ri++) {
                if (registroNaEtapa(regs[ri], etapas[pe])) {
                    primeiraComMatch = pe;
                    break;
                }
            }
            if (primeiraComMatch >= 0) break;
        }
        if (primeiraComMatch < 0) return null;

        var visitas = [];
        var cursor = 0;
        var temDesvio = primeiraComMatch > 0;
        var alertaGeral = false;

        function criarBase(idx, etapa) {
            return {
                numero: etapa.etapa_numero || (idx + 1),
                nome: etapa.etapa_descricao || ('Etapa ' + (idx + 1)),
                status: 'pendente',
                chegada: null,
                chegadaLabel: '—',
                permanencia: null,
                permanenciaLabel: '—',
                maxPermanencia: Number(etapa.tempo_permanencia_maximo) || 0,
                minPermanencia: Number(etapa.tempo_permanencia_minimo) || 0,
                alertaPermanencia: false,
                transitSeguinte: null,
                transitLabel: '—',
                maxTransit: 0,
                alertaTransit: false,
                direto: false,
                badge: '',
                fimNaEtapa: null
            };
        }

        for (var e = 0; e < etapas.length; e++) {
            var etapa = etapas[e];
            var cell = criarBase(e, etapa);

            if (e < primeiraComMatch) {
                cell.status = 'pulada';
                cell.badge = 'Etapa pulada';
                visitas.push(cell);
                continue;
            }

            var startIdx = -1;
            for (var j = cursor; j < regs.length; j++) {
                if (registroNaEtapa(regs[j], etapa)) {
                    startIdx = j;
                    break;
                }
            }

            if (startIdx < 0) {
                visitas.push(cell);
                continue;
            }

            var endIdx = startIdx;
            for (var k = startIdx + 1; k < regs.length; k++) {
                if (registroNaEtapa(regs[k], etapa)) endIdx = k;
            }

            cell.chegada = regs[startIdx].data_registro;
            cell.chegadaLabel = formatHora(cell.chegada);
            cell.fimNaEtapa = instanteFimNaEtapa(regs[endIdx]);

            var saida = null;
            for (var s = endIdx + 1; s < regs.length; s++) {
                if (!registroNaEtapa(regs[s], etapa)) {
                    saida = regs[s].data_registro;
                    cursor = s;
                    break;
                }
            }
            if (!saida && e === etapaAtualIdx) {
                saida = agora;
                cell.status = 'aqui';
                cell.badge = 'Aqui agora';
                cursor = endIdx + 1;
            } else if (!saida && endIdx === regs.length - 1) {
                saida = agora;
                cell.status = 'aqui';
                cell.badge = 'Aqui agora';
                cursor = regs.length;
            } else if (saida) {
                if (e < etapaAtualIdx || (e === etapaAtualIdx && saida !== agora)) {
                    cell.status = 'ok';
                }
                cursor = Math.max(cursor, endIdx + 1);
            }

            cell.permanencia = minutosEntre(cell.chegada, saida || agora);
            cell.permanenciaLabel = fmtMinutos(cell.permanencia);

            if (cell.maxPermanencia > 0 && cell.permanencia != null && cell.permanencia > cell.maxPermanencia) {
                cell.alertaPermanencia = true;
                cell.status = cell.status === 'aqui' ? 'alerta' : (cell.status === 'ok' ? 'alerta' : cell.status);
                alertaGeral = true;
            }

            visitas.push(cell);
        }

        for (var t = 0; t < visitas.length - 1; t++) {
            var prox = visitas[t + 1];
            if (!prox.chegada || prox.status === 'pendente') continue;

            var origemIdx = t;
            while (origemIdx >= 0 && (visitas[origemIdx].status === 'pulada' || visitas[origemIdx].status === 'pendente' || !visitas[origemIdx].chegada)) {
                origemIdx--;
            }
            if (origemIdx < 0) continue;

            var origem = visitas[origemIdx];
            var etapaOrigem = etapas[origemIdx];
            origem.maxTransit = Number(etapaOrigem.tempo_descolamento_proxima_etapa) || 0;

            var pulou = (t + 1 - origemIdx) > 1;
            var fimOrigem = origem.fimNaEtapa || origem.chegada;

            origem.transitSeguinte = minutosEntre(fimOrigem, prox.chegada);
            origem.transitLabel = fmtMinutos(origem.transitSeguinte) + (pulou ? ' · direto' : '');
            if (pulou) prox.direto = true;

            if (origem.maxTransit > 0 && origem.transitSeguinte != null && origem.transitSeguinte > origem.maxTransit) {
                origem.alertaTransit = true;
                alertaGeral = true;
            }
        }

        var visitadas = visitas.filter(function (v) {
            return v.status !== 'pendente' && v.status !== 'pulada';
        }).length;
        var puladas = visitas.filter(function (v) { return v.status === 'pulada'; }).length;
        var concluiuUltima = visitas.length && visitas[visitas.length - 1].status === 'ok';
        var pct = etapas.length ? Math.round((visitadas / etapas.length) * 100) : 0;

        var encerrado = concluiuUltima || (etapaAtualIdx === etapas.length - 1 && visitas[etapas.length - 1].status === 'ok');
        var statusGeral = '';
        if (encerrado && (temDesvio || alertaGeral)) statusGeral = 'Encerrado com desvio';
        else if (encerrado) statusGeral = 'Encerrado';
        else if (alertaGeral) statusGeral = 'Em alerta';

        var t0 = parseData(regs[0].data_registro);
        var chaveCiclo = String(regs[0].tag) + '-c' + ciclo + '-' + (t0 ? t0.getTime() : regs[0]._id || '');

        return {
            tag: regs[0].tag,
            chave: chaveCiclo,
            titulo: tituloTag(regs),
            ciclo: ciclo,
            fluxoDescricao: fluxo.descricao || 'Fluxo',
            etapas: visitas,
            totalEtapas: etapas.length,
            visitadas: visitadas,
            pct: pct,
            ultimaLeitura: ultimaLeitura,
            ultimaLeituraLabel: formatHora(ultimaLeitura),
            statusGeral: statusGeral,
            etapaAtualIdx: etapaAtualIdx,
            temDesvio: temDesvio || alertaGeral
        };
    }

    function agruparPorTag(regs) {
        var map = {};
        (regs || []).forEach(function (r) {
            var tag = String(r.tag || '').trim();
            if (!tag || tag.toUpperCase() === 'SENSOR') return;
            if (!map[tag]) map[tag] = [];
            map[tag].push(r);
        });
        Object.keys(map).forEach(function (tag) {
            map[tag].sort(function (a, b) {
                return (parseData(a.data_registro) || 0) - (parseData(b.data_registro) || 0);
            });
        });
        return map;
    }

    function montarLinhas(regs, fluxos) {
        var agora = new Date();
        var porTag = agruparPorTag(regs);
        var linhas = [];
        Object.keys(porTag).forEach(function (tag) {
            var lista = porTag[tag];
            var fluxo = fluxoParaTag(fluxos, lista[lista.length - 1]);
            if (!fluxo) return;

            var etapasFluxo = ordenarEtapas(fluxo);
            var fatias = fatiarCiclos(lista, etapasFluxo);
            if (!fatias.length) {
                var linhaUnica = analisarTag(lista, fluxo, agora, 1);
                if (linhaUnica) linhas.push(linhaUnica);
                return;
            }

            fatias.forEach(function (fatia, idx) {
                var linha = analisarTag(fatia, fluxo, agora, idx + 1);
                if (linha) linhas.push(linha);
            });
        });
        linhas.sort(function (a, b) {
            var ta = a.ultimaLeitura ? a.ultimaLeitura.getTime() : 0;
            var tb = b.ultimaLeitura ? b.ultimaLeitura.getTime() : 0;
            return tb - ta;
        });
        return linhas;
    }

    $scope.formatHora = formatHora;

    $scope.classeEtapaNode = function (etapa) {
        var st = etapa && etapa.status;
        if (st === 'aqui') return 'is-aqui';
        if (st === 'ok') return 'is-ok';
        if (st === 'alerta') return 'is-alerta';
        if (st === 'pulada') return 'is-pulada';
        return 'is-pendente';
    };

    $scope.classeTransit = function (etapa) {
        if (etapa && etapa.alertaTransit) return 'is-alerta';
        if (etapa && etapa.transitSeguinte != null) return 'is-ok';
        return '';
    };

    $scope.estiloGridEtapas = function (linha) {
        var n = linha && linha.etapas ? linha.etapas.length : 0;
        if (!n) return {};
        return { gridTemplateColumns: 'repeat(' + n + ', minmax(0, 1fr))' };
    };

    $scope.classeLinhaTransit = function (et, linha, idx) {
        if (et && et.alertaTransit) return 'is-alerta';
        if (et && et.transitSeguinte != null) return 'is-ok';
        var prox = linha && linha.etapas && linha.etapas[idx + 1];
        if (prox && prox.status === 'pendente' && !et.transitSeguinte) return 'is-pendente';
        return '';
    };

    function atualizarRelogio() {
        $scope._dataHoraTopo = moment().format('dddd, D [de] MMMM · HH:mm:ss');
    }

    function agendarPoll() {
        if (timerPoll) {
            $timeout.cancel(timerPoll);
            timerPoll = null;
        }
        if ($scope._pausado) return;
        var ms = Math.max(2, Number($scope._intervaloSeg) || 5) * 1000;
        timerPoll = $timeout(function () {
            $scope.onAtualizar().finally(function () {
                agendarPoll();
            });
        }, ms);
    }

    $scope.onMudarIntervalo = function () {
        var v = Math.max(2, Math.min(120, Number($scope._intervaloSeg) || 5));
        $scope._intervaloSeg = v;
        try {
            localStorage.setItem(LS_INTERVALO, String(v));
        } catch (e) { /* ignore */ }
        agendarPoll();
    };

    $scope.onTogglePausa = function () {
        $scope._pausado = !$scope._pausado;
        if ($scope._pausado && timerPoll) {
            $timeout.cancel(timerPoll);
            timerPoll = null;
        } else if (!$scope._pausado) {
            $scope.onAtualizar();
            agendarPoll();
        }
    };

    $scope.onMudarFluxo = function () {
        $scope.onAtualizar();
    };

    $scope.onAtualizar = function () {
        if ($scope._carregando) {
            return Promise.resolve();
        }
        var idConta = $scope._regConta && $scope._regConta._id;
        if (!idConta) return Promise.resolve();

        $scope._carregando = true;
        var desde = moment().subtract($scope._janelaHoras || 2, 'hours').toISOString();
        var url = '/_bd?c=registro&id_conta=' + encodeURIComponent(idConta);
        url += '&data_registro=*gte' + encodeURIComponent(desde);
        url += '&_sort=data_registro';
        url += '&limit=3500';
        url += '&pop=id_item&pop=id_categoria';
        url += '&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';

        return uteisService.getBase(url)
            .then(function (res) {
                var regs = Array.isArray(res) ? res : [];
                $scope._linhas = montarLinhas(regs, $scope._fluxos);
                $scope._ultimaAtualizacao = moment().format('HH:mm:ss');
                $scope._erro = '';
            })
            .catch(function () {
                $scope._erro = 'Falha ao buscar registros. Tente novamente.';
            })
            .finally(function () {
                $scope._carregando = false;
                $scope.$applyAsync();
            });
    };

    $scope.onCarregarFluxos = function () {
        var idConta = $scope._regConta && $scope._regConta._id;
        if (!idConta) return Promise.resolve();
        var url = '/_bd?c=trackingfluxo&id_conta=' + encodeURIComponent(idConta) + '&_sort=descricao';
        return uteisService.getBase(url)
            .then(function (res) {
                $scope._fluxos = (Array.isArray(res) ? res : []).filter(fluxoAtivo);
                if (!$scope._fluxoId && $scope._fluxos.length === 1) {
                    $scope._fluxoId = $scope._fluxos[0]._id;
                }
            })
            .catch(function () {
                $scope._erro = 'Não foi possível carregar os fluxos de tracking.';
            });
    };

    $scope.$watch('$viewContentLoaded', function () {
        $scope._regConta = uteisService.getCookie('_conta') || {};
        $scope._regConta._logo = '../assets/images/logo_default.fw.png';
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') === false) {
            $scope._regConta._logo = uteisService.apiUrl_() + '/image/' + $scope._regConta.logo;
        }
        $scope._regConta = uteisService.normalizarConta($scope._regConta);
        $scope._regColaborador = uteisService.getCookie('_colaborador') || {};

        if (!podeAcessar($scope._regColaborador)) {
            uteisService.onToast('Sem permissão para acessar o rastreamento.', 'error', 3000, 'top-end');
            window.location.href = '/start';
            return;
        }

        try {
            var salvo = parseInt(localStorage.getItem(LS_INTERVALO), 10);
            if (salvo >= 2 && salvo <= 120) $scope._intervaloSeg = salvo;
        } catch (e) { /* ignore */ }

        atualizarRelogio();
        timerRelogio = setInterval(function () {
            $scope.$applyAsync(atualizarRelogio);
        }, 1000);

        $scope.onCarregarFluxos()
            .then(function () { return $scope.onAtualizar(); })
            .finally(function () {
                agendarPoll();
            });
    });

    $scope.$on('$destroy', function () {
        if (timerPoll) $timeout.cancel(timerPoll);
        if (timerRelogio) clearInterval(timerRelogio);
    });
});