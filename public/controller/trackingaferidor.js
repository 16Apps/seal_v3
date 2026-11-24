app.directive('tafDraggable', function ($parse) {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            element.attr('draggable', 'true');

            function callAttr(name, ev) {
                var expr = attrs[name];
                if (!expr) return;
                var fn = $parse(expr);
                scope.$applyAsync(function () {
                    fn(scope, { $event: ev.originalEvent || ev });
                });
            }

            element.on('dragstart', function (e) { callAttr('tafDragStart', e); });
            element.on('dragend', function (e) { callAttr('tafDragEnd', e); });
            element.on('dragover', function (e) {
                e.preventDefault();
                callAttr('tafDragOver', e);
            });
            element.on('drop', function (e) {
                e.preventDefault();
                callAttr('tafDrop', e);
            });

            scope.$on('$destroy', function () {
                element.off('dragstart dragend dragover drop');
            });
        }
    };
});

app.controller('trackingAferidorCtrl', function ($scope, uteisService, $timeout, $interval) {

    $scope._regConta = {};
    $scope._regColaborador = {};
    $scope.socket = null;
    $scope._dataHoraTopo = '';

    $scope._listGatewaysTodos = [];
    $scope._listGatewaysDisponiveis = [];
    $scope._gatewaysSelecionados = [];
    $scope._carregandoGateways = false;
    $scope._pesquisaModalGw = '';

    // idle | running | paused | ended
    $scope._disputaStatus = 'idle';
    $scope._disputaInicio = null;
    $scope._disputaFim = null;

    // Janela de checagem (segundos) — a cada N s avalia métricas e aloca campeão
    $scope._janelaChecagemSeg = 10;
    $scope._janelaAtualInicio = null;
    $scope._janelaAtualFimPrevisto = null;
    $scope._segundosRestantes = null;
    $scope._campeaoPorTag = {}; // tag -> { id_gateway, nome, quando, janela_inicio, janela_fim, pontos, empate }
    $scope._historicoChecagens = [];

    // leituras da disputa atual: { tag, id_gateway, gateway_descricao, rssi, data_leitura, _id_local }
    $scope._leiturasDisputa = [];
    // tags vistas: [{ tag, aba }]
    $scope._tagsDisputa = [];
    $scope._tagAtivaPorGateway = {};
    $scope._cardsGateway = [];

    // snapshot da disputa encerrada (referência para a próxima)
    $scope._disputaReferencia = null;

    $scope._filtroGateway = '';
    $scope._filtroTag = '';
    $scope._abaDireita = 'leituras';

    var modalGateways = undefined;
    var LIMITE_LEITURAS = 2000;
    var _dragCardId = null;
    var _clockTimer = null;
    var _janelaTimer = null;
    var STORAGE_KEY = 'seal_aferidor_gateways';
    var REF_KEY = 'seal_aferidor_referencia';
    var JANELA_KEY = 'seal_aferidor_janela';

    function podeAcessar(colaborador) {
        if (!colaborador) return false;
        var perfil = String(colaborador.perfil || '').toLowerCase();
        if (perfil === 'admin') return true;
        var mods = Array.isArray(colaborador.acesso_modulos) ? colaborador.acesso_modulos : [];
        return mods.some(function (m) {
            var v = String(m || '').toLowerCase();
            return v === 'trackingregra' || v === 'trackingaferidor' || v === 'gateway';
        });
    }

    function strId(v) {
        if (v == null) return '';
        if (typeof v === 'object' && v._id) return String(v._id).trim();
        return String(v).trim();
    }

    function fmtHora(d) {
        if (!d) return '—';
        var m = moment(d);
        if (!m.isValid()) return '—';
        return m.format('HH:mm:ss');
    }

    function fmtDataHora(d) {
        if (!d) return '—';
        var m = moment(d);
        if (!m.isValid()) return '—';
        return m.format('DD/MM HH:mm:ss');
    }

    function fmtRssi(v) {
        if (v == null || !Number.isFinite(Number(v))) return '—';
        return Number(v).toFixed(1);
    }

    $scope.fmtHora = fmtHora;
    $scope.fmtDataHora = fmtDataHora;
    $scope.fmtRssi = fmtRssi;

    function storageKey() {
        var id = ($scope._regConta && $scope._regConta._id) || 'x';
        return STORAGE_KEY + ':' + id;
    }

    function refKey() {
        var id = ($scope._regConta && $scope._regConta._id) || 'x';
        return REF_KEY + ':' + id;
    }

    function carregarIdsSelecionados() {
        try {
            var raw = localStorage.getItem(storageKey());
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.map(String) : [];
        } catch (e) {
            return [];
        }
    }

    function salvarIdsSelecionados() {
        try {
            var ids = ($scope._gatewaysSelecionados || []).map(function (g) { return strId(g._id); });
            localStorage.setItem(storageKey(), JSON.stringify(ids));
        } catch (e) { /* ignore */ }
    }

    function carregarReferencia() {
        try {
            var raw = localStorage.getItem(refKey());
            $scope._disputaReferencia = raw ? JSON.parse(raw) : null;
        } catch (e) {
            $scope._disputaReferencia = null;
        }
    }

    function salvarReferencia(ref) {
        $scope._disputaReferencia = ref;
        try {
            localStorage.setItem(refKey(), JSON.stringify(ref));
        } catch (e) { /* ignore */ }
    }

    function janelaKey() {
        var id = ($scope._regConta && $scope._regConta._id) || 'x';
        return JANELA_KEY + ':' + id;
    }

    function carregarJanelaPreferencia() {
        try {
            var n = Number(localStorage.getItem(janelaKey()));
            if (Number.isFinite(n) && n >= 1) $scope._janelaChecagemSeg = Math.floor(n);
        } catch (e) { /* ignore */ }
    }

    function salvarJanelaPreferencia() {
        try {
            localStorage.setItem(janelaKey(), String(Math.max(1, Math.floor(Number($scope._janelaChecagemSeg) || 10))));
        } catch (e) { /* ignore */ }
    }

    $scope.onJanelaChange = function () {
        var n = Math.floor(Number($scope._janelaChecagemSeg));
        if (!Number.isFinite(n) || n < 1) n = 1;
        if (n > 3600) n = 3600;
        $scope._janelaChecagemSeg = n;
        salvarJanelaPreferencia();
        if ($scope._disputaStatus === 'running' || $scope._disputaStatus === 'paused') {
            // Reancora o fim previsto da janela aberta a partir do início atual
            if ($scope._janelaAtualInicio) {
                $scope._janelaAtualFimPrevisto = new Date(
                    new Date($scope._janelaAtualInicio).getTime() + n * 1000
                ).toISOString();
            }
            atualizarContagemJanela();
        }
    };

    function janelaSeg() {
        var n = Math.floor(Number($scope._janelaChecagemSeg));
        return (Number.isFinite(n) && n >= 1) ? n : 10;
    }

    function abrirNovaJanela(inicioIso) {
        var ini = inicioIso || new Date().toISOString();
        $scope._janelaAtualInicio = ini;
        $scope._janelaAtualFimPrevisto = new Date(
            new Date(ini).getTime() + janelaSeg() * 1000
        ).toISOString();
        atualizarContagemJanela();
    }

    function atualizarContagemJanela() {
        if (!$scope._janelaAtualFimPrevisto) {
            $scope._segundosRestantes = null;
            return;
        }
        var resto = Math.ceil((new Date($scope._janelaAtualFimPrevisto).getTime() - Date.now()) / 1000);
        $scope._segundosRestantes = resto > 0 ? resto : 0;
    }

    function pararTimerJanela() {
        if (_janelaTimer) {
            $interval.cancel(_janelaTimer);
            _janelaTimer = null;
        }
    }

    function iniciarTimerJanela() {
        pararTimerJanela();
        _janelaTimer = $interval(function () {
            if ($scope._disputaStatus !== 'running') {
                atualizarContagemJanela();
                return;
            }
            atualizarContagemJanela();
            if ($scope._janelaAtualFimPrevisto && Date.now() >= new Date($scope._janelaAtualFimPrevisto).getTime()) {
                executarChecagemJanela();
            } else {
                $scope.onRecalcularCards();
            }
        }, 1000);
    }

    function executarChecagemJanela(opts) {
        opts = opts || {};
        var ini = $scope._janelaAtualInicio;
        var fim = $scope._janelaAtualFimPrevisto || new Date().toISOString();
        if (!ini) {
            if (!opts.semAbrirProxima) abrirNovaJanela();
            return;
        }

        var metricasJanela = calcularMetricas(ini, fim);
        var vencedores = calcularVencedores(metricasJanela);
        var quando = new Date().toISOString();

        Object.keys(vencedores).forEach(function (tag) {
            var venc = vencedores[tag];
            var nome = '—';
            if (venc.id_gateway) {
                var m = metricasJanela[tag] && metricasJanela[tag][venc.id_gateway];
                nome = (m && m.gateway_descricao) || venc.id_gateway;
            } else if (venc.empate) {
                nome = 'Empate';
            }
            $scope._campeaoPorTag[tag] = {
                id_gateway: venc.id_gateway || null,
                nome: nome,
                quando: quando,
                janela_inicio: ini,
                janela_fim: fim,
                pontos: venc.placar || {},
                empate: !!venc.empate
            };
        });

        // Também registra tags que só existem no total mas sem leitura na janela? não — só quem teve métrica na janela

        $scope._historicoChecagens.unshift({
            _id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            quando: quando,
            janela_inicio: ini,
            janela_fim: fim,
            campeoes: angular.copy($scope._campeaoPorTag)
        });
        if ($scope._historicoChecagens.length > 50) {
            $scope._historicoChecagens = $scope._historicoChecagens.slice(0, 50);
        }

        if (!opts.semAbrirProxima) {
            abrirNovaJanela(fim);
        }
        $scope.onRecalcularCards();
    }

    function idsSelecionados() {
        return ($scope._gatewaysSelecionados || []).map(function (g) { return strId(g._id); });
    }

    function gatewayPorIdOuTokem(idGw, tokem) {
        return ($scope._listGatewaysTodos || []).find(function (g) {
            return strId(g._id) === strId(idGw) || strId(g.tokem) === strId(tokem);
        }) || null;
    }

    function atualizarRelogio() {
        $scope._dataHoraTopo = moment().format('dddd, DD [de] MMMM YYYY · HH:mm:ss');
    }

    function atualizarDisponiveis() {
        var ids = {};
        ($scope._gatewaysSelecionados || []).forEach(function (g) {
            if (g && g._id) ids[strId(g._id)] = true;
        });
        var q = String($scope._pesquisaModalGw || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

        $scope._listGatewaysDisponiveis = ($scope._listGatewaysTodos || []).filter(function (g) {
            if (!g || !g._id || ids[strId(g._id)]) return false;
            if (!q) return true;
            var d = String(g.descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            var t = String(g.tokem || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return d.indexOf(q) !== -1 || t.indexOf(q) !== -1;
        });
    }

    $scope.statusDisputaLabel = function () {
        if ($scope._disputaStatus === 'running') return 'Em andamento';
        if ($scope._disputaStatus === 'paused') return 'Pausada';
        if ($scope._disputaStatus === 'ended') return 'Encerrada';
        return 'Aguardando início';
    };

    $scope.podeIniciar = function () {
        return ($scope._gatewaysSelecionados || []).length >= 1 &&
            ($scope._disputaStatus === 'idle' || $scope._disputaStatus === 'ended');
    };

    $scope.podePausar = function () {
        return $scope._disputaStatus === 'running';
    };

    $scope.podeRetomar = function () {
        return $scope._disputaStatus === 'paused';
    };

    $scope.podeEncerrar = function () {
        return $scope._disputaStatus === 'running' || $scope._disputaStatus === 'paused';
    };

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta') || {};
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png';
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            var _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        }

        $scope._regConta = uteisService.normalizarConta($scope._regConta);
        $scope._regColaborador = uteisService.getCookie('_colaborador') || {};

        if (!podeAcessar($scope._regColaborador)) {
            uteisService.onToast('Sem permissão para acessar o Aferidor de Gateways.', 'error', 3000, 'top-end');
            window.location.href = '/start';
            return;
        }

        atualizarRelogio();
        _clockTimer = $interval(atualizarRelogio, 1000);
        carregarReferencia();
        carregarJanelaPreferencia();
        await $scope.onCarregaGateways();
        $scope.onSocket();
        $scope.onRecalcularCards();
        $scope.$applyAsync();
    });

    $scope.onCarregaGateways = async function () {
        $scope._carregandoGateways = true;
        try {
            var res = await uteisService.getBase(
                '/_bd?c=gateway&id_conta=' + encodeURIComponent($scope._regConta._id) + '&ativo=1&_sort=descricao'
            );
            var lista = Array.isArray(res) ? res : [];
            lista = lista.filter(function (g) { return g && g._id && !g.error; });
            $scope._listGatewaysTodos = lista;

            var idsSalvos = carregarIdsSelecionados();
            var setIds = {};
            idsSalvos.forEach(function (id) { setIds[String(id)] = true; });
            $scope._gatewaysSelecionados = lista.filter(function (g) {
                return setIds[strId(g._id)];
            });
            if (idsSalvos.length) {
                $scope._gatewaysSelecionados.sort(function (a, b) {
                    return idsSalvos.indexOf(strId(a._id)) - idsSalvos.indexOf(strId(b._id));
                });
            }

            atualizarDisponiveis();
            $scope.onRecalcularCards();
        } catch (e) {
            $scope._listGatewaysTodos = [];
            $scope._gatewaysSelecionados = [];
            uteisService.onToast('Erro ao carregar gateways.', 'error', 2500, 'top-end');
        } finally {
            $scope._carregandoGateways = false;
        }
    };

    $scope.onAbrirModalGateways = function () {
        $scope._pesquisaModalGw = '';
        atualizarDisponiveis();
        $timeout(function () {
            var el = document.getElementById('modalAferidorGateways');
            if (!el || typeof bootstrap === 'undefined') return;
            modalGateways = bootstrap.Modal.getOrCreateInstance(el);
            modalGateways.show();
        }, 10);
        $scope.onCarregaGateways().then(function () {
            atualizarDisponiveis();
            $scope.$applyAsync();
        });
    };

    $scope.onFiltraModalGateways = function () {
        atualizarDisponiveis();
    };

    $scope.onAdicionarGateway = function (g) {
        if (!g || !g._id) return;
        if ($scope._disputaStatus === 'running' || $scope._disputaStatus === 'paused') {
            uteisService.onToast('Encerre ou limpe a disputa antes de alterar gateways.', 'warning', 2500, 'top-end');
            return;
        }
        var id = strId(g._id);
        var ja = ($scope._gatewaysSelecionados || []).some(function (x) {
            return strId(x._id) === id;
        });
        if (ja) return;

        $scope._gatewaysSelecionados = ($scope._gatewaysSelecionados || []).concat([g]);
        salvarIdsSelecionados();
        atualizarDisponiveis();
        $scope.onRecalcularCards();
        uteisService.onToast('Gateway vinculado: ' + (g.descricao || g.tokem || id), 'success', 1600, 'top-end');

        if (!$scope._listGatewaysDisponiveis.length && modalGateways) {
            modalGateways.hide();
        }
    };

    $scope.onRemoverGateway = function (g) {
        if (!g || !g._id) return;
        if ($scope._disputaStatus === 'running' || $scope._disputaStatus === 'paused') {
            uteisService.onToast('Encerre ou limpe a disputa antes de alterar gateways.', 'warning', 2500, 'top-end');
            return;
        }
        var id = strId(g._id);
        $scope._gatewaysSelecionados = ($scope._gatewaysSelecionados || []).filter(function (x) {
            return strId(x._id) !== id;
        });
        delete $scope._tagAtivaPorGateway[id];
        salvarIdsSelecionados();
        atualizarDisponiveis();
        $scope.onRecalcularCards();
    };

    // --- Drag & drop ---
    $scope.onCardDragStart = function (ev, card) {
        if (!card || !card.gateway) return;
        _dragCardId = strId(card.gateway._id);
        try {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', _dragCardId);
        } catch (e) { /* ignore */ }
        card._dragging = true;
    };

    $scope.onCardDragEnd = function (card) {
        if (card) card._dragging = false;
        _dragCardId = null;
        ($scope._cardsGateway || []).forEach(function (c) { c._dragOver = false; });
    };

    $scope.onCardDragOver = function (ev, card) {
        ev.preventDefault();
        try { ev.dataTransfer.dropEffect = 'move'; } catch (e) { /* ignore */ }
        ($scope._cardsGateway || []).forEach(function (c) {
            c._dragOver = !!(card && c.gateway && strId(c.gateway._id) === strId(card.gateway._id));
        });
    };

    $scope.onCardDrop = function (ev, cardAlvo) {
        ev.preventDefault();
        var fromId = _dragCardId;
        try {
            var raw = ev.dataTransfer.getData('text/plain');
            if (raw) fromId = raw;
        } catch (e) { /* ignore */ }

        var toId = cardAlvo && cardAlvo.gateway ? strId(cardAlvo.gateway._id) : '';
        if (!fromId || !toId || fromId === toId) {
            $scope.onCardDragEnd(cardAlvo);
            return;
        }

        var lista = $scope._gatewaysSelecionados || [];
        var fromIdx = lista.findIndex(function (g) { return strId(g._id) === fromId; });
        var toIdx = lista.findIndex(function (g) { return strId(g._id) === toId; });
        if (fromIdx < 0 || toIdx < 0) return;

        var moved = lista.splice(fromIdx, 1)[0];
        lista.splice(toIdx, 0, moved);
        $scope._gatewaysSelecionados = lista;
        salvarIdsSelecionados();
        $scope.onRecalcularCards();
        _dragCardId = null;
    };

    // --- Disputa ---
    $scope.onIniciarDisputa = function () {
        if (!$scope.podeIniciar()) {
            uteisService.onToast('Selecione ao menos um gateway para iniciar.', 'warning', 2200, 'top-end');
            return;
        }
        salvarJanelaPreferencia();
        $scope._leiturasDisputa = [];
        $scope._tagsDisputa = [];
        $scope._tagAtivaPorGateway = {};
        $scope._campeaoPorTag = {};
        $scope._historicoChecagens = [];
        $scope._disputaInicio = new Date().toISOString();
        $scope._disputaFim = null;
        $scope._disputaStatus = 'running';
        abrirNovaJanela($scope._disputaInicio);
        iniciarTimerJanela();
        $scope.onRecalcularCards();
        uteisService.onToast(
            'Disputa iniciada. Checagem a cada ' + janelaSeg() + 's.',
            'success', 2000, 'top-end'
        );
    };

    $scope.onPausarDisputa = function () {
        if ($scope._disputaStatus === 'running') {
            $scope._disputaStatus = 'paused';
            // Congela o restante da janela: ao retomar, recoloca o fim a partir de agora + resto
            $scope._pausaRestanteSeg = $scope._segundosRestantes;
            uteisService.onToast('Disputa pausada.', 'info', 1600, 'top-end');
        } else if ($scope._disputaStatus === 'paused') {
            $scope._disputaStatus = 'running';
            var resto = Number($scope._pausaRestanteSeg);
            if (!Number.isFinite(resto) || resto < 0) resto = janelaSeg();
            $scope._janelaAtualFimPrevisto = new Date(Date.now() + resto * 1000).toISOString();
            atualizarContagemJanela();
            uteisService.onToast('Disputa retomada.', 'success', 1600, 'top-end');
        }
        $scope.onRecalcularCards();
    };

    $scope.onEncerrarDisputa = function () {
        if (!$scope.podeEncerrar()) return;
        // Checagem final da janela aberta (parcial)
        if ($scope._janelaAtualInicio) {
            $scope._janelaAtualFimPrevisto = new Date().toISOString();
            executarChecagemJanela({ semAbrirProxima: true });
        }
        pararTimerJanela();
        $scope._disputaStatus = 'ended';
        $scope._disputaFim = new Date().toISOString();
        $scope._segundosRestantes = null;
        $scope.onRecalcularCards();

        var snapshot = montarSnapshotReferencia();
        salvarReferencia(snapshot);
        uteisService.onToast('Disputa encerrada. Resultado guardado como referência.', 'success', 2500, 'top-end');
    };

    $scope.onLimpar = function () {
        pararTimerJanela();
        $scope._leiturasDisputa = [];
        $scope._tagsDisputa = [];
        $scope._tagAtivaPorGateway = {};
        $scope._campeaoPorTag = {};
        $scope._historicoChecagens = [];
        $scope._disputaStatus = 'idle';
        $scope._disputaInicio = null;
        $scope._disputaFim = null;
        $scope._janelaAtualInicio = null;
        $scope._janelaAtualFimPrevisto = null;
        $scope._segundosRestantes = null;
        $scope.onRecalcularCards();
    };

    function garantirTag(tag) {
        tag = String(tag || '').trim();
        if (!tag) return;
        var existe = ($scope._tagsDisputa || []).some(function (t) { return t.tag === tag; });
        if (!existe) {
            $scope._tagsDisputa.push({ tag: tag });
        }
        ($scope._gatewaysSelecionados || []).forEach(function (g) {
            var id = strId(g._id);
            if (!$scope._tagAtivaPorGateway[id]) {
                $scope._tagAtivaPorGateway[id] = tag;
            }
        });
    }

    $scope.onSelecionarTag = function (idGateway, tag) {
        $scope._tagAtivaPorGateway[strId(idGateway)] = tag;
        $scope.onRecalcularCards();
    };

    /**
     * Métricas por tag → por gateway.
     * Se inicio/fim informados, considera só leituras nessa janela (inclusive).
     */
    function calcularMetricas(inicioIso, fimIso) {
        var mapa = {};
        var tIni = inicioIso ? new Date(inicioIso).getTime() : null;
        var tFim = fimIso ? new Date(fimIso).getTime() : null;

        ($scope._leiturasDisputa || []).forEach(function (l) {
            var tag = String(l.tag || '');
            var idGw = strId(l.id_gateway);
            if (!tag || !idGw) return;

            if (tIni != null || tFim != null) {
                var t = new Date(l.data_leitura).getTime();
                if (!Number.isFinite(t)) return;
                if (tIni != null && t < tIni) return;
                if (tFim != null && t > tFim) return;
            }

            if (!mapa[tag]) mapa[tag] = {};
            if (!mapa[tag][idGw]) {
                mapa[tag][idGw] = {
                    id_gateway: idGw,
                    gateway_descricao: l.gateway_descricao || idGw,
                    qtd: 0,
                    somaRssi: 0,
                    qtdRssi: 0,
                    media: null,
                    melhor: null,
                    leituras: []
                };
            }
            var m = mapa[tag][idGw];
            m.qtd += 1;
            m.leituras.push(l);
            var rssi = Number(l.rssi);
            if (Number.isFinite(rssi)) {
                m.somaRssi += rssi;
                m.qtdRssi += 1;
                if (m.melhor == null || rssi > m.melhor) m.melhor = rssi;
            }
        });

        Object.keys(mapa).forEach(function (tag) {
            Object.keys(mapa[tag]).forEach(function (idGw) {
                var m = mapa[tag][idGw];
                m.media = m.qtdRssi > 0 ? (m.somaRssi / m.qtdRssi) : null;
            });
        });
        return mapa;
    }

    /**
     * Para cada tag, pontua gateways nos 3 critérios.
     * Ganha quem tiver mais vitórias (empate no critério = ninguém leva ponto).
     */
    function calcularVencedores(metricas) {
        var vencedores = {}; // tag -> { id_gateway, placar: {qtd, media, melhor, total}, detalhes }

        Object.keys(metricas).forEach(function (tag) {
            var porGw = metricas[tag];
            var ids = Object.keys(porGw);
            if (!ids.length) return;

            var placar = {};
            ids.forEach(function (id) {
                placar[id] = { qtd: 0, media: 0, melhor: 0, total: 0 };
            });

            function disputaCriterio(campo, maiorMelhor) {
                var melhorVal = null;
                var ganhadores = [];
                ids.forEach(function (id) {
                    var v = porGw[id][campo];
                    if (v == null || !Number.isFinite(Number(v))) return;
                    v = Number(v);
                    if (melhorVal == null) {
                        melhorVal = v;
                        ganhadores = [id];
                        return;
                    }
                    if (maiorMelhor) {
                        if (v > melhorVal) { melhorVal = v; ganhadores = [id]; }
                        else if (v === melhorVal) ganhadores.push(id);
                    } else {
                        if (v < melhorVal) { melhorVal = v; ganhadores = [id]; }
                        else if (v === melhorVal) ganhadores.push(id);
                    }
                });
                // Só marca ponto se houver um único ganhador no critério
                if (ganhadores.length === 1) {
                    placar[ganhadores[0]][campo] = 1;
                    placar[ganhadores[0]].total += 1;
                }
                return { valor: melhorVal, ganhadores: ganhadores };
            }

            // Mais leituras, melhor média RSSI (maior algébrico), melhor RSSI (maior)
            var dQtd = disputaCriterio('qtd', true);
            var dMedia = disputaCriterio('media', true);
            var dMelhor = disputaCriterio('melhor', true);

            var vencedorId = null;
            var melhorTotal = -1;
            ids.forEach(function (id) {
                if (placar[id].total > melhorTotal) {
                    melhorTotal = placar[id].total;
                    vencedorId = id;
                } else if (placar[id].total === melhorTotal) {
                    vencedorId = null; // empate geral
                }
            });

            vencedores[tag] = {
                id_gateway: vencedorId,
                placar: placar,
                criterios: {
                    qtd: dQtd,
                    media: dMedia,
                    melhor: dMelhor
                },
                empate: !vencedorId && melhorTotal >= 0
            };
        });

        return vencedores;
    }

    function montarSnapshotReferencia() {
        var metricas = calcularMetricas();
        var vencedores = calcularVencedores(metricas);
        var tags = ($scope._tagsDisputa || []).map(function (t) {
            var tag = t.tag;
            var porGw = metricas[tag] || {};
            var venc = vencedores[tag] || null;
            var gateways = ($scope._gatewaysSelecionados || []).map(function (g) {
                var id = strId(g._id);
                var m = porGw[id] || { qtd: 0, media: null, melhor: null };
                return {
                    id_gateway: id,
                    descricao: g.descricao || g.tokem,
                    qtd: m.qtd || 0,
                    media: m.media,
                    melhor: m.melhor,
                    pontos: venc && venc.placar[id] ? venc.placar[id].total : 0,
                    vencedor: !!(venc && venc.id_gateway === id)
                };
            });
            return {
                tag: tag,
                vencedor_id: venc && venc.id_gateway,
                vencedor_nome: venc && venc.id_gateway
                    ? ((porGw[venc.id_gateway] && porGw[venc.id_gateway].gateway_descricao) || venc.id_gateway)
                    : (venc && venc.empate ? 'Empate' : '—'),
                gateways: gateways
            };
        });

        return {
            inicio: $scope._disputaInicio,
            fim: $scope._disputaFim || new Date().toISOString(),
            gateways: ($scope._gatewaysSelecionados || []).map(function (g) {
                return { _id: g._id, descricao: g.descricao, tokem: g.tokem };
            }),
            tags: tags,
            total_leituras: ($scope._leiturasDisputa || []).length
        };
    }

    $scope.onRecalcularCards = function () {
        var agoraIso = new Date().toISOString();
        var janelaIni = $scope._janelaAtualInicio;
        var janelaFim = ($scope._disputaStatus === 'running' || $scope._disputaStatus === 'paused')
            ? agoraIso
            : ($scope._janelaAtualFimPrevisto || agoraIso);

        var metricasJanela = calcularMetricas(janelaIni, janelaFim);
        var metricasTotal = calcularMetricas();
        // Placar ao vivo da janela aberta (só visual); campeão oficial vem da última checagem
        var vencedoresJanelaLive = calcularVencedores(metricasJanela);
        var tags = ($scope._tagsDisputa || []).map(function (t) { return t.tag; });

        var cards = ($scope._gatewaysSelecionados || []).map(function (gw) {
            var idGw = strId(gw._id);
            var tagAtiva = $scope._tagAtivaPorGateway[idGw] || tags[0] || null;
            if (tagAtiva && tags.indexOf(tagAtiva) < 0) {
                tagAtiva = tags[0] || null;
                $scope._tagAtivaPorGateway[idGw] = tagAtiva;
            }

            var mJanela = (tagAtiva && metricasJanela[tagAtiva] && metricasJanela[tagAtiva][idGw])
                ? metricasJanela[tagAtiva][idGw]
                : { qtd: 0, media: null, melhor: null, leituras: [] };

            var mTotal = (tagAtiva && metricasTotal[tagAtiva] && metricasTotal[tagAtiva][idGw])
                ? metricasTotal[tagAtiva][idGw]
                : { qtd: 0, media: null, melhor: null, leituras: [] };

            var campeaoOficial = tagAtiva ? ($scope._campeaoPorTag[tagAtiva] || null) : null;
            var live = tagAtiva ? (vencedoresJanelaLive[tagAtiva] || null) : null;
            var pontosLive = (live && live.placar[idGw])
                ? live.placar[idGw]
                : { qtd: 0, media: 0, melhor: 0, total: 0 };

            var ehVencedor = !!(campeaoOficial && campeaoOficial.id_gateway &&
                strId(campeaoOficial.id_gateway) === idGw);
            var empateOficial = !!(campeaoOficial && campeaoOficial.empate);

            var refTag = null;
            if ($scope._disputaReferencia && $scope._disputaReferencia.tags && tagAtiva) {
                refTag = ($scope._disputaReferencia.tags || []).find(function (t) {
                    return t.tag === tagAtiva;
                }) || null;
            }
            var refGw = null;
            if (refTag && Array.isArray(refTag.gateways)) {
                refGw = refTag.gateways.find(function (x) {
                    return strId(x.id_gateway) === idGw;
                }) || null;
            }

            return {
                gateway: gw,
                tags: tags,
                tagAtiva: tagAtiva,
                metricasJanela: {
                    qtd: mJanela.qtd || 0,
                    media: mJanela.media,
                    melhor: mJanela.melhor
                },
                metricasTotal: {
                    qtd: mTotal.qtd || 0,
                    media: mTotal.media,
                    melhor: mTotal.melhor
                },
                pontos: pontosLive,
                ehVencedor: ehVencedor,
                empate: empateOficial,
                vencedorNome: campeaoOficial
                    ? (campeaoOficial.nome || '—')
                    : 'Aguardando checagem',
                campeaoQuando: campeaoOficial ? campeaoOficial.quando : null,
                campeaoJanela: campeaoOficial
                    ? { inicio: campeaoOficial.janela_inicio, fim: campeaoOficial.janela_fim }
                    : null,
                leiturasTag: (mTotal.leituras || []).slice().reverse(),
                referencia: refGw,
                referenciaVencedor: refTag ? refTag.vencedor_nome : null,
                _dragging: false,
                _dragOver: false
            };
        });

        $scope._cardsGateway = cards;
    };

    $scope.leiturasFiltradas = function () {
        var idGw = strId($scope._filtroGateway);
        var tag = String($scope._filtroTag || '').trim().toLowerCase();
        return ($scope._leiturasDisputa || []).filter(function (l) {
            if (idGw && strId(l.id_gateway) !== idGw) return false;
            if (tag && String(l.tag || '').toLowerCase().indexOf(tag) < 0) return false;
            return true;
        });
    };

    $scope.resumoPorTagGateway = function () {
        var metricas = calcularMetricas();
        var rows = [];
        Object.keys(metricas).forEach(function (tag) {
            Object.keys(metricas[tag]).forEach(function (idGw) {
                var m = metricas[tag][idGw];
                rows.push({
                    tag: tag,
                    id_gateway: idGw,
                    gateway_descricao: m.gateway_descricao,
                    qtd: m.qtd,
                    media: m.media,
                    melhor: m.melhor
                });
            });
        });
        if ($scope._filtroGateway) {
            rows = rows.filter(function (r) { return strId(r.id_gateway) === strId($scope._filtroGateway); });
        }
        if ($scope._filtroTag) {
            var q = String($scope._filtroTag).toLowerCase();
            rows = rows.filter(function (r) { return String(r.tag).toLowerCase().indexOf(q) >= 0; });
        }
        return rows.sort(function (a, b) {
            return String(a.tag).localeCompare(String(b.tag)) ||
                String(a.gateway_descricao).localeCompare(String(b.gateway_descricao));
        });
    };

    // --- Socket ---
    $scope.onSocket = function () {
        if ($scope.socket) {
            $scope.socket.disconnect();
            $scope.socket = null;
        }
        if (!$scope._regConta || !$scope._regConta._id) return;

        $scope.socket = io();
        $scope.socket.on($scope._regConta._id, function (data) {
            try {
                var leitura = typeof data === 'string' ? JSON.parse(data) : data;
                if (!leitura) return;
                $timeout(function () {
                    $scope.onRecebeLeitura(leitura);
                }, 0);
            } catch (err) {
                console.error('[aferidor] socket:', err, data);
            }
        });
    };

    $scope.onRecebeLeitura = function (leitura) {
        if ($scope._disputaStatus !== 'running') return;
        if (!leitura) return;

        var tag = String(leitura.tag || '').trim();
        if (!tag) return;

        var idGw = strId(leitura.id_gateway);
        var tokem = strId(leitura.tokem);
        var gw = gatewayPorIdOuTokem(idGw, tokem);
        if (!gw) {
            // tenta casar só por tokem entre selecionados
            gw = ($scope._gatewaysSelecionados || []).find(function (g) {
                return strId(g.tokem) === tokem || strId(g._id) === idGw;
            }) || null;
        }
        if (!gw) return;

        var ids = idsSelecionados();
        if (ids.indexOf(strId(gw._id)) < 0) return;

        var entry = {
            _id_local: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            data_leitura: leitura.data_leitura || new Date().toISOString(),
            tag: tag,
            tokem: tokem || gw.tokem || '',
            rssi: leitura.rssi != null ? Number(leitura.rssi) : null,
            id_gateway: strId(gw._id),
            gateway_descricao: gw.descricao || gw.tokem || strId(gw._id)
        };

        $scope._leiturasDisputa.unshift(entry);
        if ($scope._leiturasDisputa.length > LIMITE_LEITURAS) {
            $scope._leiturasDisputa = $scope._leiturasDisputa.slice(0, LIMITE_LEITURAS);
        }

        garantirTag(tag);
        $scope.onRecalcularCards();
    };

    $scope.$on('$destroy', function () {
        if ($scope.socket) {
            $scope.socket.disconnect();
            $scope.socket = null;
        }
        if (_clockTimer) {
            $interval.cancel(_clockTimer);
            _clockTimer = null;
        }
        pararTimerJanela();
    });
});
