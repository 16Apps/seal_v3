app.controller('itensAssociadosCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._listItens = []
    $scope._listItensBase = []
    $scope._pesquisa = ''
    $scope.sortField = 'categoria.descricao';
    $scope.sortReverse = false;

    var modalInstance = undefined;

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };

        $scope._regColaborador = uteisService.getCookie('_colaborador');

        $scope.onCarregaRegistros()
    });

    $scope.onCarregaRegistros = async function () {

        let _url = '/relatorio/associacao-reg/' + $scope._regConta._id;

        await uteisService.getBase(_url)
            .then((res) => {

                $scope._listItens = res
                $scope._listItensBase = res

                console.log(JSON.stringify(res))
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    };

    $scope.onPesquisa = async function () {

        const pesquisa = $scope._pesquisa
            ? $scope._pesquisa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            : '';

        if (pesquisa !== '') {
            $scope._listItens = $scope._listItensBase.filter((item) => {

                const norm = (v) =>
                    (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

                // Campos da pesquisa
                const catDesc = norm(item.id_categoria?.descricao);
                const catItemDesc = norm(item.id_categoria_reg1?.descricao);
                const tag = norm(item.tag);
                const id_externo = norm(item.id_externo);
                const nv1Desc = norm(item.id_nivel_loc1?.descricao);
                const nv2Desc = norm(item.id_nivel_loc2?.descricao);
                const nv3Desc = norm(item.id_nivel_loc3?.descricao);
                const nv4Desc = norm(item.id_nivel_loc4?.descricao);

                const inf1 = norm(item.inf_compl1);
                const inf2 = norm(item.inf_compl2);
                const inf3 = norm(item.inf_compl3);
                const inf4 = norm(item.inf_compl4);

                return (
                    catDesc.includes(pesquisa) ||
                    catItemDesc.includes(pesquisa) ||
                    id_externo.includes(pesquisa) ||
                    tag.includes(pesquisa) ||
                    inf1.includes(pesquisa) ||
                    inf2.includes(pesquisa) ||
                    inf3.includes(pesquisa) ||
                    inf4.includes(pesquisa)||
                    nv1Desc.includes(pesquisa)||
                    nv2Desc.includes(pesquisa)||
                    nv3Desc.includes(pesquisa)||
                    nv4Desc.includes(pesquisa)
                );
            });

        } else {
            $scope._listItens = $scope._listItensBase;
        }

    }


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
        const nomeArquivo = 'itens_associados_' + stamp + '.csv';

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
            .add(params.timeAdd, 'hours'); // Remove 3 horas
    
        return date.format('DDMMM HH[h]mm:ss');
    };
    

    
});