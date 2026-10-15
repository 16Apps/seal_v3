app.controller('posicaoCtrl', function ($scope, $http, params, uteisService, $location, $interval, $timeout) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._listPosicoes = []
    $scope.sortField = 'id_doc';
    $scope.sortReverse = false;
    $scope._tipo = 'conferencia';
    /** Barra de auto-refresh via CSS (sem digests a cada 50ms) */
    $scope._autoRefreshRunning = false;
    $scope._listPosicoesFiltradas = [];
    $scope._listItensExpandidos = [];

    var modalInstance = undefined;
    var AUTO_REFRESH_MS = 10000;
    var _autoTimer = null;
    var _carregandoLista = false;

    var inicioSemanaAtual = moment().startOf('isoWeek').format('YYYY-MM-DD');
    var fimSemanaAtual = moment().endOf('isoWeek').format('YYYY-MM-DD');

    document.getElementById('_pesquisa.data_de').value = inicioSemanaAtual;
    document.getElementById('_pesquisa.data_a').value = fimSemanaAtual;

    $scope._pesquisa = {
        status: '',
        data_de: inicioSemanaAtual,
        data_a: fimSemanaAtual,
        pesquisa: '',
        somenteRetorno: ''
    };

    /** ordens = lista atual | itens = lista explícita item a item */
    $scope._ui = {
        modoVisualizacao: 'ordens'
    };

    /** id_gateway → { codif_epc, ... } — modo da última leitura do item (itens.id_gatweway) */
    $scope._mapGatewayPorId = {};
    /** Conta tem ao menos um gateway com codif_epc = dsv */
    $scope._temGatewayDsv = false;

    $scope.$watch('$viewContentLoaded', async function () {

        const currentUrl = $location.absUrl();
        let url = currentUrl.split('/')
      
        if(url[url.length - 1].includes('inventario')) {
            $scope._tipo = 'inventario'
        } else {
            $scope._tipo = 'conferencia'
        }

        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };
        $scope._regConta = uteisService.normalizarConta($scope._regConta);
        
        $scope._regColaborador = uteisService.getCookie('_colaborador');

        await $scope.onCarregaGateways();
        await $scope.onCarregaRegistros();
        iniciarAutoRefreshLista();
    });

    $scope.onCarregaGateways = async function () {
        if (!$scope._regConta || !$scope._regConta._id) return;
        var url = '/_bd?c=gateway&id_conta=' + encodeURIComponent($scope._regConta._id);
        var res = await uteisService.getBase(url).catch(function () { return []; });
        var map = {};
        var temDsv = false;
        (Array.isArray(res) ? res : []).forEach(function (g) {
            if (!g || !g._id) return;
            var codif = g.codif_epc != null ? String(g.codif_epc).trim().toLowerCase() : '';
            if (codif === 'dsv') temDsv = true;
            map[String(g._id)] = {
                _id: g._id,
                tokem: g.tokem || '',
                codif_epc: codif,
                codif_epc_inicial: g.codif_epc_inicial,
                codif_epc_comprimento: g.codif_epc_comprimento
            };
        });
        $scope._mapGatewayPorId = map;
        $scope._temGatewayDsv = temDsv;
    };

    function montarDecodDsv(epc, dec) {
        return {
            dsv: true,
            epc: (dec && dec.epc) || epc,
            cliente: (dec && dec.cliente) || '',
            volume: (dec && dec.volume) || '',
            nota_fiscal: (dec && dec.nota_fiscal) || '',
            tagDec: (dec && dec.tag) || '',
            dec: dec || null
        };
    }

    /**
     * Decodifica tag conforme codif_epc do gateway da última leitura (itens.id_gatweway).
     * Fallback: se o item não tiver gateway mas a conta tiver gateway DSV e o EPC
     * for válido no padrão DSV, aplica decodificarEPCDSV (itens antigos sem id_gatweway).
     */
    function decodificarTagPorGateway(tagRaw, idGateway) {
        var epc = tagRaw && tagRaw !== '—' ? String(tagRaw).trim() : '';
        var vazio = {
            dsv: false,
            epc: epc || '',
            cliente: '',
            volume: '',
            nota_fiscal: '',
            tagDec: '',
            dec: null
        };
        if (!epc) return vazio;

        var gw = null;
        if (idGateway != null && idGateway !== '') {
            gw = $scope._mapGatewayPorId[String(idGateway)] || null;
        }
        var codif = gw && gw.codif_epc ? gw.codif_epc : '';

        // Preferência: modo do gateway gravado no item (última leitura)
        if (codif === 'dsv') {
            try {
                return montarDecodDsv(epc, uteisService.decodificarEPCDSV(epc));
            } catch (e) {
                return Object.assign({}, vazio, { epc: epc });
            }
        }

        // Sem id_gatweway / gateway sem modo: tenta DSV se a conta usa esse modo
        if ((!codif || !gw) && $scope._temGatewayDsv) {
            try {
                return montarDecodDsv(epc, uteisService.decodificarEPCDSV(epc));
            } catch (e) {
                /* EPC não é DSV — mantém tag crua */
            }
        }

        return Object.assign({}, vazio, { epc: epc });
    }

    function pararAutoRefreshLista() {
        if (_autoTimer) {
            $interval.cancel(_autoTimer);
            _autoTimer = null;
        }
        $scope._autoRefreshRunning = false;
    }

    function reiniciarBarraAutoRefresh() {
        // Reinicia animação CSS sem $interval de progresso
        $scope._autoRefreshRunning = false;
        $timeout(function () {
            $scope._autoRefreshRunning = true;
        }, 20);
    }

    function iniciarAutoRefreshLista() {
        pararAutoRefreshLista();
        reiniciarBarraAutoRefresh();
        _autoTimer = $interval(function () {
            reiniciarBarraAutoRefresh();
            $scope.onCarregaRegistros({ silencioso: true });
        }, AUTO_REFRESH_MS);
    }

    $scope.$on('$destroy', function () {
        pararAutoRefreshLista();
    });

    $scope.onCarregaRegistros = async function (opts) {
        opts = opts || {};
        var silencioso = !!opts.silencioso;
        if (_carregandoLista) return;
        if (!$scope._regConta || !$scope._regConta._id) return;
        _carregandoLista = true;

        let _url = '/_bd?c=posicao&id_conta=' + $scope._regConta._id;

        _url += '&tipo=' + $scope._tipo
        
        if($scope._pesquisa.status) {
            if ($scope._pesquisa.status === 'aberta') {
                // "Abertas" = pendente + parcial
                _url += '&status*in=' + encodeURIComponent(JSON.stringify(['pendente', 'parcial']));
            } else {
                _url += '&status=' + $scope._pesquisa.status;
            }
        };

        if($scope._pesquisa.data_de && $scope._pesquisa.data_a) {
            _url += '&partida_data=*dtP' + moment($scope._pesquisa.data_de).format('YYYY-MM-DD') + '|' + moment($scope._pesquisa.data_a).format('YYYY-MM-DD')
        };

        // Texto livre: filtro client-side em posicoesFiltradas (id_doc, descricao, níveis)

        _url += '&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';
        _url += '&pop=id_nivel_loc1_destino&pop=id_nivel_loc2_destino&pop=id_nivel_loc3_destino&pop=id_nivel_loc4_destino';
        _url += '&pop=id_colaborador';

        try {
            var res = await uteisService.getBase(_url).catch(function (error) {
                if (!silencioso) {
                    uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
                }
                return null;
            });
            if (!Array.isArray(res)) return;

            res.map((item) => {

                item['_icone'] = '../assets/images/icon_cadastro.fw.png'

                item['_previsao_chegada_data'] = item.previsao_chegada_data
                item['_previsao_chegada_data_status'] = false

                let _chegadaReal = (item.itens || []).find(function (it) { return it && it.status_destino_data; });
                if (_chegadaReal) {
                    item['_previsao_chegada_data'] = _chegadaReal.status_destino_data;
                    item['_previsao_chegada_data_status'] = true
                }

                var contagem = $scope.contagemItensPosicao(item);
                item['_itensConcluido'] = contagem.concluido;
                item['_itensPendente'] = contagem.pendente;

                var infoRetorno = $scope.infoRetornoPosicao(item);
                item['_temRetorno'] = infoRetorno.temRetorno;
                item['_qtdRetorno'] = infoRetorno.qtd;
                item['_ultimoRetorno'] = infoRetorno.ultimo;

            });

            $scope._listPosicoes = res;
            atualizarListasDerivadas();
            $timeout(function () { }, 0);
        } finally {
            _carregandoLista = false;
        }
    };

    $scope.infoRetornoPosicao = function (posicao) {
        var itens = (posicao && posicao.itens) || [];
        if (!Array.isArray(itens)) itens = [];
        var qtd = 0;
        var ultimo = null;
        itens.forEach(function (it) {
            if (!it || !it.retorno_data) return;
            qtd += 1;
            var t = new Date(it.retorno_data).getTime();
            if (!isNaN(t) && (ultimo == null || t > ultimo)) ultimo = t;
        });
        return {
            temRetorno: qtd > 0,
            qtd: qtd,
            ultimo: ultimo != null ? new Date(ultimo) : null
        };
    };

    $scope.contagemItensPosicao = function (posicao) {
        var itens = (posicao && posicao.itens) || [];
        if (!Array.isArray(itens)) itens = [];

        var concluido = 0;
        var pendenteArr = 0;

        itens.forEach(function (item) {
            if (!item) return;
            var st = String(item.status || 'pendente').toLowerCase();
            if (st === 'concluido') concluido += 1;
            else pendenteArr += 1;
        });

        var totais = uteisService.normalizarTotaisPosicao
            ? uteisService.normalizarTotaisPosicao(posicao || { itens: itens })
            : { total_itens: itens.length, total_concluido: concluido };
        var totalPrevisto = totais.total_itens != null ? totais.total_itens : itens.length;
        var concl = totais.total_concluido != null ? totais.total_concluido : concluido;

        return {
            concluido: concl,
            pendente: Math.max(0, totalPrevisto - concl),
            total: totalPrevisto,
            // mantém contagem só do array quando útil
            pendente_arr: pendenteArr
        };
    };

    function descricaoNivelPosicao(campo) {
        if (!campo) return '';
        if (typeof campo === 'object') return String(campo.descricao || '');
        return '';
    }

    /** Texto pesquisável: id_doc, descricao e níveis (origem + destino) expostos na lista */
    function textoBuscaPosicao(pos) {
        if (!pos) return '';
        var partes = [
            pos.id_doc,
            pos.descricao,
            descricaoNivelPosicao(pos.id_nivel_loc1),
            descricaoNivelPosicao(pos.id_nivel_loc2),
            descricaoNivelPosicao(pos.id_nivel_loc3),
            descricaoNivelPosicao(pos.id_nivel_loc4),
            descricaoNivelPosicao(pos.id_nivel_loc1_destino),
            descricaoNivelPosicao(pos.id_nivel_loc2_destino),
            descricaoNivelPosicao(pos.id_nivel_loc3_destino),
            descricaoNivelPosicao(pos.id_nivel_loc4_destino)
        ];
        return partes.join(' ').toLowerCase();
    }

    function computarPosicoesFiltradas() {
        var lista = Array.isArray($scope._listPosicoes) ? $scope._listPosicoes : [];
        if ($scope._pesquisa.somenteRetorno === true || $scope._pesquisa.somenteRetorno === '1') {
            lista = lista.filter(function (p) { return p && p._temRetorno; });
        }
        var q = String(($scope._pesquisa && $scope._pesquisa.pesquisa) || '').trim().toLowerCase();
        if (q) {
            lista = lista.filter(function (p) {
                return textoBuscaPosicao(p).indexOf(q) !== -1;
            });
        }
        return lista;
    }

    function computarItensExpandidos(posicoes) {
        var linhas = [];
        var soRetorno = $scope._pesquisa.somenteRetorno === true || $scope._pesquisa.somenteRetorno === '1';
        (posicoes || []).forEach(function (pos) {
            var itens = (pos && pos.itens) || [];
            if (!Array.isArray(itens) || !itens.length) {
                if (!soRetorno) {
                    linhas.push({
                        posicao: pos,
                        item: null,
                        id_doc: pos.id_doc,
                        ordemStatus: pos.status,
                        partida_data: pos.partida_data,
                        tag: '—',
                        tagDsv: false,
                        tagCliente: '',
                        tagVolume: '',
                        tagNotaFiscal: '',
                        tagEpc: '',
                        ean: '—',
                        itemStatus: '—',
                        status_data: null,
                        retorno_data: null,
                        temRetorno: false
                    });
                }
                return;
            }
            itens.forEach(function (it, idx) {
                if (soRetorno && !(it && it.retorno_data)) return;
                var tagRaw = (it && it.tag) || '—';
                var idGw = (it && (it.id_gatweway || it.id_gateway)) || null;
                var tagInfo = decodificarTagPorGateway(tagRaw, idGw);
                linhas.push({
                    posicao: pos,
                    item: it,
                    seq: idx + 1,
                    id_doc: pos.id_doc,
                    ordemStatus: pos.status,
                    partida_data: pos.partida_data,
                    origem: (pos.id_nivel_loc1 && pos.id_nivel_loc1.descricao) || '',
                    destino: (pos.id_nivel_loc1_destino && pos.id_nivel_loc1_destino.descricao) || '',
                    tag: tagRaw,
                    tagDsv: !!tagInfo.dsv,
                    tagCliente: tagInfo.cliente || '',
                    tagVolume: tagInfo.volume || '',
                    tagNotaFiscal: tagInfo.nota_fiscal || '',
                    tagEpc: tagInfo.epc || (tagRaw !== '—' ? tagRaw : ''),
                    ean: (it && it.ean) || '—',
                    itemStatus: (it && it.status) || 'pendente',
                    status_data: (it && it.status_data) || null,
                    retorno_data: (it && it.retorno_data) || null,
                    temRetorno: !!(it && it.retorno_data),
                    id_gatweway: idGw
                });
            });
        });
        return linhas;
    }

    /** Recalcula caches usadas na view (evita reprocessar DSV a cada digest) */
    function atualizarListasDerivadas() {
        $scope._listPosicoesFiltradas = computarPosicoesFiltradas();
        $scope._listItensExpandidos = computarItensExpandidos($scope._listPosicoesFiltradas);
    }

    /** Lista de ordens após filtros client-side (retorno + texto) */
    $scope.posicoesFiltradas = function () {
        return $scope._listPosicoesFiltradas || [];
    };

    /**
     * Visão por itens: uma linha por item da ordem (cache).
     */
    $scope.itensExpandidos = function () {
        return $scope._listItensExpandidos || [];
    };

    $scope.onFiltroClientChange = function () {
        atualizarListasDerivadas();
    };

    // Filtros client-side: pesquisa / retorno — status e datas disparam reload via botão/auto
    $scope.$watchGroup([
        '_pesquisa.pesquisa',
        '_pesquisa.somenteRetorno'
    ], function () {
        atualizarListasDerivadas();
    });

    $scope.labelStatusItem = function (st) {
        var s = String(st || '').toLowerCase();
        if (s === 'concluido') return 'Concluído';
        if (s === 'excedente') return 'Excedente';
        if (s === 'nao_encontrado') return 'Não encontrado';
        if (s === 'pendente') return 'Pendente';
        return st || '—';
    };

    $scope.classeStatusItem = function (st) {
        var s = String(st || '').toLowerCase();
        if (s === 'concluido') return 'text-success';
        if (s === 'excedente') return 'text-danger';
        if (s === 'pendente') return 'text-warning';
        return 'text-secondary';
    };

    $scope.onModoVisualizacao = function (modo) {
        $scope._ui.modoVisualizacao = modo === 'itens' ? 'itens' : 'ordens';
    };

    $scope.sortBy = function (field) {
        if ($scope.sortField === field) {
            $scope.sortReverse = !$scope.sortReverse;
        } else {
            $scope.sortField = field;
            $scope.sortReverse = false;
        }
    };

    $scope.onExportarCSV = function () {
        const modoItens = $scope._ui && $scope._ui.modoVisualizacao === 'itens';
        const escapeCSV = (valor) => {
            const v = valor == null ? '' : String(valor);
            const precisaAspas = /[";\r\n]/.test(v);
            const escapado = v.replace(/"/g, '""');
            return precisaAspas ? `"${escapado}"` : escapado;
        };
        const fmtData = (d) => {
            if (!d) return '';
            try {
                return moment(d).format('YYYY-MM-DD HH:mm:ss');
            } catch (e) {
                return String(d);
            }
        };
        const baixar = (cabecalho, linhasDados, prefixo) => {
            if (!linhasDados.length) {
                uteisService.onToast('Nenhum registro para exportar.', 'warning', 2500, 'top-end');
                return;
            }
            const conteudo = [cabecalho.map(escapeCSV).join(';'), ...linhasDados].join('\r\n');
            const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const stamp = moment().format('YYYYMMDD_HHmmss');
            const nomeArquivo = (prefixo || 'posicoes') + '_' + stamp + '.csv';
            const a = document.createElement('a');
            a.href = url;
            a.download = nomeArquivo;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            uteisService.onToast('Arquivo exportado: ' + nomeArquivo, 'success', 2500, 'top-end');
        };

        if (modoItens) {
            const lista = ($scope.itensExpandidos() || []).slice();
            const field = $scope.sortField;
            const reverse = $scope.sortReverse ? -1 : 1;
            lista.sort((a, b) => {
                const va = a && a[field] != null ? a[field] : (a && a.id_doc) || '';
                const vb = b && b[field] != null ? b[field] : (b && b.id_doc) || '';
                if (va === vb) return 0;
                if (va === '' || va == null) return 1 * reverse;
                if (vb === '' || vb == null) return -1 * reverse;
                return (String(va).localeCompare(String(vb), 'pt-BR', { numeric: true })) * reverse;
            });

            const cabecalho = [
                'Pedido',
                'Status Ordem',
                'Partida',
                'Origem N1',
                'Destino N1',
                'Cliente',
                'Volume',
                'Nota Fiscal',
                'Tag (EPC)',
                'EAN',
                'Status Item',
                'Leitura (Data)',
                'Retornou',
                'Retorno (Data)'
            ];

            const linhas = lista.map((linha) => {
                const pos = linha.posicao || {};
                const tagPlain = linha.tag === '—' ? '' : (linha.tag || '');
                const tagInfo = decodificarTagPorGateway(tagPlain, linha.id_gatweway);
                return [
                    linha.id_doc || '',
                    linha.ordemStatus || '',
                    fmtData(linha.partida_data),
                    (pos.id_nivel_loc1 && pos.id_nivel_loc1.descricao) || linha.origem || '',
                    (pos.id_nivel_loc1_destino && pos.id_nivel_loc1_destino.descricao) || linha.destino || '',
                    tagInfo.dsv ? (tagInfo.cliente || '') : '',
                    tagInfo.dsv ? (tagInfo.volume || '') : '',
                    tagInfo.dsv ? (tagInfo.nota_fiscal || '') : '',
                    tagInfo.dsv ? (tagInfo.epc || tagPlain) : tagPlain,
                    linha.ean === '—' ? '' : (linha.ean || ''),
                    $scope.labelStatusItem(linha.itemStatus),
                    linha.status_data ? fmtData(linha.status_data) : '',
                    linha.temRetorno ? 'Sim' : 'Não',
                    linha.temRetorno ? fmtData(linha.retorno_data) : ''
                ].map(escapeCSV).join(';');
            });

            baixar(cabecalho, linhas, 'posicoes_itens');
            return;
        }

        // Modo ordens (padrão) — respeita filtro de retorno
        const lista = ($scope.posicoesFiltradas() || []).slice();
        if (!lista.length) {
            uteisService.onToast('Nenhum registro para exportar.', 'warning', 2500, 'top-end');
            return;
        }

        const field = $scope.sortField;
        const reverse = $scope.sortReverse ? -1 : 1;
        const getCampo = (obj, path) => {
            if (!obj || !path) return '';
            const partes = String(path).split('.');
            let cur = obj;
            for (let i = 0; i < partes.length; i++) {
                if (cur == null) return '';
                cur = cur[partes[i]];
            }
            return cur == null ? '' : cur;
        };
        lista.sort((a, b) => {
            const va = getCampo(a, field);
            const vb = getCampo(b, field);
            if (va === vb) return 0;
            if (va === '' || va == null) return 1 * reverse;
            if (vb === '' || vb == null) return -1 * reverse;
            return (String(va).localeCompare(String(vb), 'pt-BR', { numeric: true })) * reverse;
        });

        const cabecalho = [
            'iD Doc',
            'Inf. Extra',
            'Criado em',
            'Status',
            'Partida (Data)',
            'Origem Nivel 1',
            'Origem Nivel 2',
            'Origem Nivel 3',
            'Origem Nivel 4',
            'Qtd Itens',
            'Itens Concluidos',
            'Itens Pendentes',
            'Com Retorno',
            'Qtd Retorno',
            'Ultimo Retorno',
            'Chegada Prevista',
            'Chegada Real',
            'Destino Nivel 1',
            'Destino Nivel 2',
            'Destino Nivel 3',
            'Destino Nivel 4'
        ];

        const linhas = lista.map((item) => {
            const qtdItens = Array.isArray(item.itens) ? item.itens.length : 0;
            return [
                item.id_doc || '',
                item.descricao || '',
                fmtData(item.createdAt),
                item.status || '',
                fmtData(item.partida_data),
                item.id_nivel_loc1?.descricao || '',
                item.id_nivel_loc2?.descricao || '',
                item.id_nivel_loc3?.descricao || '',
                item.id_nivel_loc4?.descricao || '',
                qtdItens,
                item._itensConcluido || 0,
                item._itensPendente || 0,
                item._temRetorno ? 'Sim' : 'Não',
                item._qtdRetorno || 0,
                item._temRetorno ? fmtData(item._ultimoRetorno) : '',
                fmtData(item.previsao_chegada_data),
                item._previsao_chegada_data_status ? fmtData(item._previsao_chegada_data) : '',
                item.id_nivel_loc1_destino?.descricao || '',
                item.id_nivel_loc2_destino?.descricao || '',
                item.id_nivel_loc3_destino?.descricao || '',
                item.id_nivel_loc4_destino?.descricao || ''
            ].map(escapeCSV).join(';');
        });

        baixar(cabecalho, linhas, 'posicoes_ordens');
    };


    $scope.onPosicao = async function (_acao, _edit) {

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.onCarregaRegistros()
            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;

            $scope.$apply();
        } else {

            let _tratComponente = JSON.parse(JSON.stringify(_edit || {}));
            _tratComponente.id_nivel_loc1 = _tratComponente.id_nivel_loc1 ? _tratComponente.id_nivel_loc1._id : null
            _tratComponente.id_nivel_loc2 = _tratComponente.id_nivel_loc2 ? _tratComponente.id_nivel_loc2._id : null
            _tratComponente.id_nivel_loc3 = _tratComponente.id_nivel_loc3 ? _tratComponente.id_nivel_loc3._id : null
            _tratComponente.id_nivel_loc4 = _tratComponente.id_nivel_loc4 ? _tratComponente.id_nivel_loc4._id : null

            _tratComponente.id_nivel_loc1_destino = _tratComponente.id_nivel_loc1_destino ? _tratComponente.id_nivel_loc1_destino._id : null
            _tratComponente.id_nivel_loc2_destino = _tratComponente.id_nivel_loc2_destino ? _tratComponente.id_nivel_loc2_destino._id : null
            _tratComponente.id_nivel_loc3_destino = _tratComponente.id_nivel_loc3_destino ? _tratComponente.id_nivel_loc3_destino._id : null
            _tratComponente.id_nivel_loc4_destino = _tratComponente.id_nivel_loc4_destino ? _tratComponente.id_nivel_loc4_destino._id : null

            $scope.funcaoLoc = _acao;
            $scope.editLoc = _tratComponente;

            modalInstance = new bootstrap.Modal(document.getElementById('modalPosicao'));
            modalInstance.show();
        }

    };

$scope.formataDataHora = function (data) {
    return uteisService.formataDataHora(data, 'DDMMM HH[h]mm');
};

$scope.formataDataHoraString = function (data) {
    return uteisService.formataDataHora(data, 'DDMMM HH[h]mm');
};

});