app.controller('portalOrdemMultiplasCtrl', function ($scope, $timeout, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = [];
    $scope._carregandoOrdens = false;

    $scope._ui = {
        portalSel: 'expedicao01',
        pausado: false,
        tempoReal: true,
        filtroOrdem: 'todas',
        ordenacaoOrdem: 'ultimas_lidas',
        limiteLeituras: 10,
        ordemExpandidaId: null
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
        var total = itens.length;
        itens.forEach(function (item) {
            if (!item) return;
            if (String(item.status || '').toLowerCase() === 'concluido') concluido += 1;
        });
        return { concluido: concluido, total: total };
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
            return {
                seq: idx + 1,
                tag: (it && it.tag) || '—',
                ean: (it && it.ean) || '—',
                status: (it && it.status) || 'pendente',
                statusLabel: st.label,
                statusClass: st.cls
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
        if (cliente) cliente = 'Cliente: ' + cliente;

        var refData = pos.status_data || pos.partida_data || pos.updatedAt || pos.createdAt;

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
            itens: montarItensLinha(pos),
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

        $scope._kpis[1].valor = String(nAndamento + nParcial);
        $scope._kpis[2].valor = String(nPendente);
        $scope._kpis[3].valor = String(nConcluida);

        $scope._filtrosOrdem[0].count = ordens.length;
        $scope._filtrosOrdem[1].count = nPendente;
        $scope._filtrosOrdem[2].count = nParcial + nAndamento;
        $scope._filtrosOrdem[3].count = nConcluida;
    }

    $scope.onCarregaOrdens = async function () {
        if (!$scope._regConta || !$scope._regConta._id) return;

        $scope._carregandoOrdens = true;
        try {
            var hoje = moment().format('YYYY-MM-DD');
            var url = '/_bd?c=posicao&id_conta=' + encodeURIComponent($scope._regConta._id)
                + '&tipo=conferencia'
                + '&partida_data=*dtP' + hoje + '|' + hoje
                + '&_sort=status_data'
                + '&pop=id_colaborador';

            var res = await uteisService.getBase(url).catch(function () { return []; });
            if (!Array.isArray(res)) res = [];

            var expandidaAntes = $scope._ui.ordemExpandidaId;
            $scope._ordens = res.map(montarOrdemView);
            if (expandidaAntes && !$scope._ordens.some(function (o) { return o._id === expandidaAntes; })) {
                $scope._ui.ordemExpandidaId = null;
            }
            atualizarKpisEAbas($scope._ordens);
        } catch (e) {
            $scope._ordens = [];
            atualizarKpisEAbas([]);
            uteisService.onToast('Não foi possível carregar as ordens do dia.', 'warning', 2500, 'top-end');
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
        return ordenarLista(lista);
    };

    $scope.$watch('_ui.ordenacaoOrdem', function () { /* re-render via ordensFiltradas */ });

    $scope.onTogglePausar = function () {
        $scope._ui.pausado = !$scope._ui.pausado;
        if ($scope._ui.pausado && $scope._loteAtual && $scope._loteAtual.status === 'aberto') {
            fecharLote($scope._loteAtual);
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
        _timerOrdens = $timeout(async function tick() {
            await $scope.onCarregaOrdens();
            if ($scope._ui.tempoReal && !$scope._ui.pausado) {
                _timerOrdens = $timeout(tick, 30000);
            }
        }, 30000);
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
        await $scope.onCarregaOrdens();
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
        uteisService.onToast('Lote P' + lote.seq + ' iniciado', 'info', 1800, 'top-end');
        return lote;
    }

    /**
     * Fecha o lote após silêncio de tag nova.
     * Sem patch/persistência de ordens — apenas log e UI.
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
        uteisService.onToast(
            'Lote P' + lote.seq + ' fechado · ' + lote.qtdTags + ' tags · ' + lote.duracaoSeg + 's',
            'success',
            2500,
            'top-end'
        );

        // TODO (próximo passo): processarTagsDoLote(lote) — casar tags × ordens e patch
    }

    function agendarFechamentoLote(lote) {
        cancelarIdleLote(lote);
        lote._timerIdle = $timeout(function () {
            fecharLote(lote);
        }, IDLE_FECHA_LOTE_MS);
    }

    /**
     * Entrada única por leitura do socket.
     * - Abre lote se necessário
     * - Tag nova: lista + reinicia idle
     * - Releitura: só atualiza RSSI/hora (não reinicia idle)
     * - Não altera ordens no banco
     */
    $scope.onTagSocket = function (leitura) {
        if (!leitura || $scope._ui.pausado) return;

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
            _recebidoEm: new Date()
        });

        if (ehNovaNoLote) {
            lote.tagsMap[chave] = true;
            lote.tags.push({
                tag: tagRaw,
                chave: chave,
                rssi: leitura.rssi,
                data_leitura: leitura.data_leitura || linha._recebidoEm
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
        }

        $scope._kpis[0].valor = String(($scope._leituras || []).length);
    };

});
