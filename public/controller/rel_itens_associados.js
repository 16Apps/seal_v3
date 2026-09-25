app.controller('itensAssociadosCtrl', function ($scope, $http, params, uteisService, $timeout) {

    const hoje = moment().format('YYYY-MM-DD');
    const PAGE_SIZE = 10;

    $scope._regConta = {};
    $scope._listItens = [];
    $scope._listItensBase = [];
    $scope._pesquisa = '';
    $scope._carregando = false;
    $scope.sortField = 'data_registro';
    $scope.sortReverse = true;

    $scope._paginacao = {
        page: 1,
        limit: PAGE_SIZE,
        temProxima: false,
        totalNaPagina: 0
    };

    $scope._filtro = {
        data_de: hoje,
        data_a: hoje
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

    const normaliza = (v) =>
        (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png';
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        }

        $scope._regColaborador = uteisService.getCookie('_colaborador');

        $timeout(aplicarDatasNosInputs);
        $scope.onCarregaRegistros(1);
    });

    $scope.onCarregaRegistros = async function (page) {
        if ($scope._carregando) return;

        const elDe = document.getElementById('filtro_data_de');
        const elA = document.getElementById('filtro_data_a');
        if (elDe && elDe.value) $scope._filtro.data_de = elDe.value;
        if (elA && elA.value) $scope._filtro.data_a = elA.value;

        const pagina = Math.max(1, parseInt(page, 10) || $scope._paginacao.page || 1);
        $scope._paginacao.page = pagina;
        $scope._carregando = true;

        let _url = '/relatorio/associacao-reg/' + $scope._regConta._id;
        _url += '?page=' + pagina;
        _url += '&limit=' + PAGE_SIZE;

        const dataDe = $scope._filtro.data_de;
        const dataA = $scope._filtro.data_a;
        if (dataDe) {
            _url += '&data_inicio=' + encodeURIComponent(moment(dataDe).startOf('day').toISOString());
        }
        if (dataA) {
            _url += '&data_fim=' + encodeURIComponent(moment(dataA).endOf('day').toISOString());
        }

        const pesquisa = String($scope._pesquisa || '').trim();
        if (pesquisa) {
            _url += '&tag=' + encodeURIComponent(pesquisa);
        }

        try {
            const res = await uteisService.getBase(_url);
            const lista = Array.isArray(res) ? res : [];
            $scope._listItensBase = lista;
            $scope._paginacao.temProxima = lista.length >= PAGE_SIZE;
            $scope._paginacao.totalNaPagina = lista.length;
            $scope.aplicarFiltrosLocais();
        } catch (error) {
            $scope._listItensBase = [];
            $scope._listItens = [];
            $scope._paginacao.temProxima = false;
            $scope._paginacao.totalNaPagina = 0;
            uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        } finally {
            $scope._carregando = false;
            $scope.$applyAsync();
        }
    };

    $scope.onFiltroServidor = function () {
        $scope.onCarregaRegistros(1);
    };

    /** Refino local na página (categoria, endereço, associados). Tag já veio do servidor. */
    $scope.aplicarFiltrosLocais = function () {
        const pesquisa = $scope._pesquisa
            ? normaliza($scope._pesquisa)
            : '';

        if (!pesquisa) {
            $scope._listItens = $scope._listItensBase || [];
            return;
        }

        $scope._listItens = ($scope._listItensBase || []).filter((item) => {
            const catDesc = normaliza(item.id_categoria?.descricao);
            const tag = normaliza(item.tag);
            const gateway = normaliza(item.id_gateway?.descricao);
            const status = normaliza(item.status);
            const nv1 = normaliza(item.id_registro?.id_nivel_loc1?.descricao);
            const nv2 = normaliza(item.id_registro?.id_nivel_loc2?.descricao);
            const nv3 = normaliza(item.id_registro?.id_nivel_loc3?.descricao);
            const nv4 = normaliza(item.id_registro?.id_nivel_loc4?.descricao);

            const associadosMatch = (item.associados || []).some((a) =>
                normaliza(a.id_categoria?.descricao).includes(pesquisa) ||
                normaliza(a.tag).includes(pesquisa)
            );

            return (
                catDesc.includes(pesquisa) ||
                tag.includes(pesquisa) ||
                gateway.includes(pesquisa) ||
                status.includes(pesquisa) ||
                nv1.includes(pesquisa) ||
                nv2.includes(pesquisa) ||
                nv3.includes(pesquisa) ||
                nv4.includes(pesquisa) ||
                associadosMatch
            );
        });
    };

    $scope.onPesquisa = function () {
        $scope.onCarregaRegistros(1);
    };

    $scope.onPaginaAnterior = function () {
        if ($scope._paginacao.page <= 1 || $scope._carregando) return;
        $scope.onCarregaRegistros($scope._paginacao.page - 1);
    };

    $scope.onPaginaProxima = function () {
        if (!$scope._paginacao.temProxima || $scope._carregando) return;
        $scope.onCarregaRegistros($scope._paginacao.page + 1);
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
            'Item',
            'Tag',
            'Data Registro',
            'Status',
            'Qtd Encontrada',
            'Qtd Esperada',
            'Coletor (Gateway)',
            'Nivel 1',
            'Nivel 2',
            'Nivel 3',
            'Nivel 4',
            'Associados'
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
            const associados = Array.isArray(item.associados) ? item.associados : [];
            const associadosTexto = associados
                .map((a) => {
                    const cat = a.id_categoria?.descricao || 'Categoria N/A';
                    const tag = a.tag || 'Sem tag';
                    const dt = a.data_leitura ? fmtData(a.data_leitura) : '';
                    return cat + ' [' + tag + '] ' + dt;
                })
                .join(' | ');
            return [
                item.id_categoria?.descricao || 'Item N/A',
                item.tag || '',
                fmtData(item.data_registro),
                item.status || '',
                item.quantidade_encontrada != null ? item.quantidade_encontrada : '',
                item.quantidade_esperada != null ? item.quantidade_esperada : '',
                item.id_gateway?.descricao || '',
                item.id_registro?.id_nivel_loc1?.descricao || '',
                item.id_registro?.id_nivel_loc2?.descricao || '',
                item.id_registro?.id_nivel_loc3?.descricao || '',
                item.id_registro?.id_nivel_loc4?.descricao || '',
                associadosTexto
            ].map(escapeCSV).join(';');
        });

        const conteudo = [cabecalho.map(escapeCSV).join(';'), ...linhas].join('\r\n');
        const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const stamp = moment().format('YYYYMMDD_HHmmss');
        const nomeArquivo = 'itens_associados_p' + $scope._paginacao.page + '_' + stamp + '.csv';

        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        uteisService.onToast('Arquivo exportado (página atual): ' + nomeArquivo, 'success', 2500, 'top-end');
    };

    $scope.formataDataHora = function (data) {
        const date = moment(data, 'YYYY-MM-DD HH:mm:ss')
            .add(params.timeAdd, 'hours');

        return date.format('DDMMM HH[h]mm:ss');
    };

});
