app.controller('categoriaCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._listCategorias = []
    $scope._listCategoriasBase = []
    $scope._pesquisa = ''
    $scope.sortField = 'descricao';
    $scope.sortReverse = false;

    var modalInstance = undefined;

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };

        $scope._regConta = uteisService.normalizarConta($scope._regConta);

        $scope._regColaborador = uteisService.getCookie('_colaborador');

        $scope.onCarregaRegistros()
    });

    $scope.onCarregaRegistros = async function () {

        await uteisService.getBase('/_bd?c=categoria&id_conta=' + $scope._regConta._id + '&_sort=descricao')
            .then((res) => {

                res.map((item) => {

                    item['_foto'] = '../assets/images/icon_cadastro.fw.png'

                    if (item.foto && !item.foto.includes('assets')) {
                        item._foto = uteisService.apiUrl_() + '/image/' + item.foto
                    };

                });


                $scope._listCategorias = res
                $scope._listCategoriasBase = res
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
            $scope._listCategorias = $scope._listCategoriasBase.filter((item) => {

                const norm = (v) =>
                    (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

                const descricao = norm(item.descricao);
                const ean = norm(item.ean);
                const labelInf1 = norm(item.labelInf1);
                const labelInf2 = norm(item.labelInf2);
                const labelInf3 = norm(item.labelInf3);
                const labelInf4 = norm(item.labelInf4);
                const labelInf5 = norm(item.labelInf5);
                const valorLabelInf1 = norm(item.valor_labelInf1);
                const valorLabelInf2 = norm(item.valor_labelInf2);
                const valorLabelInf3 = norm(item.valor_labelInf3);
                const valorLabelInf4 = norm(item.valor_labelInf4);
                const valorLabelInf5 = norm(item.valor_labelInf5);

                return (
                    descricao.includes(pesquisa) ||
                    ean.includes(pesquisa) ||
                    labelInf1.includes(pesquisa) ||
                    labelInf2.includes(pesquisa) ||
                    labelInf3.includes(pesquisa) ||
                    labelInf4.includes(pesquisa) ||
                    labelInf5.includes(pesquisa) ||
                    valorLabelInf1.includes(pesquisa) ||
                    valorLabelInf2.includes(pesquisa) ||
                    valorLabelInf3.includes(pesquisa) ||
                    valorLabelInf4.includes(pesquisa) ||
                    valorLabelInf5.includes(pesquisa)
                );
            });

        } else {
            $scope._listCategorias = $scope._listCategoriasBase;
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
        const lista = Array.isArray($scope._listCategorias) ? $scope._listCategorias.slice() : [];
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
            'Descricao',
            'EAN',
            'Label 1', 'Valor 1',
            'Label 2', 'Valor 2',
            'Label 3', 'Valor 3',
            'Label 4', 'Valor 4',
            'Label 5', 'Valor 5'
        ];

        const escapeCSV = (valor) => {
            const v = valor == null ? '' : String(valor);
            const precisaAspas = /[";\r\n]/.test(v);
            const escapado = v.replace(/"/g, '""');
            return precisaAspas ? `"${escapado}"` : escapado;
        };

        const linhas = lista.map((item) => {
            return [
                item.descricao || '',
                item.ean || '',
                item.labelInf1 || '', item.valor_labelInf1 || '',
                item.labelInf2 || '', item.valor_labelInf2 || '',
                item.labelInf3 || '', item.valor_labelInf3 || '',
                item.labelInf4 || '', item.valor_labelInf4 || '',
                item.labelInf5 || '', item.valor_labelInf5 || ''
            ].map(escapeCSV).join(';');
        });

        const conteudo = [cabecalho.map(escapeCSV).join(';'), ...linhas].join('\r\n');
        const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const stamp = moment().format('YYYYMMDD_HHmmss');
        const nomeArquivo = 'categorias_' + stamp + '.csv';

        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        uteisService.onToast('Arquivo exportado: ' + nomeArquivo, 'success', 2500, 'top-end');
    };

    $scope.onImportar = function () {
        const off = bootstrap.Offcanvas.getOrCreateInstance('#offcanvasImportar');
        off.show();
    };

    // ======================================================
    // 1️⃣ Ler e converter o CSV para JSON
    // ======================================================
    $scope.onLerArquivoImportacao = function (event) {
        const file = event.target.files[0];
        if (!file) return alert('Selecione um arquivo CSV primeiro.');

        const reader = new FileReader();

        reader.onload = function (e) {

            // Monta o JSON final no formato esperado
            let dados = []

            const csv = e.target.result;
            const linhas = csv.split(/\r?\n/).filter(l => l.trim() !== '');

            linhas.map((item, index,) => {
                if (index > 0) {
                    let coluna = item.split(';')

                    dados.push({
                        id_conta: $scope._regConta._id,
                        ativo: '1',
                        descricao: coluna[0],
                        ean: coluna[1],
                        observacao: '',
                        foto: '',
                        _foto: '../assets/images/icon_cadastro.fw.png',
                        labelInf1: coluna[2],
                        labelInf2: coluna[3],
                        labelInf3: coluna[4],
                        labelInf4: coluna[5],
                        labelInf5: coluna[6],
                        valor_labelInf1: coluna[7],
                        valor_labelInf2: coluna[8],
                        valor_labelInf3: coluna[9],
                        valor_labelInf4: coluna[10],
                        valor_labelInf5: coluna[11],
                        estoque_minimo: 0,
                        estoque_maximo: 0,
                        valor: '0',
                        id_nivel_cat1: '',
                        id_nivel_cat2: '',
                        id_nivel_cat3: '',
                        id_nivel_cat4: '',
                    })

                }

            })


            // Extrai cabeçalhos
            const cabecalho = linhas[0].split(',').map(h => h.trim());

            // Mapeia as linhas restantes para objetos
            const itens = linhas.slice(1).map(linha => {
                const cols = linha.split(',');
                const obj = {};
                cabecalho.forEach((key, i) => {
                    obj[key.trim()] = (cols[i] || '').trim();
                });
                return obj;
            });


            // Atualiza o escopo
            $scope.$apply(() => {
                $scope._dadosImportacao = dados;
            });
            console.log('✅ JSON gerado:', dados);
            uteisService.onToast('Arquivo lido! Pronto para importar.', 'success', 2000, 'top-end');
        };

        reader.readAsText(file, 'UTF-8');
    };

    // -------------------------------------------------------------
    // 2️⃣ Enviar JSON para o endpoint via POST
    // -------------------------------------------------------------
    $scope.onExecutarImportacao = async function () {
        if (!$scope._dadosImportacao) {
            uteisService.onToast('Nenhum arquivo foi lido, ainda.', 'info', 2000, 'top-end');
            return;
        };

        uteisService.posthBase('/categoria/importar', $scope._dadosImportacao).then((res) => {
            uteisService.onToast('Tudo importado, com sucesso!', 'success', 2000, 'top-end');

            // atualiza os valores dos itens, com base nas categorias
            uteisService.getBase('/_bd/item/preencher-inf-complementares?id_conta=' + $scope._regConta._id)

            $scope.$apply(() => {
                $scope.onCarregaRegistros();
                $scope._dadosImportacao = [];
            });
        })

    };


    $scope.onCategoria = async function (_acao, _edit) {

        setTimeout(() => {
            $scope.$apply(() => {       // força o Angular a perceber a mudança
                $scope.funcaoLoc = _acao;
                $scope.editLoc = _edit;
            });
        }, 10);

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.onCarregaRegistros()
            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;

            $scope.$apply();
        } else {
            modalInstance = new bootstrap.Modal(document.getElementById('modalCategoria'));
            modalInstance.show();
        }

    };
});