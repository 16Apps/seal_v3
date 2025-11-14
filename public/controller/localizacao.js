app.controller('localizacaoCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._listLocalizacoes = []

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

        let _url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id 
        _url += '&id_nivel=null'
        _url += '&_sort=descricao'

        await uteisService.getBase(_url)
            .then((res) => {

                res.map((item) => {

                    item['_foto'] = '../assets/images/icon_cadastro.fw.png'

                    if (item.foto && !item.foto.includes('assets')) {
                        item._foto = uteisService.apiUrl_() + '/image/' + item.foto
                    };

                });


                $scope._listLocalizacoes = res
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    }


    $scope.onLocalizacao = async function (_acao, _edit) {

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
            modalInstance = new bootstrap.Modal(document.getElementById('modalLocalizacao'));
            modalInstance.show();
        }

    };
});