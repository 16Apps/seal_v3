
app.controller('portalMovimentacaoCtrl', function ($scope, $http, $timeout, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = [];
    $scope._listGateways = [];
    $scope._listGatewaysTodos = [];      // todos da conta (config do posto)
    $scope._postoIdsSel = [];            // ids selecionados neste PC (localStorage)
    $scope._postoSemConfig = false;      // true se ainda não configurou este computador

    // Log ao vivo (socket x_naturgy_portal_log) — só gateways ativos neste PC
    $scope._portalLog = [];
    $scope._portalLogMax = 500;
    var modalPortalLog = undefined;

    // Auxiliares para o modal de associação da tag
    $scope._listItens = [];              // coleção "categoria" (carrega os labels)
    $scope._listCategoriasItem = [];     // coleção "categoria_item"
    $scope._assoc = {};                  // dados da associação em edição

    // Itens cadastrados (coleção item) para identificar tags conhecidas
    $scope._listItensCadastrados = [];
    $scope._mapItensPorTag = {};

    // Registro de posição (modal de "Registrar" por coletor)
    $scope._reg = {};                    // dados da posição em edição
    $scope._regGatewaySel = null;        // coletor selecionado
    $scope._listPosNivel1 = [];
    $scope._listPosNivel2 = [];
    $scope._listPosNivel3 = [];
    $scope._listPosNivel4 = [];

    // Checagem (modal de "Checar" por coletor)
    $scope._chk = {};                    // filtros da checagem (documento / localização)
    $scope._chkGateway = null;           // coletor da checagem
    $scope._listChkNivel1 = [];
    $scope._listChkNivel2 = [];
    $scope._listChkNivel3 = [];
    $scope._listChkNivel4 = [];

    // Cores aplicadas a cada coletor/gateway (ciclo)
    $scope._coresColetor = ['success', 'primary', 'purple', 'warning', 'danger', 'info'];

    $scope.corDoColetor = function (index) {
        return $scope._coresColetor[index % $scope._coresColetor.length];
    };

    // Cor da barra/card: danger enquanto alerta de excedente estiver ativo
    $scope.corBarraColetor = function (gateway, index) {
        if (gateway && gateway._alertaExcedente) return 'danger';
        return $scope.corDoColetor(index);
    };


    function checagemPosicaoCompleta(gateway) {
        if (!gateway || !gateway.checagem || !gateway.checagem.ativa) return false;
        if (gateway.checagem.origem !== 'posicao') return false;
        const esperados = (gateway.tags || []).filter((t) => t.esperado);
        if (!esperados.length) return false;
        // Retorno: sucesso quando todos têm status_destino concluido
        if (gateway.checagem.modo_retorno) {
            return esperados.every((t) => t.status_destino === 'concluido');
        }
        return esperados.every((t) => t.status === 'encontrado');
    }

    function tokemPortalInverso(tokem) {
        const t = String(tokem || '').trim();
        if (/-S$/i.test(t)) return t.replace(/-S$/i, '-E');
        if (/-E$/i.test(t)) return t.replace(/-E$/i, '-S');
        return null;
    }

    function encontrarGatewayPorTokem(tokem) {
        if (!tokem) return null;
        const listas = [$scope._listGateways || [], $scope._listGatewaysTodos || []];
        for (let i = 0; i < listas.length; i++) {
            const g = listas[i].find((x) => String(x.tokem || '') === String(tokem));
            if (g) return g;
        }
        return null;
    }

    function idNivelValor(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'object' && v._id) return String(v._id);
        return String(v);
    }

    function niveisGatewayComoDestino(gateway) {
        return {
            id_nivel_loc1_destino: idNivelValor(gateway && gateway.id_nivel_loc1),
            id_nivel_loc2_destino: idNivelValor(gateway && gateway.id_nivel_loc2),
            id_nivel_loc3_destino: idNivelValor(gateway && gateway.id_nivel_loc3),
            id_nivel_loc4_destino: idNivelValor(gateway && gateway.id_nivel_loc4)
        };
    }

    /** Carrega a ordem RET no portal inverso para conferência de devolução (status_destino). */
    async function carregarChecagemRetornoNoPortal(gatewayDestino, posicao) {
        if (!gatewayDestino || !posicao) return false;

        const agora = new Date();
        const esperados = await Promise.all((posicao.itens || []).map(async (pit) => {
            const linha = await montarEsperadoPorTag(pit.tag, pit);
            // Todos os itens da RET são esperados no retorno
            linha.esperado = true;
            linha.status_destino = 'pendente';
            linha.status_destino_data = null;
            // Mantém status da 1ª leitura (concluido→encontrado / excedente)
            if (pit.status === 'concluido') linha.status = 'encontrado';
            else if (pit.status === 'excedente') linha.status = 'excedente';
            else linha.status = statusDaPosicaoParaUI(pit.status);
            return linha;
        }));

        if (!esperados.length) return false;

        const dest = niveisGatewayComoDestino(gatewayDestino);

        gatewayDestino.checagem = {
            ativa: true,
            origem: 'posicao',
            modo_retorno: true,
            id_posicao: posicao._id,
            id_doc: posicao.id_doc,
            tipo: posicao.tipo || 'conferencia',
            id_nivel_loc1: posicao.id_nivel_loc1 || '',
            id_nivel_loc2: posicao.id_nivel_loc2 || '',
            id_nivel_loc3: posicao.id_nivel_loc3 || '',
            id_nivel_loc4: posicao.id_nivel_loc4 || '',
            id_nivel_loc1_destino: dest.id_nivel_loc1_destino || '',
            id_nivel_loc2_destino: dest.id_nivel_loc2_destino || '',
            id_nivel_loc3_destino: dest.id_nivel_loc3_destino || '',
            id_nivel_loc4_destino: dest.id_nivel_loc4_destino || ''
        };
        gatewayDestino.tags = esperados;
        gatewayDestino._sucessoChecagemTocado = false;
        cancelarSucessoChecagemPendente(gatewayDestino);
        gatewayDestino._ultima_leitura = '';
        return true;
    }

    const DELAY_SUCESSO_CHECAGEM_MS = 7000;

    function temExcedenteNaOrdem(gateway) {
        if (!gateway || !gateway.tags) return false;
        return gateway.tags.some((t) => t.status === 'excedente' || t.status === 'alerta');
    }

    /** Excedente que impede sinal de sucesso (retorno: não bloqueia — excedente já alerta à parte). */
    function temExcedenteBloqueandoSucesso(gateway) {
        if (!gateway || !gateway.tags) return false;
        if (gateway.checagem && gateway.checagem.modo_retorno) return false;
        return temExcedenteNaOrdem(gateway);
    }

    function cancelarSucessoChecagemPendente(gateway) {
        if (!gateway) return;
        if (gateway._sucessoChecagemTimer) {
            $timeout.cancel(gateway._sucessoChecagemTimer);
            gateway._sucessoChecagemTimer = null;
        }
    }

    function verificarSucessoChecagem(gateway) {
        if (!gateway || !gateway.checagem || !gateway.checagem.ativa) {
            cancelarSucessoChecagemPendente(gateway);
            return;
        }
        if (!checagemPosicaoCompleta(gateway)) {
            cancelarSucessoChecagemPendente(gateway);
            return;
        }
        if (gateway._sucessoChecagemTocado) return;
        if (temExcedenteBloqueandoSucesso(gateway)) {
            cancelarSucessoChecagemPendente(gateway);
            return;
        }

        cancelarSucessoChecagemPendente(gateway);

        gateway._sucessoChecagemTimer = $timeout(function () {
            gateway._sucessoChecagemTimer = null;
            if (gateway._sucessoChecagemTocado) return;
            if (!checagemPosicaoCompleta(gateway)) return;
            if (temExcedenteBloqueandoSucesso(gateway)) return;

            gateway._sucessoChecagemTocado = true;
            tocarSucessoChecagem();
            tocarSinaleiro(gateway && gateway.tokem, 1, 6000);
        }, DELAY_SUCESSO_CHECAGEM_MS);
    }

    function sinalizarExcedenteVisual(gateway) {
        if (!gateway) return;
        if (gateway._alertaExcedenteTimer) {
            $timeout.cancel(gateway._alertaExcedenteTimer);
            gateway._alertaExcedenteTimer = null;
        }
        gateway._alertaExcedente = true;
        gateway._alertaExcedenteTimer = $timeout(function () {
            gateway._alertaExcedente = false;
            gateway._alertaExcedenteTimer = null;
        }, 30000);
    }

    function gatewayAlertaItensForaOrdem(gateway) {
        const valor = String(gateway && gateway.portal_alertas || '').trim().toLowerCase();
        return valor === 'itens_fora_ordem' || valor === '1itens_fora_ordem';
    }

    /** portal_acao = checagem_multipla: atende tag a tag sem carregar a ordem inteira */
    function gatewayChecagemMultipla(gateway) {
        return String(gateway && gateway.portal_acao || '').trim().toLowerCase() === 'checagem_multipla';
    }
    $scope.ehChecagemMultipla = gatewayChecagemMultipla;

    var MULTI_TAG_EXPIRA_MS = 35000;
    var MULTI_ATENDER_MAX_CONCORRENTE = 3;
    var MULTI_ATENDER_BACKOFF_MS = 4000;

    var _multiAtenderFila = [];
    var _multiAtenderAtivos = 0;

    function enfileirarAtenderTag(fn) {
        return new Promise(function (resolve, reject) {
            _multiAtenderFila.push({ fn: fn, resolve: resolve, reject: reject });
            drenarFilaAtenderTag();
        });
    }

    function drenarFilaAtenderTag() {
        while (_multiAtenderAtivos < MULTI_ATENDER_MAX_CONCORRENTE && _multiAtenderFila.length) {
            (function (job) {
                _multiAtenderAtivos++;
                Promise.resolve()
                    .then(function () { return job.fn(); })
                    .then(job.resolve, job.reject)
                    .finally(function () {
                        _multiAtenderAtivos--;
                        drenarFilaAtenderTag();
                    });
            })(_multiAtenderFila.shift());
        }
    }

    function cancelarTimerRemocaoTag(linha) {
        if (linha && linha._timerRemocao) {
            $timeout.cancel(linha._timerRemocao);
            linha._timerRemocao = null;
        }
    }

    /** Remove a linha da listagem 35s após a última leitura (timer individual, reinicia a cada leitura). */
    function agendarRemocaoTagMultipla(gateway, linha) {
        if (!gateway || !linha) return;
        cancelarTimerRemocaoTag(linha);
        linha._expiraEm = Date.now() + MULTI_TAG_EXPIRA_MS;
        linha._timerRemocao = $timeout(function () {
            linha._timerRemocao = null;
            if (!gateway.tags) return;
            const idx = gateway.tags.indexOf(linha);
            if (idx >= 0) gateway.tags.splice(idx, 1);
        }, MULTI_TAG_EXPIRA_MS);
    }

    function limparTimersTagsMultipla(gateway) {
        if (!gateway || !gateway.tags) return;
        gateway.tags.forEach(cancelarTimerRemocaoTag);
    }

    function aplicarOrdemNaLinha(linha, posicao) {
        linha.id_doc = (posicao && posicao.id_doc) || '';
        linha.id_posicao = (posicao && posicao.id_posicao) || null;
        linha.ordem_descricao = (posicao && posicao.descricao) || '';
        linha.ordem_status = (posicao && posicao.status) || '';
    }

    async function enriquecerLinhaComItemCadastro(linha, tag) {
        const item = await $scope.buscarItemPorTagAsync(tag);
        if (!item) return linha;
        linha.cadastrada = true;
        linha.item = item;
        linha.id_item = item._id;
        linha.id_categoria = (item.id_categoria && item.id_categoria._id)
            || (typeof item.id_categoria === 'string' ? item.id_categoria : null);
        linha.item_descricao = (item.id_categoria && item.id_categoria.descricao) || item.descricao || '';
        linha.categoria_descricao = (item.id_categoria_reg1 && item.id_categoria_reg1.descricao) || '';
        linha.labels = $scope.montarLabelsDoItem(item);
        linha.descricao = linha.item_descricao;
        return linha;
    }

    function deveChamarAtenderTag(gateway, linha, chaveLeitura) {
        if (!linha) return false;
        if (linha.status === 'encontrado') return false;
        // not_found já resolvido: não martela o servidor a cada leitura
        if (linha._apiResultado === 'not_found') return false;
        if (gateway._atendendoTag && gateway._atendendoTag[chaveLeitura]) return false;
        if (linha._proximaTentativa && Date.now() < linha._proximaTentativa) return false;
        return true;
    }

    async function executarAtenderTagMultipla(gateway, linha, chaveLeitura, leitura) {
        const payload = {
            tag: leitura.tag,
            id_conta: ($scope._regConta && $scope._regConta._id) || '',
            id_gateway: gateway._id || '',
            rssi: leitura.rssi
        };
        ['id_nivel_loc1', 'id_nivel_loc2', 'id_nivel_loc3', 'id_nivel_loc4'].forEach(function (campo) {
            if (gateway[campo]) payload[campo] = gateway[campo];
        });

        const resHttp = await $http.post(
            uteisService.apiUrl_() + '/posicao/atender-tag',
            payload,
            { headers: { 'Content-Type': 'application/json' } }
        ).catch(function () { return null; });

        const res = resHttp && resHttp.data ? resHttp.data : null;
        if (!res || res.ok === false) {
            // Falha de rede/API: backoff; próximas leituras podem re-tentar
            linha._proximaTentativa = Date.now() + MULTI_ATENDER_BACKOFF_MS;
            if (linha.status !== 'encontrado') {
                linha.status = 'excedente';
                linha.em_alerta = false;
            }
            return;
        }

        linha._proximaTentativa = null;

        if (res.resultado === 'atendido') {
            linha._apiResultado = 'atendido';
            linha.status = 'encontrado';
            linha.em_alerta = false;
            linha.esperado = true;
            aplicarOrdemNaLinha(linha, res.posicao);
            if (res.posicao && res.posicao.status === 'concluido') {
                uteisService.onToast(
                    'Ordem ' + (linha.id_doc || '') + ' concluída.',
                    'success',
                    2500,
                    'top-end'
                );
            }
        } else if (res.resultado === 'reaberto') {
            // Próxima leitura pode atender de novo (item voltou a pendente)
            linha._apiResultado = null;
            linha.status = 'pendente';
            linha.em_alerta = false;
            linha.esperado = true;
            aplicarOrdemNaLinha(linha, res.posicao);
        } else {
            // not_found → excedente visual; NÃO re-tenta enquanto a linha existir
            linha._apiResultado = 'not_found';
            linha.status = 'excedente';
            linha.em_alerta = false;
            linha.esperado = false;
            linha.id_doc = '';
            linha.id_posicao = null;
            linha.ordem_descricao = '';
            linha.ordem_status = '';
        }
    }

    /**
     * Modo checagem_multipla: cada tag é resolvida individualmente na posição.
     * Não inicia checagem nem carrega a ordem completa.
     * Volume alto: not_found não re-tenta; erros com backoff; fila max 3 POSTs.
     */
    async function processarLeituraChecagemMultipla(gateway, leitura, hora) {
        if (!gateway || !leitura || !leitura.tag) return;

        const chaveLeitura = $scope.normalizaTag(leitura.tag);
        let linha = (gateway.tags || []).find((t) => $scope.normalizaTag(t.tag) === chaveLeitura);

        // Já na lista: só contagem + RSSI + timer (API só se ainda precisar)
        if (linha) {
            linha.ultima_leitura = hora;
            linha.contagem = (linha.contagem || 0) + 1;
            linha.rssi = leitura.rssi;
            linha._raw = leitura;
            agendarRemocaoTagMultipla(gateway, linha);
        } else {
            linha = {
                tag: leitura.tag,
                descricao: '',
                primeira_leitura: hora,
                ultima_leitura: hora,
                contagem: 1,
                rssi: leitura.rssi,
                _raw: leitura,
                cadastrada: false,
                item: null,
                item_descricao: '',
                categoria_descricao: '',
                labels: [],
                status: 'excedente',
                em_alerta: false,
                esperado: false,
                status_destino: '',
                status_destino_data: null,
                id_doc: '',
                id_posicao: null,
                ordem_descricao: '',
                ordem_status: '',
                _apiResultado: null,
                _proximaTentativa: null
            };
            gateway.tags.unshift(linha);
            agendarRemocaoTagMultipla(gateway, linha);
            // Enrich em background — não bloqueia a fila de leituras
            enriquecerLinhaComItemCadastro(linha, leitura.tag).catch(function () { });
        }

        if (!deveChamarAtenderTag(gateway, linha, chaveLeitura)) {
            return;
        }

        if (!gateway._atendendoTag) gateway._atendendoTag = {};
        gateway._atendendoTag[chaveLeitura] = true;

        // Não await: socket segue processando outras tags; a fila limita carga no servidor
        enfileirarAtenderTag(function () {
            return executarAtenderTagMultipla(gateway, linha, chaveLeitura, leitura);
        })
            .catch(function () { })
            .finally(function () {
                if (gateway._atendendoTag) delete gateway._atendendoTag[chaveLeitura];
                $timeout(function () { }, 0);
            });
    }

    /** Portal itens_fora_ordem sem checagem: tags em alerta → fluxo só de retorno */
    function ehRetornoForaOrdemSemChecagem(gateway) {
        const g = gateway || $scope._regGatewaySel;
        if (!g || !gatewayAlertaItensForaOrdem(g)) return false;
        if (g.checagem && g.checagem.ativa) return false;
        return $scope.contaStatus(g, 'alerta') > 0;
    }

    function gerarIdDocForaOrdem(gateway) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
            + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
        const tokem = String((gateway && gateway.tokem) || 'PORTAL').replace(/[^A-Za-z0-9]/g, '');
        return 'FORA-' + tokem + '-' + stamp;
    }

    function sinalizarItemForaOrdem(gateway, tagLinha) {
        if (!gateway || !tagLinha) return;
        tagLinha.status = 'alerta';
        tagLinha.em_alerta = true;
        tocarAlertaExcedente(gateway);
        sinalizarExcedenteVisual(gateway);
    }

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png';
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };

        $scope._regColaborador = uteisService.getCookie('_colaborador');


        $scope.onCarregaGateways();
        $scope.onCarregaAuxiliares();
    });

    // Carrega categorias (modal assoc). Itens: busca individual por tag (sem lista completa).
    $scope.onCarregaAuxiliares = async function () {

        await uteisService.getBase('/_bd?c=categoria&id_conta=' + $scope._regConta._id + '&_sort=descricao')
            .then((res) => {
                $scope._listItens = res || [];
                $scope.$apply();
            })
            .catch(() => { });

        await uteisService.getBase('/_bd?c=categoria_item&id_conta=' + $scope._regConta._id + '&_sort=descricao')
            .then((res) => {
                $scope._listCategoriasItem = res || [];
                $scope.$apply();
            })
            .catch(() => { });

        $scope._listItensCadastrados = [];
        $scope._mapItensPorTag = $scope._mapItensPorTag || {};
        $scope._mapItensPorId = $scope._mapItensPorId || {};
        $scope._buscandoTag = $scope._buscandoTag || {};
    };

    // Normaliza tag para comparação (remove separadores, uppercase)
    $scope.normalizaTag = function (valor) {
        if (valor == null) return '';
        return valor.toString().replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    };

    function indexarItemNoCache(item) {
        if (!item) return;
        $scope._mapItensPorId = $scope._mapItensPorId || {};
        $scope._mapItensPorTag = $scope._mapItensPorTag || {};
        if (item._id) $scope._mapItensPorId[item._id] = item;
        [item.tag, item.tag_secundaria].forEach((t) => {
            const chave = $scope.normalizaTag(t);
            if (chave) $scope._mapItensPorTag[chave] = item;
        });
    }

    // Cache síncrono (só o que já foi buscado individualmente)
    $scope.buscarItemPorTag = function (tag) {
        const chave = $scope.normalizaTag(tag);
        if (!chave) return null;
        const hit = $scope._mapItensPorTag[chave];
        return hit || null;
    };

    /** Busca item por tag no banco (1 request). Cacheia resultado. */
    $scope.buscarItemPorTagAsync = async function (tag) {
        const chave = $scope.normalizaTag(tag);
        if (!chave) return null;

        if ($scope._mapItensPorTag && Object.prototype.hasOwnProperty.call($scope._mapItensPorTag, chave)) {
            return $scope._mapItensPorTag[chave] || null;
        }
        if ($scope._buscandoTag && $scope._buscandoTag[chave]) {
            return $scope._buscandoTag[chave];
        }

        const idConta = ($scope._regConta && $scope._regConta._id) || '';
        const base = '/_bd?c=item&id_conta=' + encodeURIComponent(idConta)
            + '&pop=id_categoria&pop=id_categoria_reg1&limit=5';

        const promessa = (async () => {
            try {
                let res = await uteisService.getBase(base + '&tag=' + encodeURIComponent(chave)).catch(() => []);
                if ((!res || !res.length) && tag && String(tag) !== chave) {
                    res = await uteisService.getBase(base + '&tag=' + encodeURIComponent(String(tag).trim())).catch(() => []);
                }
                if (!res || !res.length) {
                    res = await uteisService.getBase(base + '&tag_secundaria=' + encodeURIComponent(chave)).catch(() => []);
                }
                const item = (Array.isArray(res) && res[0]) ? res[0] : null;
                if (item) {
                    indexarItemNoCache(item);
                } else {
                    $scope._mapItensPorTag[chave] = null;
                }
                return item;
            } finally {
                if ($scope._buscandoTag) delete $scope._buscandoTag[chave];
            }
        })();

        $scope._buscandoTag = $scope._buscandoTag || {};
        $scope._buscandoTag[chave] = promessa;
        return promessa;
    };

    // Monta as informações complementares de um item cadastrado
    // (label vem da categoria; valor vem do inf_compl do item)
    $scope.montarLabelsDoItem = function (item) {
        const labels = [];
        const categoria = item && item.id_categoria;
        if (categoria && typeof categoria === 'object') {
            for (let i = 1; i <= 5; i++) {
                const nome = categoria['labelInf' + i];
                if (nome && String(nome).trim() !== '') {
                    labels.push({
                        index: i,
                        label: nome,
                        valor: item['inf_compl' + i] || ''
                    });
                }
            }
        }
        return labels;
    };

    // ------------------------------------------------------------
    // Posto / este computador: quais gateways operar (localStorage)
    // ------------------------------------------------------------
    var modalPosto = undefined;

    function chavePostoGateways() {
        return 'portal_gateways_' + (($scope._regConta && $scope._regConta._id) || '');
    }

    $scope.carregarIdsPosto = function () {
        try {
            const raw = localStorage.getItem(chavePostoGateways());
            if (!raw) return null; // null = nunca configurou
            const ids = JSON.parse(raw);
            return Array.isArray(ids) ? ids.map(String) : null;
        } catch (e) {
            return null;
        }
    };

    $scope.salvarIdsPosto = function (ids) {
        localStorage.setItem(chavePostoGateways(), JSON.stringify((ids || []).map(String)));
    };

    function aplicarFiltroPosto(todos) {
        const lista = todos || [];
        $scope._listGatewaysTodos = lista;
        const ids = $scope.carregarIdsPosto();

        if (ids === null) {
            // Primeira vez neste PC: não mostra nenhum até configurar
            $scope._postoSemConfig = true;
            $scope._postoIdsSel = [];
            $scope._listGateways = [];
            return;
        }

        $scope._postoSemConfig = false;
        $scope._postoIdsSel = ids.slice();
        if (!ids.length) {
            $scope._listGateways = [];
            return;
        }
        $scope._listGateways = lista.filter((g) => ids.indexOf(String(g._id)) >= 0);
    }

    $scope.onAbrirConfigPosto = function () {
        const salvos = $scope.carregarIdsPosto();
        $scope._postoIdsSel = (salvos || []).slice();

        // Marca seleção nos itens para o modal
        ($scope._listGatewaysTodos || []).forEach((g) => {
            g._postoSel = $scope._postoIdsSel.indexOf(String(g._id)) >= 0;
        });

        modalPosto = new bootstrap.Modal(document.getElementById('modalConfigPosto'));
        modalPosto.show();
    };

    $scope.onTogglePostoTodos = function (marcar) {
        ($scope._listGatewaysTodos || []).forEach((g) => {
            g._postoSel = !!marcar;
        });
    };

    $scope.onSalvarConfigPosto = function () {
        const ids = ($scope._listGatewaysTodos || [])
            .filter((g) => g._postoSel)
            .map((g) => String(g._id));

        $scope.salvarIdsPosto(ids);
        aplicarFiltroPosto($scope._listGatewaysTodos);

        if (modalPosto) {
            modalPosto.hide();
            modalPosto = undefined;
        }

        uteisService.onToast(
            ids.length
                ? ('Posto salvo: ' + ids.length + ' coletor(es) neste computador.')
                : 'Posto salvo sem coletores. Configure novamente para receber leituras.',
            ids.length ? 'success' : 'warning',
            3000,
            'top-end'
        );
        $scope.$applyAsync();
    };

    $scope.onCarregaGateways = async function () {

        let _url = '/_bd?c=gateway&id_conta=' + $scope._regConta._id;
        _url += '&_sort=descricao';

        await uteisService.getBase(_url)
            .then((res) => {

                (res || []).map((item) => {
                    item['_foto'] = '../assets/images/icon_cadastro.fw.png';
                    if (item.foto && !item.foto.includes('assets')) {
                        item._foto = uteisService.apiUrl_() + '/image/' + item.foto;
                    };
                    item.tags = [];
                });

                aplicarFiltroPosto(res || []);
                $scope.onLogs();
                $scope.$apply();

                // Sem config neste PC → abre seleção
                if ($scope._postoSemConfig && ($scope._listGatewaysTodos || []).length) {
                    $timeout(function () {
                        $scope.onAbrirConfigPosto();
                    }, 300);
                }
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.onLogs = async function () {

        // Desconecta socket anterior se existir
        if ($scope.socket) {
            if ($scope._regConta && $scope._regConta._id) {
                $scope.socket.emit('portal_leave', { id_conta: $scope._regConta._id });
            }
            $scope.socket.disconnect();
            $scope.socket = null;
        };

        // Cria nova conexão socket
        $scope.socket = io(); // conexão padrão

        // Presence: avisa o servidor que o portal desta conta está aberto
        function entrarPresencePortal() {
            if (!$scope.socket || !$scope._regConta || !$scope._regConta._id) return;
            $scope.socket.emit('portal_join', { id_conta: $scope._regConta._id });
        }
        $scope.socket.on('connect', entrarPresencePortal);
        if ($scope.socket.connected) {
            entrarPresencePortal();
        }

        $scope.socket.on($scope._regConta._id, async function (data) {
            try {
                // Aceita objeto único ou array de leituras
                let leituras = data;
                if (typeof leituras === 'string') {
                    leituras = JSON.parse(leituras);
                };
                if (!Array.isArray(leituras)) {
                    leituras = [leituras];
                };

                for (const leitura of leituras) {
                    await $scope.onDistribuiLeitura(leitura);
                }

                $scope.$apply();

            } catch (error) {
                console.error('Erro ao processar leitura:', error, data);
            }
        });

        // Log dedicado Naturgy → portal (não interfere na distribuição de tags)
        $scope.socket.on('x_naturgy_portal_log', function (data) {
            try {
                $scope.onRecebePortalLog(data);
                $scope.$applyAsync();
            } catch (e) {
                console.error('Erro no log do portal:', e, data);
            }
        });

    };

    $scope.$on('$destroy', function () {
        if ($scope.socket) {
            if ($scope._regConta && $scope._regConta._id) {
                $scope.socket.emit('portal_leave', { id_conta: $scope._regConta._id });
            }
            $scope.socket.disconnect();
            $scope.socket = null;
        }
    });

    /** Log só dos devices/tokems dos coletores ativos nesta página (posto). */
    $scope.logPertenceAoPosto = function (log) {
        if (!log) return false;
        const gateways = $scope._listGateways || [];
        if (!gateways.length) return false;

        const device = String(log.device || '').trim().toUpperCase();
        const tokem = String(log.tokem || '').trim().toUpperCase();

        return gateways.some((g) => {
            const gTokem = String(g.tokem || '').trim().toUpperCase();
            if (tokem && gTokem && tokem === gTokem) return true;
            const base = gTokem.replace(/-[ES]$/, '');
            return !!(device && base && device === base);
        });
    };

    $scope.onRecebePortalLog = function (data) {
        if (!$scope.logPertenceAoPosto(data)) return;

        const status = String(data.status_sensor || '').toLowerCase();
        let statusLabel = data.status_sensor || '—';
        if (status === 'pre_sensor') statusLabel = 'Pré-sensor';
        else if (status === 'aguardando') statusLabel = 'Tag · Aguardando';
        else if (status === 'entrada') statusLabel = 'Tag · Entrada';
        else if (status === 'saida') statusLabel = 'Tag · Saída';
        else if (status === 'sensor_1') statusLabel = 'Sensor · 1ª porta';
        else if (status === 'sensor_entrada') statusLabel = 'Sensor · Entrada';
        else if (status === 'sensor_saida') statusLabel = 'Sensor · Saída';
        else if (status === 'sensor_descartado') statusLabel = 'Sensor · Descartado';
        else if (status === 'sensor_expirado') statusLabel = 'Sensor · Expirado';
        else if (status === 'sensor_ignorado') statusLabel = 'Sensor · Ignorado';

        $scope._portalLog.unshift({
            data_hora: data.data_hora || '',
            tag: data.tag || '',
            rssi: data.rssi != null ? data.rssi : '',
            status_sensor: statusLabel,
            status_raw: status,
            device: data.device || '',
            tokem: data.tokem || '',
            antena: data.antena || ''
        });

        if ($scope._portalLog.length > $scope._portalLogMax) {
            $scope._portalLog.length = $scope._portalLogMax;
        }
    };

    $scope.onAbrirPortalLog = function () {
        modalPortalLog = new bootstrap.Modal(document.getElementById('modalPortalLog'));
        modalPortalLog.show();
    };

    $scope.onLimparPortalLog = function () {
        $scope._portalLog = [];
    };

    // Sem checagem ativa: tenta carregar ordem de posição pela tag (item pendente)
    async function autoIniciarChecagemPorTag(gateway, leitura) {
        if (!gateway || !leitura || !leitura.tag) return false;
        if (gateway.checagem && gateway.checagem.ativa) return false;
        if (gateway._carregandoChecagem) return false;

        gateway._carregandoChecagem = true;
        try {
            let url = '/posicao/por-tag-pendente?tag=' + encodeURIComponent(leitura.tag);
            if ($scope._regConta && $scope._regConta._id) {
                url += '&id_conta=' + encodeURIComponent($scope._regConta._id);
            }
            ['id_nivel_loc1', 'id_nivel_loc2', 'id_nivel_loc3', 'id_nivel_loc4'].forEach((campo) => {
                if (gateway[campo]) url += '&' + campo + '=' + encodeURIComponent(gateway[campo]);
            });

            console.log('url: ' + url);
            const res = await uteisService.getBase(url).catch(() => null);
            const posicao = res && res.ok && res.posicao ? res.posicao : null;
            if (!posicao) return false;

            const hora = (leitura.data_leitura || '').split(' ')[1] || leitura.data_leitura || '';
            const chaveLeitura = $scope.normalizaTag(leitura.tag);

            const esperados = await Promise.all((posicao.itens || []).map(async (pit) => {
                const linha = await montarEsperadoPorTag(pit.tag, pit);
                // Tag que acabou de ser lida: confirma como encontrado com dados da leitura
                if ($scope.normalizaTag(pit.tag) === chaveLeitura) {
                    linha.status = 'encontrado';
                    linha.esperado = true;
                    linha.contagem = Math.max(linha.contagem || 0, 1);
                    linha.primeira_leitura = hora;
                    linha.ultima_leitura = hora;
                    linha.rssi = leitura.rssi;
                    linha._raw = leitura;
                }
                return linha;
            }));

            if (!esperados.length) return false;


            gateway.checagem = {
                ativa: true,
                origem: 'posicao',
                id_posicao: posicao._id,
                id_doc: posicao.id_doc,
                tipo: posicao.tipo,
                id_nivel_loc1: posicao.id_nivel_loc1 || '',
                id_nivel_loc2: posicao.id_nivel_loc2 || '',
                id_nivel_loc3: posicao.id_nivel_loc3 || '',
                id_nivel_loc4: posicao.id_nivel_loc4 || ''
            };
            gateway.tags = esperados;
            gateway._sucessoChecagemTocado = false;
            cancelarSucessoChecagemPendente(gateway);
            gateway._ultima_leitura = hora;

            verificarSucessoChecagem(gateway);
            uteisService.onToast('Checagem iniciada pela tag: ' + esperados.length + ' item(ns).', 'info', 2500, 'top-end');
            return true;
        } finally {
            gateway._carregandoChecagem = false;
        }
    }

    // Casa a leitura ao coletor/gateway pelo tokem e alimenta o campo tags
    $scope.onDistribuiLeitura = async function (leitura) {

        if (!leitura || !leitura.tokem) return;

        const gateway = $scope._listGateways.find((g) => g.tokem == leitura.tokem);
        if (!gateway) return; // tokem não pertence a nenhum coletor cadastrado

        if (!gateway.tags) gateway.tags = [];

        // "2026-07-03 09:52:43" -> "09:52:43"
        const hora = (leitura.data_leitura || '').split(' ')[1] || leitura.data_leitura || '';

        // Modo portal_acao=checagem_multipla: atende tag a tag (sem carregar ordem)
        if (gatewayChecagemMultipla(gateway)) {
            await processarLeituraChecagemMultipla(gateway, leitura, hora);
            gateway._ultima_leitura = hora;
            return;
        }

        let emChecagem = !!(gateway.checagem && gateway.checagem.ativa);
        const alertaForaOrdem = gatewayAlertaItensForaOrdem(gateway);

        // Portal "itens_fora_ordem": não auto-carrega ordem; alerta leituras sem checagem manual
        if (!emChecagem && !alertaForaOrdem) {
            const iniciou = await autoIniciarChecagemPorTag(gateway, leitura);
            if (iniciou) return;
            emChecagem = !!(gateway.checagem && gateway.checagem.ativa);
        }

        // compara por tag normalizada (a esperada pode estar em outro formato)
        const chaveLeitura = $scope.normalizaTag(leitura.tag);
        const existente = gateway.tags.find((t) => $scope.normalizaTag(t.tag) == chaveLeitura);

        if (existente) {
            const eraPendente = existente.status === 'pendente';
            const eraDestinoPendente = !existente.status_destino || existente.status_destino === 'pendente';
            existente.ultima_leitura = hora;
            if (!existente.primeira_leitura) existente.primeira_leitura = hora;
            existente.contagem = (existente.contagem || 0) + 1;
            existente.rssi = leitura.rssi;
            existente._raw = leitura;

            // Checagem de retorno: mantém status da 1ª leitura; grava status_destino
            if (emChecagem && gateway.checagem.modo_retorno) {
                if (existente.esperado) {
                    existente.status_destino = 'concluido';
                    existente.status_destino_data = new Date();
                    existente.em_alerta = false;
                    if (eraDestinoPendente) {
                        verificarSucessoChecagem(gateway);
                    }
                } else {
                    existente.status = 'excedente';
                    existente.em_alerta = false;
                    cancelarSucessoChecagemPendente(gateway);
                    tocarAlertaExcedente(gateway);
                    sinalizarExcedenteVisual(gateway);
                }
            } else if (existente.esperado) {
                // Esperado → encontrado; fora da ordem em checagem → mantém excedente
                existente.status = 'encontrado';
                existente.em_alerta = false;
            } else if (emChecagem) {
                existente.status = 'excedente';
                existente.em_alerta = false;
                cancelarSucessoChecagemPendente(gateway);
            } else if (gatewayAlertaItensForaOrdem(gateway)) {
                sinalizarItemForaOrdem(gateway, existente);
            } else {
                existente.status = 'encontrado';
                existente.em_alerta = false;
            }

            // Checagem de posição: todos os esperados encontrados → beep de sucesso
            if (emChecagem && !gateway.checagem.modo_retorno
                && eraPendente && existente.esperado && gateway.checagem.origem === 'posicao') {
                verificarSucessoChecagem(gateway);
            }
        } else {
            const nova = {
                tag: leitura.tag,
                descricao: '',
                primeira_leitura: hora,
                ultima_leitura: hora,
                contagem: 1,
                rssi: leitura.rssi,
                _raw: leitura,
                cadastrada: false,
                item: null,
                item_descricao: '',
                categoria_descricao: '',
                labels: [],
                // fora de checagem: lida = encontrado ou alerta (portal_alertas); em checagem: excedente
                status: emChecagem ? 'excedente' : (gatewayAlertaItensForaOrdem(gateway) ? 'alerta' : 'encontrado'),
                em_alerta: !emChecagem && gatewayAlertaItensForaOrdem(gateway),
                esperado: false,
                status_destino: '',
                status_destino_data: null
            };

            // Identifica se a tag pertence a um item cadastrado (busca individual)
            const item = await $scope.buscarItemPorTagAsync(leitura.tag);
            if (item) {
                nova.cadastrada = true;
                nova.item = item;
                nova.id_item = item._id;
                nova.id_categoria = (item.id_categoria && item.id_categoria._id) || (typeof item.id_categoria === 'string' ? item.id_categoria : null);
                nova.item_descricao = (item.id_categoria && item.id_categoria.descricao) || item.descricao || '';
                nova.categoria_descricao = (item.id_categoria_reg1 && item.id_categoria_reg1.descricao) || '';
                nova.labels = $scope.montarLabelsDoItem(item);
                nova.descricao = nova.item_descricao;
            }

            gateway.tags.unshift(nova);

            // Checagem de posição: alerta sonoro + barra vermelha (30s) ao registrar excedente
            if (emChecagem && nova.status === 'excedente' && gateway.checagem.origem === 'posicao') {
                cancelarSucessoChecagemPendente(gateway);
                tocarAlertaExcedente(gateway);
                sinalizarExcedenteVisual(gateway);
            } else if (!emChecagem && nova.status === 'alerta') {
                tocarAlertaExcedente(gateway);
                sinalizarExcedenteVisual(gateway);
            }
        };

        gateway._ultima_leitura = hora;
    };

    // Total de tags únicas lidas em todos os coletores (resumo)
    $scope.totalTagsLidas = function () {
        return ($scope._listGateways || []).reduce((total, g) => {
            return total + ((g.tags && g.tags.length) || 0);
        }, 0);
    };

    // ------------------------------------------------------------
    // Modal de associação da tag (item / categoria + inf. complementares)
    // ------------------------------------------------------------
    var modalAssoc = undefined;

    // Normaliza texto para busca (ignora acentos e maiúsculas/minúsculas)
    function normalizarBusca(valor) {
        if (valor == null) return '';
        return String(valor)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    $scope.itemAssocValido = function () {
        if (!$scope._assoc || !$scope._assoc.id_item || !$scope._assoc.itemBusca) return false;
        const selecionado = ($scope._listItens || []).find((i) => i._id == $scope._assoc.id_item);
        if (!selecionado) return false;
        return normalizarBusca(selecionado.descricao) === normalizarBusca($scope._assoc.itemBusca);
    };

    $scope.itemAssocInvalido = function () {
        if (!$scope._assoc || !$scope._assoc.itemBusca) return false;
        return !$scope.itemAssocValido();
    };

    $scope.syncAssocItemBusca = function () {
        if (!$scope._assoc) return;
        if (!$scope._assoc.id_item) {
            $scope._assoc.itemBusca = $scope._assoc.itemBusca || '';
            return;
        }
        const item = ($scope._listItens || []).find((i) => i._id == $scope._assoc.id_item);
        $scope._assoc.itemBusca = item ? item.descricao : '';
    };

    $scope.getItensAssocFiltrados = function () {
        const lista = $scope._listItens || [];
        const termo = normalizarBusca($scope._assoc && $scope._assoc.itemBusca);
        if (!termo) return lista;
        return lista.filter((i) => normalizarBusca(i.descricao).includes(termo));
    };

    $scope.onBuscaItemAssocChange = function () {
        const selecionado = ($scope._listItens || []).find((i) => i._id == $scope._assoc.id_item);
        if (selecionado && normalizarBusca(selecionado.descricao) === normalizarBusca($scope._assoc.itemBusca)) {
            $scope._assoc._itemDropdownAberto = true;
            return;
        }
        // Só desvincula o item; não reconstrói labels (evita repor valores que o usuário apagou)
        $scope._assoc.id_item = '';
        $scope._assoc._itemDropdownAberto = true;
    };

    $scope.onSelecionarItemAssoc = function (item) {
        $scope._assoc.id_item = item._id;
        $scope._assoc.itemBusca = item.descricao;
        $scope._assoc._itemDropdownAberto = false;
        $scope.onSelecionaItem();
    };

    $scope.onLimparItemAssoc = function () {
        $scope._assoc.id_item = '';
        $scope._assoc.itemBusca = '';
        $scope._assoc._itemDropdownAberto = false;
        $scope.onSelecionaItem();
    };

    $scope.onFecharListaItensAssoc = function () {
        $timeout(function () {
            if ($scope._assoc) $scope._assoc._itemDropdownAberto = false;
        }, 150);
    };

    $scope.onAbrirAssociar = function (tag, gateway) {
        $scope._assoc = {
            tag: tag,               // referência à leitura selecionada
            gateway: gateway || null,
            id_item: '',            // categoria escolhida (traz os labels)
            id_categoria: '',       // categoria_item escolhida
            labels: [],             // informações complementares editáveis
            itemBusca: '',
            _itemDropdownAberto: false
        };

        // 1) Se a tag já foi associada manualmente, reutiliza o que foi salvo
        if (tag && tag._assoc) {
            $scope._assoc.id_item = tag._assoc.id_item || '';
            $scope._assoc.id_categoria = tag._assoc.id_categoria || '';
            if (Array.isArray(tag._assoc.labels)) {
                $scope._assoc.labels = angular.copy(tag._assoc.labels);
            } else {
                $scope.onSelecionaItem();
            }

            // 2) Caso contrário, se for um item já cadastrado, pré-preenche com os dados dele
        } else if (tag && tag.cadastrada && tag.item) {
            const item = tag.item;
            $scope._assoc.id_item = (item.id_categoria && item.id_categoria._id) || '';
            $scope._assoc.id_categoria = (item.id_categoria_reg1 && item.id_categoria_reg1._id) || '';
            $scope._assoc.labels = angular.copy(tag.labels && tag.labels.length ? tag.labels : $scope.montarLabelsDoItem(item));
        }

        $scope.syncAssocItemBusca();

        modalAssoc = new bootstrap.Modal(document.getElementById('modalAssociarTag'));
        modalAssoc.show();
    };


    // Monta os campos de informações complementares a partir dos labels do item escolhido
    $scope.onSelecionaItem = function () {
        const item = ($scope._listItens || []).find((i) => i._id == $scope._assoc.id_item);
        const anteriores = ($scope._assoc.labels || []).reduce((map, lbl) => {
            if (lbl.index != null) {
                map[lbl.index] = lbl.valor != null ? lbl.valor : '';
            }
            return map;
        }, {});

        if (!item) {
            $scope._assoc.labels = [];
            return;
        }

        const labels = [];
        for (let i = 1; i <= 5; i++) {
            const nome = item['labelInf' + i];
            if (nome && String(nome).trim() !== '') {
                labels.push({
                    index: i,
                    label: nome,
                    valor: Object.prototype.hasOwnProperty.call(anteriores, i) ? anteriores[i] : ''
                });
            }
        }
        $scope._assoc.labels = labels;
    };

    /** Em checagem com posição: incorpora tag associada como encontrado e persiste na ordem. */
    function incorporarTagAssociadaNaOrdem(gateway, tag) {
        const chk = gateway && gateway.checagem;
        if (!chk || !chk.ativa || !tag) return Promise.resolve(false);

        tag.esperado = true;
        tag.status = 'encontrado';
        tag.em_alerta = false;
        tag.id_item = (tag.item && tag.item._id) || tag.id_item || null;
        if (tag.item && tag.item.id_categoria) {
            const cat = tag.item.id_categoria;
            tag.id_categoria = (cat && cat._id) || (typeof cat === 'string' ? cat : tag.id_categoria) || null;
        }
        if (chk.modo_retorno) {
            tag.status_destino = 'concluido';
            tag.status_destino_data = new Date();
        }

        cancelarSucessoChecagemPendente(gateway);
        gateway._sucessoChecagemTocado = false;

        if (!chk.id_posicao || chk.origem !== 'posicao') {
            verificarSucessoChecagem(gateway);
            return Promise.resolve(true);
        }

        const itens = (gateway.tags || []).map((t) => montarItemPosicao(t, gateway));
        let statusPos = 'pendente';
        if (chk.modo_retorno) {
            const destinos = itens.filter((it) => it.status !== 'excedente' || it.status_destino);
            const todosDestino = destinos.length > 0 && destinos.every((it) => it.status_destino === 'concluido');
            const algumDestino = destinos.some((it) => it.status_destino === 'concluido');
            if (todosDestino) statusPos = 'concluido';
            else if (algumDestino) statusPos = 'parcial';
        } else {
            const itensChecagem = itens.filter((it) => it.status !== 'excedente');
            const todosConcluidos = itensChecagem.length > 0 && itensChecagem.every((it) => it.status === 'concluido');
            const algumConcluido = itensChecagem.some((it) => it.status === 'concluido');
            if (todosConcluidos) statusPos = 'concluido';
            else if (algumConcluido) statusPos = 'parcial';
        }

        const payloadPos = {
            _id: chk.id_posicao,
            id_conta: $scope._regConta._id,
            id_colaborador: ($scope._regColaborador && $scope._regColaborador._id) || null,
            ativo: '1',
            tipo: chk.tipo || 'conferencia',
            id_doc: chk.id_doc,
            descricao: chk.id_doc,
            status: statusPos,
            status_data: new Date(),
            id_nivel_loc1: chk.id_nivel_loc1 || null,
            id_nivel_loc2: chk.id_nivel_loc2 || null,
            id_nivel_loc3: chk.id_nivel_loc3 || null,
            id_nivel_loc4: chk.id_nivel_loc4 || null,
            itens: itens
        };

        if (chk.modo_retorno) {
            payloadPos.id_nivel_loc1_destino = chk.id_nivel_loc1_destino || idNivelValor(gateway.id_nivel_loc1);
            payloadPos.id_nivel_loc2_destino = chk.id_nivel_loc2_destino || idNivelValor(gateway.id_nivel_loc2);
            payloadPos.id_nivel_loc3_destino = chk.id_nivel_loc3_destino || idNivelValor(gateway.id_nivel_loc3);
            payloadPos.id_nivel_loc4_destino = chk.id_nivel_loc4_destino || idNivelValor(gateway.id_nivel_loc4);
        }

        return uteisService.patchBase('/posicao', payloadPos)
            .then(() => {
                verificarSucessoChecagem(gateway);
                return true;
            });
    }

    $scope.onSalvarAssociacao = function () {
        const tag = $scope._assoc.tag;
        if (!tag) return;

        if (!$scope.itemAssocValido()) {
            uteisService.onToast('Selecione um item válido na lista.', 'warning', 3000, 'top-end');
            return;
        }

        const item = ($scope._listItens || []).find((i) => i._id == $scope._assoc.id_item);
        const categoria = ($scope._listCategoriasItem || []).find((c) => c._id == $scope._assoc.id_categoria);

        // Reaproveita o item cadastrado (atualização) ou cria um novo
        let payload;
        if (tag.item && tag.item._id) {
            payload = JSON.parse(JSON.stringify(tag.item));
        } else {
            payload = {
                _id: uteisService.onGetID(),
                id_conta: $scope._regConta._id,
                id_externo: '',
                status: 'ativo',
                foto: '',
                tag_secundaria: '',
                id_nivel_loc1: '', id_nivel_loc2: '', id_nivel_loc3: '', id_nivel_loc4: '',
                observacao: '',
                registro_atual: {}, registro_anterior: {},
                vinculos_device: [],
                mov_livre: 0, mov_tracking: 0
            };
        }

        // Garante que salvamos apenas os _id nas referências (podem vir populados)
        payload.tag = tag.tag;
        payload.id_categoria = $scope._assoc.id_item;
        payload.id_categoria_reg1 = $scope._assoc.id_categoria || null;
        payload.descricao = item ? item.descricao : (payload.descricao || '');

        // Reaplica as informações complementares em inf_compl1..5
        for (let i = 1; i <= 5; i++) payload['inf_compl' + i] = '';
        ($scope._assoc.labels || []).forEach((lbl) => {
            if (lbl.index) payload['inf_compl' + lbl.index] = lbl.valor || '';
        });

        // Remove campos auxiliares de front que não pertencem ao schema
        delete payload._foto;

        uteisService.patchBase('/item', payload)
            .then(() => {

                // Reflete na lista como item cadastrado (mesmo formato de um item já conhecido)
                const itemPopulado = angular.copy(payload);
                itemPopulado.id_categoria = item || $scope._assoc.id_item;
                itemPopulado.id_categoria_reg1 = categoria || null;

                tag.cadastrada = true;
                tag.item = itemPopulado;
                tag.item_descricao = item ? item.descricao : (payload.descricao || '');
                tag.categoria_descricao = categoria ? categoria.descricao : '';
                tag.labels = angular.copy($scope._assoc.labels);
                tag.descricao = tag.item_descricao;
                tag._assoc = null;

                // Indexa a tag para identificar próximas leituras automaticamente
                indexarItemNoCache(itemPopulado);

                const gateway = $scope._assoc.gateway
                    || ($scope._listGateways || []).find((g) => (g.tags || []).indexOf(tag) >= 0);

                return incorporarTagAssociadaNaOrdem(gateway, tag)
                    .then((incorporou) => {
                        if (modalAssoc) {
                            modalAssoc.hide();
                            modalAssoc = undefined;
                        }
                        const msg = incorporou
                            ? 'Item associado e incorporado à ordem como encontrado.'
                            : 'Item cadastrado e associado com sucesso!';
                        uteisService.onToast(msg, 'success', 2500, 'top-end');
                        $scope.$apply();
                    });
            })
            .catch(() => {
                uteisService.onToast('Erro ao salvar o item, tente novamente.', 'error', 3000, 'top-end');
            });
    };

    // ------------------------------------------------------------
    // Modal de registro de posição (por coletor)
    // ------------------------------------------------------------
    var modalPos = undefined;

    // Carrega uma lista de localização por nível (cascata)
    $scope.onCarregaNivelPos = function (nivel) {
        let idPai = 'null';
        if (nivel == 2) idPai = $scope._reg.id_nivel_loc1;
        else if (nivel == 3) idPai = $scope._reg.id_nivel_loc2;
        else if (nivel == 4) idPai = $scope._reg.id_nivel_loc3;

        if (nivel > 1 && (!idPai || idPai === '')) {
            if (nivel == 2) $scope._listPosNivel2 = [];
            if (nivel <= 3) $scope._listPosNivel3 = [];
            $scope._listPosNivel4 = [];
            return Promise.resolve();
        }

        let _url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id + '&id_nivel=' + idPai + '&sort=descricao';

        return uteisService.getBase(_url)
            .then((res) => {
                if (nivel == 1) $scope._listPosNivel1 = res || [];
                else if (nivel == 2) $scope._listPosNivel2 = res || [];
                else if (nivel == 3) $scope._listPosNivel3 = res || [];
                else if (nivel == 4) $scope._listPosNivel4 = res || [];
                $scope.$apply();
            })
            .catch(() => { });
    };

    // Ao trocar um nível, limpa os dependentes e recarrega o próximo
    $scope.onMudaNivelPos = function (nivel) {
        if (nivel == 1) {
            $scope._reg.id_nivel_loc2 = '';
            $scope._reg.id_nivel_loc3 = '';
            $scope._reg.id_nivel_loc4 = '';
            $scope._listPosNivel3 = [];
            $scope._listPosNivel4 = [];
            $scope.onCarregaNivelPos(2);
        } else if (nivel == 2) {
            $scope._reg.id_nivel_loc3 = '';
            $scope._reg.id_nivel_loc4 = '';
            $scope._listPosNivel4 = [];
            $scope.onCarregaNivelPos(3);
        } else if (nivel == 3) {
            $scope._reg.id_nivel_loc4 = '';
            $scope.onCarregaNivelPos(4);
        }
    };

    $scope.onAbrirRegistrar = async function (gateway) {
        $scope._regGatewaySel = gateway;
        $scope._reg = {
            id_doc: '',
            id_nivel_loc1: '',
            id_nivel_loc2: '',
            id_nivel_loc3: '',
            id_nivel_loc4: '',
            _modo: 'novo',        // 'novo' | 'atualizar' | 'inventario'
            _bloqueado: false,     // trava campos quando vem de posição existente
            _salvando: false
        };

        const chk = gateway && gateway.checagem;

        // Há itens pendentes na checagem → alerta sonoro
        if (chk && chk.ativa && $scope.contaStatus(gateway, 'pendente') > 0) {
            tocarAlertaExcedente(gateway);
        }

        // Normaliza id de localização (ObjectId / objeto / string) para o select
        function idNivel(v) {
            if (v == null || v === '') return '';
            if (typeof v === 'object' && v._id) return String(v._id);
            return String(v);
        }

        // Níveis do coletor (mesmo critério do modo normal / fixo)
        function niveisDoGateway() {
            return {
                id_nivel_loc1: idNivel(gateway && gateway.id_nivel_loc1),
                id_nivel_loc2: idNivel(gateway && gateway.id_nivel_loc2),
                id_nivel_loc3: idNivel(gateway && gateway.id_nivel_loc3),
                id_nivel_loc4: idNivel(gateway && gateway.id_nivel_loc4)
            };
        }

        await $scope.onCarregaNivelPos(1);

        if (chk && chk.ativa && chk.origem === 'posicao') {
            // Atualização de posição (checagem por documento)
            $scope._reg._modo = 'atualizar';
            $scope._reg._bloqueado = true;
            $scope._reg.id_doc = chk.id_doc || '';
            // Posição pode não ter localização (ex.: pickdetails) → usa níveis do gateway
            const gw = niveisDoGateway();
            $scope._reg.id_nivel_loc1 = idNivel(chk.id_nivel_loc1) || gw.id_nivel_loc1;
            $scope._reg.id_nivel_loc2 = idNivel(chk.id_nivel_loc2) || gw.id_nivel_loc2;
            $scope._reg.id_nivel_loc3 = idNivel(chk.id_nivel_loc3) || gw.id_nivel_loc3;
            $scope._reg.id_nivel_loc4 = idNivel(chk.id_nivel_loc4) || gw.id_nivel_loc4;

        } else if (chk && chk.ativa && chk.origem === 'localizacao') {
            // Inventário: localização da checagem; se faltar, gateway
            $scope._reg._modo = 'inventario';
            const gw = niveisDoGateway();
            $scope._reg.id_nivel_loc1 = idNivel(chk.id_nivel_loc1) || gw.id_nivel_loc1;
            $scope._reg.id_nivel_loc2 = idNivel(chk.id_nivel_loc2) || gw.id_nivel_loc2;
            $scope._reg.id_nivel_loc3 = idNivel(chk.id_nivel_loc3) || gw.id_nivel_loc3;
            $scope._reg.id_nivel_loc4 = idNivel(chk.id_nivel_loc4) || gw.id_nivel_loc4;

        } else if (ehRetornoForaOrdemSemChecagem(gateway)) {
            // Itens fora de ordem sem checagem: só devolução (Registrar bloqueado)
            $scope._reg._modo = 'retorno_fora_ordem';
            $scope._reg.id_doc = gerarIdDocForaOrdem(gateway);
            const gw = niveisDoGateway();
            $scope._reg.id_nivel_loc1 = gw.id_nivel_loc1;
            $scope._reg.id_nivel_loc2 = gw.id_nivel_loc2;
            $scope._reg.id_nivel_loc3 = gw.id_nivel_loc3;
            $scope._reg.id_nivel_loc4 = gw.id_nivel_loc4;
            tocarAlertaExcedente(gateway);

        } else if (gateway && gateway.modo == 'fixo') {
            // Coletor fixo sem checagem: pré-preenche a localização do cadastro
            const gw = niveisDoGateway();
            $scope._reg.id_nivel_loc1 = gw.id_nivel_loc1;
            $scope._reg.id_nivel_loc2 = gw.id_nivel_loc2;
            $scope._reg.id_nivel_loc3 = gw.id_nivel_loc3;
            $scope._reg.id_nivel_loc4 = gw.id_nivel_loc4;
        }

        if ($scope._reg.id_nivel_loc1) await $scope.onCarregaNivelPos(2);
        if ($scope._reg.id_nivel_loc2) await $scope.onCarregaNivelPos(3);
        if ($scope._reg.id_nivel_loc3) await $scope.onCarregaNivelPos(4);

        modalPos = new bootstrap.Modal(document.getElementById('modalRegistrarPosicao'));
        modalPos.show();
        $scope.$apply();
    };

    // Tags que serão gravadas na posição:
    // - em checagem: todas as linhas (esperadas + excedentes)
    // - fora de checagem: apenas as cadastradas
    $scope.tagsParaRegistro = function (gateway) {
        const alvo = gateway || $scope._regGatewaySel;
        if (!alvo || !alvo.tags) return [];
        if (alvo.checagem && alvo.checagem.ativa) return alvo.tags;
        return alvo.tags.filter((t) => t.cadastrada);
    };

    $scope.qtdTagsRegistraveis = function (gateway) {
        return $scope.tagsParaRegistro(gateway).length;
    };

    // Converte o status da UI para o enum da coleção posicao
    function statusParaPosicao(s) {
        if (s === 'encontrado') return 'concluido';
        if (s === 'excedente') return 'excedente';
        if (s === 'alerta') return 'excedente';
        if (s === 'pendente') return 'pendente';
        return 'pendente';
    };

    // Converte o status salvo na posição para o status da UI de checagem
    function statusDaPosicaoParaUI(s) {
        if (s === 'concluido') return 'encontrado';
        if (s === 'excedente') return 'excedente';
        if (s === 'pendente') return 'pendente';
        if (s === 'nao_encontrado') return 'pendente';
        return 'pendente';
    };

    function montarItemPosicao(t, gateway) {
        // Resolve o cadastro do item (já identificado na leitura ou busca pela tag)
        const cadastro = t.item
            || $scope.buscarItemPorTag(t.tag)
            || ($scope._listItensCadastrados || []).find((i) => i._id == t.id_item)
            || null;

        const cat = cadastro && cadastro.id_categoria;
        const idItem = t.id_item || (cadastro && cadastro._id) || null;
        const idCategoria = t.id_categoria
            || (cat && cat._id)
            || (typeof cat === 'string' ? cat : null)
            || null;

        // EAN vem da categoria (produto) do item cadastrado
        const ean = (cat && typeof cat === 'object' && cat.ean) || '';

        const item = {
            _id: uteisService.onGetID(),
            id_item: idItem,
            id_categoria: idCategoria,
            tag: t.tag,
            ean: ean,
            rssi: t.rssi != null ? String(t.rssi) : '',
            quantidade: t.contagem || 1,
            status: statusParaPosicao(t.status),
            status_data: new Date(),
            status_destino: t.status_destino || '',
            status_destino_data: t.status_destino_data || (t.status_destino === 'concluido' ? new Date() : ''),
            id_gatweway: gateway._id,
            id_colaborador: ($scope._regColaborador && $scope._regColaborador._id) || null,
            // Informações complementares do cadastro do item
            inf_compl_1: (cadastro && cadastro.inf_compl1) || '',
            inf_compl_2: (cadastro && cadastro.inf_compl2) || '',
            inf_compl_3: (cadastro && cadastro.inf_compl3) || '',
            inf_compl_4: (cadastro && cadastro.inf_compl4) || '',
            inf_compl_5: (cadastro && cadastro.inf_compl5) || ''
        };

        // Labels da UI (associação / edição) sobrescrevem o cadastro quando houver valor
        (t.labels || []).forEach((lbl) => {
            if (lbl.index) item['inf_compl_' + lbl.index] = lbl.valor || '';
        });

        return item;
    }

    $scope.onRegistrarPosicao = function () {
        const gateway = $scope._regGatewaySel;
        if (!gateway) return;
        if ($scope._reg && $scope._reg._salvando) return;

        // itens_fora_ordem sem checagem: não registra — só Retornar Ordem
        if (ehRetornoForaOrdemSemChecagem(gateway)) {
            uteisService.onToast('Use Retornar Ordem para devolver itens fora de ordem.', 'warning', 3500, 'top-end');
            return;
        }

        if (!$scope._reg.id_doc) {
            uteisService.onToast('Informe o idDoc.', 'warning', 3000, 'top-end');
            return;
        }

        const tags = $scope.tagsParaRegistro(gateway);
        if (!tags.length) {
            uteisService.onToast('Nenhuma tag para registrar.', 'warning', 3000, 'top-end');
            return;
        }

        // Ainda há pendentes na checagem → alerta sonoro
        if ($scope.contaStatus(gateway, 'pendente') > 0) {
            tocarAlertaExcedente(gateway);
        }

        const itens = tags.map((t) => montarItemPosicao(t, gateway));

        const chk = gateway.checagem;
        const atualizando = chk && chk.ativa && chk.origem === 'posicao' && chk.id_posicao;

        // tipo: mantém o da posição (id_doc) ou 'inventario' quando veio por localização
        let tipo = 'conferencia';
        if (chk && chk.ativa) {
            if (chk.tipo) tipo = chk.tipo;
            else if (chk.origem === 'localizacao') tipo = 'inventario';
        }

        const payload = {
            _id: atualizando ? chk.id_posicao : uteisService.onGetID(),
            id_conta: $scope._regConta._id,
            id_colaborador: $scope._regColaborador._id || null,
            ativo: '1',
            tipo: tipo,
            id_doc: $scope._reg.id_doc,
            descricao: $scope._reg.id_doc,
            status: 'pendente',
            status_data: new Date(),
            id_nivel_loc1: $scope._reg.id_nivel_loc1 || null,
            id_nivel_loc2: $scope._reg.id_nivel_loc2 || null,
            id_nivel_loc3: $scope._reg.id_nivel_loc3 || null,
            id_nivel_loc4: $scope._reg.id_nivel_loc4 || null,
            itens: itens
        };

        // Retorno: destino = níveis do portal onde a devolução foi lida
        if (chk && chk.modo_retorno) {
            payload.id_nivel_loc1_destino = chk.id_nivel_loc1_destino || idNivelValor(gateway.id_nivel_loc1);
            payload.id_nivel_loc2_destino = chk.id_nivel_loc2_destino || idNivelValor(gateway.id_nivel_loc2);
            payload.id_nivel_loc3_destino = chk.id_nivel_loc3_destino || idNivelValor(gateway.id_nivel_loc3);
            payload.id_nivel_loc4_destino = chk.id_nivel_loc4_destino || idNivelValor(gateway.id_nivel_loc4);
        }

        if (!atualizando) {
            payload.partida_data = new Date();
            payload.tolerancia = 30;
        }

        // Status da posição conforme a checagem (itens já mapeados: encontrado→concluido, etc.)
        if (chk && chk.modo_retorno) {
            const destinos = itens.filter((it) => it.status !== 'excedente' || it.status_destino);
            const todosDestino = destinos.length > 0 && destinos.every((it) => it.status_destino === 'concluido');
            const algumDestino = destinos.some((it) => it.status_destino === 'concluido');
            if (todosDestino) payload.status = 'concluido';
            else if (algumDestino) payload.status = 'parcial';
            else payload.status = 'pendente';
        } else {
            const itensChecagem = itens.filter((it) => it.status !== 'excedente');
            const todosConcluidos = itensChecagem.length > 0 && itensChecagem.every((it) => it.status === 'concluido');
            const algumConcluido = itensChecagem.some((it) => it.status === 'concluido');
            if (todosConcluidos) {
                payload.status = 'concluido';
            } else if (algumConcluido) {
                payload.status = 'parcial';
            } else {
                payload.status = 'pendente';
            }
        }

        $scope._reg._salvando = true;

        uteisService.patchBase('/posicao', payload)
            .then(() => {
                if (modalPos) {
                    modalPos.hide();
                    modalPos = undefined;
                }

                // Encerra a checagem e limpa as tags do coletor após registrar
                cancelarSucessoChecagemPendente(gateway);
                gateway.checagem = null;
                gateway.tags = [];

                const msg = atualizando ? 'Posição atualizada com sucesso!' : 'Posição registrada com sucesso!';
                uteisService.onToast(msg, 'success', 2500, 'top-end');
            })
            .catch(() => {
                uteisService.onToast('Erro ao registrar a posição, tente novamente.', 'error', 3000, 'top-end');
            })
            .finally(() => {
                if ($scope._reg) $scope._reg._salvando = false;
                $scope.$apply();
            });
    };

    /** Tags já lidas elegíveis para ordem de devolução (-RET). */
    function tagsLidasParaRetorno(gateway) {
        if (!gateway || !gateway.tags) return [];
        return gateway.tags.filter((t) =>
            t.status === 'encontrado' || t.status === 'excedente' || t.status === 'alerta'
        );
    }

    /** Checagem incompleta: pelo menos 1 esperado lido e ainda há pendente(s). */
    function temRetornoParcial(gateway) {
        if (!gateway || !gateway.checagem || !gateway.checagem.ativa) return false;
        if (gateway.checagem.modo_retorno) return false;
        const lidos = tagsLidasParaRetorno(gateway).length;
        const pendentes = (gateway.tags || []).filter((t) => t.esperado && t.status === 'pendente').length;
        return lidos > 0 && pendentes > 0;
    }

    function motivoRetornoOrdem(gateway, foraOrdemSemChecagem) {
        if (foraOrdemSemChecagem) return 'itens_fora_ordem';
        if (temRetornoParcial(gateway)) return 'parcial';
        return 'excedente';
    }

    // Há itens para gerar ordem de devolução (excedente, parcial ou fora de ordem sem checagem)
    // Não permite retornar se o id_doc já for uma ordem -RET
    $scope.podeRetornarOrdem = function () {
        const g = $scope._regGatewaySel;
        if (!g) return false;
        const idDoc = String(
            ($scope._reg && $scope._reg.id_doc) ||
            (g.checagem && g.checagem.id_doc) ||
            ''
        ).trim();
        if (/-RET/i.test(idDoc)) return false;
        if (ehRetornoForaOrdemSemChecagem(g)) return true;
        if (!g.checagem || !g.checagem.ativa || g.checagem.modo_retorno) return false;
        return $scope.contaStatus(g, 'excedente') > 0
            || $scope.contaStatus(g, 'alerta') > 0
            || temRetornoParcial(g);
    };

    // Cria ordem -RET só com itens lidos; exclui a ordem em checagem (origem)
    $scope.onRetornarOrdem = function () {
        const gateway = $scope._regGatewaySel;
        if (!gateway) return;
        if ($scope._reg && $scope._reg._salvando) return;

        const foraOrdemSemChecagem = ehRetornoForaOrdemSemChecagem(gateway);

        if (!$scope._reg.id_doc) {
            if (foraOrdemSemChecagem) {
                $scope._reg.id_doc = gerarIdDocForaOrdem(gateway);
            } else {
                uteisService.onToast('Informe o idDoc.', 'warning', 3000, 'top-end');
                return;
            }
        }

        const tokemInverso = tokemPortalInverso(gateway.tokem);
        const gatewayInverso = ($scope._listGateways || []).find((g) => String(g.tokem || '') === String(tokemInverso || ''));
        if (!gatewayInverso) {
            const existeNaConta = encontrarGatewayPorTokem(tokemInverso);
            uteisService.onToast(
                existeNaConta
                    ? 'Portal inverso (' + tokemInverso + ') não está ativo neste posto. Inclua-o na configuração.'
                    : 'Portal inverso (' + (tokemInverso || '—') + ') não encontrado.',
                'error',
                4500,
                'top-end'
            );
            return;
        }

        // Sem checagem (itens_fora_ordem): só tags em alerta
        // Com checagem: apenas itens já lidos (encontrado / excedente / alerta)
        const tagsLidas = foraOrdemSemChecagem
            ? (gateway.tags || []).filter((t) => t.status === 'alerta')
            : tagsLidasParaRetorno(gateway);

        if (!tagsLidas.length) {
            uteisService.onToast('Não há itens lidos para devolução.', 'warning', 3000, 'top-end');
            return;
        }

        const chk = gateway.checagem;
        const idDocBase = String($scope._reg.id_doc || '').trim();
        const idDocRetorno = /-RET$/i.test(idDocBase) ? idDocBase : (idDocBase + '-RET');
        const destinos = niveisGatewayComoDestino(gatewayInverso);
        const motivoRetorno = motivoRetornoOrdem(gateway, foraOrdemSemChecagem);

        // Ordem RET: concluido (na ordem) ou excedente (fora/alerta); destino pendente
        const itensRetorno = tagsLidas.map((t) => {
            const item = montarItemPosicao(t, gateway);
            if (t.status === 'encontrado') {
                item.status = 'concluido';
            } else {
                item.status = 'excedente';
            }
            item.status_data = new Date();
            item.status_destino = 'pendente';
            item.status_destino_data = null;
            return item;
        });

        const temExcedenteRetorno = itensRetorno.some((it) => it.status === 'excedente');
        const todosConcluidosRetorno = itensRetorno.length > 0
            && itensRetorno.every((it) => it.status === 'concluido');

        const payloadRetorno = {
            _id: uteisService.onGetID(),
            id_conta: $scope._regConta._id,
            id_colaborador: $scope._regColaborador._id || null,
            ativo: '1',
            tipo: 'conferencia',
            id_doc: idDocRetorno,
            descricao: foraOrdemSemChecagem
                ? ('Fora de ordem · ' + (gateway.tokem || ''))
                : ('Devolução · ' + idDocBase.replace(/-RET$/i, '')),
            status: todosConcluidosRetorno ? 'concluido' : (temExcedenteRetorno ? 'parcial' : 'pendente'),
            status_data: new Date(),
            partida_data: new Date(),
            tolerancia: 30,
            id_nivel_loc1: $scope._reg.id_nivel_loc1 || idNivelValor(gateway.id_nivel_loc1),
            id_nivel_loc2: $scope._reg.id_nivel_loc2 || idNivelValor(gateway.id_nivel_loc2),
            id_nivel_loc3: $scope._reg.id_nivel_loc3 || idNivelValor(gateway.id_nivel_loc3),
            id_nivel_loc4: $scope._reg.id_nivel_loc4 || idNivelValor(gateway.id_nivel_loc4),
            id_nivel_loc1_destino: destinos.id_nivel_loc1_destino,
            id_nivel_loc2_destino: destinos.id_nivel_loc2_destino,
            id_nivel_loc3_destino: destinos.id_nivel_loc3_destino,
            id_nivel_loc4_destino: destinos.id_nivel_loc4_destino,
            itens: itensRetorno,
            retorno_api: JSON.stringify({
                origem_id_doc: foraOrdemSemChecagem ? null : idDocBase.replace(/-RET$/i, ''),
                origem_id_posicao: (chk && chk.id_posicao) || null,
                portal_origem: gateway.tokem,
                portal_retorno: gatewayInverso.tokem,
                motivo: motivoRetorno,
                itens_retorno: tagsLidas.length
            })
        };

        $scope._reg._salvando = true;

        // Com checagem: exclui ordem origem; sem checagem: só cria RET
        let cadeia = Promise.resolve();
        if (!foraOrdemSemChecagem && chk && chk.ativa && chk.id_posicao) {
            const idDocOrigem = idDocBase.replace(/-RET$/i, '');
            payloadRetorno.retorno_api = JSON.stringify({
                origem_id_doc: idDocOrigem,
                origem_id_posicao: chk.id_posicao,
                portal_origem: gateway.tokem,
                portal_retorno: gatewayInverso.tokem,
                motivo: motivoRetorno,
                origem_excluida: true,
                itens_retorno: tagsLidas.length
            });
            cadeia = uteisService.delBase('posicao/_id/' + chk.id_posicao);
        }

        cadeia
            .then(() => uteisService.patchBase('/posicao', payloadRetorno))
            .then(async (posSalva) => {
                if (modalPos) {
                    modalPos.hide();
                    modalPos = undefined;
                }
                gateway.checagem = null;
                gateway.tags = [];
                cancelarSucessoChecagemPendente(gateway);

                const posicaoRet = (posSalva && posSalva._id) ? posSalva : payloadRetorno;
                const carregou = await carregarChecagemRetornoNoPortal(gatewayInverso, posicaoRet);
                if (carregou) {
                    uteisService.onToast(
                        'Devolução ' + idDocRetorno + ' carregada em ' + gatewayInverso.tokem + '.',
                        'success',
                        3500,
                        'top-end'
                    );
                } else {
                    uteisService.onToast('Ordem ' + idDocRetorno + ' criada, mas falhou ao carregar no portal inverso.', 'warning', 4000, 'top-end');
                }
            })
            .catch(() => {
                uteisService.onToast('Erro ao processar devolução, tente novamente.', 'error', 3000, 'top-end');
            })
            .finally(() => {
                if ($scope._reg) $scope._reg._salvando = false;
                $scope.$apply();
            });
    };

    // ------------------------------------------------------------
    // Modal de checagem (por coletor) - documento ou localização
    // ------------------------------------------------------------
    var modalChk = undefined;

    $scope.onCarregaNivelChk = function (nivel) {
        let idPai = 'null';
        if (nivel == 2) idPai = $scope._chk.id_nivel_loc1;
        else if (nivel == 3) idPai = $scope._chk.id_nivel_loc2;
        else if (nivel == 4) idPai = $scope._chk.id_nivel_loc3;

        if (nivel > 1 && (!idPai || idPai === '')) {
            if (nivel == 2) $scope._listChkNivel2 = [];
            if (nivel <= 3) $scope._listChkNivel3 = [];
            $scope._listChkNivel4 = [];
            return Promise.resolve();
        }

        let _url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id + '&id_nivel=' + idPai + '&sort=descricao';

        return uteisService.getBase(_url)
            .then((res) => {
                if (nivel == 1) $scope._listChkNivel1 = res || [];
                else if (nivel == 2) $scope._listChkNivel2 = res || [];
                else if (nivel == 3) $scope._listChkNivel3 = res || [];
                else if (nivel == 4) $scope._listChkNivel4 = res || [];
                $scope.$apply();
            })
            .catch(() => { });
    };

    $scope.onMudaNivelChk = function (nivel) {
        if (nivel == 1) {
            $scope._chk.id_nivel_loc2 = '';
            $scope._chk.id_nivel_loc3 = '';
            $scope._chk.id_nivel_loc4 = '';
            $scope._listChkNivel3 = [];
            $scope._listChkNivel4 = [];
            $scope.onCarregaNivelChk(2);
        } else if (nivel == 2) {
            $scope._chk.id_nivel_loc3 = '';
            $scope._chk.id_nivel_loc4 = '';
            $scope._listChkNivel4 = [];
            $scope.onCarregaNivelChk(3);
        } else if (nivel == 3) {
            $scope._chk.id_nivel_loc4 = '';
            $scope.onCarregaNivelChk(4);
        }
    };

    $scope.onAbrirChecar = async function (gateway) {
        $scope._chkGateway = gateway;
        $scope._chk = {
            origem: 'documento',
            id_doc: '',
            id_nivel_loc1: '',
            id_nivel_loc2: '',
            id_nivel_loc3: '',
            id_nivel_loc4: ''
        };

        await $scope.onCarregaNivelChk(1);

        modalChk = new bootstrap.Modal(document.getElementById('modalChecarPosicao'));
        modalChk.show();
        $scope.$apply();
    };

    // Monta uma linha "esperada" a partir de uma tag (respeita status salvo na posição, se houver)
    async function montarEsperadoPorTag(tag, dados) {
        const item = await $scope.buscarItemPorTagAsync(tag);
        const linha = {
            tag: tag,
            descricao: '',
            primeira_leitura: '',
            ultima_leitura: '',
            contagem: 0,
            rssi: '',
            cadastrada: !!item,
            item: item || null,
            id_item: (dados && dados.id_item) || (item && item._id) || null,
            id_categoria: (dados && dados.id_categoria) || (item && item.id_categoria && item.id_categoria._id) || null,
            item_descricao: '',
            categoria_descricao: '',
            labels: [],
            status: 'pendente',
            esperado: true
        };

        if (item) {
            linha.item_descricao = (item.id_categoria && item.id_categoria.descricao) || item.descricao || '';
            linha.categoria_descricao = (item.id_categoria_reg1 && item.id_categoria_reg1.descricao) || '';
            linha.labels = $scope.montarLabelsDoItem(item);
            linha.descricao = linha.item_descricao;
        }

        // Se veio de uma posição, sobrescreve os valores complementares e o status salvos
        if (dados) {
            for (let i = 1; i <= 5; i++) {
                const val = dados['inf_compl_' + i];
                if (val != null && val !== '') {
                    const lbl = linha.labels.find((l) => l.index == i);
                    if (lbl) lbl.valor = val;
                }
            }

            if (dados.status) {
                linha.status = statusDaPosicaoParaUI(dados.status);
                if (linha.status === 'excedente') {
                    linha.esperado = false;
                }
                if (linha.status === 'encontrado' || linha.status === 'excedente') {
                    linha.contagem = dados.quantidade || 1;
                    if (dados.rssi != null && dados.rssi !== '') {
                        linha.rssi = dados.rssi;
                    }
                }
            }

            linha.status_destino = dados.status_destino || 'pendente';
            linha.status_destino_data = dados.status_destino_data || null;
        }

        if (linha.status_destino == null) {
            linha.status_destino = '';
        }

        return linha;
    }

    $scope.onIniciarChecagem = async function () {
        const gateway = $scope._chkGateway;
        if (!gateway) return;

        let sentidoGateway = gateway.tokem.split('-')[1];


        let esperados = [];
        let checagem = { ativa: true };

        if ($scope._chk.origem === 'documento') {
            if (!$scope._chk.id_doc) {
                uteisService.onToast('Informe o idDoc.', 'warning', 3000, 'top-end');
                return;
            }

            // 1) Busca a ordem em posicao
            let _url = '/_bd?c=posicao&id_conta=' + $scope._regConta._id + '&id_doc=' + encodeURIComponent($scope._chk.id_doc) + '&_sort=createdAt';
            const res = await uteisService.getBase(_url).catch(() => []);
            let posicao = (res && res.length) ? res[0] : null;

            // 2) Não achou: tenta integração (se a conta tiver id_api)
            if (!posicao) {
                const idApi = String(($scope._regConta && $scope._regConta.id_api) || '').trim();
                if (!idApi) {
                    uteisService.onToast('Documento não encontrado.', 'warning', 3000, 'top-end');
                    return;
                }

                let urlIntegracao = '/' + encodeURIComponent(idApi);
                if (sentidoGateway === 'S') {
                    urlIntegracao += '/pickdetails/' + encodeURIComponent($scope._chk.id_doc);
                } else {
                    urlIntegracao += '/receiptdetails/' + encodeURIComponent($scope._chk.id_doc);
                }
                urlIntegracao += '?id_conta=' + encodeURIComponent($scope._regConta._id);

                try {
                    const integ = await uteisService.getBase(urlIntegracao);

                    if (!integ || integ.ok === false) {
                        uteisService.onToast(
                            (integ && (integ.error || integ.mensagem)) || 'Documento não encontrado na integração.',
                            'error',
                            4000,
                            'top-end'
                        );
                        return;
                    }

                    posicao = integ.posicao || null;
                    if (!posicao) {
                        uteisService.onToast('Documento não encontrado na integração.', 'warning', 3000, 'top-end');
                        return;
                    }
                } catch (e) {
                    uteisService.onToast('Erro ao consultar a integração do cliente.', 'error', 4000, 'top-end');
                    return;
                }
            }

            esperados = await Promise.all((posicao.itens || []).map((pit) => montarEsperadoPorTag(pit.tag, pit)));

            checagem.origem = 'posicao';
            checagem.id_posicao = posicao._id;
            checagem.id_doc = posicao.id_doc;
            checagem.tipo = posicao.tipo;
            checagem.id_nivel_loc1 = posicao.id_nivel_loc1 || '';
            checagem.id_nivel_loc2 = posicao.id_nivel_loc2 || '';
            checagem.id_nivel_loc3 = posicao.id_nivel_loc3 || '';
            checagem.id_nivel_loc4 = posicao.id_nivel_loc4 || '';

        } else {
            if (!$scope._chk.id_nivel_loc1) {
                uteisService.onToast('Selecione ao menos o Nível 1.', 'warning', 3000, 'top-end');
                return;
            }

            let _url = '/_bd?c=item&id_conta=' + $scope._regConta._id;
            _url += '&pop=id_categoria&pop=id_categoria_reg1';
            if ($scope._chk.id_nivel_loc1) _url += '&id_nivel_loc1=' + $scope._chk.id_nivel_loc1;
            if ($scope._chk.id_nivel_loc2) _url += '&id_nivel_loc2=' + $scope._chk.id_nivel_loc2;
            if ($scope._chk.id_nivel_loc3) _url += '&id_nivel_loc3=' + $scope._chk.id_nivel_loc3;
            if ($scope._chk.id_nivel_loc4) _url += '&id_nivel_loc4=' + $scope._chk.id_nivel_loc4;

            const res = await uteisService.getBase(_url).catch(() => []);

            esperados = await Promise.all((res || []).map(async (it) => {
                indexarItemNoCache(it);
                const linha = await montarEsperadoPorTag(it.tag);
                linha.id_item = it._id;
                linha.id_categoria = (it.id_categoria && it.id_categoria._id) || null;
                if (!linha.item) {
                    linha.item = it;
                    linha.cadastrada = true;
                    linha.item_descricao = (it.id_categoria && it.id_categoria.descricao) || it.descricao || '';
                    linha.categoria_descricao = (it.id_categoria_reg1 && it.id_categoria_reg1.descricao) || '';
                    linha.labels = $scope.montarLabelsDoItem(it);
                    linha.descricao = linha.item_descricao;
                }
                return linha;
            }));

            checagem.origem = 'localizacao';
            checagem.id_posicao = null;
            checagem.id_doc = '';
            checagem.tipo = 'inventario';
            checagem.id_nivel_loc1 = $scope._chk.id_nivel_loc1 || '';
            checagem.id_nivel_loc2 = $scope._chk.id_nivel_loc2 || '';
            checagem.id_nivel_loc3 = $scope._chk.id_nivel_loc3 || '';
            checagem.id_nivel_loc4 = $scope._chk.id_nivel_loc4 || '';
        }

        if (!esperados.length) {
            uteisService.onToast('Nenhum item para checar foi encontrado.', 'warning', 3000, 'top-end');
            return;
        }

        // Ativa a checagem no coletor e lista os itens esperados
        gateway.checagem = checagem;
        gateway.tags = esperados;
        gateway._sucessoChecagemTocado = false;
        cancelarSucessoChecagemPendente(gateway);

        if (modalChk) {
            modalChk.hide();
            modalChk = undefined;
        }

        uteisService.onToast('Checagem iniciada: ' + esperados.length + ' item(ns).', 'info', 2500, 'top-end');
        $scope.$apply();
    };

    $scope.podeCancelarChecagem = function (gateway) {
        if (!gateway || !gateway.checagem || !gateway.checagem.ativa) return false;
        if ($scope.contaStatus(gateway, 'encontrado') > 0) return false;
        if ($scope.contaStatus(gateway, 'excedente') > 0) return false;
        if ($scope.contaStatus(gateway, 'alerta') > 0) return false;
        if (gateway.checagem.modo_retorno && $scope.contaStatusDestino(gateway, 'concluido') > 0) return false;
        return true;
    };

    $scope.onCancelarChecagem = function (gateway) {
        const alvo = gateway || $scope._chkGateway;
        if (!alvo || !alvo.checagem || !alvo.checagem.ativa) return;
        if (!$scope.podeCancelarChecagem(alvo)) return;

        const chk = alvo.checagem;
        cancelarSucessoChecagemPendente(alvo);

        function limparChecagemLocal() {
            alvo.checagem = null;
            alvo.tags = [];
            $scope.$apply();
        }

        if (chk.origem === 'posicao' && chk.id_posicao) {
            uteisService.delBase('posicao/_id/' + chk.id_posicao)
                .then(() => {
                    limparChecagemLocal();
                    uteisService.onToast('Checagem cancelada e ordem excluída.', 'success', 2500, 'top-end');
                })
                .catch(() => {
                    uteisService.onToast('Erro ao excluir a ordem, tente novamente.', 'error', 3000, 'top-end');
                });
            return;
        }

        limparChecagemLocal();
        uteisService.onToast('Checagem cancelada.', 'success', 2000, 'top-end');
    };

    // Reset completo do coletor: tags, ordem/checagem e alertas visuais
    $scope.onResetarColetor = function (gateway) {
        if (!gateway) return;

        if (gateway._alertaExcedenteTimer) {
            $timeout.cancel(gateway._alertaExcedenteTimer);
            gateway._alertaExcedenteTimer = null;
        }

        limparTimersTagsMultipla(gateway);
        gateway.tags = [];
        gateway.checagem = null;
        gateway._ultima_leitura = '';
        gateway._alertaExcedente = false;
        gateway._sucessoChecagemTocado = false;
        cancelarSucessoChecagemPendente(gateway);

        uteisService.onToast('Coletor resetado: tags e checagem limpos.', 'success', 2000, 'top-end');
    };

    // Contadores por status (para exibir no card em checagem)
    $scope.contaStatus = function (gateway, status) {
        if (!gateway || !gateway.tags) return 0;
        return gateway.tags.filter((t) => t.status === status).length;
    };

    $scope.contaStatusDestino = function (gateway, status) {
        if (!gateway || !gateway.tags) return 0;
        return gateway.tags.filter((t) => t.esperado && (t.status_destino || 'pendente') === status).length;
    };

    // Modal registrar: em checagem, pendentes ou excedentes → barra vermelha / botão bloqueado
    $scope.temAlertaRegistro = function () {
        const g = $scope._regGatewaySel;
        if (!g) return false;

        // itens_fora_ordem sem ordem: bloquear Registrar (só Retornar)
        if (ehRetornoForaOrdemSemChecagem(g)) return true;

        if (g.portal_registro_ordem === 'com_divergencia') return false;

        if (!g.checagem || !g.checagem.ativa) return false;

        if (g.checagem.modo_retorno) {
            const extraNaoEsperado = (g.tags || []).some((t) => !t.esperado && t.status === 'excedente');
            return $scope.contaStatusDestino(g, 'pendente') > 0 || extraNaoEsperado;
        }

        return $scope.contaStatus(g, 'pendente') > 0 || $scope.contaStatus(g, 'excedente') > 0;
    };

    var _audiosPortal = {
        warning: new Audio('/assets/audio/beep-warning.mp3'),
        success: new Audio('/assets/audio/beep_success.mp3')
    };

    var _audioPortalLiberado = false;

    function liberarAudioPortal() {
        if (_audioPortalLiberado) return;

        var audios = Object.values(_audiosPortal);
        var promessas = [];

        audios.forEach(function (audio) {
            audio.preload = 'auto';
            audio.volume = 0.01;
            audio.muted = false;

            var promessa = audio.play().then(function () {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 1;
            });

            promessas.push(promessa);
        });

        Promise.all(promessas)
            .then(function () {
                _audioPortalLiberado = true;
                console.log('Áudios liberados');
            })
            .catch(function (erro) {
                console.error('Erro ao liberar áudios:', erro);
            });
    }

    function tocarSomPortal(tipo) {
        if (!_audioPortalLiberado) {
            console.warn('Áudio ainda não liberado');
            return;
        }

        var audio = _audiosPortal[tipo];

        if (!audio) {
            console.warn('Áudio não encontrado:', tipo);
            return;
        }

        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        audio.muted = false;

        audio.play()
            .then(function () {
                console.log('Áudio reproduzido:', tipo);
            })
            .catch(function (erro) {
                console.error('Erro ao reproduzir:', tipo, erro);
            });
    }

    function tocarAlertaExcedente(gateway) {
        tocarSomPortal('warning');
        if (gateway && gateway.tokem) {
            tocarSinaleiro(gateway.tokem, 4, 10000);
        }
    }

    function tocarSucessoChecagem() {
        tocarSomPortal('success');
    }

    function tocarSinaleiro(deviceName, cor, tempo) {
        if (!deviceName) return;
        // GPO usa o nome base do leitor (P02), não o tokem com sentido (P02-E / P02-S)
        const name = String(deviceName).trim().replace(/-[EeSs]$/, '');
        if (!name) return;
        const payload = {
            deviceName: name,
            cor: cor,
            tempo: tempo || 3000
        };
        $http.post(uteisService.apiUrl_() + '/x_naturgy/sinaleiro', payload)
            .then(function (res) {
                console.log('[sinaleiro]', res.data);
            })
            .catch(function (err) {
                console.warn('[sinaleiro]', err);
            });
    }

    document.addEventListener('click', liberarAudioPortal, { once: true });
    document.addEventListener('touchstart', liberarAudioPortal, { once: true });

});


/*
 1. Ok - Cadastro de SKU
 2. Ok - Registro de Posição
 3. !! Criar Botão para Checar Ordens Cadastradas, com base na localização do Coletor Fixo
    3.1 Aplicar regras da Localizaçao (Finaliza Ordem, ou solicita Destino)
4. !! Criar botão de Inventariar 

 */