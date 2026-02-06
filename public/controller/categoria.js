app.controller('categoriaCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._listCategorias = []
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
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
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