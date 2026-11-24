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

            element.on('dragstart', function (e) {
                callAttr('tafDragStart', e);
            });
            element.on('dragend', function (e) {
                callAttr('tafDragEnd', e);
            });
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

app.controller('trackingAferidorCtrl', function ($scope, $http, params, uteisService, $timeout, $interval) {

    $scope._regConta = {};
    $scope._regColaborador = {};
    $scope.socket = null;
    $scope._dataHoraTopo = '';

    $scope._listGatewaysTodos = [];
    $scope._listGatewaysDisponiveis = [];
    $scope._gatewaysSelecionados = [];
    $scope._mapRegras = {};
    $scope._carregandoGateways = false;

    $scope._leituras = [];
    $scope._afericoesPorTag = {};
    $scope._historicoPorGateway = {};
    $scope._estadoTagPorGateway = {};
    $scope._cardsGateway = [];
    $scope._kpi = { gateways: 0, campeao: 0, perdedora: 0, leituras: 0 };

    $scope._abaDireita = 'leituras';
    $scope._filtroGateway = '';
    $scope._filtroTag = '';
    $scope._periodoMinutos = 5;

    $scope._regraModal = null;
    $scope._pesquisaModalGw = '';

    var modalGateways = undefined;
    var modalRegra = undefined;
    var LIMITE_LEITURAS = 400;
    var LIMITE_HISTORICO = 80;
    var _dragCardId = null;
    var _clockTimer = null;
    var STORAGE_KEY = 'seal_aferidor_gateways';

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

    function storageKey() {
        var id = ($scope._regConta && $scope._regConta._id) || 'x';
        return STORAGE_KEY + ':' + id;
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

    function periodoInicioMs() {
        var min = num($scope._periodoMinutos, 5);
        if (min <= 0) return 0;
        return Date.now() - (min * 60 * 1000);
    }

    function leituraNoPeriodo(l) {
        var ini = periodoInicioMs();
        if (!ini) return true;
        var t = l && (l.data_leitura || l._recebido_em || l.quando);
        if (!t) return true;
        var ms = new Date(t).getTime();
        return Number.isFinite(ms) && ms >= ini;
    }

    function idsSelecionados() {
        return ($scope._gatewaysSelecionados || []).map(function (g) { return strId(g._id); });
    }

    function regraDoGateway(gw) {
        if (!gw) return null;
        var id = strId(gw.id_tracking_regra);
        if (!id) return null;
        return $scope._mapRegras[id] || null;
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
            var r = String((g._regra && g._regra.descricao) || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return d.indexOf(q) !== -1 || t.indexOf(q) !== -1 || r.indexOf(q) !== -1;
        });
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

        atualizarRelogio();
        _clockTimer = $interval(atualizarRelogio, 1000);

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
        }
    };

    $scope.onCarregaGateways = async function () {
        $scope._carregandoGateways = true;
        try {
            var res = await uteisService.getBase(
                '/_bd?c=gateway&id_conta=' + encodeURIComponent($scope._regConta._id) + '&ativo=1&_sort=descricao'
            );
            var lista = Array.isArray(res) ? res : [];
            lista = lista.filter(function (g) { return g && g._id && !g.error; });
            lista.forEach(function (g) {
                g._regra = regraDoGateway(g);
            });
            $scope._listGatewaysTodos = lista;

            var idsSalvos = carregarIdsSelecionados();
            var setIds = {};
            idsSalvos.forEach(function (id) { setIds[String(id)] = true; });
            $scope._gatewaysSelecionados = lista.filter(function (g) {
                return setIds[strId(g._id)];
            });
            // preserva ordem salva
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
        var id = strId(g._id);
        var ja = ($scope._gatewaysSelecionados || []).some(function (x) {
            return strId(x._id) === id;
        });
        if (ja) return;

        g._regra = regraDoGateway(g);
        $scope._gatewaysSelecionados = ($scope._gatewaysSelecionados || []).concat([g]);
        if (!$scope._historicoPorGateway[id]) $scope._historicoPorGateway[id] = [];
        if (!$scope._estadoTagPorGateway[id]) $scope._estadoTagPorGateway[id] = {};

        salvarIdsSelecionados();
        atualizarDisponiveis();
        $scope.onRecalcularCards();

        uteisService.onToast(
            'Gateway vinculado: ' + (g.descricao || g.tokem || id),
            'success', 1800, 'top-end'
        );

        if (!$scope._listGatewaysDisponiveis.length && modalGateways) {
            modalGateways.hide();
        }
    };

    $scope.onRemoverGateway = function (g) {
        if (!g || !g._id) return;
        var id = strId(g._id);
        $scope._gatewaysSelecionados = ($scope._gatewaysSelecionados || []).filter(function (x) {
            return strId(x._id) !== id;
        });
        salvarIdsSelecionados();
        atualizarDisponiveis();
        $scope.onRecalcularCards();
    };

    // --- Drag & drop dos cards ---
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

        var ids = idsSelecionados();
        if (ids.length && idGw && ids.indexOf(strId(idGw)) < 0) {
            var af = leitura.afericao;
            var envolve = af && (
                (af.gateway_campeao && ids.indexOf(strId(af.gateway_campeao._id)) >= 0) ||
                (af.gateway_candidato && ids.indexOf(strId(af.gateway_candidato._id)) >= 0)
            );
            if (!envolve) return;
        }

        var gw = ($scope._listGatewaysTodos || []).find(function (g) {
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

    function papelGatewayNaAfericao(af, idGw) {
        if (!af || !idGw) return null;
        var idCamp = af.gateway_campeao && strId(af.gateway_campeao._id);
        var idCand = af.gateway_candidato && strId(af.gateway_candidato._id);
        var idLeit = af.gateway_leitura && strId(af.gateway_leitura._id);
        var applied = !!(af.decisao && af.decisao.applied);
        var pending = !!(af.decisao && af.decisao.pending);
        var permanence = !!(af.decisao && af.decisao.permanence);

        // Após decisão aplicada: vencedor = candidato
        if (applied && idCand) {
            if (idGw === idCand) return permanence ? 'manteve' : 'ganhou';
            if (idCamp && idGw === idCamp && idCamp !== idCand) return 'perdeu';
        }

        // Pendente / disputa aberta
        if (pending || af.disputa) {
            if (idCamp && idGw === idCamp) {
                if (idCand && idCand !== idCamp) return 'campeao_desafiado';
                return 'campeao';
            }
            if (idCand && idGw === idCand && idCamp && idCand !== idCamp) return 'desafiante';
            if (idLeit === idGw && idCamp && idLeit !== idCamp) return 'desafiante';
        }

        if (idCamp && idGw === idCamp) return 'campeao';
        if (idCand && idGw === idCand) return 'candidato';
        if (idLeit === idGw) return 'leitura';
        return null;
    }

    function rotuloResultado(papel) {
        if (papel === 'ganhou' || papel === 'campeao' || papel === 'manteve') return 'campeao';
        if (papel === 'perdeu' || papel === 'desafiante' || papel === 'campeao_desafiado') return 'perdedora';
        return 'neutro';
    }

    function registrarHistorico(idGw, evento) {
        if (!idGw || !evento) return;
        if (!$scope._historicoPorGateway[idGw]) $scope._historicoPorGateway[idGw] = [];
        var hist = $scope._historicoPorGateway[idGw];
        var prev = hist[0];
        // Evita spam: mesmo tag+resultado+motivo em < 1.5s
        if (prev &&
            prev.tag === evento.tag &&
            prev.resultado === evento.resultado &&
            prev.motivo === evento.motivo &&
            (new Date(evento.quando).getTime() - new Date(prev.quando).getTime()) < 1500) {
            return;
        }
        hist.unshift(evento);
        if (hist.length > LIMITE_HISTORICO) {
            $scope._historicoPorGateway[idGw] = hist.slice(0, LIMITE_HISTORICO);
        }
    }

    $scope.onRecebeAfericao = function (afericao) {
        if (!afericao || !afericao.tag) return;
        var key = String(afericao.tag);
        $scope._afericoesPorTag[key] = afericao;

        var ids = idsSelecionados();
        if (!ids.length) {
            $scope.onRecalcularCards();
            return;
        }

        var quando = afericao.data_leitura || new Date().toISOString();
        var motivo = (afericao.decisao && (afericao.decisao.message || afericao.decisao.narrativa)) || '';
        var narrativa = (afericao.decisao && afericao.decisao.narrativa) || motivo;
        var itemDesc = (afericao.item && afericao.item.descricao) || key;

        ids.forEach(function (idGw) {
            var papel = papelGatewayNaAfericao(afericao, idGw);
            if (!papel) return;

            if (!$scope._estadoTagPorGateway[idGw]) $scope._estadoTagPorGateway[idGw] = {};
            var prevEstado = $scope._estadoTagPorGateway[idGw][key];
            var statusUi = rotuloResultado(papel);

            var mudou = !prevEstado ||
                prevEstado.papel !== papel ||
                prevEstado.status !== statusUi ||
                !!(afericao.decisao && (afericao.decisao.applied || afericao.decisao.pending));

            $scope._estadoTagPorGateway[idGw][key] = {
                tag: key,
                item_descricao: itemDesc,
                papel: papel,
                status: statusUi,
                quando: quando,
                motivo: motivo,
                narrativa: narrativa,
                afericao: afericao
            };

            if (mudou && (papel === 'ganhou' || papel === 'perdeu' || papel === 'manteve' ||
                papel === 'desafiante' || papel === 'campeao_desafiado' ||
                (afericao.decisao && afericao.decisao.applied))) {
                var resultadoHist = 'pendente';
                if (papel === 'ganhou' || (papel === 'campeao' && afericao.decisao && afericao.decisao.applied)) {
                    resultadoHist = 'ganhou';
                } else if (papel === 'manteve') {
                    resultadoHist = 'manteve';
                } else if (papel === 'perdeu') {
                    resultadoHist = 'perdeu';
                } else if (papel === 'desafiante' || papel === 'campeao_desafiado') {
                    resultadoHist = 'disputando';
                }

                registrarHistorico(idGw, {
                    _id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                    quando: quando,
                    tag: key,
                    item_descricao: itemDesc,
                    resultado: resultadoHist,
                    papel: papel,
                    motivo: motivo,
                    narrativa: narrativa,
                    regra: afericao.regra ? afericao.regra.descricao : '',
                    janela: afericao.janela || null,
                    confirmacoes: afericao.confirmacoes || null,
                    diferenca_rssi: afericao.diferenca_rssi || null
                });
            }
        });

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

    function historicoFiltrado(idGw) {
        return ($scope._historicoPorGateway[idGw] || []).filter(function (h) {
            return leituraNoPeriodo({ data_leitura: h.quando });
        });
    }

    $scope.onRecalcularCards = function () {
        var cards = [];

        ($scope._gatewaysSelecionados || []).forEach(function (gw) {
            var idGw = strId(gw._id);
            var regra = regraDoGateway(gw) || gw._regra || null;
            var estados = $scope._estadoTagPorGateway[idGw] || {};
            var tagsAtuais = [];

            Object.keys(estados).forEach(function (tag) {
                var st = estados[tag];
                if (!st) return;
                if (st.quando && !leituraNoPeriodo({ data_leitura: st.quando })) return;

                var af = st.afericao || $scope._afericoesPorTag[tag];
                tagsAtuais.push({
                    tag: tag,
                    item_descricao: st.item_descricao || tag,
                    status: st.status || 'neutro',
                    papel: st.papel,
                    narrativa: st.narrativa || '',
                    motivo: st.motivo || '',
                    quando: st.quando,
                    afericao: af,
                    pending: !!(af && af.decisao && af.decisao.pending),
                    applied: !!(af && af.decisao && af.decisao.applied)
                });
            });

            tagsAtuais.sort(function (a, b) {
                var rank = { campeao: 0, perdedora: 1, neutro: 2 };
                var ra = rank[a.status] != null ? rank[a.status] : 3;
                var rb = rank[b.status] != null ? rank[b.status] : 3;
                if (ra !== rb) return ra - rb;
                return String(a.tag).localeCompare(String(b.tag));
            });

            var hist = historicoFiltrado(idGw);
            var qtdCampeao = tagsAtuais.filter(function (t) { return t.status === 'campeao'; }).length;
            var qtdPerdedora = tagsAtuais.filter(function (t) { return t.status === 'perdedora'; }).length;

            cards.push({
                gateway: gw,
                regra: regra,
                tags: tagsAtuais,
                historico: hist,
                qtd_campeao: qtdCampeao,
                qtd_perdedora: qtdPerdedora,
                qtd_disputa: tagsAtuais.filter(function (t) { return t.pending; }).length,
                _dragging: false,
                _dragOver: false
            });
        });

        $scope._cardsGateway = cards;
        $scope._kpi = {
            gateways: ($scope._gatewaysSelecionados || []).length,
            campeao: cards.reduce(function (acc, c) { return acc + (c.qtd_campeao || 0); }, 0),
            perdedora: cards.reduce(function (acc, c) { return acc + (c.qtd_perdedora || 0); }, 0),
            leituras: $scope.leiturasFiltradas().length
        };
    };

    $scope.onVerRegra = function (regra, $event) {
        if ($event) {
            $event.preventDefault();
            $event.stopPropagation();
        }
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
        $scope._historicoPorGateway = {};
        $scope._estadoTagPorGateway = {};
        $scope.onRecalcularCards();
    };

    $scope.labelResultado = function (r) {
        if (r === 'ganhou') return 'Ganhou';
        if (r === 'perdeu') return 'Perdeu';
        if (r === 'manteve') return 'Manteve';
        if (r === 'disputando') return 'Disputando';
        return r || '—';
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
    });
});
