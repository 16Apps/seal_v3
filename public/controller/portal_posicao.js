
app.controller('portalPosicaoCtrl', function ($scope, $timeout, $http, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = {};
    $scope.socket = null;

    // Log ao vivo (Naturgy → gateways vinculados)
    $scope._portalLog = [];
    $scope._portalLogMax = 250;
    $scope._portalLogAberto = false;
    $scope._sinaleiroAcionando = false;

    $scope._idDoc = '';
    $scope._buscando = false;
    $scope._posicao = null;
    $scope._origem = null; // 'posicao' | 'pickdetails' | 'receiptdetails' | null
    $scope._itensNaoCadastrados = []; // tags da API que a ordem pediu e faltam no Seal
    $scope._msgBusca = ''; // feedback persistente na tela
    $scope._registrando = false;
    $scope._retornando = false;
    $scope._modoRetorno = false; // ordem -RET em conferência de devolução

    // Leituras ao vivo — agregadas por tag
    $scope._leituras = [];
    $scope._mapLeituras = {};
    var MAX_LEITURAS = 200;

    // tokem normalizado → { descricao, tokem }
    $scope._mapGatewayPorTokem = {};

    // Gateways aceitos neste portal (localStorage por conta)
    $scope._listGatewaysTodos = [];
    $scope._listGatewaysAceitos = [];
    $scope._listGatewaysDisponiveis = [];
    $scope._mapTokemAceito = {}; // tokem normalizado → true (filtro rápido)
    $scope._mapGatewayObjPorTokem = {}; // tokem normalizado → gateway completo
    $scope._gatewayUltimaLeitura = null; // gateway da última tag lida (destaque + params)
    $scope._carregandoGateways = false;
    var _modalGateways = null;
    var _promiseGateways = null;

    // Modal edição/inclusão de item a partir da leitura RFID
    $scope._listCategorias = [];
    $scope._itemEdit = null;
    $scope._salvandoItem = false;
    var _modalItemEdit = null;

    // Cache otimizado: tag normalizada → { cadastrado, descricao }
    $scope._mapInfoTag = {};
    var _inflightInfoTag = {}; // evita request duplicado da mesma tag
    var _mapCategorias = null; // lazy: id → { descricao, ean }
    var _promiseCategorias = null;
    var _filaLookupTag = []; // tags pendentes para batch
    var _timerLookupTag = null;
    var LOOKUP_DEBOUNCE_MS = 60;

    $scope._dataHoraTopo = '';
    $scope._portalFechamento = null; // { nome, quando, id_colaborador } — último fechamento local
    var timerRelogio = null;
    var _onBeforeUnloadPortal = null;
    var _onPageHidePortal = null;
    var _ignorandoUnloadPortal = false;

    // Alertas sonoros (warning + success)
    var _audioAlerta = new Audio('/assets/audio/beep-warning.mp3');
    var _audioSucesso = new Audio('/assets/audio/beep_success.mp3');
    _audioAlerta.preload = 'auto';
    _audioSucesso.preload = 'auto';
    var _audioLiberado = false;
    var _ultimoAlertaMs = 0;
    var ALERTA_DEBOUNCE_MS = 250;

    // Ordem completa → aguarda 10s → verde + success; excedente no meio → cancela e vermelho + warning
    var DELAY_SUCESSO_PEDIDO_MS = 10000;
    var _sucessoPedidoTimer = null;
    var _sucessoPedidoTocado = false;

    function liberarAudioAlerta() {
        if (_audioLiberado) return;
        var audios = [_audioAlerta, _audioSucesso];
        var feitos = 0;
        audios.forEach(function (a) {
            a.volume = 0.01;
            a.muted = false;
            a.play().then(function () {
                a.pause();
                a.currentTime = 0;
                a.volume = 1;
                feitos += 1;
                if (feitos >= audios.length) _audioLiberado = true;
            }).catch(function () { /* autoplay bloqueado até gesto do usuário */ });
        });
    }

    function tocarAudioPortal(audio) {
        if (!_audioLiberado) {
            liberarAudioAlerta();
            return false;
        }
        var agora = Date.now();
        if (agora - _ultimoAlertaMs < ALERTA_DEBOUNCE_MS) return false;
        _ultimoAlertaMs = agora;
        try {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 1;
            audio.muted = false;
            audio.play().catch(function () {});
        } catch (e) { /* ignore */ }
        return true;
    }

    /** Alerta: beep-warning + sinaleiro vermelho (mesmo debounce). */
    function tocarAlertaAviso() {
        var tocou = tocarAudioPortal(_audioAlerta);
        if (tocou) {
            tocarSinaleiroPortal(4, 10000);
        } else if (!_audioLiberado) {
            // Ainda sem gesto do usuário: tenta só o sinaleiro
            tocarSinaleiroPortal(4, 10000);
        }
    }

    function tocarSucessoPedido() {
        tocarAudioPortal(_audioSucesso);
    }

    /** Dispara beep: sem ordem | excedente | não cadastrado. */
    function avaliarAlertaLeitura(opts) {
        opts = opts || {};
        if (!opts.pedidoCarregado) {
            tocarAlertaAviso();
            return;
        }
        if (opts.foraDaOrdem) {
            tocarAlertaAviso();
            return;
        }
        if (opts.cadastrado === false) {
            tocarAlertaAviso();
        }
    }

    document.addEventListener('click', liberarAudioAlerta, { once: true });
    document.addEventListener('touchstart', liberarAudioAlerta, { once: true });

    function tocarSinaleiroPortal(cor, tempo) {
        var name = $scope.deviceSinaleiroAtual && $scope.deviceSinaleiroAtual();
        if (!name) return;
        $http.post(uteisService.apiUrl_() + '/x_naturgy/sinaleiro', {
            deviceName: name,
            cor: Number(cor),
            tempo: tempo != null ? Number(tempo) : 10000
        }).catch(function (err) {
            console.warn('[portal_posicao] sinaleiro auto:', err && err.message);
        });
    }

    function cancelarSucessoPedidoPendente() {
        if (_sucessoPedidoTimer) {
            $timeout.cancel(_sucessoPedidoTimer);
            _sucessoPedidoTimer = null;
        }
    }

    function resetSucessoPedido() {
        cancelarSucessoPedidoPendente();
        _sucessoPedidoTocado = false;
    }

    /** Todos os esperados lidos e nenhum excedente. */
    function pedidoCompletoSemExcedente() {
        if (!$scope._posicao || $scope.isModoRetorno()) return false;
        var esperados = $scope.totalEsperados();
        if (esperados <= 0) return false;
        if ($scope.totalPendentes() > 0) return false;
        if ($scope.totalExcedentes() > 0) return false;
        return $scope.totalConcluidos() >= esperados;
    }

    /**
     * Ordem 100% atendida → agenda verde + beep_success em 10s.
     * Se surgir excedente nesse intervalo → cancela verde, vermelho + beep-warning.
     */
    function verificarSucessoPedido() {
        if (!$scope._posicao || $scope.isModoRetorno()) {
            cancelarSucessoPedidoPendente();
            return;
        }

        // Excedente durante a espera do verde: descarta sucesso (warning+vermelho via tocarAlertaAviso)
        if ($scope.totalExcedentes() > 0) {
            if (_sucessoPedidoTimer) {
                cancelarSucessoPedidoPendente();
                tocarAlertaAviso();
            } else {
                cancelarSucessoPedidoPendente();
            }
            return;
        }

        if (!pedidoCompletoSemExcedente()) {
            cancelarSucessoPedidoPendente();
            return;
        }

        if (_sucessoPedidoTocado) return;
        if (_sucessoPedidoTimer) return; // já aguardando

        _sucessoPedidoTimer = $timeout(function () {
            _sucessoPedidoTimer = null;
            if (_sucessoPedidoTocado) return;
            if (!pedidoCompletoSemExcedente()) return;
            if ($scope.totalExcedentes() > 0) return;

            _sucessoPedidoTocado = true;
            tocarSucessoPedido();
            tocarSinaleiroPortal(1, 10000); // verde
        }, DELAY_SUCESSO_PEDIDO_MS);
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function formatarTopo() {
        var d = new Date();
        var meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return pad2(d.getDate()) + ' ' + meses[d.getMonth()] + ' ' + d.getFullYear()
            + ' - ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function agoraFormatado() {
        var d = new Date();
        return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear()
            + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function chavePortalFechamento() {
        var id = ($scope._regConta && $scope._regConta._id) || 'sem_conta';
        return 'portal_posicao_fechamento_' + id;
    }

    function nomeColaboradorPortal() {
        var c = $scope._regColaborador || {};
        return c.nome || c.descricao || c.login || c.email || 'Colaborador';
    }

    function salvarFechamentoPortal() {
        try {
            var reg = {
                nome: nomeColaboradorPortal(),
                id_colaborador: ($scope._regColaborador && $scope._regColaborador._id) || '',
                quando: agoraFormatado(),
                quandoIso: new Date().toISOString()
            };
            localStorage.setItem(chavePortalFechamento(), JSON.stringify(reg));
            $scope._portalFechamento = reg;
        } catch (e) { /* ignore */ }
    }

    function carregarFechamentoPortal() {
        try {
            var raw = localStorage.getItem(chavePortalFechamento());
            if (!raw) {
                $scope._portalFechamento = null;
                return;
            }
            $scope._portalFechamento = JSON.parse(raw);
        } catch (e) {
            $scope._portalFechamento = null;
        }
    }

    $scope.onAbrirPortalNovamente = function () {
        try {
            localStorage.removeItem(chavePortalFechamento());
        } catch (e) { /* ignore */ }
        $scope._portalFechamento = null;
    };

    function registrarListenersFechamentoPortal() {
        if (_onBeforeUnloadPortal) return;

        _onBeforeUnloadPortal = function (e) {
            if (_ignorandoUnloadPortal) return;
            e.preventDefault();
            e.returnValue = '';
            return '';
        };

        _onPageHidePortal = function () {
            if (_ignorandoUnloadPortal) return;
            salvarFechamentoPortal();
            // Avisa o servidor antes da aba morrer (fallback: disconnect no server.js)
            try {
                if ($scope.socket && $scope._regConta && $scope._regConta._id) {
                    $scope.socket.emit('portal_leave', {
                        id_conta: $scope._regConta._id,
                        origem: 'portal_posicao'
                    });
                }
            } catch (e) { /* ignore */ }
        };

        window.addEventListener('beforeunload', _onBeforeUnloadPortal);
        window.addEventListener('pagehide', _onPageHidePortal);
    }

    function removerListenersFechamentoPortal() {
        if (_onBeforeUnloadPortal) {
            window.removeEventListener('beforeunload', _onBeforeUnloadPortal);
            _onBeforeUnloadPortal = null;
        }
        if (_onPageHidePortal) {
            window.removeEventListener('pagehide', _onPageHidePortal);
            _onPageHidePortal = null;
        }
    }

    function normalizaTokem(valor) {
        return String(valor || '').trim().toUpperCase();
    }

    /** Formata ISO / Date / string para DD/MM/YYYY HH:mm:ss (horário local). */
    $scope.formatarDataHora = function (valor) {
        if (valor == null || valor === '') return '—';
        var d = valor instanceof Date ? valor : new Date(valor);
        if (isNaN(d.getTime())) {
            // já no formato "YYYY-MM-DD HH:mm:ss"
            var m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
            if (m) return m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] + ':' + m[6];
            return String(valor);
        }
        return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear()
            + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    };

    $scope.descricaoGateway = function (tokem) {
        var key = normalizaTokem(tokem);
        if (!key) return '';
        var g = $scope._mapGatewayPorTokem[key];
        return (g && g.descricao) ? g.descricao : '';
    };

    function chaveGatewaysAceitos() {
        return 'portal_posicao_gateways_' + (($scope._regConta && $scope._regConta._id) || '');
    }

    function carregarIdsGatewaysAceitos() {
        try {
            var raw = localStorage.getItem(chaveGatewaysAceitos());
            if (!raw) return [];
            var ids = JSON.parse(raw);
            return Array.isArray(ids) ? ids.map(String) : [];
        } catch (e) {
            return [];
        }
    }

    function salvarIdsGatewaysAceitos(ids) {
        localStorage.setItem(chaveGatewaysAceitos(), JSON.stringify((ids || []).map(String)));
    }

    function indexarGatewayPorTokems(g, mapaObj, mapaAceito) {
        if (!g) return;
        var keys = [g.tokem, g.tokem_associado, g.leitor_mac];
        for (var i = 0; i < keys.length; i++) {
            var key = normalizaTokem(keys[i]);
            if (!key) continue;
            if (mapaAceito) mapaAceito[key] = true;
            if (mapaObj) mapaObj[key] = g;
            // Compatível com pares E/S
            var base = key.replace(/-[ES]$/, '');
            if (base && base !== key && mapaObj && !mapaObj[base]) mapaObj[base] = g;
        }
    }

    function rebuildMapTokemAceito() {
        $scope._mapTokemAceito = {};
        $scope._mapGatewayObjPorTokem = {};
        ($scope._listGatewaysAceitos || []).forEach(function (g) {
            indexarGatewayPorTokems(g, $scope._mapGatewayObjPorTokem, $scope._mapTokemAceito);
        });
        // Também indexa todos (descrição no tokem da tabela)
        ($scope._listGatewaysTodos || []).forEach(function (g) {
            indexarGatewayPorTokems(g, $scope._mapGatewayObjPorTokem, null);
        });
    }

    function resolverGatewayDaLeitura(leitura) {
        var key = normalizaTokem(leitura && leitura.tokem);
        if (!key) return null;
        if ($scope._mapGatewayObjPorTokem[key]) return $scope._mapGatewayObjPorTokem[key];
        var base = key.replace(/-[ES]$/, '');
        if (base && $scope._mapGatewayObjPorTokem[base]) return $scope._mapGatewayObjPorTokem[base];
        // Fallback: match por descrição
        var listas = [$scope._listGatewaysAceitos || [], $scope._listGatewaysTodos || []];
        for (var li = 0; li < listas.length; li++) {
            for (var i = 0; i < listas[li].length; i++) {
                var g = listas[li][i];
                if (!g) continue;
                if (normalizaTokem(g.tokem) === key) return g;
                if (normalizaTokem(g.descricao) === key) return g;
            }
        }
        return null;
    }

    function sinalizarGatewayUltimaLeitura(leitura) {
        var g = resolverGatewayDaLeitura(leitura);
        if (g) $scope._gatewayUltimaLeitura = g;
    }

    $scope.isGatewayAtivo = function (g) {
        if (!g || !$scope._gatewayUltimaLeitura) return false;
        return String(g._id) === String($scope._gatewayUltimaLeitura._id);
    };

    /** Labels iguais ao formulário em gateway.html */
    $scope.labelPortalAcao = function (valor) {
        var v = String(valor || '0');
        if (v === 'checagem') return 'Checagem';
        if (v === 'checagem_multipla') return 'Checagem Multipla';
        if (v === 'cadastro') return 'Cadastro';
        return 'Nenhuma';
    };

    $scope.labelPortalRegistroOrdem = function (valor) {
        var v = String(valor || '0');
        if (v === 'com_divergencia') return 'Com Divergência';
        if (v === 'sem_divergencia') return 'Sem Divergência';
        return 'Nenhuma';
    };

    $scope.labelPortalAlertas = function (valor) {
        var v = String(valor || '0');
        if (v === 'itens_fora_ordem') return 'Itens fora da Ordem';
        return 'Sem Alertas';
    };

    /**
     * Gateway: Checagem + Com Divergência + Sem Alertas.
     * Item cadastrado fora da ordem → inclui como esperado (não alerta).
     */
    function gatewayChecagemComDivergenciaSemAlerta(g) {
        if (!g) return false;
        var acao = String(g.portal_acao || '').trim().toLowerCase();
        var reg = String(g.portal_registro_ordem || '').trim().toLowerCase();
        var alerta = String(g.portal_alertas || '0').trim().toLowerCase();
        return acao === 'checagem'
            && reg === 'com_divergencia'
            && alerta !== 'itens_fora_ordem';
    }

    function incrementarTotalItensEsperado() {
        if (!$scope._posicao) return;
        var ti = Number($scope._posicao.total_itens);
        if (!Number.isFinite(ti) || ti < 0) {
            $scope._posicao.total_itens = $scope.totalEsperados();
            return;
        }
        $scope._posicao.total_itens = ti + 1;
    }

    /**
     * Inclui tag cadastrada na ordem como item esperado (concluído), não excedente.
     * Atualiza quantidade esperada (total_itens).
     */
    function adicionarItemEsperadoAoPedido(leitura, chave, info) {
        if (!$scope._posicao) return null;
        if (!$scope._posicao.itens) $scope._posicao.itens = [];

        var existente = tagPertenceAoPedido(chave);
        if (existente) {
            if (isExcedenteItem(existente)) {
                existente.status = 'concluido';
                existente.status_data = new Date();
                existente._status_origem = 'concluido';
                existente._excedente = false;
                delete existente._excedente;
                incrementarTotalItensEsperado();
            } else {
                marcarItemPedidoConcluido(existente, leitura);
            }
            if (info) {
                if (info.descricao) existente.descricao = info.descricao;
                if (info.id_item) existente.id_item = info.id_item;
                if (info.id_categoria) existente.id_categoria = info.id_categoria;
                if (info.inf_compl_1 && !existente.inf_compl_1) {
                    existente.inf_compl_1 = info.inf_compl_1;
                }
            }
            if (leitura && leitura.rssi != null) existente.rssi = leitura.rssi;
            return existente;
        }

        var item = {
            _id: 'div-' + chave,
            tag: (leitura && leitura.tag) || chave,
            id_item: (info && info.id_item) || null,
            id_categoria: (info && info.id_categoria) || null,
            descricao: (info && info.descricao) || '',
            inf_compl_1: (info && (info.inf_compl_1 || info.inf_compl1)) || '',
            ean: '',
            rssi: leitura && leitura.rssi != null ? leitura.rssi : '',
            quantidade: 1,
            status: 'concluido',
            status_data: new Date(),
            _status_origem: 'concluido',
            _divergencia: true
        };
        $scope._posicao.itens.push(item);
        incrementarTotalItensEsperado();
        return item;
    }

    /**
     * Após lookup: com divergência, cadastrado entra na ordem; não cadastrado = excedente+alerta.
     */
    function resolverDivergenciaAposLookup(linha, info) {
        if (!linha || !info) return;
        if (!gatewayChecagemComDivergenciaSemAlerta($scope._gatewayUltimaLeitura)) return;
        if (!$scope._posicao || $scope.isModoRetorno()) return;

        var chave = $scope.normalizaTag(linha.tag);
        if (!chave) return;

        var ped = tagPertenceAoPedido(chave);
        if (ped && !isExcedenteItem(ped)) {
            linha.excedente = false;
            return;
        }

        var leituraFake = { tag: linha.tag, rssi: linha.rssi };

        if (info.cadastrado) {
            adicionarItemEsperadoAoPedido(leituraFake, chave, info);
            linha.excedente = false;
            atualizarStatusPedido();
            return;
        }

        // Não cadastrado: mantém fluxo atual (excedente + alerta)
        if (!ped) {
            adicionarExcedenteAoPedido(leituraFake, chave);
        }
        linha.excedente = true;
        atualizarStatusPedido();
        tocarAlertaAviso();
    }

    function atualizarDisponiveisGateways() {
        var idsAceitos = {};
        ($scope._listGatewaysAceitos || []).forEach(function (g) {
            if (g && g._id) idsAceitos[String(g._id)] = true;
        });
        $scope._listGatewaysDisponiveis = ($scope._listGatewaysTodos || []).filter(function (g) {
            return g && g._id && !idsAceitos[String(g._id)];
        });
    }

    function aplicarGatewaysAceitos(todos) {
        var lista = todos || [];
        $scope._listGatewaysTodos = lista;
        var ids = carregarIdsGatewaysAceitos();
        var setIds = {};
        ids.forEach(function (id) { setIds[id] = true; });
        $scope._listGatewaysAceitos = lista.filter(function (g) {
            return g && g._id && setIds[String(g._id)];
        });
        rebuildMapTokemAceito();
        atualizarDisponiveisGateways();
    }

    /**
     * Só aceita leituras dos gateways vinculados.
     * Sem nenhum vinculado → descarta todas.
     */
    function leituraDeGatewayAceito(leitura) {
        if (!$scope._listGatewaysAceitos || !$scope._listGatewaysAceitos.length) return false;
        var key = normalizaTokem(leitura && leitura.tokem);
        if (!key) return false;
        if ($scope._mapTokemAceito[key]) return true;

        // Compatível com pares E/S (ex.: BCTN1-E ↔ BCTN1)
        var base = key.replace(/-[ES]$/, '');
        if (base && base !== key && $scope._mapTokemAceito[base]) return true;
        if ($scope._mapTokemAceito[key + '-E'] || $scope._mapTokemAceito[key + '-S']) return true;
        return false;
    }

    $scope.onAbrirModalGateways = function () {
        var el = document.getElementById('modalGatewaysPosicao');
        if (!el || typeof bootstrap === 'undefined') return;
        _modalGateways = bootstrap.Modal.getOrCreateInstance(el);
        _modalGateways.show();

        // Garante lista atualizada ao abrir (evita modal vazio se o load inicial falhou/atrasou)
        carregarGateways(true).then(function () {
            atualizarDisponiveisGateways();
            $scope.$applyAsync();
        });
    };

    $scope.onAdicionarGatewayAceito = function (g) {
        if (!g || !g._id) return;
        var id = String(g._id);
        var ja = ($scope._listGatewaysAceitos || []).some(function (x) {
            return String(x._id) === id;
        });
        if (ja) return;

        $scope._listGatewaysAceitos = ($scope._listGatewaysAceitos || []).concat([g]);
        salvarIdsGatewaysAceitos($scope._listGatewaysAceitos.map(function (x) { return x._id; }));
        rebuildMapTokemAceito();
        atualizarDisponiveisGateways();

        uteisService.onToast(
            'Gateway vinculado: ' + (g.descricao || g.tokem || id),
            'success', 2000, 'top-end'
        );

        if ($scope.sincronizarGatewaysPortalPresence) {
            $scope.sincronizarGatewaysPortalPresence();
        }

        if (!$scope._listGatewaysDisponiveis.length && _modalGateways) {
            _modalGateways.hide();
        }
        $scope.$applyAsync();
    };

    $scope.onRemoverGatewayAceito = function (g) {
        if (!g || !g._id) return;
        var id = String(g._id);
        $scope._listGatewaysAceitos = ($scope._listGatewaysAceitos || []).filter(function (x) {
            return String(x._id) !== id;
        });
        if ($scope._gatewayUltimaLeitura && String($scope._gatewayUltimaLeitura._id) === id) {
            $scope._gatewayUltimaLeitura = null;
        }
        salvarIdsGatewaysAceitos($scope._listGatewaysAceitos.map(function (x) { return x._id; }));
        rebuildMapTokemAceito();
        atualizarDisponiveisGateways();
        if ($scope.sincronizarGatewaysPortalPresence) {
            $scope.sincronizarGatewaysPortalPresence();
        }
        $scope.$applyAsync();
    };

    function carregarGateways(forcar) {
        var idConta = ($scope._regConta && $scope._regConta._id) || '';
        if (!idConta) return Promise.resolve([]);
        if (_promiseGateways && !forcar) return _promiseGateways;

        $scope._carregandoGateways = true;
        _promiseGateways = uteisService.getBase(
            '/_bd?c=gateway&id_conta=' + encodeURIComponent(idConta) + '&_sort=descricao'
        ).then(function (lista) {
            var rows = Array.isArray(lista) ? lista : [];
            // Ignora payload de erro do /_bd (ex.: [{ error: '...' }])
            rows = rows.filter(function (g) { return g && g._id && !g.error; });

            $scope._mapGatewayPorTokem = {};
            rows.forEach(function (g) {
                if (g.tokem == null) return;
                var key = normalizaTokem(g.tokem);
                if (!key) return;
                $scope._mapGatewayPorTokem[key] = {
                    descricao: g.descricao || '',
                    tokem: g.tokem,
                    portal_acao: g.portal_acao,
                    portal_alertas: g.portal_alertas,
                    portal_registro_ordem: g.portal_registro_ordem
                };
            });
            aplicarGatewaysAceitos(rows);
            // Mantém destaque se o gateway ainda existir
            if ($scope._gatewayUltimaLeitura && $scope._gatewayUltimaLeitura._id) {
                var ainda = rows.find(function (g) {
                    return String(g._id) === String($scope._gatewayUltimaLeitura._id);
                });
                $scope._gatewayUltimaLeitura = ainda || null;
            }
            if ($scope.sincronizarGatewaysPortalPresence) {
                $scope.sincronizarGatewaysPortalPresence();
            } else if ($scope.socket && $scope.socket.connected) {
                // socket ainda não definiu o helper — reenvia join com gateways
                $scope.socket.emit('portal_join', {
                    id_conta: $scope._regConta._id,
                    origem: 'portal_posicao',
                    gateways: ($scope._listGatewaysAceitos || []).map(function (g) {
                        return { _id: g._id, tokem: g.tokem || '', descricao: g.descricao || '' };
                    })
                });
            }
            return rows;
        }).catch(function (err) {
            console.error('[portal_posicao] gateways:', err);
            return $scope._listGatewaysTodos || [];
        }).finally(function () {
            $scope._carregandoGateways = false;
            _promiseGateways = null;
            $scope.$applyAsync();
        });

        return _promiseGateways;
    }

    $scope.$watch('$viewContentLoaded', function () {
        $scope._regConta = uteisService.getCookie('_conta') || {};
        $scope._regColaborador = uteisService.getCookie('_colaborador') || {};
        $scope._dataHoraTopo = formatarTopo();
        carregarFechamentoPortal();
        registrarListenersFechamentoPortal();
        timerRelogio = setInterval(function () {
            $scope._dataHoraTopo = formatarTopo();
            $scope.$applyAsync();
        }, 1000);
        carregarGateways();
        $scope.onConectarSocket();
    });

    // Navegação interna: confirma só ao SAIR do portal (ignora carga inicial / reabrir)
    $scope.$on('$locationChangeStart', function (event, next, current) {
        if (_ignorandoUnloadPortal) return;

        var nextUrl = String(next || '');
        var currentUrl = String(current || '');

        // Bootstrap Angular / refresh: current vazio ou mesma URL → não perguntar
        if (!currentUrl || currentUrl === nextUrl) return;

        // Continua no portal de posição
        if (nextUrl.indexOf('/portal_posicao') !== -1) return;

        // Só pergunta se estava no portal e está indo para outra rota
        if (currentUrl.indexOf('/portal_posicao') === -1) return;

        if (!window.confirm('Deseja realmente sair do portal de posição?')) {
            event.preventDefault();
            return;
        }
        salvarFechamentoPortal();
        _ignorandoUnloadPortal = true;
        removerListenersFechamentoPortal();
    });

    $scope.normalizaTag = function (valor) {
        if (valor == null) return '';
        return String(valor).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    };

    $scope.badgeStatusPom = function (status) {
        var s = String(status || '').toLowerCase();
        if (s === 'excedente' || s === 'alerta') return 'badge-excedente';
        if (s === 'concluido' || s === 'encontrado') return 'badge-concluida';
        if (s === 'parcial') return 'badge-parcial';
        if (s === 'aberta' || s === 'partida') return 'badge-andamento';
        if (s === 'pendente') return 'badge-pendente';
        return 'badge-nao';
    };

    $scope.itemStatusClass = function (status) {
        var s = String(status || '').toLowerCase();
        if (s === 'concluido' || s === 'encontrado') return 'item-st-concluido';
        if (s === 'excedente' || s === 'alerta') return 'item-st-excedente';
        if (s === 'parcial') return 'item-st-parcial';
        if (s === 'nao_lido') return 'item-st-nao-lido';
        if (s === 'nao_encontrado') return 'item-st-nao';
        return 'item-st-pendente';
    };

    /** Ícone do pedido = mesmo dos KPIs (pendente/concluído/excedente/parcial). */
    $scope.iconeStatusPedido = function (status) {
        var s = String(status || '').toLowerCase();
        if (s === 'excedente' || s === 'alerta') return 'bi-exclamation-triangle';
        if (s === 'concluido' || s === 'encontrado') return 'bi-check-circle';
        if (s === 'parcial') return 'bi-box-seam';
        if (s === 'pendente') return 'bi-hourglass-split';
        return 'bi-box-seam';
    };

    $scope.iconeStatusPedidoClass = function (status) {
        var s = String(status || '').toLowerCase();
        if (s === 'excedente' || s === 'alerta') return 'icon-st-excedente';
        if (s === 'concluido' || s === 'encontrado') return 'icon-st-concluido';
        if (s === 'parcial') return 'icon-st-parcial';
        if (s === 'pendente') return 'icon-st-pendente';
        return 'icon-st-nao';
    };

    $scope.barraStatusPedidoClass = function (status) {
        var s = String(status || '').toLowerCase();
        if (s === 'excedente' || s === 'alerta') return 'bar-excedente';
        if (s === 'concluido' || s === 'encontrado') return 'bar-concluido';
        if (s === 'parcial') return 'bar-parcial';
        return '';
    };

    $scope.isModoRetorno = function () {
        if ($scope._modoRetorno) return true;
        var idDoc = String(($scope._posicao && $scope._posicao.id_doc) || $scope._idDoc || '');
        return /-RET$/i.test(idDoc.trim());
    };

    function statusDestinoLower(it) {
        return String((it && it.status_destino) || 'pendente').toLowerCase() || 'pendente';
    }

    /** Itens obrigatórios na devolução (já tinham sido lidos: concluido/excedente). */
    function itemRequerRetorno(it) {
        if (!it) return false;
        if (it._retorno_obrigatorio === false) return false;
        if (it._retorno_obrigatorio === true) return true;
        var origem = String(it._status_origem || '').toLowerCase();
        if (origem === 'pendente' || origem === 'nao_lido') return false;
        if (origem === 'concluido' || origem === 'excedente' || origem === 'encontrado') return true;
        var s = statusItemLower(it);
        return s === 'concluido' || s === 'encontrado' || s === 'excedente' || s === 'alerta';
    }

    function itemOpcionalRetorno(it) {
        return !!(it && it._retorno_obrigatorio === false);
    }

    /** Recalcula status do pedido: excedente > concluido > parcial > pendente. */
    function atualizarStatusPedido() {
        if (!$scope._posicao) return;
        var itens = $scope._posicao.itens || [];

        // Modo RET: progresso pelo status_destino só dos itens da devolução (já lidos antes)
        if ($scope.isModoRetorno()) {
            var totalRet = 0;
            var destOk = 0;
            for (var r = 0; r < itens.length; r++) {
                if (!itemRequerRetorno(itens[r])) continue;
                totalRet += 1;
                if (statusDestinoLower(itens[r]) === 'concluido') destOk += 1;
            }
            if (totalRet > 0 && destOk >= totalRet) {
                $scope._posicao.status = 'concluido';
            } else if (destOk > 0) {
                $scope._posicao.status = 'parcial';
            } else {
                $scope._posicao.status = 'pendente';
            }
            $scope._posicao.status_data = new Date();
            return;
        }

        var temExcedente = false;
        var esperados = 0;
        var concluidos = 0;

        for (var i = 0; i < itens.length; i++) {
            var s = String(itens[i].status || '').toLowerCase();
            if (s === 'excedente' || s === 'alerta') {
                temExcedente = true;
                continue;
            }
            esperados += 1;
            if (s === 'concluido' || s === 'encontrado') concluidos += 1;
        }

        if (temExcedente) {
            $scope._posicao.status = 'excedente';
        } else if (esperados > 0 && concluidos >= esperados) {
            $scope._posicao.status = 'concluido';
        } else if (concluidos > 0) {
            $scope._posicao.status = 'parcial';
        } else {
            $scope._posicao.status = 'pendente';
        }
        $scope._posicao.status_data = new Date();

        // Completa → agenda verde 10s; excedente no meio → vermelho
        verificarSucessoPedido();
    }

    /** Tag fora da ordem → inclui na lista do pedido como excedente. */
    function adicionarExcedenteAoPedido(leitura, chave) {
        if (!$scope._posicao) return null;
        if (!$scope._posicao.itens) $scope._posicao.itens = [];

        var existente = tagPertenceAoPedido(chave);
        if (existente) {
            if (String(existente.status || '').toLowerCase() !== 'excedente') {
                existente.status = 'excedente';
                existente.status_data = new Date();
            }
            if (leitura && leitura.rssi != null) existente.rssi = leitura.rssi;
            return existente;
        }

        var cached = $scope._mapInfoTag[chave];
        var itemExc = {
            _id: 'exc-' + chave,
            tag: leitura.tag,
            descricao: (cached && cached.descricao) || '',
            ean: '',
            rssi: leitura.rssi != null ? leitura.rssi : '',
            quantidade: 1,
            status: 'excedente',
            status_data: new Date(),
            _excedente: true
        };
        $scope._posicao.itens.push(itemExc);
        return itemExc;
    }

    $scope.capitalizarStatus = function (status) {
        var s = String(status || 'pendente').toLowerCase();
        if (s === 'nao_lido') return 'Não lido';
        if (!s) return '';
        return s.charAt(0).toUpperCase() + s.slice(1);
    };

    $scope.descricaoItem = function (it) {
        if (!it) return '—';
        if (it.descricao) return it.descricao;
        if (it.id_categoria && typeof it.id_categoria === 'object' && it.id_categoria.descricao) {
            return it.id_categoria.descricao;
        }
        return '—';
    };

    /** Preenche item.descricao a partir de categoria quando faltar (posições antigas). */
    async function enriquecerDescricoesPosicao(posicao) {
        if (!posicao || !Array.isArray(posicao.itens) || !posicao.itens.length) return posicao;

        var ids = [];
        for (var i = 0; i < posicao.itens.length; i++) {
            var it = posicao.itens[i];
            if (it.descricao) continue;
            var idCat = it.id_categoria;
            if (idCat && typeof idCat === 'object') idCat = idCat._id;
            idCat = String(idCat || '').trim();
            if (idCat) ids.push(idCat);
        }
        ids = ids.filter(function (v, idx, arr) { return v && arr.indexOf(v) === idx; });
        if (!ids.length) return posicao;

        var cats = await uteisService.getBase(
            '/_bd?c=categoria&id_conta=' + encodeURIComponent($scope._regConta._id) + '&_sort=descricao'
        ).catch(function () { return []; });

        var mapa = {};
        (cats || []).forEach(function (c) {
            if (c && c._id) mapa[String(c._id)] = c;
        });

        for (var j = 0; j < posicao.itens.length; j++) {
            var item = posicao.itens[j];
            if (item.descricao) continue;
            var idc = item.id_categoria;
            if (idc && typeof idc === 'object') {
                item.descricao = idc.descricao || '';
                continue;
            }
            idc = String(idc || '').trim();
            if (idc && mapa[idc]) {
                item.descricao = mapa[idc].descricao || '';
                item.ean = item.ean || mapa[idc].ean || '';
            }
        }
        return posicao;
    }

    function tagPertenceAoPedido(chave) {
        var itens = ($scope._posicao && $scope._posicao.itens) || [];
        for (var i = 0; i < itens.length; i++) {
            if ($scope.normalizaTag(itens[i].tag) === chave) return itens[i];
        }
        return null;
    }

    function marcarItemPedidoConcluido(itemPedido, leitura) {
        if (!itemPedido) return;
        itemPedido.status = 'concluido';
        itemPedido.status_data = new Date();
        // Mantém origem alinhada ao status atual — senão o Registrar grava pendente
        if (!itemPedido._status_origem || String(itemPedido._status_origem).toLowerCase() === 'pendente') {
            itemPedido._status_origem = 'concluido';
        }
        if (leitura && leitura.rssi != null) itemPedido.rssi = leitura.rssi;
    }

    /** Em modo RET: leitura confirma o destino; opcionais (não lidos) passam a status normal concluido. */
    function marcarDestinoConcluido(itemPedido, leitura) {
        if (!itemPedido) return;
        if (itemOpcionalRetorno(itemPedido)) {
            // Esperado não lido na 1ª passagem: só sinaliza; se ler no retorno → status normal
            itemPedido.status = 'concluido';
            itemPedido.status_data = new Date();
            itemPedido._status_origem = 'concluido';
            itemPedido.status_destino = 'pendente';
            itemPedido.status_destino_data = '';
        } else {
            itemPedido.status_destino = 'concluido';
            itemPedido.status_destino_data = new Date();
            if (String(itemPedido.status || '').toLowerCase() === 'pendente' && itemPedido._status_origem) {
                itemPedido.status = itemPedido._status_origem;
            }
        }
        if (leitura && leitura.rssi != null) itemPedido.rssi = leitura.rssi;
    }

    function cacheInfoTag(chave, info) {
        $scope._mapInfoTag[chave] = info;
        return info;
    }

    /** Semear cache a partir dos itens do pedido (0 request). Só com descrição real. */
    function semearCacheDoPedido(posicao) {
        var itens = (posicao && posicao.itens) || [];
        for (var i = 0; i < itens.length; i++) {
            var it = itens[i];
            var chave = $scope.normalizaTag(it.tag);
            if (!chave || $scope._mapInfoTag[chave]) continue;
            if (isExcedenteItem(it)) continue;
            var desc = $scope.descricaoItem(it);
            var inf = it.inf_compl_1 || it.inf_compl1 || '';
            if ((!desc || desc === '—') && !inf) continue;
            cacheInfoTag(chave, {
                cadastrado: true,
                descricao: (desc && desc !== '—') ? desc : '',
                inf_compl_1: inf
            });
        }
    }

    function carregarCategoriasOnce() {
        if (_mapCategorias) return Promise.resolve(_mapCategorias);
        if (_promiseCategorias) return _promiseCategorias;
        var idConta = ($scope._regConta && $scope._regConta._id) || '';
        if (!idConta) {
            _mapCategorias = {};
            return Promise.resolve(_mapCategorias);
        }
        _promiseCategorias = uteisService.getBase(
            '/_bd?c=categoria&id_conta=' + encodeURIComponent(idConta) + '&_sort=descricao'
        ).then(function (cats) {
            _mapCategorias = {};
            $scope._listCategorias = [];
            (cats || []).forEach(function (c) {
                if (c && c._id) {
                    c._id = String(c._id);
                    _mapCategorias[c._id] = c;
                    $scope._listCategorias.push(c);
                }
            });
            return _mapCategorias;
        }).catch(function () {
            _mapCategorias = {};
            $scope._listCategorias = [];
            return _mapCategorias;
        }).finally(function () {
            _promiseCategorias = null;
        });
        return _promiseCategorias;
    }

    function descricaoDeCategoriaId(idCat) {
        if (!idCat || !_mapCategorias) return '';
        var id = typeof idCat === 'object' ? idCat._id : idCat;
        var cat = _mapCategorias[String(id || '').trim()];
        return (cat && cat.descricao) || (typeof idCat === 'object' ? (idCat.descricao || '') : '');
    }

    function aplicarInfoNaLinha(linha, info) {
        if (!linha || !info) return;
        var eraDesconhecido = linha.cadastrado == null;
        linha.cadastrado = !!info.cadastrado;
        linha.descricao = info.descricao || '';
        linha.inf_compl_1 = info.inf_compl_1 || info.inf_compl1 || '';
        if (info.id_item) linha.id_item = info.id_item;
        if (info.id_categoria) linha.id_categoria = info.id_categoria;
        linha._infoOk = true;

        // Com divergência: cadastrado fora da ordem → inclui; não cadastrado → excedente+alerta
        if (eraDesconhecido) {
            resolverDivergenciaAposLookup(linha, info);
        }

        // Não cadastrado: alerta só se ainda não coberto por “sem ordem” / “excedente”
        // (esses já disparam em onRecebeLeitura). Aqui cobre item esperado da ordem.
        // Em modo divergência o alerta de fora da ordem já foi tratado acima.
        if (eraDesconhecido && linha.cadastrado === false
            && !gatewayChecagemComDivergenciaSemAlerta($scope._gatewayUltimaLeitura)) {
            var temPedido = !!($scope._posicao && Array.isArray($scope._posicao.itens));
            if (temPedido && !linha.excedente) {
                tocarAlertaAviso();
            }
        }

        // Atualiza descrição / inf_compl do item no pedido, se existir
        var chave = $scope.normalizaTag(linha.tag);
        var ped = chave ? tagPertenceAoPedido(chave) : null;
        if (ped) {
            if (info.descricao) ped.descricao = info.descricao;
            if (linha.inf_compl_1 && !ped.inf_compl_1) ped.inf_compl_1 = linha.inf_compl_1;
        }
    }

    function infoCacheUtil(info) {
        return !!(info && (info.descricao || info.inf_compl_1 || info.cadastrado === false));
    }

    function agendarLookupTag(chave, tagRaw, linha) {
        var cached = $scope._mapInfoTag[chave];
        // Cache só é válido se tem descrição ou já confirmou "não cadastrado"
        if (cached && infoCacheUtil(cached)) {
            aplicarInfoNaLinha(linha, cached);
            return;
        }
        if (_inflightInfoTag[chave]) {
            _inflightInfoTag[chave].then(function (info) {
                aplicarInfoNaLinha(linha, info);
                $scope.$applyAsync();
            });
            return;
        }

        // Hit do pedido: só se já tiver descrição (itens esperados). Excedente sem desc → API.
        var doPedido = tagPertenceAoPedido(chave);
        if (doPedido && !isExcedenteItem(doPedido)) {
            var descPed = $scope.descricaoItem(doPedido);
            var infPed = doPedido.inf_compl_1 || doPedido.inf_compl1 || '';
            if ((descPed && descPed !== '—') || infPed) {
                var infoPed = cacheInfoTag(chave, {
                    cadastrado: true,
                    descricao: (descPed && descPed !== '—') ? descPed : '',
                    inf_compl_1: infPed
                });
                aplicarInfoNaLinha(linha, infoPed);
                return;
            }
        }

        _filaLookupTag.push({ chave: chave, tag: tagRaw, linha: linha });
        if (_timerLookupTag) return;
        _timerLookupTag = setTimeout(function () {
            _timerLookupTag = null;
            flushLookupTags();
        }, LOOKUP_DEBOUNCE_MS);
    }

    /** Batch: 1 request de categorias (lazy) + 1 request por tag nova (dedupe in-flight). */
    function flushLookupTags() {
        var fila = _filaLookupTag.splice(0, _filaLookupTag.length);
        if (!fila.length) return;

        var idConta = ($scope._regConta && $scope._regConta._id) || '';
        if (!idConta) {
            fila.forEach(function (f) {
                var info = cacheInfoTag(f.chave, { cadastrado: false, descricao: '', inf_compl_1: '' });
                aplicarInfoNaLinha(f.linha, info);
            });
            $scope.$applyAsync();
            return;
        }

        carregarCategoriasOnce().then(function () {
            fila.forEach(function (f) {
                var cachedOk = $scope._mapInfoTag[f.chave];
                if (cachedOk && infoCacheUtil(cachedOk)) {
                    aplicarInfoNaLinha(f.linha, cachedOk);
                    return;
                }
                if (_inflightInfoTag[f.chave]) {
                    _inflightInfoTag[f.chave].then(function (info) {
                        aplicarInfoNaLinha(f.linha, info);
                        $scope.$applyAsync();
                    });
                    return;
                }

                _inflightInfoTag[f.chave] = buscarItemPorTag(idConta, f.tag, f.chave)
                    .then(function (info) {
                        return cacheInfoTag(f.chave, info);
                    })
                    .finally(function () {
                        delete _inflightInfoTag[f.chave];
                    });

                _inflightInfoTag[f.chave].then(function (info) {
                    aplicarInfoNaLinha(f.linha, info);
                    $scope.$applyAsync();
                });
            });
            $scope.$applyAsync();
        });
    }

    /** Busca item por tag (original e normalizada) e resolve descrição via categoria. */
    function buscarItemPorTag(idConta, tagRaw, chave) {
        var tentativas = [];
        var t1 = String(tagRaw || '').trim();
        var t2 = chave;
        if (t1) tentativas.push(t1);
        if (t2 && t2 !== t1.toUpperCase() && t2 !== t1) tentativas.push(t2);
        if (t1 && t1.toUpperCase() !== t1) tentativas.push(t1.toUpperCase());

        function tentar(idx) {
            if (idx >= tentativas.length) {
                return Promise.resolve({
                    cadastrado: false, descricao: '', inf_compl_1: '',
                    id_item: null, id_categoria: null
                });
            }
            var tagQ = tentativas[idx];
            return uteisService.getBase(
                '/_bd?c=item&id_conta=' + encodeURIComponent(idConta)
                    + '&tag=' + encodeURIComponent(tagQ)
            ).then(function (res) {
                var lista = Array.isArray(res) ? res : (res ? [res] : []);
                var item = null;
                for (var i = 0; i < lista.length; i++) {
                    if ($scope.normalizaTag(lista[i].tag) === chave
                        || $scope.normalizaTag(lista[i].tag_secundaria) === chave) {
                        item = lista[i];
                        break;
                    }
                }
                if (!item && lista.length === 1) item = lista[0];
                if (!item || !item._id) return tentar(idx + 1);

                var inf = item.inf_compl1 || item.inf_compl_1 || '';
                var idCat = item.id_categoria
                    ? (typeof item.id_categoria === 'object' ? item.id_categoria._id : item.id_categoria)
                    : null;
                return resolverDescricaoItem(item).then(function (desc) {
                    return {
                        cadastrado: true,
                        descricao: desc,
                        inf_compl_1: inf,
                        id_item: item._id,
                        id_categoria: idCat
                    };
                });
            }).catch(function () {
                return tentar(idx + 1);
            });
        }

        return tentar(0);
    }

    function resolverDescricaoItem(item) {
        if (!item) return Promise.resolve('');
        if (item.id_categoria && typeof item.id_categoria === 'object' && item.id_categoria.descricao) {
            return Promise.resolve(String(item.id_categoria.descricao));
        }
        var idCat = item.id_categoria
            ? String(typeof item.id_categoria === 'object' ? item.id_categoria._id : item.id_categoria).trim()
            : '';
        var doMapa = descricaoDeCategoriaId(item.id_categoria);
        if (doMapa) return Promise.resolve(doMapa);
        if (item.descricao) return Promise.resolve(String(item.descricao));

        if (!idCat) return Promise.resolve('');

        return uteisService.getBase(
            '/_bd?c=categoria&_id=' + encodeURIComponent(idCat)
        ).then(function (res) {
            var cat = Array.isArray(res) ? res[0] : res;
            if (cat && cat._id) {
                if (!_mapCategorias) _mapCategorias = {};
                _mapCategorias[String(cat._id)] = cat;
                return cat.descricao || '';
            }
            return '';
        }).catch(function () { return ''; });
    }

    function statusItemLower(it) {
        return String((it && it.status) || '').toLowerCase();
    }

    function isExcedenteItem(it) {
        var s = statusItemLower(it);
        if (s === 'excedente' || s === 'alerta' || !!(it && it._excedente)) return true;
        // Em RET: item pendente que era excedente na origem
        if ($scope.isModoRetorno() && String(it && it._status_origem || '').toLowerCase() === 'excedente') {
            return true;
        }
        return false;
    }
    $scope.isExcedenteItem = isExcedenteItem;

    /** Status na tabela: RET — opcionais = "Não lido" (amarelo); obrigatórios pelo status_destino. */
    $scope.statusExibicaoItem = function (it) {
        if ($scope.isModoRetorno()) {
            if (itemOpcionalRetorno(it)) {
                // Se lido no retorno, mostra status normal (concluido)
                var sn = statusItemLower(it);
                if (sn === 'concluido' || sn === 'encontrado') return 'concluido';
                return 'nao_lido';
            }
            return statusDestinoLower(it) === 'concluido' ? 'concluido' : 'pendente';
        }
        return statusItemLower(it) || 'pendente';
    };

    $scope.totalEsperados = function () {
        if (!$scope._posicao || !$scope._posicao.itens) {
            return ($scope._itensNaoCadastrados || []).length;
        }
        var itens = $scope._posicao.itens;
        if ($scope.isModoRetorno()) {
            var nRet = 0;
            for (var i = 0; i < itens.length; i++) {
                if (itemRequerRetorno(itens[i])) nRet += 1;
            }
            return nRet;
        }
        var n = 0;
        for (var j = 0; j < itens.length; j++) {
            if (!isExcedenteItem(itens[j])) n += 1;
        }
        return n;
    };

    $scope.totalPendentes = function () {
        var itens = ($scope._posicao && $scope._posicao.itens) || [];
        var n = 0;
        if ($scope.isModoRetorno()) {
            for (var i = 0; i < itens.length; i++) {
                if (!itemRequerRetorno(itens[i])) continue;
                if (statusDestinoLower(itens[i]) !== 'concluido') n += 1;
            }
            return n;
        }
        for (var j = 0; j < itens.length; j++) {
            if (isExcedenteItem(itens[j])) continue;
            var s = statusItemLower(itens[j]);
            if (s === 'pendente' || !s) n += 1;
        }
        if (!$scope._posicao) n += ($scope._itensNaoCadastrados || []).length;
        return n;
    };

    $scope.totalConcluidos = function () {
        var itens = ($scope._posicao && $scope._posicao.itens) || [];
        var n = 0;
        if ($scope.isModoRetorno()) {
            for (var i = 0; i < itens.length; i++) {
                if (!itemRequerRetorno(itens[i])) continue;
                if (statusDestinoLower(itens[i]) === 'concluido') n += 1;
            }
            return n;
        }
        for (var j = 0; j < itens.length; j++) {
            if (isExcedenteItem(itens[j])) continue;
            var s = statusItemLower(itens[j]);
            if (s === 'concluido' || s === 'encontrado') n += 1;
        }
        return n;
    };

    $scope.totalExcedentes = function () {
        var itens = ($scope._posicao && $scope._posicao.itens) || [];
        var n = 0;
        for (var i = 0; i < itens.length; i++) {
            if (isExcedenteItem(itens[i])) n += 1;
        }
        return n;
    };

    $scope.progressoPct = function () {
        var total = $scope.totalEsperados();
        if (!total) return 0;
        return Math.round(($scope.totalConcluidos() / total) * 100);
    };

    async function buscarPosicaoLocal(idDoc) {
        var urlLocal = '/_bd?c=posicao'
            + '&id_conta=' + encodeURIComponent($scope._regConta._id)
            + '&id_doc=' + encodeURIComponent(idDoc)
            + '&_sort=createdAt';
        var resLocal = await uteisService.getBase(urlLocal).catch(function () { return []; });
        return (resLocal && resLocal.length) ? resLocal[0] : null;
    }

    /** Restaura metadados de devolução (_status_origem / modo RET) a partir de retorno_api. */
    function prepararPosicaoCarregada(posicao) {
        if (!posicao) return posicao;
        var idDoc = String(posicao.id_doc || '').trim();
        $scope._modoRetorno = /-RET$/i.test(idDoc);

        var mapaOrigem = {};
        var mapaObrig = {};
        try {
            var meta = posicao.retorno_api
                ? (typeof posicao.retorno_api === 'string'
                    ? JSON.parse(posicao.retorno_api)
                    : posicao.retorno_api)
                : null;
            if (meta && meta.status_origem_por_tag) {
                Object.keys(meta.status_origem_por_tag).forEach(function (k) {
                    mapaOrigem[$scope.normalizaTag(k)] = meta.status_origem_por_tag[k];
                });
            }
            if (meta && meta.retorno_obrigatorio_por_tag) {
                Object.keys(meta.retorno_obrigatorio_por_tag).forEach(function (k) {
                    mapaObrig[$scope.normalizaTag(k)] = !!meta.retorno_obrigatorio_por_tag[k];
                });
            }
        } catch (e) { /* ignore */ }

        (posicao.itens || []).forEach(function (it) {
            var chave = $scope.normalizaTag(it.tag);
            if (mapaOrigem[chave]) {
                it._status_origem = mapaOrigem[chave];
            } else if (!it._status_origem) {
                var st = statusItemLower(it);
                if (st === 'excedente') it._status_origem = 'excedente';
                else if (st === 'pendente' || !st) it._status_origem = 'pendente';
                else it._status_origem = 'concluido';
            }
            if (mapaObrig.hasOwnProperty(chave)) {
                it._retorno_obrigatorio = mapaObrig[chave];
            } else if (it._retorno_obrigatorio == null) {
                it._retorno_obrigatorio = it._status_origem !== 'pendente';
            }
            if (it._status_origem === 'excedente') it._excedente = true;
            if ($scope._modoRetorno) {
                if (!it.status_destino) it.status_destino = 'pendente';
                // Opcional já lido no retorno mantém concluido; demais restauram origem
                if (it._retorno_obrigatorio === false && statusItemLower(it) === 'concluido') {
                    /* mantém */
                } else if (it._status_origem) {
                    it.status = it._status_origem;
                }
            }
        });
        return posicao;
    }

    $scope.onBuscarPedido = async function () {
        var idDoc = String($scope._idDoc || '').trim();
        if (!idDoc) {
            uteisService.onToast('Informe o número do pedido.', 'warning', 2500, 'top-end');
            return;
        }
        if (!$scope._regConta || !$scope._regConta._id) {
            uteisService.onToast('Conta não carregada.', 'error', 2500, 'top-end');
            return;
        }

        $scope._buscando = true;
        resetSucessoPedido();
        $scope._posicao = null;
        $scope._origem = null;
        $scope._itensNaoCadastrados = [];
        $scope._msgBusca = '';
        $scope._modoRetorno = false;

        try {
            // Ordens -RET são locais (devolução) — não passam pela API do cliente
            if (/-RET$/i.test(idDoc)) {
                var posRetLocal = await buscarPosicaoLocal(idDoc);
                if (posRetLocal) {
                    $scope._posicao = prepararPosicaoCarregada(
                        await enriquecerDescricoesPosicao(posRetLocal)
                    );
                    semearCacheDoPedido($scope._posicao);
                    $scope._origem = 'retorno';
                    atualizarStatusPedido();
                    uteisService.onToast('Devolução carregada.', 'success', 2000, 'top-end');
                    return;
                }
                $scope._msgBusca = 'Ordem de devolução não encontrada.';
                uteisService.onToast($scope._msgBusca, 'warning', 3000, 'top-end');
                return;
            }

            var idApi = String(($scope._regConta && $scope._regConta.id_api) || '').trim();

            // Com id_api: sempre sincroniza via /ordem (recria posicao com todos os itens
            // cadastrados). Evita ficar preso numa posicao antiga incompleta.
            if (idApi) {
                var urlOrdem = '/' + encodeURIComponent(idApi)
                    + '/ordem/' + encodeURIComponent(idDoc)
                    + '?id_conta=' + encodeURIComponent($scope._regConta._id);

                var integ = await uteisService.getBase(urlOrdem);

                if (!integ) {
                    $scope._msgBusca = 'Erro ao consultar a integração.';
                    uteisService.onToast($scope._msgBusca, 'error', 3500, 'top-end');
                    return;
                }

                $scope._origem = integ.origem || null;
                $scope._itensNaoCadastrados = Array.isArray(integ.itens_nao_cadastrados)
                    ? integ.itens_nao_cadastrados
                    : [];

                if (integ.motivo === 'ordem_nao_encontrada') {
                    // Fallback: posição local já existente
                    var posLocal = await buscarPosicaoLocal(idDoc);
                    if (posLocal) {
                        $scope._posicao = prepararPosicaoCarregada(
                            await enriquecerDescricoesPosicao(posLocal)
                        );
                        semearCacheDoPedido($scope._posicao);
                        $scope._origem = 'posicao';
                        $scope._itensNaoCadastrados = [];
                        uteisService.onToast('Pedido encontrado na posição (local).', 'success', 2000, 'top-end');
                        return;
                    }
                    $scope._msgBusca = 'Ordem não encontrada.';
                    uteisService.onToast($scope._msgBusca, 'warning', 3000, 'top-end');
                    return;
                }

                if (integ.motivo === 'itens_nao_cadastrados') {
                    $scope._msgBusca = 'Ordem encontrada, mas todos os itens precisam estar cadastrados (inf_compl1) antes de criar a posição.';
                    uteisService.onToast(
                        'Cadastre os inf_compl1: ' + ($scope._itensNaoCadastrados.join(', ') || '—'),
                        'warning',
                        5000,
                        'top-end'
                    );
                    return;
                }

                if (integ.ok === false) {
                    $scope._msgBusca = integ.error || integ.mensagem || 'Falha na integração.';
                    uteisService.onToast($scope._msgBusca, 'error', 4000, 'top-end');
                    return;
                }

                if (!integ.posicao) {
                    $scope._msgBusca = 'Ordem não encontrada.';
                    uteisService.onToast($scope._msgBusca, 'warning', 3000, 'top-end');
                    return;
                }

                $scope._posicao = prepararPosicaoCarregada(
                    await enriquecerDescricoesPosicao(integ.posicao)
                );
                semearCacheDoPedido($scope._posicao);
                $scope._origem = integ.origem || 'ordem';
                uteisService.onToast(
                    'Pedido carregado (' + $scope._origem + ') — '
                        + (($scope._posicao.itens || []).length) + ' item(ns).',
                    'success',
                    2500,
                    'top-end'
                );
                return;
            }

            // Sem id_api: só collection posicao
            var posicaoLocal = await buscarPosicaoLocal(idDoc);
            if (posicaoLocal) {
                $scope._posicao = prepararPosicaoCarregada(
                    await enriquecerDescricoesPosicao(posicaoLocal)
                );
                semearCacheDoPedido($scope._posicao);
                $scope._origem = 'posicao';
                uteisService.onToast('Pedido encontrado na posição.', 'success', 2000, 'top-end');
                return;
            }

            $scope._msgBusca = 'Ordem não encontrada e conta sem id_api.';
            uteisService.onToast($scope._msgBusca, 'warning', 3000, 'top-end');
        } catch (e) {
            console.error('[portal_posicao] busca:', e);
            $scope._msgBusca = 'Erro ao consultar o pedido.';
            uteisService.onToast($scope._msgBusca, 'error', 3500, 'top-end');
        } finally {
            $scope._buscando = false;
            $timeout(function () { $scope.$applyAsync(); });
        }
    };

    $scope.onLimparPedido = function () {
        resetSucessoPedido();
        $scope._idDoc = '';
        $scope._posicao = null;
        $scope._origem = null;
        $scope._itensNaoCadastrados = [];
        $scope._msgBusca = '';
        $scope._registrando = false;
        $scope._retornando = false;
        $scope._modoRetorno = false;
    };

    $scope.podeRegistrarPosicao = function () {
        if ($scope._registrando || $scope._retornando) return false;
        var pos = $scope._posicao;
        if (!pos || !pos._id) return false;
        return String(pos.status || '').toLowerCase() === 'concluido';
    };

    /** Botão Retorno: parcial (algum lido + pendente) ou excedente; não em ordem -RET. */
    $scope.podeRetornarPosicao = function () {
        if ($scope._retornando || $scope._registrando) return false;
        var pos = $scope._posicao;
        if (!pos || !pos._id) return false;
        if ($scope.isModoRetorno()) return false;
        if (/-RET/i.test(String(pos.id_doc || ''))) return false;

        if ($scope.totalExcedentes() > 0) return true;
        var concluidos = $scope.totalConcluidos();
        var pendentes = $scope.totalPendentes();
        return concluidos > 0 && pendentes > 0;
    };

    function statusItemParaPosicao(s) {
        var st = String(s || '').toLowerCase();
        if (st === 'encontrado' || st === 'concluido') return 'concluido';
        if (st === 'excedente' || st === 'alerta') return 'excedente';
        if (st === 'nao_encontrado') return 'nao_encontrado';
        return 'pendente';
    }

    /** Status do documento posicao (enum sem 'excedente'). */
    function statusDocParaSalvar(statusUi) {
        var s = String(statusUi || '').toLowerCase();
        if (s === 'excedente' || s === 'alerta') return 'parcial';
        if (s === 'concluido' || s === 'encontrado') return 'concluido';
        if (s === 'parcial') return 'parcial';
        if (s === 'aberta' || s === 'partida') return s;
        return 'pendente';
    }

    function mapearItemPersistencia(it, opts) {
        opts = opts || {};
        var idCat = it.id_categoria;
        if (idCat && typeof idCat === 'object') idCat = idCat._id || null;
        var idItem = it._id;
        // IDs temporários do portal (excedente / divergência) → gera _id persistente
        if (!idItem
            || String(idItem).indexOf('exc-') === 0
            || String(idItem).indexOf('div-') === 0) {
            idItem = uteisService.onGetID();
        }

        // Registrar: usa status atual da UI (atendido = concluido).
        // RET: pode forçar via forcarStatus / usarOrigem.
        var statusFinal;
        if (opts.forcarStatus != null) {
            statusFinal = opts.forcarStatus;
        } else if (opts.usarOrigem) {
            statusFinal = statusItemParaPosicao(it._status_origem || it.status);
        } else {
            statusFinal = statusItemParaPosicao(it.status || it._status_origem);
        }

        return {
            _id: idItem,
            id_item: it.id_item || null,
            id_categoria: idCat || null,
            tag: it.tag || '',
            ean: it.ean || '',
            rssi: it.rssi != null ? String(it.rssi) : '',
            inf_compl_1: it.inf_compl_1 || it.inf_compl1 || '',
            inf_compl_2: it.inf_compl_2 || it.inf_compl2 || '',
            inf_compl_3: it.inf_compl_3 || it.inf_compl3 || '',
            inf_compl_4: it.inf_compl_4 || it.inf_compl4 || '',
            inf_compl_5: it.inf_compl_5 || it.inf_compl5 || '',
            quantidade: it.quantidade != null ? it.quantidade : 1,
            status: statusFinal,
            status_data: it.status_data || new Date(),
            status_destino: opts.status_destino != null
                ? opts.status_destino
                : (it.status_destino || 'pendente'),
            status_destino_data: opts.status_destino_data != null
                ? opts.status_destino_data
                : (it.status_destino_data || ''),
            id_gatweway: it.id_gatweway || null,
            id_colaborador: it.id_colaborador
                || ($scope._regColaborador && $scope._regColaborador._id)
                || null
        };
    }

    function montarItensParaRegistro(posicao, incluirExcedentes) {
        var itens = (posicao && posicao.itens) || [];
        return itens
            .filter(function (it) {
                if (!it) return false;
                if (!incluirExcedentes && isExcedenteItem(it)) return false;
                return true;
            })
            .map(function (it) {
                // Status atual (concluido na tela), não _status_origem pendente da carga
                return mapearItemPersistencia(it);
            });
    }

    function montarPayloadPosicao(pos, itens, extras) {
        extras = extras || {};
        var totais = uteisService.normalizarTotaisPosicao({
            itens: itens.filter(function (it) {
                return statusItemParaPosicao(it.status) !== 'excedente';
            }),
            total_itens: extras.total_itens != null ? extras.total_itens : pos.total_itens
        });
        if (extras.status) {
            // status forçado (ex.: RET / concluido)
        } else if (itens.some(function (it) {
            return statusItemParaPosicao(it.status) === 'excedente';
        })) {
            totais.status = 'parcial';
        }

        return {
            _id: extras._id || pos._id,
            id_conta: pos.id_conta || ($scope._regConta && $scope._regConta._id) || null,
            id_colaborador: pos.id_colaborador
                || ($scope._regColaborador && $scope._regColaborador._id)
                || null,
            ativo: pos.ativo != null ? pos.ativo : '1',
            tipo: pos.tipo || 'conferencia',
            id_doc: extras.id_doc != null ? extras.id_doc : pos.id_doc,
            descricao: extras.descricao != null ? extras.descricao : (pos.descricao || pos.id_doc),
            status: extras.status || statusDocParaSalvar(totais.status),
            status_data: new Date(),
            partida_data: extras.partida_data != null ? extras.partida_data : (pos.partida_data || null),
            tolerancia: pos.tolerancia != null ? pos.tolerancia : 30,
            total_itens: totais.total_itens,
            total_concluido: totais.total_concluido,
            id_nivel_loc1: pos.id_nivel_loc1 || null,
            id_nivel_loc2: pos.id_nivel_loc2 || null,
            id_nivel_loc3: pos.id_nivel_loc3 || null,
            id_nivel_loc4: pos.id_nivel_loc4 || null,
            id_nivel_loc1_destino: extras.id_nivel_loc1_destino != null
                ? extras.id_nivel_loc1_destino
                : (pos.id_nivel_loc1_destino || null),
            id_nivel_loc2_destino: extras.id_nivel_loc2_destino != null
                ? extras.id_nivel_loc2_destino
                : (pos.id_nivel_loc2_destino || null),
            id_nivel_loc3_destino: extras.id_nivel_loc3_destino != null
                ? extras.id_nivel_loc3_destino
                : (pos.id_nivel_loc3_destino || null),
            id_nivel_loc4_destino: extras.id_nivel_loc4_destino != null
                ? extras.id_nivel_loc4_destino
                : (pos.id_nivel_loc4_destino || null),
            itens: itens,
            retorno_api: extras.retorno_api != null ? extras.retorno_api : (pos.retorno_api || undefined)
        };
    }

    $scope.onRetornarPosicao = function () {
        if (!$scope.podeRetornarPosicao()) return;

        var pos = $scope._posicao;
        var idDocBase = String(pos.id_doc || '').trim();
        if (!idDocBase) {
            uteisService.onToast('Pedido sem id_doc.', 'warning', 2500, 'top-end');
            return;
        }

        var todosItens = (pos.itens || []).filter(function (it) { return !!it; });
        var qtdLidos = 0;
        for (var i = 0; i < todosItens.length; i++) {
            if (isExcedenteItem(todosItens[i])) { qtdLidos += 1; continue; }
            var st = statusItemLower(todosItens[i]);
            if (st === 'concluido' || st === 'encontrado') qtdLidos += 1;
        }
        if (!qtdLidos) {
            uteisService.onToast('Não há itens lidos para devolução.', 'warning', 2500, 'top-end');
            return;
        }

        var idDocRetorno = /-RET$/i.test(idDocBase) ? idDocBase : (idDocBase + '-RET');
        var motivo = $scope.totalExcedentes() > 0
            ? ($scope.totalPendentes() > 0 ? 'parcial_excedente' : 'excedente')
            : 'parcial';

        // Mesma posição: id_doc += -RET
        // - lidos esperados → status concluido, destino pendente
        // - excedentes → status excedente, destino pendente
        // - esperados não lidos → status e destino pendente (permanecem na ordem)
        var itensAtualizados = todosItens.map(function (it) {
            var statusNormal;
            var obrigatorio;
            if (isExcedenteItem(it)) {
                statusNormal = 'excedente';
                obrigatorio = true;
            } else {
                var s = statusItemLower(it);
                if (s === 'concluido' || s === 'encontrado') {
                    statusNormal = 'concluido';
                    obrigatorio = true;
                } else {
                    statusNormal = 'pendente';
                    obrigatorio = false; // esperado não lido — opcional no retorno
                }
            }
            var mapped = mapearItemPersistencia(it, {
                forcarStatus: statusNormal,
                status_destino: 'pendente',
                status_destino_data: ''
            });
            mapped._status_origem = statusNormal;
            mapped._retorno_obrigatorio = obrigatorio;
            if (statusNormal === 'excedente') mapped._excedente = true;
            return mapped;
        });

        var itensPersistencia = itensAtualizados.map(function (it) {
            return {
                _id: it._id,
                id_item: it.id_item,
                id_categoria: it.id_categoria,
                tag: it.tag,
                ean: it.ean,
                rssi: it.rssi,
                inf_compl_1: it.inf_compl_1,
                inf_compl_2: it.inf_compl_2,
                inf_compl_3: it.inf_compl_3,
                inf_compl_4: it.inf_compl_4,
                inf_compl_5: it.inf_compl_5,
                quantidade: it.quantidade,
                status: it.status,
                status_data: it.status_data || new Date(),
                status_destino: 'pendente',
                status_destino_data: '',
                id_gatweway: it.id_gatweway,
                id_colaborador: it.id_colaborador
            };
        });

        var payload = montarPayloadPosicao(pos, itensPersistencia, {
            _id: pos._id,
            id_doc: idDocRetorno,
            descricao: idDocRetorno,
            status: 'pendente',
            total_itens: itensPersistencia.length,
            retorno_api: JSON.stringify({
                origem_id_doc: idDocBase.replace(/-RET$/i, ''),
                origem_id_posicao: pos._id,
                motivo: motivo,
                itens_retorno: qtdLidos,
                status_origem_por_tag: itensAtualizados.reduce(function (acc, it) {
                    acc[String(it.tag || '').toUpperCase()] = it._status_origem;
                    return acc;
                }, {}),
                retorno_obrigatorio_por_tag: itensAtualizados.reduce(function (acc, it) {
                    acc[String(it.tag || '').toUpperCase()] = !!it._retorno_obrigatorio;
                    return acc;
                }, {})
            })
        });

        $scope._retornando = true;
        uteisService.patchBase('/posicao', payload)
            .then(function (res) {
                var posRet = (res && res._id) ? res : Object.assign({}, pos, payload);

                var mapaOrigem = {};
                var mapaObrig = {};
                itensAtualizados.forEach(function (it) {
                    var k = $scope.normalizaTag(it.tag);
                    mapaOrigem[k] = it._status_origem;
                    mapaObrig[k] = it._retorno_obrigatorio;
                });
                (posRet.itens || []).forEach(function (it) {
                    var chave = $scope.normalizaTag(it.tag);
                    it._status_origem = mapaOrigem[chave]
                        || (statusItemLower(it) === 'excedente'
                            ? 'excedente'
                            : (statusItemLower(it) === 'pendente' ? 'pendente' : 'concluido'));
                    it._retorno_obrigatorio = mapaObrig.hasOwnProperty(chave)
                        ? mapaObrig[chave]
                        : (it._status_origem !== 'pendente');
                    if (it._status_origem === 'excedente') it._excedente = true;
                    it.status = it._status_origem;
                    it.status_destino = 'pendente';
                    it.status_destino_data = '';
                });

                $scope._posicao = posRet;
                $scope._idDoc = idDocRetorno;
                $scope._modoRetorno = true;
                $scope._origem = 'retorno';
                $scope.onLimparLeituras();
                atualizarStatusPedido();

                uteisService.onToast(
                    'Pedido convertido em ' + idDocRetorno + '. Releia os itens e registre o destino.',
                    'success', 3500, 'top-end'
                );
            })
            .catch(function (err) {
                console.error('[portal_posicao] retorno:', err);
                uteisService.onToast('Erro ao gerar devolução, tente novamente.', 'error', 3000, 'top-end');
            })
            .finally(function () {
                $scope._retornando = false;
                $scope.$applyAsync();
            });
    };

    $scope.onRegistrarPosicao = function () {
        if (!$scope.podeRegistrarPosicao()) return;

        var pos = $scope._posicao;
        var modoRet = $scope.isModoRetorno();

        var itens;
        if (modoRet) {
            // Devolução: fecha status_destino dos itens re-lidos; não lidos ficam pendente
            itens = (pos.itens || []).map(function (it) {
                var statusNormal = statusItemParaPosicao(it._status_origem || it.status);
                if (!itemRequerRetorno(it)) {
                    return mapearItemPersistencia(it, {
                        forcarStatus: 'pendente',
                        status_destino: 'pendente',
                        status_destino_data: ''
                    });
                }
                return mapearItemPersistencia(it, {
                    forcarStatus: statusNormal === 'pendente' ? 'concluido' : statusNormal,
                    status_destino: 'concluido',
                    status_destino_data: it.status_destino_data || new Date()
                });
            });
        } else {
            itens = montarItensParaRegistro(pos, false);
        }

        if (!itens.length) {
            uteisService.onToast('Nenhum item para registrar.', 'warning', 2500, 'top-end');
            return;
        }

        var payload = montarPayloadPosicao(pos, itens, {
            _id: pos._id,
            id_doc: pos.id_doc,
            status: 'concluido',
            retorno_api: pos.retorno_api
        });

        $scope._registrando = true;
        var idPosRegistro = pos._id;
        var idDocRegistro = String(pos.id_doc || '');

        uteisService.patchBase('/posicao', payload)
            .then(function (docSalvo) {
                uteisService.onToast(
                    modoRet ? 'Devolução registrada com sucesso!' : 'Posição registrada com sucesso!',
                    'success', 2500, 'top-end'
                );

                function limparAposRegistro() {
                    $scope.onLimparPedido();
                    $scope.onLimparLeituras();
                }

                // Ordens de retorno/recebimento internas: não integra Naturgy
                if (modoRet
                    || /-RET/i.test(idDocRegistro)
                    || /-REC/i.test(idDocRegistro)) {
                    limparAposRegistro();
                    return;
                }

                // Se o PATCH já disparou integração via conta.id_api, retorno_api vem preenchido
                if (docSalvo && docSalvo.retorno_api) {
                    limparAposRegistro();
                    return;
                }

                // Mantém GET /x_naturgy/:id_posicao — decide Recebimento vs Saída pela loc. nível 2
                var idPos = (docSalvo && docSalvo._id) || idPosRegistro;
                return $http.get(
                    uteisService.apiUrl_() + '/x_naturgy/' + encodeURIComponent(idPos),
                    { timeout: 90000 }
                ).then(function (res) {
                    var ok = res && res.status >= 200 && res.status < 300;
                    uteisService.onToast(
                        ok ? 'Integração Naturgy enviada.' : 'Falha na integração Naturgy.',
                        ok ? 'success' : 'warning',
                        3000,
                        'top-end'
                    );
                }).catch(function (errNat) {
                    console.error('[portal_posicao] naturgy:', errNat);
                    uteisService.onToast(
                        'Posição salva; falha ao enviar para Naturgy.',
                        'warning',
                        3500,
                        'top-end'
                    );
                }).finally(limparAposRegistro);
            })
            .catch(function (err) {
                console.error('[portal_posicao] registrar:', err);
                uteisService.onToast('Erro ao registrar a posição, tente novamente.', 'error', 3000, 'top-end');
            })
            .finally(function () {
                $scope._registrando = false;
                $scope.$applyAsync();
            });
    };

    $scope.onLimparLeituras = function () {
        $scope._leituras = [];
        $scope._mapLeituras = {};
    };

    function labelInf1DaCategoria(idCat) {
        if (!idCat || !_mapCategorias) return 'Inf. Extra';
        var cat = _mapCategorias[String(idCat)];
        var lbl = cat && cat.labelInf1;
        return (lbl && String(lbl).trim()) ? String(lbl).trim() : 'Inf. Extra';
    }

    function buscarItemCompletoPorTag(tag) {
        var idConta = ($scope._regConta && $scope._regConta._id) || '';
        var chave = $scope.normalizaTag(tag);
        if (!idConta || !chave) return Promise.resolve(null);
        return buscarItemPorTag(idConta, tag, chave).then(function (info) {
            if (!info || !info.cadastrado || !info.id_item) return null;
            return uteisService.getBase(
                '/_bd?c=item&_id=' + encodeURIComponent(info.id_item)
            ).then(function (res) {
                var lista = Array.isArray(res) ? res : (res ? [res] : []);
                return lista[0] || null;
            }).catch(function () { return null; });
        });
    }

    function idCategoriaComoString(valor) {
        if (valor == null || valor === '') return '';
        if (typeof valor === 'object') return String(valor._id || '').trim();
        return String(valor).trim();
    }

    $scope.onAbrirEditarItemLeitura = function (linha) {
        if (!linha || !linha.tag) return;

        carregarCategoriasOnce().then(function () {
            var idCatLinha = idCategoriaComoString(linha.id_categoria);
            $scope._itemEdit = {
                linha: linha,
                tag: linha.tag,
                id_item: linha.id_item || null,
                id_categoria: idCatLinha,
                inf_compl1: linha.inf_compl_1 || '',
                labelInf1: labelInf1DaCategoria(idCatLinha),
                cadastrado: !!linha.cadastrado,
                _carregando: true
            };

            var el = document.getElementById('modalItemLeituraPosicao');
            if (el && typeof bootstrap !== 'undefined') {
                _modalItemEdit = bootstrap.Modal.getOrCreateInstance(el);
                _modalItemEdit.show();
            }

            // Sempre busca o item pela tag ao editar (garante id_categoria real)
            return buscarItemCompletoPorTag(linha.tag).then(function (item) {
                if (!$scope._itemEdit || $scope._itemEdit.tag !== linha.tag) return;
                if (item && item._id) {
                    var idCat = idCategoriaComoString(item.id_categoria);
                    // Garante que a categoria exista na lista do select
                    if (idCat && _mapCategorias && _mapCategorias[idCat]) {
                        var naLista = ($scope._listCategorias || []).some(function (c) {
                            return String(c._id) === idCat;
                        });
                        if (!naLista) $scope._listCategorias.push(_mapCategorias[idCat]);
                    }
                    $scope._itemEdit.id_item = item._id;
                    $scope._itemEdit.id_categoria = idCat;
                    $scope._itemEdit.inf_compl1 = item.inf_compl1 || item.inf_compl_1 || '';
                    $scope._itemEdit.cadastrado = true;
                    $scope._itemEdit.labelInf1 = labelInf1DaCategoria(idCat);
                    $scope._itemEdit._itemRaw = item;
                }
            }).finally(function () {
                if ($scope._itemEdit) $scope._itemEdit._carregando = false;
                $scope.$applyAsync();
            });
        });
    };

    /** Troca de categoria: atualiza só o label; mantém inf_compl1 já informado. */
    $scope.onItemEditCategoriaChange = function () {
        if (!$scope._itemEdit) return;
        $scope._itemEdit.labelInf1 = labelInf1DaCategoria($scope._itemEdit.id_categoria);
    };

    $scope.onSalvarItemLeitura = function () {
        if (!$scope._itemEdit || $scope._salvandoItem) return;
        var edit = $scope._itemEdit;
        if (!edit.id_categoria) {
            uteisService.onToast('Selecione uma categoria.', 'warning', 2500, 'top-end');
            return;
        }

        var idConta = ($scope._regConta && $scope._regConta._id) || '';
        var cat = _mapCategorias && _mapCategorias[String(edit.id_categoria)];
        var descCat = (cat && cat.descricao) || '';

        var payload;
        if (edit.id_item && edit._itemRaw) {
            payload = JSON.parse(JSON.stringify(edit._itemRaw));
        } else if (edit.id_item) {
            payload = { _id: edit.id_item, id_conta: idConta, tag: edit.tag };
        } else {
            payload = {
                _id: uteisService.onGetID(),
                id_conta: idConta,
                id_externo: '',
                status: 'ativo',
                foto: '',
                tag_secundaria: '',
                id_nivel_loc1: '', id_nivel_loc2: '', id_nivel_loc3: '', id_nivel_loc4: '',
                observacao: '',
                registro_atual: {}, registro_anterior: {},
                vinculos_device: [],
                mov_livre: 0, mov_tracking: 0,
                inf_compl2: '', inf_compl3: '', inf_compl4: '', inf_compl5: ''
            };
        }

        payload.tag = edit.tag;
        payload.id_conta = payload.id_conta || idConta;
        payload.id_categoria = edit.id_categoria;
        payload.descricao = descCat || payload.descricao || '';
        // Categoria alterada: mantém o inf_compl1 do formulário (já preservado no change)
        payload.inf_compl1 = edit.inf_compl1 != null ? String(edit.inf_compl1) : '';

        delete payload._foto;

        $scope._salvandoItem = true;
        uteisService.patchBase('/item', payload)
            .then(function () {
                var info = cacheInfoTag($scope.normalizaTag(edit.tag), {
                    cadastrado: true,
                    descricao: descCat,
                    inf_compl_1: payload.inf_compl1,
                    id_item: payload._id,
                    id_categoria: edit.id_categoria
                });

                if (edit.linha) aplicarInfoNaLinha(edit.linha, info);

                // Atualiza outras linhas da mesma tag e itens do pedido
                var chave = $scope.normalizaTag(edit.tag);
                ($scope._leituras || []).forEach(function (l) {
                    if ($scope.normalizaTag(l.tag) === chave) aplicarInfoNaLinha(l, info);
                });
                var ped = tagPertenceAoPedido(chave);
                if (ped) {
                    ped.descricao = descCat || ped.descricao;
                    ped.inf_compl_1 = payload.inf_compl1;
                    if (!ped.id_item) ped.id_item = payload._id;
                    if (!ped.id_categoria) ped.id_categoria = edit.id_categoria;
                }

                if (_modalItemEdit) _modalItemEdit.hide();
                $scope._itemEdit = null;
                uteisService.onToast(
                    edit.cadastrado ? 'Item atualizado.' : 'Item cadastrado.',
                    'success', 2200, 'top-end'
                );
            })
            .catch(function (err) {
                console.error('[portal_posicao] salvar item:', err);
                uteisService.onToast('Erro ao salvar o item.', 'error', 3000, 'top-end');
            })
            .finally(function () {
                $scope._salvandoItem = false;
                $scope.$applyAsync();
            });
    };

    $scope.onRecebeLeitura = function (leitura) {
        if (!leitura || !leitura.tag) return;
        if (!leituraDeGatewayAceito(leitura)) return;

        sinalizarGatewayUltimaLeitura(leitura);

        var chave = $scope.normalizaTag(leitura.tag);
        if (!chave) return;

        var agora = leitura.data_leitura || agoraFormatado();
        var pedidoCarregado = !!($scope._posicao && Array.isArray($scope._posicao.itens));
        var itemPedido = tagPertenceAoPedido(chave);
        var modoRet = $scope.isModoRetorno();
        var modoDivergencia = !modoRet && gatewayChecagemComDivergenciaSemAlerta($scope._gatewayUltimaLeitura);
        var foraDaOrdem = false;
        if (pedidoCarregado) {
            // RET: tudo que está na lista é esperado na devolução; só tag nova é excedente
            foraDaOrdem = modoRet
                ? !itemPedido
                : (!itemPedido || isExcedenteItem(itemPedido));
        }

        if (pedidoCarregado) {
            if (modoRet) {
                if (itemPedido) {
                    marcarDestinoConcluido(itemPedido, leitura);
                } else {
                    var exc = adicionarExcedenteAoPedido(leitura, chave);
                    if (exc) {
                        exc._status_origem = 'excedente';
                        exc.status = 'pendente';
                        exc.status_destino = 'concluido';
                        exc.status_destino_data = new Date();
                    }
                }
            } else if (itemPedido && !isExcedenteItem(itemPedido)) {
                marcarItemPedidoConcluido(itemPedido, leitura);
                foraDaOrdem = false;
            } else if (modoDivergencia) {
                // Checagem + Com Divergência + Sem Alertas:
                // cadastrado → inclui na ordem / atualiza qtd esperada / sem alerta
                // não cadastrado → excedente (como hoje)
                var cachedDiv = $scope._mapInfoTag[chave];
                if (cachedDiv && cachedDiv.cadastrado === true) {
                    adicionarItemEsperadoAoPedido(leitura, chave, cachedDiv);
                    foraDaOrdem = false;
                } else if (cachedDiv && cachedDiv.cadastrado === false) {
                    adicionarExcedenteAoPedido(leitura, chave);
                    foraDaOrdem = true;
                } else {
                    // Aguarda lookup (aplicarInfoNaLinha → resolverDivergenciaAposLookup)
                    foraDaOrdem = false;
                }
            } else {
                adicionarExcedenteAoPedido(leitura, chave);
            }
            atualizarStatusPedido();
        }

        var existente = $scope._mapLeituras[chave];

        if (existente) {
            existente.contagem = (existente.contagem || 0) + 1;
            existente.rssi = leitura.rssi != null ? leitura.rssi : existente.rssi;
            existente.data_hora = agora;
            existente.tokem = leitura.tokem || existente.tokem;
            existente.excedente = foraDaOrdem || !!existente.excedente;
            if (!existente._infoOk) {
                agendarLookupTag(chave, leitura.tag, existente);
            } else if (foraDaOrdem) {
                // propaga descrição da leitura para o item excedente do pedido
                var noPedido = tagPertenceAoPedido(chave);
                if (noPedido && !noPedido.descricao && existente.descricao) {
                    noPedido.descricao = existente.descricao;
                }
            } else if (modoDivergencia && existente.cadastrado === true && existente.excedente) {
                existente.excedente = false;
            }
            avaliarAlertaLeitura({
                pedidoCarregado: pedidoCarregado,
                foraDaOrdem: foraDaOrdem,
                cadastrado: existente.cadastrado
            });
            return;
        }

        var linha = {
            tag: leitura.tag,
            rssi: leitura.rssi != null ? leitura.rssi : '',
            contagem: 1,
            data_hora: agora,
            tokem: leitura.tokem || '',
            excedente: foraDaOrdem,
            cadastrado: null,
            descricao: '',
            _infoOk: false
        };

        var cached = $scope._mapInfoTag[chave];
        if (cached && infoCacheUtil(cached)) {
            aplicarInfoNaLinha(linha, cached);
            // Após aplicar cache em modo divergência, sincroniza flag excedente
            if (modoDivergencia && linha.cadastrado === true) {
                foraDaOrdem = false;
                linha.excedente = false;
            } else if (modoDivergencia && linha.cadastrado === false) {
                foraDaOrdem = true;
                linha.excedente = true;
            }
        } else {
            agendarLookupTag(chave, leitura.tag, linha);
        }

        // Sem ordem / excedente: alerta imediato.
        // Não cadastrado: se já conhecido no cache; senão aplica quando o lookup confirmar.
        avaliarAlertaLeitura({
            pedidoCarregado: pedidoCarregado,
            foraDaOrdem: foraDaOrdem,
            cadastrado: linha.cadastrado
        });

        $scope._mapLeituras[chave] = linha;
        $scope._leituras.unshift(linha);
        if ($scope._leituras.length > MAX_LEITURAS) {
            var removida = $scope._leituras.pop();
            if (removida) {
                delete $scope._mapLeituras[$scope.normalizaTag(removida.tag)];
            }
        }
    };

    $scope.onConectarSocket = function () {
        if ($scope.socket) {
            if ($scope._regConta && $scope._regConta._id) {
                $scope.socket.emit('portal_leave', {
                    id_conta: $scope._regConta._id,
                    origem: 'portal_posicao'
                });
            }
            $scope.socket.disconnect();
            $scope.socket = null;
        }

        if (!$scope._regConta || !$scope._regConta._id) return;

        $scope.socket = io();

        function payloadGatewaysPortal() {
            return ($scope._listGatewaysAceitos || []).map(function (g) {
                return {
                    _id: g._id,
                    tokem: g.tokem || '',
                    descricao: g.descricao || ''
                };
            });
        }

        function entrarPresencePortal() {
            if (!$scope.socket || !$scope._regConta || !$scope._regConta._id) return;
            $scope.socket.emit('portal_join', {
                id_conta: $scope._regConta._id,
                origem: 'portal_posicao',
                gateways: payloadGatewaysPortal()
            });
        }

        $scope.sincronizarGatewaysPortalPresence = function () {
            if (!$scope.socket || !$scope._regConta || !$scope._regConta._id) return;
            $scope.socket.emit('portal_gateways', {
                id_conta: $scope._regConta._id,
                origem: 'portal_posicao',
                gateways: payloadGatewaysPortal()
            });
        };

        $scope.socket.on('connect', entrarPresencePortal);
        if ($scope.socket.connected) entrarPresencePortal();

        $scope.socket.on($scope._regConta._id, function (data) {
            try {
                var leituras = data;
                if (typeof leituras === 'string') leituras = JSON.parse(leituras);
                if (!Array.isArray(leituras)) leituras = [leituras];

                for (var i = 0; i < leituras.length; i++) {
                    $scope.onRecebeLeitura(leituras[i]);
                }
                $scope.$applyAsync();
            } catch (error) {
                console.error('[portal_posicao] socket:', error, data);
            }
        });

        $scope.socket.on('x_naturgy_portal_log', function (data) {
            try {
                $scope.onRecebePortalLog(data);
                $scope.$applyAsync();
            } catch (e) {
                console.error('[portal_posicao] portal_log:', e, data);
            }
        });
    };

    /** Log só dos gateways aceitos neste portal. */
    $scope.logPertenceAoPosto = function (log) {
        if (!log) return false;
        var gateways = $scope._listGatewaysAceitos || [];
        if (!gateways.length) return false;

        var device = String(log.device || '').trim().toUpperCase();
        var tokem = String(log.tokem || '').trim().toUpperCase();
        var deviceBase = device.replace(/-[ES]$/, '');

        return gateways.some(function (g) {
            var gTokem = String(g.tokem || '').trim().toUpperCase();
            var gDesc = String(g.descricao || '').trim().toUpperCase();
            if (tokem && gTokem && tokem === gTokem) return true;
            if (tokem && gDesc && tokem === gDesc) return true;
            var base = gTokem.replace(/-[ES]$/, '');
            if (device && base && (device === base || deviceBase === base || device === gTokem)) return true;
            if (device && gDesc && (device === gDesc || deviceBase === gDesc)) return true;
            return false;
        });
    };

    $scope.onRecebePortalLog = function (data) {
        if (!$scope.logPertenceAoPosto(data)) return;

        var status = String(data.status_sensor || '').toLowerCase();
        var statusLabel = data.status_sensor || '—';
        if (status === 'pre_sensor') statusLabel = 'Pré-sensor';
        else if (status === 'aguardando') statusLabel = 'Tag · Aguardando';
        else if (status === 'entrada') statusLabel = 'Tag · Entrada';
        else if (status === 'saida') statusLabel = 'Tag · Saída';
        else if (status === 'sensor_1') statusLabel = 'Sensor · 1ª porta';
        else if (status === 'sensor_entrada') statusLabel = 'Sensor · Entrada';
        else if (status === 'sensor_saida') statusLabel = 'Sensor · Saída';
        else if (status === 'sensor_descartado') statusLabel = 'Sensor · Descartado';
        else if (status === 'sensor_expirado') statusLabel = 'Sensor · Expirado / perdido';
        else if (status === 'sequencia_expirada') statusLabel = 'Sequência · Expirada';
        else if (status === 'tag_retida') statusLabel = 'Tag · Retida';
        else if (status === 'sentido_expirado') statusLabel = 'Sentido · Expirado';
        else if (status === 'sensor_ignorado') statusLabel = 'Sensor · Ignorado';
        else if (status === 'sinaleiro_ok') statusLabel = 'Sinaleiro · OK';
        else if (status === 'sinaleiro_erro') statusLabel = 'Sinaleiro · Erro';
        else if (status === 'sinaleiro_ignorado') statusLabel = 'Sinaleiro · Ignorado';
        else if (status === 'sinaleiro_verde') statusLabel = 'Sinaleiro · Verde';
        else if (status === 'sinaleiro_vermelho') statusLabel = 'Sinaleiro · Vermelho';

        var dataHora = data.data_hora || '';
        var hora = dataHora;
        if (dataHora && dataHora.indexOf(' ') > 0) {
            hora = dataHora.split(' ')[1] || dataHora;
        }

        $scope._portalLog.unshift({
            data_hora: dataHora,
            hora: hora,
            tag: data.tag || '',
            rssi: data.rssi != null ? data.rssi : '',
            status_sensor: statusLabel,
            status_raw: status,
            device: data.device || '',
            tokem: data.tokem || '',
            antena: data.antena || '',
            message: data.message || ''
        });

        if ($scope._portalLog.length > $scope._portalLogMax) {
            $scope._portalLog.length = $scope._portalLogMax;
        }
    };

    $scope.onTogglePortalLog = function (forcar) {
        if (typeof forcar === 'boolean') {
            $scope._portalLogAberto = forcar;
        } else {
            $scope._portalLogAberto = !$scope._portalLogAberto;
        }
    };

    $scope.onLimparPortalLog = function () {
        $scope._portalLog = [];
    };

    $scope.deviceSinaleiroAtual = function () {
        var g = $scope._gatewayUltimaLeitura;
        var tokem = g && (g.tokem || g.descricao);
        if (!tokem && $scope._listGatewaysAceitos && $scope._listGatewaysAceitos.length) {
            tokem = $scope._listGatewaysAceitos[0].tokem || $scope._listGatewaysAceitos[0].descricao;
        }
        if (!tokem) return '';
        return String(tokem).trim().replace(/-[EeSs]$/, '');
    };

    $scope.onAcionarSinaleiro = function (cor) {
        var name = $scope.deviceSinaleiroAtual();
        if (!name || $scope._sinaleiroAcionando) return;

        var payload = {
            deviceName: name,
            cor: Number(cor),
            tempo: 10000
        };

        $scope._sinaleiroAcionando = true;
        $http.post(uteisService.apiUrl_() + '/x_naturgy/sinaleiro', payload)
            .catch(function (err) {
                // Resposta OK já chega via socket x_naturgy_portal_log; aqui só falha de rede
                if (err && err.data && err.data.error) return;
                var msg = (err && err.message) || 'falha na chamada';
                $scope.onRecebePortalLog({
                    data_hora: '',
                    tag: 'SINALEIRO',
                    status_sensor: 'sinaleiro_erro',
                    device: name,
                    tokem: name,
                    message: msg
                });
            })
            .finally(function () {
                $scope._sinaleiroAcionando = false;
            });
    };

    $scope.$on('$destroy', function () {
        resetSucessoPedido();
        if (timerRelogio) {
            clearInterval(timerRelogio);
            timerRelogio = null;
        }
        if (_timerLookupTag) {
            clearTimeout(_timerLookupTag);
            _timerLookupTag = null;
        }
        removerListenersFechamentoPortal();
        if ($scope.socket) {
            if ($scope._regConta && $scope._regConta._id) {
                $scope.socket.emit('portal_leave', {
                    id_conta: $scope._regConta._id,
                    origem: 'portal_posicao'
                });
            }
            $scope.socket.disconnect();
            $scope.socket = null;
        }
    });
});
