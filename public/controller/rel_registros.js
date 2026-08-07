app.controller('relRegistrosCtrl', function ($scope, $http, params, uteisService, $timeout) {

    const hoje = moment().format('YYYY-MM-DD');

    $scope._regConta = {};
    $scope._listItens = [];
    $scope._listItensBase = [];
    $scope._listGateways = [];
    $scope._listEnderecos = [];
    $scope._listSkus = [];
    $scope._listCategorias = [];
    $scope._mapaItemCategoria = {};
    $scope._interacaoSelecionada = null;
    $scope.sortField = 'categoria.descricao';
    $scope.sortReverse = false;

    $scope._filtro = {
        data_de: hoje,
        data_a: hoje,
        id_gateway: '',
        id_endereco: '',
        id_sku: '',
        id_categoria: '',
        status: '',
        pesquisa: ''
    };

    function aplicarDatasNosInputs() {
        const dataDe = $scope._filtro.data_de || hoje;
        const dataA = $scope._filtro.data_a || hoje;
        $scope._filtro.data_de = dataDe;
        $scope._filtro.data_a = dataA;

        const elDe = document.getElementById('filtro_data_de');
        const elA = document.getElementById('filtro_data_a');
        if (elDe) elDe.value = dataDe;
        if (elA) elA.value = dataA;
    }

    var modalInstance = undefined;

    const getId = (obj) => (obj && obj._id ? obj._id : (obj || ''));

    const normaliza = (v) =>
        (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    $scope.$watch('$viewContentLoaded', async function () {

        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png';
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        }

        $scope._regConta = uteisService.normalizarConta($scope._regConta);
        $scope._regColaborador = uteisService.getCookie('_colaborador');

        $timeout(aplicarDatasNosInputs);

        await $scope.onCarregaOpcoesFiltro();
        $scope.onCarregaRegistros();
    });

    $scope.onCarregaOpcoesFiltro = async function () {
        const idConta = $scope._regConta._id;
        if (!idConta) return;

        try {
            const [gateways, enderecos, skus, categorias, itens] = await Promise.all([
                uteisService.getBase('/_bd?c=gateway&id_conta=' + idConta + '&_sort=descricao'),
                uteisService.getBase('/_bd?c=localizacao&id_conta=' + idConta + '&_sort=descricao'),
                uteisService.getBase('/_bd?c=categoria&id_conta=' + idConta + '&_sort=descricao'),
                uteisService.getBase('/_bd?c=categoria_item&id_conta=' + idConta + '&_sort=descricao'),
                uteisService.getBase('/_bd?c=item&id_conta=' + idConta + '&limit=5000')
            ]);

            $scope._listGateways = Array.isArray(gateways) ? gateways : [];
            $scope._listEnderecos = Array.isArray(enderecos) ? enderecos : [];
            $scope._listSkus = Array.isArray(skus) ? skus : [];
            $scope._listCategorias = Array.isArray(categorias) ? categorias : [];

            const mapa = {};
            (Array.isArray(itens) ? itens : []).forEach((item) => {
                if (!item || !item._id) return;
                mapa[item._id] = getId(item.id_categoria_reg1);
                if (item.tag) mapa['tag:' + String(item.tag).toLowerCase()] = getId(item.id_categoria_reg1);
            });
            $scope._mapaItemCategoria = mapa;
        } catch (e) {
            console.error(e);
        }
    };

    $scope.onCarregaRegistros = async function () {

        const elDe = document.getElementById('filtro_data_de');
        const elA = document.getElementById('filtro_data_a');
        if (elDe && elDe.value) $scope._filtro.data_de = elDe.value;
        if (elA && elA.value) $scope._filtro.data_a = elA.value;

        let _url = '/_bd?c=registro&id_conta=' + $scope._regConta._id;
        _url += '&pop=id_gateway&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';
        _url += '&pop=id_categoria';
        _url += '&_sort=data_permanecia';

        const dataDe = $scope._filtro.data_de;
        const dataA = $scope._filtro.data_a;
        if (dataDe && dataA) {
            _url += '&data_registro=*dtP' + moment(dataDe).format('YYYY-MM-DD') + '|' + moment(dataA).format('YYYY-MM-DD');
        }

        await uteisService.getBase(_url)
            .then((res) => {
                $scope._listItensBase = Array.isArray(res) ? res : [];
                $scope.aplicarFiltros();
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    };

    $scope.onFiltroChange = function (recarregar) {
        if (recarregar) {
            $scope.onCarregaRegistros();
            return;
        }
        $scope.aplicarFiltros();
    };

    $scope.aplicarFiltros = function () {
        const f = $scope._filtro || {};
        const pesquisa = f.pesquisa ? normaliza(f.pesquisa) : '';

        $scope._listItens = ($scope._listItensBase || []).filter((item) => {
            if (f.id_gateway && getId(item.id_gateway) !== f.id_gateway) return false;

            if (f.id_sku && getId(item.id_categoria) !== f.id_sku) return false;

            if (f.status && String(item.status || '').toLowerCase() !== f.status) return false;

            if (f.id_endereco) {
                const idsLoc = [
                    getId(item.id_nivel_loc1),
                    getId(item.id_nivel_loc2),
                    getId(item.id_nivel_loc3),
                    getId(item.id_nivel_loc4)
                ];
                if (!idsLoc.includes(f.id_endereco)) return false;
            }

            if (f.id_categoria) {
                const idItem = getId(item.id_item);
                const tagKey = item.tag ? 'tag:' + String(item.tag).toLowerCase() : '';
                const idCatItem =
                    $scope._mapaItemCategoria[idItem] ||
                    (tagKey ? $scope._mapaItemCategoria[tagKey] : '') ||
                    getId(item.id_categoria_reg1);
                if (idCatItem !== f.id_categoria) return false;
            }

            if (!pesquisa) return true;

            const catDesc = normaliza(item.id_categoria?.descricao);
            const tag = normaliza(item.tag);
            const gateway = normaliza(item.id_gateway?.descricao);
            const status = normaliza(item.status);
            const nv1 = normaliza(item.id_nivel_loc1?.descricao);
            const nv2 = normaliza(item.id_nivel_loc2?.descricao);
            const nv3 = normaliza(item.id_nivel_loc3?.descricao);
            const nv4 = normaliza(item.id_nivel_loc4?.descricao);

            return (
                catDesc.includes(pesquisa) ||
                tag.includes(pesquisa) ||
                gateway.includes(pesquisa) ||
                status.includes(pesquisa) ||
                nv1.includes(pesquisa) ||
                nv2.includes(pesquisa) ||
                nv3.includes(pesquisa) ||
                nv4.includes(pesquisa)
            );
        });
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
        const lista = Array.isArray($scope._listItens) ? $scope._listItens.slice() : [];
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
            'SKU',
            'Tag',
            'Data Permanencia',
            'Data Registro',
            'Status',
            'Coletor (Gateway)',
            'Nivel 1',
            'Nivel 2',
            'Nivel 3',
            'Nivel 4',
            'Interacoes'
        ];

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

        const linhas = lista.map((item) => {
            const interacoes = Array.isArray(item.interacoes) ? item.interacoes : [];
            const interacoesTexto = interacoes
                .map((i) => (i.interacao_id || '') + '[' + (i.interacao_status || '') + ']')
                .join(' | ');
            return [
                item.id_categoria?.descricao || 'Item N/A',
                item.tag || '',
                fmtData(item.data_permanecia),
                fmtData(item.data_registro),
                item.status || '',
                item.id_gateway?.descricao || '',
                item.id_nivel_loc1?.descricao || '',
                item.id_nivel_loc2?.descricao || '',
                item.id_nivel_loc3?.descricao || '',
                item.id_nivel_loc4?.descricao || '',
                interacoesTexto
            ].map(escapeCSV).join(';');
        });

        const conteudo = [cabecalho.map(escapeCSV).join(';'), ...linhas].join('\r\n');
        const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const stamp = moment().format('YYYYMMDD_HHmmss');
        const nomeArquivo = 'registros_' + stamp + '.csv';

        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        uteisService.onToast('Arquivo exportado: ' + nomeArquivo, 'success', 2500, 'top-end');
    };

    $scope.formataDataHora = function (data) {
        const date = moment(data, 'YYYY-MM-DD HH:mm:ss')
            .add(params.timeAdd, 'hours');

        return date.format('DDMMM HH[h]mm:ss');
    };

    $scope.onAbrirModalInteracao = function (interacao) {
        $scope._interacaoSelecionada = interacao || null;
        const modalEl = document.getElementById('modalInteracao');
        if (!modalEl) return;
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    };

    $scope.jsonFormatado = function (valor) {
        if (valor === null || valor === undefined || valor === '') {
            return '{}';
        }

        if (typeof valor === 'string') {
            try {
                return JSON.stringify(JSON.parse(valor), null, 2);
            } catch (e) {
                return valor;
            }
        }

        try {
            return JSON.stringify(valor, null, 2);
        } catch (e) {
            return String(valor);
        }
    };

});
