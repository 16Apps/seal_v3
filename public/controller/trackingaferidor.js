app.controller('trackingAferidorCtrl', function ($scope, $http, params, uteisService, $timeout) {

    $scope._regConta = {};
    $scope._regColaborador = {};
    $scope.socket = null;

    $scope._listGateways = [];
    $scope._listGatewaysBase = [];
    $scope._mapRegras = {};
    $scope._gatewaysSelecionados = [];
    $scope._pesquisaGateway = '';

    $scope._leituras = [];
    $scope._afericoesPorTag = {};
    $scope._cardsGateway = [];

    $scope._abaDireita = 'leituras';
    $scope._filtroGateway = '';
    $scope._filtroTag = '';
    $scope._periodoMinutos = 5;

    $scope._regraModal = null;
    var modalRegra = undefined;
    var LIMITE_LEITURAS = 400;

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

    function num(v, def) {
        var n = Number(v);
        return Number.isFinite(n) ? n : (def != null ? def : 0);
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

    $scope.fmtHora = fmtHora;
    $scope.fmtDataHora = fmtDataHora;

    function periodoInicioMs() {
        var min = num($scope._periodoMinutos, 5);
        if (min <= 0) return 0;
        return Date.now() - (min * 60 * 1000);
    }

    function leituraNoPeriodo(l) {
        var ini = periodoInicioMs();
        if (!ini) return true;
        var t = l && (l.data_leitura || l._recebido_em);
        if (!t) return true;
        var ms = new Date(t).getTime();
        return Number.isFinite(ms) && ms >= ini;
    }

    function idsSelecionados() {
        return ($scope._gatewaysSelecionados || []).map(function (g) { return strId(g._id); });
    }

    function gatewaySelecionado(id) {
        var sid = strId(id);
        return ($scope._gatewaysSelecionados || []).some(function (g) {
            return strId(g._id) === sid;
        });
    }

    function regraDoGateway(gw) {
        if (!gw) return null;
        var id = strId(gw.id_tracking_regra);
        if (!id) return null;
        return $scope._mapRegras[id] || null;
    }

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

        await $scope.onCarregaRegras();
        await $scope.onCarregaGateways();
        $scope.onSocket();
        $scope.$applyAsync();
    });

    $scope.onCarregaRegras = async function () {
        try {
            var res = await uteisService.getBase(
                '/_bd?c=trackingregra&id_conta=' + encodeURIComponent($scope._regConta._id) + '&ativo=1&_sort=descricao'
            );
            var lista = Array.isArray(res) ? res : [];
            var map = {};
            lista.forEach(function (r) {
                if (r && r._id) map[String(r._id)] = r;
            });
            $scope._mapRegras = map;
        } catch (e) {
            $scope._mapRegras = {};
            uteisService.onToast('Erro ao carregar regras de tracking.', 'error', 2500, 'top-end');
        }
    };

    $scope.onCarregaGateways = async function () {
        try {
            var res = await uteisService.getBase(
                '/_bd?c=gateway&id_conta=' + encodeURIComponent($scope._regConta._id) + '&ativo=1&_sort=descricao'
            );
            var lista = Array.isArray(res) ? res : [];
            lista.forEach(function (g) {
                g._regra = regraDoGateway(g);
                g._selecionado = false;
            });
            $scope._listGatewaysBase = lista;
            $scope._listGateways = lista;
            $scope.onFiltraGateways();
        } catch (e) {
            $scope._listGateways = [];
            $scope._listGatewaysBase = [];
            uteisService.onToast('Erro ao carregar gateways.', 'error', 2500, 'top-end');
        }
    };

    $scope.onFiltraGateways = function () {
        var q = ($scope._pesquisaGateway || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (!q) {
            $scope._listGateways = $scope._listGatewaysBase;
            return;
        }
        $scope._listGateways = ($scope._listGatewaysBase || []).filter(function (g) {
            var d = String(g.descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            var t = String(g.tokem || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            var r = String((g._regra && g._regra.descricao) || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return d.indexOf(q) !== -1 || t.indexOf(q) !== -1 || r.indexOf(q) !== -1;
        });
    };

    $scope.onToggleGateway = function (gw) {
        if (!gw) return;
        var id = strId(gw._id);
        var idx = ($scope._gatewaysSelecionados || []).findIndex(function (g) {
            return strId(g._id) === id;
        });
        if (idx >= 0) {
            $scope._gatewaysSelecionados.splice(idx, 1);
            gw._selecionado = false;
        } else {
            gw._regra = regraDoGateway(gw);
            gw._selecionado = true;
            $scope._gatewaysSelecionados.push(gw);
        }
        $scope.onRecalcularCards();
    };

    $scope.isGatewaySelecionado = function (gw) {
        return gatewaySelecionado(gw && gw._id);
    };

    $scope.onLimparSelecao = function () {
        ($scope._listGatewaysBase || []).forEach(function (g) { g._selecionado = false; });
        $scope._gatewaysSelecionados = [];
        $scope.onRecalcularCards();
    };

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
                if (!leitura || leitura.via !== 'tracking') return;
                $timeout(function () {
                    $scope.onRecebeLeitura(leitura);
                }, 0);
            } catch (err) {
                console.error('[aferidor] socket conta:', err, data);
            }
        });

        $scope.socket.on('tracking_afericao:' + $scope._regConta._id, function (afericao) {
            try {
                $timeout(function () {
                    $scope.onRecebeAfericao(afericao);
                }, 0);
            } catch (err) {
                console.error('[aferidor] socket afericao:', err, afericao);
            }
        });
    };

    $scope.onRecebeLeitura = function (leitura) {
        if (!leitura) return;
        var idGw = strId(leitura.id_gateway) ||
            (leitura.afericao && leitura.afericao.gateway_leitura && leitura.afericao.gateway_leitura._id);

        // Se há seleção, só registra gateways selecionados (ou aferição com disputa relevante)
        var ids = idsSelecionados();
        if (ids.length && idGw && ids.indexOf(strId(idGw)) < 0) {
            // Ainda pode interessar se a aferição envolve um selecionado
            var af = leitura.afericao;
            var envolve = af && (
                (af.gateway_campeao && ids.indexOf(strId(af.gateway_campeao._id)) >= 0) ||
                (af.gateway_candidato && ids.indexOf(strId(af.gateway_candidato._id)) >= 0)
            );
            if (!envolve) return;
        }

        var gw = ($scope._listGatewaysBase || []).find(function (g) {
            return strId(g._id) === strId(idGw) || strId(g.tokem) === strId(leitura.tokem);
        });

        var entry = {
            _id_local: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            _recebido_em: new Date().toISOString(),
            data_leitura: leitura.data_leitura || new Date().toISOString(),
            tag: leitura.tag || '',
            tokem: leitura.tokem || (gw && gw.tokem) || '',
            rssi: leitura.rssi,
            id_gateway: idGw || (gw && gw._id) || '',
            gateway_descricao: (leitura.afericao && leitura.afericao.gateway_leitura && leitura.afericao.gateway_leitura.descricao) ||
                (gw && gw.descricao) || leitura.tokem || '—',
            id_tracking_regra: leitura.id_tracking_regra || null,
            afericao: leitura.afericao || null,
            raw: leitura
        };

        $scope._leituras.unshift(entry);
        if ($scope._leituras.length > LIMITE_LEITURAS) {
            $scope._leituras = $scope._leituras.slice(0, LIMITE_LEITURAS);
        }

        if (leitura.afericao) {
            $scope.onRecebeAfericao(leitura.afericao);
        } else {
            $scope.onRecalcularCards();
        }
    };

    $scope.onRecebeAfericao = function (afericao) {
        if (!afericao || !afericao.tag) return;
        var key = String(afericao.tag);
        $scope._afericoesPorTag[key] = afericao;
        $scope.onRecalcularCards();
    };

    $scope.onPeriodoChange = function () {
        $scope.onRecalcularCards();
    };

    $scope.leiturasFiltradas = function () {
        var idGw = strId($scope._filtroGateway);
        var tag = String($scope._filtroTag || '').trim().toLowerCase();
        return ($scope._leituras || []).filter(function (l) {
            if (!leituraNoPeriodo(l)) return false;
            if (idGw && strId(l.id_gateway) !== idGw) return false;
            if (tag && String(l.tag || '').toLowerCase().indexOf(tag) < 0) return false;
            return true;
        });
    };

    $scope.resumoPorTagGateway = function () {
        var mapa = {};
        $scope.leiturasFiltradas().forEach(function (l) {
            var k = String(l.tag || '') + '|' + strId(l.id_gateway);
            if (!mapa[k]) {
                mapa[k] = {
                    tag: l.tag,
                    id_gateway: l.id_gateway,
                    gateway_descricao: l.gateway_descricao,
                    qtd: 0,
                    melhor_rssi: -Infinity,
                    pior_rssi: Infinity,
                    ultima: null
                };
            }
            var r = mapa[k];
            r.qtd += 1;
            var rssi = Number(l.rssi);
            if (Number.isFinite(rssi)) {
                if (rssi > r.melhor_rssi) r.melhor_rssi = rssi;
                if (rssi < r.pior_rssi) r.pior_rssi = rssi;
            }
            if (!r.ultima || new Date(l.data_leitura) > new Date(r.ultima)) {
                r.ultima = l.data_leitura;
            }
        });
        return Object.keys(mapa).map(function (k) {
            var r = mapa[k];
            if (!Number.isFinite(r.melhor_rssi) || r.melhor_rssi === -Infinity) r.melhor_rssi = null;
            if (!Number.isFinite(r.pior_rssi) || r.pior_rssi === Infinity) r.pior_rssi = null;
            return r;
        }).sort(function (a, b) {
            return String(a.tag).localeCompare(String(b.tag)) ||
                String(a.gateway_descricao).localeCompare(String(b.gateway_descricao));
        });
    };

    function metricasLinha(label, valor, ok) {
        return { label: label, valor: valor, ok: ok };
    }

    function linhasAfericao(af, gwCard) {
        if (!af) return [];
        var linhas = [];
        var j = af.janela || {};
        var regra = af.regra || {};

        linhas.push(metricasLinha(
            'janela_analise',
            (j.inicio || j.fim)
                ? (fmtHora(j.inicio) + ' → ' + fmtHora(j.fim) +
                    (j.segundos > 0 ? ' (' + j.segundos + 's · regra ' + (regra.descricao || '') + ')' : ''))
                : (regra.janela_analise > 0 ? regra.janela_analise + 's' : 'ignorada (0)'),
            true
        ));

        var leit = af.leituras || {};
        linhas.push(metricasLinha(
            'leituras_minima',
            (leit.consideradas != null ? leit.consideradas : '—') +
            ' consideradas · mín. ' +
            (leit.minima > 0 ? leit.minima : 'ignorado (0)'),
            !(leit.minima > 0) || (leit.consideradas >= leit.minima)
        ));

        var mr = af.minima_rssi || {};
        linhas.push(metricasLinha(
            'minima_rssi',
            mr.ignorado
                ? 'ignorado (0)'
                : ((mr.usado != null ? mr.usado + ' dBm' : '—') + ' · limite ' + (mr.limite != null ? mr.limite + ' dBm' : '—')),
            mr.ignorado || mr.atende !== false
        ));

        var dr = af.diferenca_rssi || {};
        if (dr.ignorado || !dr.aplicavel) {
            linhas.push(metricasLinha(
                'diferenca_rssi',
                dr.ignorado ? 'ignorado (0)' : 'não aplicável nesta comparação',
                true
            ));
        } else {
            var nomeCamp = (af.gateway_campeao && af.gateway_campeao.descricao) || 'campeão';
            var nomeCand = (af.gateway_candidato && af.gateway_candidato.descricao) || 'candidato';
            linhas.push(metricasLinha(
                'diferenca_rssi',
                nomeCand + ' ' + (dr.rssi_candidato != null ? dr.rssi_candidato + ' dBm' : '—') +
                ' vs ' + nomeCamp + ' ' + (dr.rssi_concorrente != null ? dr.rssi_concorrente + ' dBm' : '—') +
                ' · vantagem ' + (dr.vantagem != null ? dr.vantagem + ' dB' : '—') +
                ' / exigida ' + (dr.exigida != null ? dr.exigida + ' dB' : '—'),
                dr.atende !== false
            ));
        }

        var conf = af.confirmacoes || {};
        linhas.push(metricasLinha(
            'confirmacoes_consecutivas',
            conf.ignorado
                ? 'ignorado (0)'
                : ((conf.obtidas != null ? conf.obtidas : 0) + ' / ' + (conf.necessarias || 0)),
            conf.ignorado || conf.atende !== false
        ));

        var tol = af.tolerancia_sem_leitura || {};
        linhas.push(metricasLinha(
            'tolerancia_sem_leitura',
            tol.ignorado
                ? 'ignorado (0)'
                : ((tol.desde_ultima != null ? tol.desde_ultima + 's' : '—') +
                    ' desde a última · tol. ' + (tol.configurada != null ? tol.configurada + 's' : '—')),
            true
        ));

        var tm = af.tempo_minimo_local || {};
        if (!tm.aplicavel || tm.exigido <= 0) {
            linhas.push(metricasLinha('tempo_minimo_local', 'ignorado (0) ou não aplicável', true));
        } else {
            linhas.push(metricasLinha(
                'tempo_minimo_local',
                (tm.permanencia != null ? tm.permanencia + 's' : '—') +
                ' de permanência · exige ' + tm.exigido + 's' +
                (tm.falta > 0 ? ' · falta ' + tm.falta + 's' : '') +
                (tm.origem_regra === 'local_atual' ? ' (regra do local atual)' : ''),
                tm.atende !== false
            ));
        }

        return linhas;
    }

    $scope.onRecalcularCards = function () {
        var cards = [];
        var selecionados = $scope._gatewaysSelecionados || [];

        selecionados.forEach(function (gw) {
            var regra = regraDoGateway(gw) || gw._regra || null;
            var tagsMap = {};

            Object.keys($scope._afericoesPorTag || {}).forEach(function (tag) {
                var af = $scope._afericoesPorTag[tag];
                if (!af) return;
                if (af.data_leitura && !leituraNoPeriodo({ data_leitura: af.data_leitura })) return;

                var idLeitura = af.gateway_leitura && strId(af.gateway_leitura._id);
                var idCamp = af.gateway_campeao && strId(af.gateway_campeao._id);
                var idCand = af.gateway_candidato && strId(af.gateway_candidato._id);
                var idGw = strId(gw._id);

                if (idLeitura !== idGw && idCamp !== idGw && idCand !== idGw) return;

                // Em disputa ou pendente / decisão recente
                var emDisputa = !!af.disputa || !!(af.decisao && af.decisao.pending) ||
                    (idCamp && idCand && idCamp !== idCand);

                tagsMap[tag] = {
                    tag: tag,
                    item_descricao: (af.item && af.item.descricao) || tag,
                    afericao: af,
                    narrativa: (af.decisao && af.decisao.narrativa) || (af.decisao && af.decisao.message) || '',
                    linhas: linhasAfericao(af, gw),
                    em_disputa: emDisputa,
                    pending: !!(af.decisao && af.decisao.pending),
                    applied: !!(af.decisao && af.decisao.applied),
                    precedencia: af.precedencia,
                    regra_nome: (af.regra && af.regra.descricao) || (regra && regra.descricao) || '—'
                };
            });

            // Leituras recentes do gateway sem aferição ainda
            $scope.leiturasFiltradas().forEach(function (l) {
                if (strId(l.id_gateway) !== strId(gw._id)) return;
                if (!l.tag) return;
                if (tagsMap[l.tag]) return;
                tagsMap[l.tag] = {
                    tag: l.tag,
                    item_descricao: l.tag,
                    afericao: l.afericao || null,
                    narrativa: 'Aguardando avaliação da disputa…',
                    linhas: l.afericao ? linhasAfericao(l.afericao, gw) : [],
                    em_disputa: false,
                    pending: true,
                    applied: false,
                    precedencia: null,
                    regra_nome: (regra && regra.descricao) || '—'
                };
            });

            var tags = Object.keys(tagsMap).map(function (k) { return tagsMap[k]; })
                .sort(function (a, b) {
                    if (a.em_disputa !== b.em_disputa) return a.em_disputa ? -1 : 1;
                    return String(a.tag).localeCompare(String(b.tag));
                });

            cards.push({
                gateway: gw,
                regra: regra,
                tags: tags,
                qtd_disputa: tags.filter(function (t) { return t.em_disputa || t.pending; }).length
            });
        });

        $scope._cardsGateway = cards;
    };

    $scope.onVerRegra = function (regra) {
        $scope._regraModal = regra || null;
        $timeout(function () {
            var el = document.getElementById('modalAferidorRegra');
            if (!el) return;
            modalRegra = bootstrap.Modal.getOrCreateInstance(el);
            modalRegra.show();
        }, 10);
    };

    $scope.onLimparLeituras = function () {
        $scope._leituras = [];
        $scope._afericoesPorTag = {};
        $scope.onRecalcularCards();
    };

    $scope.$on('$destroy', function () {
        if ($scope.socket) {
            $scope.socket.disconnect();
            $scope.socket = null;
        }
    });
});
