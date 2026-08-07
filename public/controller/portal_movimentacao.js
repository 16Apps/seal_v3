
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
        return esperados.every((t) => t.status === 'encontrado');
    }

    function verificarSucessoChecagem(gateway) {
        if (!checagemPosicaoCompleta(gateway)) return;
        if (gateway._sucessoChecagemTocado) return;
        gateway._sucessoChecagemTocado = true;
        tocarSucessoChecagem();
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

    // Carrega itens (categoria) e categorias (categoria_item) para o modal
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

        // Itens cadastrados (com categoria e categoria_item populados) para identificar tags
        let _urlItens = '/_bd?c=item&id_conta=' + $scope._regConta._id;
        _urlItens += '&pop=id_categoria&pop=id_categoria_reg1';

        await uteisService.getBase(_urlItens)
            .then((res) => {
                $scope._listItensCadastrados = res || [];

                // Indexa por tag normalizada (tag e tag_secundaria) para busca rápida
                const mapa = {};
                ($scope._listItensCadastrados).forEach((it) => {
                    [it.tag, it.tag_secundaria].forEach((t) => {
                        const chave = $scope.normalizaTag(t);
                        if (chave) mapa[chave] = it;
                    });
                });
                $scope._mapItensPorTag = mapa;
                $scope.$apply();
            })
            .catch(() => { });

    };

    // Normaliza tag para comparação (remove separadores, uppercase)
    $scope.normalizaTag = function (valor) {
        if (valor == null) return '';
        return valor.toString().replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    };

    // Busca item cadastrado pela tag lida
    $scope.buscarItemPorTag = function (tag) {
        const chave = $scope.normalizaTag(tag);
        return chave ? ($scope._mapItensPorTag[chave] || null) : null;
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
            $scope.socket.disconnect();
            $scope.socket = null;
        };

        // Cria nova conexão socket
        $scope.socket = io(); // conexão padrão

        $scope.socket.on($scope._regConta._id, function (data) {
            try {
                // Aceita objeto único ou array de leituras
                let leituras = data;
                if (typeof leituras === 'string') {
                    leituras = JSON.parse(leituras);
                };
                if (!Array.isArray(leituras)) {
                    leituras = [leituras];
                };

                leituras.forEach((leitura) => $scope.onDistribuiLeitura(leitura));

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

    // Casa a leitura ao coletor/gateway pelo tokem e alimenta o campo tags
    $scope.onDistribuiLeitura = function (leitura) {

        if (!leitura || !leitura.tokem) return;

        const gateway = $scope._listGateways.find((g) => g.tokem == leitura.tokem);
        if (!gateway) return; // tokem não pertence a nenhum coletor cadastrado

        if (!gateway.tags) gateway.tags = [];

        // "2026-07-03 09:52:43" -> "09:52:43"
        const hora = (leitura.data_leitura || '').split(' ')[1] || leitura.data_leitura || '';

        const emChecagem = !!(gateway.checagem && gateway.checagem.ativa);

        // compara por tag normalizada (a esperada pode estar em outro formato)
        const chaveLeitura = $scope.normalizaTag(leitura.tag);
        const existente = gateway.tags.find((t) => $scope.normalizaTag(t.tag) == chaveLeitura);

        if (existente) {
            const eraPendente = existente.status === 'pendente';
            existente.ultima_leitura = hora;
            if (!existente.primeira_leitura) existente.primeira_leitura = hora;
            existente.contagem = (existente.contagem || 0) + 1;
            existente.rssi = leitura.rssi;
            existente._raw = leitura;

            // Esperado → encontrado; fora da ordem em checagem → mantém excedente (não “promove” na releitura)
            if (existente.esperado) {
                existente.status = 'encontrado';
            } else if (emChecagem) {
                existente.status = 'excedente';
            } else {
                existente.status = 'encontrado';
            }

            // Checagem de posição: todos os esperados encontrados → beep de sucesso
            if (emChecagem && eraPendente && existente.esperado && gateway.checagem.origem === 'posicao') {
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
                // fora de checagem: lida = encontrado; em checagem: não estava na lista = excedente
                status: emChecagem ? 'excedente' : 'encontrado',
                esperado: false
            };

            // Identifica se a tag pertence a um item cadastrado
            const item = $scope.buscarItemPorTag(leitura.tag);
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
                tocarAlertaExcedente();
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

    $scope.onAbrirAssociar = function (tag) {
        $scope._assoc = {
            tag: tag,               // referência à leitura selecionada
            id_item: '',            // categoria escolhida (traz os labels)
            id_categoria: '',       // categoria_item escolhida
            labels: []              // informações complementares editáveis
        };

        // 1) Se a tag já foi associada manualmente, reutiliza o que foi salvo
        if (tag && tag._assoc) {
            $scope._assoc.id_item = tag._assoc.id_item || '';
            $scope._assoc.id_categoria = tag._assoc.id_categoria || '';
            $scope.onSelecionaItem();
            if (Array.isArray(tag._assoc.labels)) {
                $scope._assoc.labels = angular.copy(tag._assoc.labels);
            }

            // 2) Caso contrário, se for um item já cadastrado, pré-preenche com os dados dele
        } else if (tag && tag.cadastrada && tag.item) {
            const item = tag.item;
            $scope._assoc.id_item = (item.id_categoria && item.id_categoria._id) || '';
            $scope._assoc.id_categoria = (item.id_categoria_reg1 && item.id_categoria_reg1._id) || '';
            $scope._assoc.labels = angular.copy(tag.labels && tag.labels.length ? tag.labels : $scope.montarLabelsDoItem(item));
        }

        modalAssoc = new bootstrap.Modal(document.getElementById('modalAssociarTag'));
        modalAssoc.show();
    };

    // Monta os campos de informações complementares a partir dos labels do item escolhido
    $scope.onSelecionaItem = function () {
        const item = ($scope._listItens || []).find((i) => i._id == $scope._assoc.id_item);

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
                    valor: item['valor_labelInf' + i] || ''
                });
            }
        };

        $scope._assoc.labels = labels;
    };

    $scope.onSalvarAssociacao = function () {
        const tag = $scope._assoc.tag;
        if (!tag) return;

        if (!$scope._assoc.id_item) {
            uteisService.onToast('Selecione um item.', 'warning', 3000, 'top-end');
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
                const chave = $scope.normalizaTag(tag.tag);
                if (chave) $scope._mapItensPorTag[chave] = itemPopulado;

                if (modalAssoc) {
                    modalAssoc.hide();
                    modalAssoc = undefined;
                }

                uteisService.onToast('Item cadastrado e associado com sucesso!', 'success', 2500, 'top-end');
                $scope.$apply();
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
            tocarAlertaExcedente();
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
        if (s === 'pendente') return 'pendente';
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
            status_destino: '',
            status_destino_data: '',
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
            tocarAlertaExcedente();
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
            id_colaborador: ($scope._regColaborador && $scope._regColaborador._id) || null,
            ativo: '1',
            tipo: tipo,
            id_doc: $scope._reg.id_doc,
            descricao: $scope._reg.id_doc,
            status: 'concluido',
            status_data: new Date(),
            id_nivel_loc1: $scope._reg.id_nivel_loc1 || null,
            id_nivel_loc2: $scope._reg.id_nivel_loc2 || null,
            id_nivel_loc3: $scope._reg.id_nivel_loc3 || null,
            id_nivel_loc4: $scope._reg.id_nivel_loc4 || null,
            itens: itens
        };

        if (!atualizando) {
            payload.partida_data = new Date();
            payload.tolerancia = 30;
        }

        $scope._reg._salvando = true;

        uteisService.patchBase('/posicao', payload)
            .then(() => {
                if (modalPos) {
                    modalPos.hide();
                    modalPos = undefined;
                }

                // Encerra a checagem e limpa as tags do coletor após registrar
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

    // Monta uma linha "esperada" (status pendente) a partir de uma tag conhecida
    function montarEsperadoPorTag(tag, dados) {
        const item = $scope.buscarItemPorTag(tag);
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

        // Se veio de uma posição, sobrescreve os valores complementares salvos
        if (dados) {
            for (let i = 1; i <= 5; i++) {
                const val = dados['inf_compl_' + i];
                if (val != null && val !== '') {
                    const lbl = linha.labels.find((l) => l.index == i);
                    if (lbl) lbl.valor = val;
                }
            }
        }

        return linha;
    }

    $scope.onIniciarChecagem = async function () {
        const gateway = $scope._chkGateway;
        if (!gateway) return;

        let esperados = [];
        let checagem = { ativa: true };

        if ($scope._chk.origem === 'documento') {
            if (!$scope._chk.id_doc) {
                uteisService.onToast('Informe o idDoc.', 'warning', 3000, 'top-end');
                return;
            }

            // Conta com integração: busca a ordem no cliente e salva/atualiza a posição antes de checar
            const idApi = String(($scope._regConta && $scope._regConta.id_api) || '').trim();
            if (idApi) {
                const urlIntegracao = '/' + encodeURIComponent(idApi)
                    + '/pickdetails/' + encodeURIComponent($scope._chk.id_doc)
                    + '?id_conta=' + encodeURIComponent($scope._regConta._id);

                try {
                    const integ = await uteisService.getBase(urlIntegracao);
                    if (!integ || integ.ok === false) {
                        uteisService.onToast(
                            (integ && (integ.error || integ.mensagem)) || 'Falha ao buscar a ordem na integração.',
                            'error',
                            4000,
                            'top-end'
                        );
                        return;
                    }
                } catch (e) {
                    uteisService.onToast('Erro ao consultar a integração do cliente.', 'error', 4000, 'top-end');
                    return;
                }
            }

            let _url = '/_bd?c=posicao&id_conta=' + $scope._regConta._id + '&id_doc=' + encodeURIComponent($scope._chk.id_doc) + '&_sort=createdAt';
            const res = await uteisService.getBase(_url).catch(() => []);
            const posicao = (res && res.length) ? res[0] : null;

            if (!posicao) {
                uteisService.onToast('Documento não encontrado.', 'warning', 3000, 'top-end');
                return;
            }

            esperados = (posicao.itens || []).map((pit) => montarEsperadoPorTag(pit.tag, pit));

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

            esperados = (res || []).map((it) => {
                const linha = montarEsperadoPorTag(it.tag);
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
            });

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

        if (modalChk) {
            modalChk.hide();
            modalChk = undefined;
        }

        uteisService.onToast('Checagem iniciada: ' + esperados.length + ' item(ns).', 'info', 2500, 'top-end');
        $scope.$apply();
    };

    $scope.onCancelarChecagem = function (gateway) {
        const alvo = gateway || $scope._chkGateway;
        if (alvo) alvo.checagem = null;
    };

    // Contadores por status (para exibir no card em checagem)
    $scope.contaStatus = function (gateway, status) {
        if (!gateway || !gateway.tags) return 0;
        return gateway.tags.filter((t) => t.status === status).length;
    };

    // Modal registrar: pendentes ou excedentes → barra vermelha
    $scope.temAlertaRegistro = function () {
        const g = $scope._regGatewaySel;
        if (!g) return false;
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

    function tocarAlertaExcedente() {
        tocarSomPortal('warning');
    }

    function tocarSucessoChecagem() {
        tocarSomPortal('success');
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