app.controller('relRegistrosCtrl', function ($scope, $http, params, uteisService) {

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

        let _url = '/_bd?c=registro&id_conta=' + $scope._regConta._id;
        _url += '&pop=id_gateway&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';
        _url += '&pop=id_categoria'
        _url += '&_sort=data_permanecia'

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

    $scope.formataDataHora = function (data) {
        const date = moment(data, 'YYYY-MM-DD HH:mm:ss')
            .subtract(3, 'hours'); // Remove 3 horas
    
        return date.format('DDMMM HH[h]mm');
    };
    

    
});