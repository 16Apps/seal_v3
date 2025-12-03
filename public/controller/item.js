app.controller('itemCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._listCategorias = []

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

        let _url = '/_bd?c=item&id_conta=' + $scope._regConta._id;
        _url += '&pop=id_categoria&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';

        await uteisService.getBase(_url)
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

    $scope.onItem = async function (_acao, _edit) {

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.onCarregaRegistros()
            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;

            $scope.$apply();

        } else {

            let _tratComponente = JSON.parse(JSON.stringify(_edit || {}));

            if (_acao == 'edit') {
                _tratComponente.id_categoria = _tratComponente.id_categoria._id
                _tratComponente.id_nivel_loc1 = _tratComponente.id_nivel_loc1 ? _tratComponente.id_nivel_loc1._id : null
                _tratComponente.id_nivel_loc2 = _tratComponente.id_nivel_loc2 ? _tratComponente.id_nivel_loc2._id : null
                _tratComponente.id_nivel_loc3 = _tratComponente.id_nivel_loc3 ? _tratComponente.id_nivel_loc3._id : null
                _tratComponente.id_nivel_loc4 = _tratComponente.id_nivel_loc4 ? _tratComponente.id_nivel_loc4._id : null
            };

            $scope.funcaoLoc = _acao;
            $scope.editLoc = _tratComponente;

            modalInstance = new bootstrap.Modal(document.getElementById('modalItem'));
            modalInstance.show();
        }

    };
});