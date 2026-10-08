app.controller('portalOrdemMultiplasCtrl', function ($scope, $timeout, $http, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = [];
    $scope._carregandoOrdens = false;

    $scope._ui = {
        portalSel: 'expedicao01',
        pausado: false,
        tempoReal: true,
        filtroOrdem: 'todas',
        ordenacaoOrdem: 'ultimas_lidas',
        pesquisaPedido: '',
        limiteLeituras: 10,
        ordemExpandidaId: null,
        modoRetorno: false,
        finalizandoRetorno: false
    };

    $scope._portais = [
        { id: 'expedicao01', label: 'Portal - Expedição 01' },
        { id: 'expedicao02', label: 'Portal - Expedição 02' },
        { id: 'recebimento01', label: 'Portal - Recebimento 01' }
    ];

    
    $scope._kpis = [
        { valor: '0', label: 'Total de Ordens', icon: 'bi-file-earmark-text', iconClass: 'pom-kpi-blue', spark: false },
        { valor: '0', label: 'Pendentes', icon: 'bi-app', iconClass: 'pom-kpi-purple' },
        { valor: '0', label: 'Parciais', icon: 'bi-clock', iconClass: 'pom-kpi-orange' },
        { valor: '0', label: 'Concluídas', icon: 'bi-check-circle', iconClass: 'pom-kpi-green' }
    ];

    $scope._dataHoraTopo = moment().format('DD MMM YYYY - HH:mm:ss');

    var STATUS_UI = {
        em_andamento: { label: 'Em andamento', badge: 'badge-andamento', bar: 'bar-andamento', icon: 'icon-andamento' },
        parcial: { label: 'Parcial', badge: 'badge-parcial', bar: 'bar-parcial', icon: 'icon-parcial' },
        pendente: { label: 'Pendente', badge: 'badge-pendente', bar: 'bar-pendente', icon: 'icon-pendente' },
        concluida: { label: 'Concluída', badge: 'badge-concluida', bar: 'bar-concluida', icon: 'icon-concluida' }
    };

    var MAX_LEITURAS = 30;
    var IDLE_FECHA_LOTE_MS = 10000; // teste: 10s; produção ~25000
    var MAX_LOTES = 20;

    $scope._leituras = [];
    $scope._lotes = [];
    $scope._loteAtual = null;
    $scope._seqLoteDia = 0;
    $scope.socket = null;
    $scope._ordens = [];
    /** Cursor ISO do maior createdAt já carregado — refresh só pede ordens depois disso */
    $scope._ordensCursorCreatedAt = null;

    /** Sessão de retorno (modo retorno) — só front até Finalizar */
    $scope._retorno = {
        tagsMap: {},
        tags: [],
        qtd: 0
    };

    $scope._filtrosOrdem = [
        { id: 'todas', label: 'Todas', count: 0, class: 'tab-todas' },
        { id: 'pendentes', label: 'Pendentes', count: 0, class: 'tab-pendente' },
        { id: 'parciais', label: 'Parciais', count: 0, class: 'tab-parcial' },
        { id: 'concluidas', label: 'Concluídas', count: 0, class: 'tab-concluida' }
    ];

    function contagemItens(posicao) {
        var itens = (posicao && posicao.itens) || [];
        if (!Array.isArray(itens)) itens = [];
        var concluido = 0;
        itens.forEach(function (item) {
            if (!item) return;
            if (String(item.status || '').toLowerCase() === 'concluido') concluido += 1;
        });
        // total previsto (total_itens) com fallback para itens.length
        var totais = uteisService.normalizarTotaisPosicao
            ? uteisService.normalizarTotaisPosicao(posicao || { itens: itens })
            : { total_itens: itens.length, total_concluido: concluido };
        return {
            concluido: totais.total_concluido != null ? totais.total_concluido : concluido,
            total: totais.total_itens != null ? totais.total_itens : itens.length
        };
    }

    function statusUiFromPosicao(st) {
        var s = String(st || 'pendente').toLowerCase();
        if (s === 'concluido') return 'concluida';
        if (s === 'parcial') return 'parcial';
        if (s === 'pendente') return 'pendente';
        if (s === 'aberta' || s === 'partida') return 'em_andamento';
        return 'pendente';
    }

    function labelStatusItem(st) {
        var s = String(st || 'pendente').toLowerCase();
        var map = {
            pendente: { label: 'Pendente', cls: 'item-st-pendente' },
            concluido: { label: 'Concluído', cls: 'item-st-concluido' },
            excedente: { label: 'Excedente', cls: 'item-st-excedente' },
            nao_encontrado: { label: 'Não encontrado', cls: 'item-st-nao' }
        };
        return map[s] || { label: s, cls: 'item-st-pendente' };
    }

    function montarItensLinha(pos) {
        return (pos.itens || []).map(function (it, idx) {
            var st = labelStatusItem(it && it.status);
            var retornoData = it && it.retorno_data ? it.retorno_data : null;
            return {
                seq: idx + 1,
                tag: (it && it.tag) || '—',
                ean: (it && it.ean) || '—',
                status: (it && it.status) || 'pendente',
                statusLabel: st.label,
                statusClass: st.cls,
                retorno_data: retornoData,
                retornoHora: retornoData ? $scope.formatHoraLeitura(retornoData) : null,
                retornou: !!retornoData
            };
        });
    }

    function formatarHoraRelativo(data) {
        if (!data) return '—';
        var m = moment(data);
        if (!m.isValid()) return '—';
        m = m.utcOffset(-3);
        var hoje = moment().utcOffset(-3).startOf('day');
        if (m.clone().startOf('day').isSame(hoje)) return 'Hoje ' + m.format('HH:mm');
        var ontem = hoje.clone().subtract(1, 'day');
        if (m.clone().startOf('day').isSame(ontem)) return 'Ontem ' + m.format('HH:mm');
        return m.format('DD/MM HH:mm');
    }

    /** Exibe só hora da leitura (HH:mm:ss), fuso Brasília */
    $scope.formatHoraLeitura = function (valor) {
        if (valor == null || valor === '') return '—';
        // Já veio como "HH:mm:ss"
        if (typeof valor === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(valor.trim())) {
            var p = valor.trim().split(':');
            return (p[0].length === 1 ? '0' + p[0] : p[0]) + ':' + p[1] + ':' + (p[2] || '00');
        }
        var m = moment(valor);
        if (!m.isValid()) {
            // "YYYY-MM-DD HH:mm:ss"
            m = moment(valor, ['YYYY-MM-DD HH:mm:ss', 'DD/MM/YYYY HH:mm:ss'], true);
        }
        if (!m.isValid()) return '—';
        return m.utcOffset(-3).format('HH:mm:ss');
    };

    function montarOrdemView(pos) {
        var cnt = contagemItens(pos);
        var total = cnt.total || 0;
        var lidos = cnt.concluido || 0;
        var pct = total > 0 ? Math.round((lidos / total) * 100) : 0;
        var statusUi = statusUiFromPosicao(pos.status);
        var st = STATUS_UI[statusUi] || STATUS_UI.pendente;

        var idDoc = pos.id_doc || pos._id || '';
        if (idDoc && idDoc.indexOf('#') !== 0) idDoc = '#' + idDoc;

        var cliente = (pos.descricao && String(pos.descricao).trim())
            ? String(pos.descricao).trim()
            : '';
        if (!cliente && pos.id_colaborador && typeof pos.id_colaborador === 'object') {
            cliente = pos.id_colaborador.nome || pos.id_colaborador.descricao || '';
        }
        if (cliente) cliente = 'Nota: ' + cliente;

        var refData = pos.status_data || pos.partida_data || pos.updatedAt || pos.createdAt;

        var itensView = montarItensLinha(pos);
        var ultimoRetorno = null;
        (pos.itens || []).forEach(function (it) {
            if (!it || !it.retorno_data) return;
            var t = new Date(it.retorno_data).getTime();
            if (!isNaN(t) && (ultimoRetorno == null || t > ultimoRetorno)) ultimoRetorno = t;
        });

        return {
            _id: pos._id,
            id_doc: idDoc,
            cliente: cliente || '—',
            hora: formatarHoraRelativo(refData),
            status: statusUi,
            statusRaw: pos.status,
            statusLabel: st.label,
            badgeClass: st.badge,
            barClass: st.bar,
            iconClass: st.icon,
            lidos: lidos,
            total: total,
            pct: pct,
            _sortStatusData: refData ? new Date(refData).getTime() : 0,
            itens: itensView,
            retornou: ultimoRetorno != null,
            retornoHora: ultimoRetorno != null ? $scope.formatHoraLeitura(new Date(ultimoRetorno)) : null,
            _posicao: pos
        };
    }

    function atualizarKpisEAbas(ordens) {
        ordens = ordens || [];
        var nAndamento = 0;
        var nPendente = 0;
        var nParcial = 0;
        var nConcluida = 0;

        ordens.forEach(function (o) {
            if (o.status === 'em_andamento') nAndamento += 1;
            else if (o.status === 'pendente') nPendente += 1;
            else if (o.status === 'parcial') nParcial += 1;
            else if (o.status === 'concluida') nConcluida += 1;
        });

        $scope._kpis[0].valor = String(ordens.length);
        $scope._kpis[1].valor = String(nPendente);
        $scope._kpis[2].valor = String(nParcial + nAndamento);
        $scope._kpis[3].valor = String(nConcluida);

        $scope._filtrosOrdem[0].count = ordens.length;
        $scope._filtrosOrdem[1].count = nPendente;
        $scope._filtrosOrdem[2].count = nParcial + nAndamento;
        $scope._filtrosOrdem[3].count = nConcluida;
    }

    function avancarCursorOrdens(docs) {
        (docs || []).forEach(function (pos) {
            if (!pos || !pos.createdAt) return;
            var t = new Date(pos.createdAt).getTime();
            if (isNaN(t)) return;
            var atual = $scope._ordensCursorCreatedAt
                ? new Date($scope._ordensCursorCreatedAt).getTime()
                : 0;
            if (t > atual) {
                $scope._ordensCursorCreatedAt = new Date(pos.createdAt).toISOString();
            }
        });
    }

    /**
     * Carrega ordens do portal.
     * - Primeira carga (ou forcarCompleto): todas do dia + pendente/parcial dos últimos 2 anos.
     * - Poll: só createdAt > cursor do dia corrente (*gt no /_bd) — append sem limpar a lista.
     */
    $scope.onCarregaOrdens = async function (forcarCompleto) {
        if (!$scope._regConta || !$scope._regConta._id) return;

        var cargaCompleta = !!forcarCompleto || !$scope._ordensCursorCreatedAt;
        var listaVazia = !($scope._ordens && $scope._ordens.length);

        // Spinner só na 1ª carga (evita “piscar” a lista no poll)
        if (cargaCompleta && listaVazia) {
            $scope._carregandoOrdens = true;
        }

        try {
            var hoje = moment().format('YYYY-MM-DD');
            var ontem = moment().subtract(1, 'day').format('YYYY-MM-DD');
            var inicioAnteriores = moment().subtract(2, 'years').format('YYYY-MM-DD');
            var baseUrl = '/_bd?c=posicao&id_conta=' + encodeURIComponent($scope._regConta._id)
                + '&tipo=conferencia'
                + '&_sort=createdAt'
                + '&pop=id_colaborador';

            var urlHoje = baseUrl + '&partida_data=*dtP' + hoje + '|' + hoje;

            if (!cargaCompleta && $scope._ordensCursorCreatedAt) {
                urlHoje += '&createdAt=*gt' + encodeURIComponent($scope._ordensCursorCreatedAt);
            }

            var res;
            var doDia = [];
            if (cargaCompleta) {
                // Dia corrente (todas) + dias anteriores só pendente/parcial
                var urlAnteriores = baseUrl
                    + '&partida_data=*dtP' + inicioAnteriores + '|' + ontem
                    + '&status*in=' + encodeURIComponent(JSON.stringify(['pendente', 'parcial']));

                var pares = await Promise.all([
                    uteisService.getBase(urlHoje).catch(function () { return []; }),
                    uteisService.getBase(urlAnteriores).catch(function () { return []; })
                ]);
                doDia = Array.isArray(pares[0]) ? pares[0] : [];
                var anteriores = Array.isArray(pares[1]) ? pares[1] : [];
                var vistos = {};
                res = [];
                [doDia, anteriores].forEach(function (lista) {
                    (lista || []).forEach(function (pos) {
                        if (!pos || !pos._id) return;
                        var id = String(pos._id);
                        if (vistos[id]) return;
                        vistos[id] = true;
                        res.push(pos);
                    });
                });
            } else {
                res = await uteisService.getBase(urlHoje).catch(function () { return []; });
                if (!Array.isArray(res)) res = [];
            }

            if (cargaCompleta) {
                $scope._ordens = res.map(montarOrdemView);
                $scope._ordensCursorCreatedAt = null;
                // Cursor do poll só considera o dia corrente (novas ordens de hoje)
                avancarCursorOrdens(doDia);
                if (!doDia.length) {
                    $scope._ordensCursorCreatedAt = moment().startOf('day').toISOString();
                }
            } else if (res.length) {
                var idsExistentes = {};
                ($scope._ordens || []).forEach(function (o) {
                    if (o && o._id) idsExistentes[String(o._id)] = true;
                });
                // res vem _sort=createdAt desc; inserir no topo preservando array (sem recriar lista inteira)
                var adicionadas = [];
                for (var i = res.length - 1; i >= 0; i--) {
                    var pos = res[i];
                    if (!pos || !pos._id || idsExistentes[String(pos._id)]) continue;
                    $scope._ordens.unshift(montarOrdemView(pos));
                    adicionadas.push(pos);
                }
                avancarCursorOrdens(adicionadas.length ? adicionadas : res);
            }

            atualizarKpisEAbas($scope._ordens);
        } catch (e) {
            if (cargaCompleta && listaVazia) {
                $scope._ordens = [];
                atualizarKpisEAbas([]);
            }
            uteisService.onToast('Não foi possível carregar as ordens.', 'warning', 2500, 'top-end');
        } finally {
            $scope._carregandoOrdens = false;
            $timeout(function () { }, 0);
        }
    };

    function ordenarLista(lista) {
        lista = (lista || []).slice();
        var ord = $scope._ui.ordenacaoOrdem;
        if (ord === 'id_doc') {
            lista.sort(function (a, b) {
                return String(a.id_doc || '').localeCompare(String(b.id_doc || ''));
            });
        } else if (ord === 'mais_pendentes') {
            lista.sort(function (a, b) { return (a.pct || 0) - (b.pct || 0); });
        } else {
            lista.sort(function (a, b) { return (b._sortStatusData || 0) - (a._sortStatusData || 0); });
        }
        return lista;
    }

    function receberLeiturasSocket(data) {
        if ($scope._ui.pausado) return;

        var leituras = data;
        if (typeof leituras === 'string') {
            try {
                leituras = JSON.parse(leituras);
            } catch (e) {
                leituras = [{ raw: data }];
            }
        }
        if (!Array.isArray(leituras)) {
            leituras = [leituras];
        }

        leituras.forEach(function (leitura) {
            if (leitura == null) return;
            $scope.onTagSocket(leitura);
        });
    }

    $scope.onIniciarSocketLeituras = function () {
        if ($scope.socket) {
            if ($scope._regConta && $scope._regConta._id) {
                $scope.socket.emit('portal_leave', { id_conta: $scope._regConta._id });
            }
            $scope.socket.disconnect();
            $scope.socket = null;
        }

        if (!$scope._regConta || !$scope._regConta._id) return;

        $scope.socket = io();

        function entrarPresencePortal() {
            if (!$scope.socket || !$scope._regConta || !$scope._regConta._id) return;
            $scope.socket.emit('portal_join', { id_conta: $scope._regConta._id });
        }

        var idConta = $scope._regConta._id;
        $scope.socket.on('connect', entrarPresencePortal);
        if ($scope.socket.connected) {
            entrarPresencePortal();
        }

        $scope.socket.on(idConta, function (data) {
            try {
                receberLeiturasSocket(data);
                $scope.$applyAsync();
            } catch (err) {
                console.error('Erro ao listar leitura (socket):', err, data);
            }
        });
    };

    $scope.leiturasVisiveis = function () {
        var lim = $scope._ui.limiteLeituras || 10;
        return ($scope._leituras || []).slice(0, lim);
    };

    $scope.ordensFiltradas = function () {
        var f = $scope._ui.filtroOrdem;
        var lista = $scope._ordens || [];
        if (f === 'pendentes') {
            lista = lista.filter(function (o) { return o.status === 'pendente'; });
        } else if (f === 'parciais') {
            lista = lista.filter(function (o) {
                return o.status === 'parcial' || o.status === 'em_andamento';
            });
        } else if (f === 'concluidas') {
            lista = lista.filter(function (o) { return o.status === 'concluida'; });
        }

        // Busca por id_doc / descrição quando ordenação = Nº pedido
        if ($scope._ui.ordenacaoOrdem === 'id_doc') {
            var q = String($scope._ui.pesquisaPedido || '').trim().toLowerCase();
            if (q) {
                lista = lista.filter(function (o) {
                    if (!o) return false;
                    var idDoc = String(o.id_doc || '').toLowerCase();
                    var desc = String(o.cliente || o.descricao || '').toLowerCase();
                    var raw = (o._posicao && o._posicao.descricao)
                        ? String(o._posicao.descricao).toLowerCase()
                        : '';
                    return idDoc.indexOf(q) !== -1
                        || desc.indexOf(q) !== -1
                        || raw.indexOf(q) !== -1;
                });
            }
        }

        return ordenarLista(lista);
    };

    $scope.$watch('_ui.ordenacaoOrdem', function (novo, antigo) {
        if (novo === 'id_doc') {
            // Ao filtrar por pedido, status volta para Todas
            $scope._ui.filtroOrdem = 'todas';
        } else if (antigo === 'id_doc' && novo !== 'id_doc') {
            $scope._ui.pesquisaPedido = '';
        }
    });

    /** Bloqueia iniciar retorno se houver lote aberto ou persistindo */
    $scope.retornoBloqueadoPorLote = function () {
        if ($scope._loteAtual && $scope._loteAtual.status === 'aberto') return true;
        return ($scope._lotes || []).some(function (l) {
            return l && (l.persistindo || l.status === 'aberto');
        });
    };

    $scope.podeIniciarRetorno = function () {
        return !$scope._ui.modoRetorno
            && !$scope._ui.finalizandoRetorno
            && !$scope.retornoBloqueadoPorLote();
    };

    function resetSessaoRetorno() {
        $scope._retorno = { tagsMap: {}, tags: [], qtd: 0 };
    }

    $scope.onIniciarRetorno = function () {
        if (!$scope.podeIniciarRetorno()) {
            uteisService.onToast('Aguarde o lote atual finalizar antes do retorno.', 'warning', 2200, 'top-end');
            return;
        }
        resetSessaoRetorno();
        $scope._ui.modoRetorno = true;
        uteisService.onToast('Modo retorno ativo — leia as tags.', 'info', 2200, 'top-end');
    };

    $scope.onCancelarRetorno = function () {
        if (!$scope._ui.modoRetorno) return;

        ($scope._retorno.tags || []).forEach(function (t) {
            if (!t || !t.id_ordem) return;
            var ordem = ($scope._ordens || []).find(function (o) { return o._id === t.id_ordem; });
            if (!ordem) return;
            var item = (ordem.itens || []).find(function (it) {
                return normalizaTag(it.tag) === t.chave;
            });
            if (!item) return;

            if (t.reverteuStatus && t.statusAntes) {
                var st = labelStatusItem(t.statusAntes);
                item.status = t.statusAntes;
                item.statusLabel = st.label;
                item.statusClass = st.cls;
            }
            if (item._retornoSessao) {
                item.retorno_data = t.retornoDataAnterior || null;
                item.retornoHora = item.retorno_data ? $scope.formatHoraLeitura(item.retorno_data) : null;
                item.retornou = !!item.retorno_data;
            }
            item._retornoSessao = false;
            recalcularOrdemLocal(ordem);
            atualizarFlagRetornoOrdem(ordem);
        });

        // Remove leituras desta sessão de retorno da lista
        $scope._leituras = ($scope._leituras || []).filter(function (l) {
            return !l || !l.retornoSessao;
        });

        resetSessaoRetorno();
        $scope._ui.modoRetorno = false;
        $scope._ui.finalizandoRetorno = false;
        atualizarKpisEAbas($scope._ordens);
        uteisService.onToast('Retorno cancelado.', 'warning', 2000, 'top-end');
    };

    function atualizarFlagRetornoOrdem(ordem) {
        if (!ordem) return;
        var ultimo = null;
        (ordem.itens || []).forEach(function (it) {
            if (!it || !it.retorno_data) return;
            var t = new Date(it.retorno_data).getTime();
            if (!isNaN(t) && (ultimo == null || t > ultimo)) ultimo = t;
        });
        ordem.retornou = ultimo != null;
        ordem.retornoHora = ultimo != null ? $scope.formatHoraLeitura(new Date(ultimo)) : null;
    }

    $scope.onFinalizarRetorno = async function () {
        if (!$scope._ui.modoRetorno || $scope._ui.finalizandoRetorno) return;

        var aPersistir = ($scope._retorno.tags || []).filter(function (t) {
            return t && t.id_ordem && t.tag && !t.excedente;
        });

        if (!aPersistir.length) {
            uteisService.onToast('Nenhuma tag de retorno para gravar.', 'warning', 2200, 'top-end');
            resetSessaoRetorno();
            $scope._ui.modoRetorno = false;
            return;
        }

        var idConta = ($scope._regConta && $scope._regConta._id) || '';
        if (!idConta) {
            uteisService.onToast('Conta não identificada.', 'warning', 2200, 'top-end');
            return;
        }

        $scope._ui.finalizandoRetorno = true;
        try {
            var resHttp = await $http.post(
                uteisService.apiUrl_() + '/posicao/retorno-tags',
                {
                    id_conta: idConta,
                    itens: aPersistir.map(function (t) {
                        return {
                            id_posicao: t.id_ordem,
                            tag: t.tag,
                            retorno_data: t.retorno_data
                        };
                    })
                },
                { headers: { 'Content-Type': 'application/json' } }
            );
            var res = resHttp && resHttp.data ? resHttp.data : null;
            if (!res || res.ok === false) {
                uteisService.onToast('Falha ao gravar retorno.', 'error', 2500, 'top-end');
            } else {
                aPersistir.forEach(function (t) {
                    var ordem = ($scope._ordens || []).find(function (o) { return o._id === t.id_ordem; });
                    if (!ordem) return;
                    var item = (ordem.itens || []).find(function (it) {
                        return normalizaTag(it.tag) === t.chave;
                    });
                    if (item) item._retornoSessao = false;
                    atualizarFlagRetornoOrdem(ordem);
                    if (res.resultados) {
                        var r = res.resultados.find(function (x) {
                            return x && normalizaTag(x.tag) === t.chave;
                        });
                        if (r && r.posicao) {
                            marcarItemPersistidoLocal(t.chave, { posicao: r.posicao });
                        } else {
                            recalcularOrdemLocal(ordem);
                        }
                    }
                });
                uteisService.onToast(
                    'Retorno gravado · ' + (res.retornos || aPersistir.length) + ' tag(s)',
                    'success',
                    2800,
                    'top-end'
                );
            }
        } catch (err) {
            console.error('[retorno] finalizar', err);
            uteisService.onToast('Erro de rede ao gravar retorno.', 'error', 2500, 'top-end');
        } finally {
            resetSessaoRetorno();
            $scope._ui.modoRetorno = false;
            $scope._ui.finalizandoRetorno = false;
            $timeout(function () { }, 0);
        }
    };

    $scope.onVerMaisLeituras = function () {
        $scope._ui.limiteLeituras = Math.min(30, ($scope._ui.limiteLeituras || 10) + 10);
    };

    $scope.onFiltroOrdem = function (id) {
        $scope._ui.filtroOrdem = id;
    };

    $scope.ordemEstaAberta = function (ordem) {
        return !!(ordem && ordem._id && $scope._ui.ordemExpandidaId === ordem._id);
    };

    $scope.onToggleOrdemExpand = function (ordem, $event) {
        if ($event) {
            $event.preventDefault();
            $event.stopPropagation();
        }
        if (!ordem || !ordem._id) return;
        if ($scope._ui.ordemExpandidaId === ordem._id) {
            $scope._ui.ordemExpandidaId = null;
        } else {
            $scope._ui.ordemExpandidaId = ordem._id;
        }
    };

    var _tickRelogio = null;
    var _timerOrdens = null;

    function iniciarRelogio() {
        if (_tickRelogio) $timeout.cancel(_tickRelogio);
        function tick() {
            if (!$scope._ui.pausado) {
                $scope._dataHoraTopo = moment().format('DD MMM YYYY - HH:mm:ss');
            }
            _tickRelogio = $timeout(tick, 1000);
        }
        tick();
    }

    function iniciarAutoOrdens() {
        if (_timerOrdens) $timeout.cancel(_timerOrdens);
        if (!$scope._ui.tempoReal || $scope._ui.pausado) return;
        var INTERVALO_ORDENS_MS = 10000;
        _timerOrdens = $timeout(async function tick() {
            await $scope.onCarregaOrdens(false);
            if ($scope._ui.tempoReal && !$scope._ui.pausado) {
                _timerOrdens = $timeout(tick, INTERVALO_ORDENS_MS);
            }
        }, INTERVALO_ORDENS_MS);
    }

    $scope.$on('$destroy', function () {
        if (_tickRelogio) $timeout.cancel(_tickRelogio);
        if (_timerOrdens) $timeout.cancel(_timerOrdens);
        if ($scope._loteAtual && $scope._loteAtual.status === 'aberto') {
            fecharLote($scope._loteAtual);
        }
        cancelarIdleLote($scope._loteAtual);
        if ($scope.socket) {
            if ($scope._regConta && $scope._regConta._id) {
                $scope.socket.emit('portal_leave', { id_conta: $scope._regConta._id });
            }
            $scope.socket.disconnect();
            $scope.socket = null;
        }
    });

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta') || {};
        $scope._regConta = uteisService.normalizarConta($scope._regConta);
        $scope._regColaborador = uteisService.getCookie('_colaborador') || [];
        iniciarRelogio();
        $scope.onIniciarSocketLeituras();
        await $scope.onCarregaOrdens(true);
        iniciarAutoOrdens();
    });

    // ------------------------------------------------------------------
    // Lotes (pallet): abertura / idle por TAG NOVA / fechamento
    // TESTE: não altera registro de ordens no banco
    // ------------------------------------------------------------------

    function normalizaTag(valor) {
        if (valor == null) return '';
        return String(valor).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    }

    function cancelarIdleLote(lote) {
        if (lote && lote._timerIdle) {
            $timeout.cancel(lote._timerIdle);
            lote._timerIdle = null;
        }
    }

    function abrirLote() {
        $scope._seqLoteDia += 1;
        var lote = {
            id: 'L' + moment().format('HHmmss') + '-' + $scope._seqLoteDia,
            seq: $scope._seqLoteDia,
            inicio: new Date(),
            fim: null,
            status: 'aberto',
            tagsMap: {},
            tags: [],
            qtdTags: 0,
            _timerIdle: null
        };
        $scope._loteAtual = lote;
        $scope._lotes.unshift(lote);
        if ($scope._lotes.length > MAX_LOTES) {
            $scope._lotes.length = MAX_LOTES;
        }

        console.log('[lote] ABERTO', lote.id, 'P' + lote.seq);
        // uteisService.onToast('Lote P' + lote.seq + ' iniciado', 'info', 1800, 'top-end');
        return lote;
    }

    /**
     * Fecha o lote após silêncio de tag nova e persiste tags casadas na posição.
     */
    function fecharLote(lote) {
        if (!lote || lote.status !== 'aberto') return;

        cancelarIdleLote(lote);
        lote.status = 'fechado';
        lote.fim = new Date();
        lote.duracaoSeg = Math.round((lote.fim - lote.inicio) / 1000);

        if ($scope._loteAtual && $scope._loteAtual.id === lote.id) {
            $scope._loteAtual = null;
        }

        console.log('[lote] FECHADO', {
            id: lote.id,
            seq: lote.seq,
            qtdTags: lote.qtdTags,
            duracaoSeg: lote.duracaoSeg,
            tags: lote.tags.map(function (t) { return t.tag; })
        });
        // uteisService.onToast(
        //     'Lote P' + lote.seq + ' fechado · ' + lote.qtdTags + ' tags · ' + lote.duracaoSeg + 's',
        //     'success',
        //     2500,
        //     'top-end'
        // );

        processarTagsDoLote(lote);
    }

    /**
     * Persiste no banco (posição) as tags do lote que casaram com ordem.
     * Usa POST /posicao/atender-tags em batch com id_posicao (O(1) por ordem).
     */
    async function processarTagsDoLote(lote) {
        if (!lote || !Array.isArray(lote.tags) || !lote.tags.length) return;

        var idConta = ($scope._regConta && $scope._regConta._id) || '';
        if (!idConta) {
            uteisService.onToast('Conta não identificada — lote não persistido.', 'warning', 2500, 'top-end');
            return;
        }

        var aPersistir = lote.tags.filter(function (t) {
            return t && !t.excedente && t.precisaPersistir && t.tag && t.id_ordem;
        });

        if (!aPersistir.length) {
            console.log('[lote] P' + lote.seq + ' sem tags para persistir (só excedentes ou já gravadas)');
            return;
        }

        lote.persistindo = true;
        var ok = 0;
        var falha = 0;
        var notFound = 0;

        var payload = {
            id_conta: idConta,
            itens: aPersistir.map(function (t) {
                return {
                    id_posicao: t.id_ordem,
                    tag: t.tag,
                    rssi: t.rssi != null ? t.rssi : ''
                };
            })
        };

        try {
            var resHttp = await $http.post(
                uteisService.apiUrl_() + '/posicao/atender-tags',
                payload,
                { headers: { 'Content-Type': 'application/json' } }
            );
            var res = resHttp && resHttp.data ? resHttp.data : null;

            if (!res || res.ok === false) {
                falha = aPersistir.length;
                console.error('[lote] atender-tags falhou', res);
            } else {
                ok = res.atendidos || 0;
                notFound = res.not_found || 0;
                falha = res.erros || 0;

                var porTag = {};
                (res.resultados || []).forEach(function (r) {
                    if (!r || !r.tag) return;
                    porTag[normalizaTag(r.tag)] = r;
                });

                aPersistir.forEach(function (t) {
                    var r = porTag[t.chave] || porTag[normalizaTag(t.tag)];
                    if (!r) {
                        t.persistResultado = 'sem_retorno';
                        return;
                    }
                    t.persistResultado = r.resultado;
                    if (r.resultado === 'atendido') {
                        t.precisaPersistir = false;
                        t.id_posicao = r.id_posicao || t.id_ordem;
                        marcarItemPersistidoLocal(t.chave, r);
                    } else if (r.resultado === 'not_found') {
                        t.excedente = true;
                        t.precisaPersistir = false;
                    }
                });
            }
        } catch (err) {
            falha = aPersistir.length;
            console.error('[lote] erro ao persistir batch', err);
        }

        lote.persistindo = false;
        lote.persistResumo = { ok: ok, falha: falha, notFound: notFound };

        console.log('[lote] P' + lote.seq + ' persistência batch', lote.persistResumo);

        var msg = 'Lote P' + lote.seq + ' · ' + ok + ' tag(s) gravada(s)';
        if (notFound) msg += ' · ' + notFound + ' não encontrada(s)';
        if (falha) msg += ' · ' + falha + ' erro(s)';
        uteisService.onToast(msg, falha ? 'warning' : 'success', 3200, 'top-end');
        $timeout(function () { }, 0);
    }

    function marcarItemPersistidoLocal(chave, resApi) {
        var hit = localizarItemPorTag(chave);
        if (!hit) return;
        hit.item._pendentePersistir = false;
        hit.item._persistido = true;
        if (resApi && resApi.posicao) {
            var stApi = String(resApi.posicao.status || '').toLowerCase();
            if (stApi === 'concluido' || stApi === 'parcial' || stApi === 'pendente') {
                // Alinha UI com status real do pedido após o update atômico
                var total = resApi.posicao.total_itens;
                var concluidos = resApi.posicao.concluidos;
                if (typeof total === 'number' && typeof concluidos === 'number') {
                    hit.ordem.lidos = concluidos;
                    hit.ordem.total = total;
                    hit.ordem.pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;
                }
                var statusUi = statusUiFromPosicao(stApi);
                var st = STATUS_UI[statusUi] || STATUS_UI.pendente;
                hit.ordem.status = statusUi;
                hit.ordem.statusRaw = stApi;
                hit.ordem.statusLabel = st.label;
                hit.ordem.badgeClass = st.badge;
                hit.ordem.barClass = st.bar;
                hit.ordem.iconClass = st.icon;
                atualizarKpisEAbas($scope._ordens);
            }
        }
    }

    function agendarFechamentoLote(lote) {
        cancelarIdleLote(lote);
        lote._timerIdle = $timeout(function () {
            fecharLote(lote);
        }, IDLE_FECHA_LOTE_MS);
    }

    function recalcularOrdemLocal(ordem) {
        if (!ordem) return;
        var pos = ordem._posicao || { itens: ordem.itens || [], total_itens: ordem.total };
        if (ordem.itens) pos.itens = ordem.itens;
        var totais = uteisService.normalizarTotaisPosicao
            ? uteisService.normalizarTotaisPosicao(pos)
            : { total_itens: (ordem.itens || []).length, total_concluido: 0, status: 'pendente' };

        var total = totais.total_itens || 0;
        var lidos = totais.total_concluido || 0;
        ordem.lidos = lidos;
        ordem.total = total;
        ordem.pct = total > 0 ? Math.round((lidos / total) * 100) : 0;
        if (ordem._posicao) {
            ordem._posicao.total_itens = total;
            ordem._posicao.total_concluido = lidos;
            ordem._posicao.status = totais.status;
        }

        var statusUi = statusUiFromPosicao(totais.status);
        var st = STATUS_UI[statusUi] || STATUS_UI.pendente;
        ordem.status = statusUi;
        ordem.statusRaw = totais.status;
        ordem.statusLabel = st.label;
        ordem.badgeClass = st.badge;
        ordem.barClass = st.bar;
        ordem.iconClass = st.icon;
        ordem._sortStatusData = Date.now();
        atualizarKpisEAbas($scope._ordens);
    }

    /**
     * Localiza item pela tag nas ordens em memória.
     * Prefere ordens abertas e itens ainda pendentes (sem gravar no banco).
     */
    function localizarItemPorTag(chave) {
        if (!chave) return null;
        var candidatos = [];
        ($scope._ordens || []).forEach(function (ord) {
            (ord.itens || []).forEach(function (item, idx) {
                if (!item) return;
                if (normalizaTag(item.tag) !== chave) return;
                candidatos.push({ ordem: ord, item: item, idx: idx });
            });
        });
        if (!candidatos.length) return null;

        candidatos.sort(function (a, b) {
            function score(c) {
                var s = 0;
                if (c.ordem.status !== 'concluida') s += 10;
                if (String(c.item.status || '').toLowerCase() !== 'concluido') s += 5;
                return s;
            }
            return score(b) - score(a);
        });
        return candidatos[0];
    }

    /**
     * Aplica leitura só na UI: item → concluido; ordem → pendente/parcial/concluida.
     * Tag fora de qualquer ordem → excedente (roxo). Sem persistência (isso no fechar lote).
     * @returns {{ excedente: boolean, precisaPersistir: boolean, id_ordem: string|null }}
     */
    function aplicarTagNasOrdens(chave, tagRaw, linha) {
        var hit = localizarItemPorTag(chave);
        if (!hit) {
            linha.excedente = true;
            linha.match = 'excedente';
            linha.matchLabel = 'Excedente';
            return { excedente: true, precisaPersistir: false, id_ordem: null };
        }

        var item = hit.item;
        var ordem = hit.ordem;
        var precisaPersistir = false;
        var st = labelStatusItem('concluido');

        if (String(item.status || '').toLowerCase() !== 'concluido') {
            item.status = 'concluido';
            item.statusLabel = st.label;
            item.statusClass = st.cls;
            item._pendentePersistir = true;
            precisaPersistir = true;
        } else if (item._pendentePersistir && !item._persistido) {
            precisaPersistir = true;
        }

        linha.excedente = false;
        linha.match = 'ok';
        linha.matchLabel = ordem.id_doc || ordem._id;
        linha.id_ordem = ordem._id;

        ($scope._ordens || []).forEach(function (o) {
            if (o) o._hitLocal = false;
        });
        ordem._hitLocal = true;
        recalcularOrdemLocal(ordem);
        $scope._ui.ordemExpandidaId = ordem._id;
        $scope._ui.ordenacaoOrdem = 'ultimas_lidas';
        return { excedente: false, precisaPersistir: precisaPersistir, id_ordem: ordem._id };
    }

    function localizarItemPorTagRetorno(chave) {
        if (!chave) return null;
        var candidatos = [];
        ($scope._ordens || []).forEach(function (ord) {
            (ord.itens || []).forEach(function (item, idx) {
                if (!item) return;
                if (normalizaTag(item.tag) !== chave) return;
                candidatos.push({ ordem: ord, item: item, idx: idx });
            });
        });
        if (!candidatos.length) return null;
        // No retorno, prioriza item ainda concluído (será reaberto na UI)
        candidatos.sort(function (a, b) {
            function score(c) {
                var s = 0;
                if (String(c.item.status || '').toLowerCase() === 'concluido') s += 10;
                if (c.ordem.status === 'concluida') s += 3;
                return s;
            }
            return score(b) - score(a);
        });
        return candidatos[0];
    }

    /**
     * Modo retorno (só UI até Finalizar):
     * - concluido → pendente
     * - pendente → mantém
     * - grava retorno_data local em todos os itens lidos
     */
    function aplicarTagRetorno(chave, tagRaw, linha) {
        var hit = localizarItemPorTagRetorno(chave);
        if (!hit) {
            linha.excedente = true;
            linha.match = 'excedente';
            linha.matchLabel = 'Excedente';
            linha.retorno = true;
            return { excedente: true, id_ordem: null };
        }

        var item = hit.item;
        var ordem = hit.ordem;
        var agora = new Date();
        var statusAntes = String(item.status || 'pendente').toLowerCase();
        var retornoDataAnterior = item.retorno_data || null;
        var reverteuStatus = false;

        if (statusAntes === 'concluido') {
            var stPend = labelStatusItem('pendente');
            item._retornoBackup = {
                status: 'concluido',
                statusLabel: item.statusLabel,
                statusClass: item.statusClass
            };
            item.status = 'pendente';
            item.statusLabel = stPend.label;
            item.statusClass = stPend.cls;
            reverteuStatus = true;
        }

        item.retorno_data = agora;
        item.retornoHora = $scope.formatHoraLeitura(agora);
        item.retornou = true;
        item._retornoSessao = true;

        linha.excedente = false;
        linha.match = 'retorno';
        linha.matchLabel = (ordem.id_doc || ordem._id) + ' · retorno';
        linha.id_ordem = ordem._id;
        linha.retorno = true;

        ($scope._ordens || []).forEach(function (o) {
            if (o) o._hitLocal = false;
        });
        ordem._hitLocal = true;
        recalcularOrdemLocal(ordem);
        atualizarFlagRetornoOrdem(ordem);
        $scope._ui.ordemExpandidaId = ordem._id;

        return {
            excedente: false,
            id_ordem: ordem._id,
            statusAntes: statusAntes,
            reverteuStatus: reverteuStatus,
            retorno_data: agora,
            retornoDataAnterior: retornoDataAnterior
        };
    }

    function onTagSocketRetorno(leitura) {
        var tagRaw = leitura.tag || '';
        var chave = normalizaTag(tagRaw);
        if (!chave) return;

        var ehNova = !$scope._retorno.tagsMap[chave];
        var linha = Object.assign({}, leitura, {
            tag: tagRaw,
            id_lote: 'RET',
            lote_seq: 'R',
            lote_nova: ehNova,
            _chave: chave,
            _recebidoEm: new Date(),
            excedente: false,
            match: null,
            matchLabel: null,
            retorno: true,
            retornoSessao: true
        });

        if (ehNova) {
            var info = aplicarTagRetorno(chave, tagRaw, linha);
            $scope._retorno.tagsMap[chave] = true;
            $scope._retorno.tags.push({
                tag: tagRaw,
                chave: chave,
                rssi: leitura.rssi,
                excedente: !!(info && info.excedente),
                id_ordem: (info && info.id_ordem) || null,
                statusAntes: (info && info.statusAntes) || null,
                reverteuStatus: !!(info && info.reverteuStatus),
                retorno_data: (info && info.retorno_data) || new Date(),
                retornoDataAnterior: (info && info.retornoDataAnterior) || null
            });
            $scope._retorno.qtd = $scope._retorno.tags.length;

            $scope._leituras.unshift(linha);
            if ($scope._leituras.length > MAX_LEITURAS) {
                $scope._leituras.length = MAX_LEITURAS;
            }
        } else {
            var existente = ($scope._leituras || []).find(function (l) {
                return l.retornoSessao && l._chave === chave;
            });
            if (existente) {
                existente.rssi = leitura.rssi;
                existente.data_leitura = leitura.data_leitura || existente.data_leitura;
                existente._recebidoEm = new Date();
            }
        }
    }

    /**
     * Entrada única por leitura do socket.
     * - Modo retorno: trata à parte (sem lote de saída)
     * - Senão: abre lote + match local + persiste no fechar
     */
    $scope.onTagSocket = function (leitura) {
        if (!leitura || $scope._ui.pausado) return;

        if ($scope._ui.modoRetorno) {
            onTagSocketRetorno(leitura);
            return;
        }

        var tagRaw = leitura.tag || '';
        var chave = normalizaTag(tagRaw);
        if (!chave) return;

        var lote = $scope._loteAtual;
        if (!lote || lote.status !== 'aberto') {
            lote = abrirLote();
        }

        var ehNovaNoLote = !lote.tagsMap[chave];

        var linha = Object.assign({}, leitura, {
            tag: tagRaw,
            id_lote: lote.id,
            lote_seq: lote.seq,
            lote_nova: ehNovaNoLote,
            _chave: chave,
            _recebidoEm: new Date(),
            excedente: false,
            match: null,
            matchLabel: null,
            retorno: false
        });

        if (ehNovaNoLote) {
            var matchInfo = aplicarTagNasOrdens(chave, tagRaw, linha);

            lote.tagsMap[chave] = true;
            lote.tags.push({
                tag: tagRaw,
                chave: chave,
                rssi: leitura.rssi,
                data_leitura: leitura.data_leitura || linha._recebidoEm,
                excedente: !!(matchInfo && matchInfo.excedente),
                precisaPersistir: !!(matchInfo && matchInfo.precisaPersistir),
                id_ordem: (matchInfo && matchInfo.id_ordem) || null
            });
            lote.qtdTags = lote.tags.length;

            $scope._leituras.unshift(linha);
            if ($scope._leituras.length > MAX_LEITURAS) {
                $scope._leituras.length = MAX_LEITURAS;
            }

            agendarFechamentoLote(lote);
        } else {
            var existente = ($scope._leituras || []).find(function (l) {
                return l.id_lote === lote.id && l._chave === chave;
            });
            if (existente) {
                existente.rssi = leitura.rssi;
                existente.data_leitura = leitura.data_leitura || existente.data_leitura;
                existente._recebidoEm = new Date();
            }
            var tagLote = (lote.tags || []).find(function (t) { return t.chave === chave; });
            if (tagLote && leitura.rssi != null) tagLote.rssi = leitura.rssi;
        }

    };

});
