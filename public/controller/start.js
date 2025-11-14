
app.controller('startCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    var modalInstance = undefined;

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };

        $scope._regColaborador = uteisService.getCookie('_colaborador');

        $scope.onChecaCadastros()
    });


    $scope.onChecaCadastros = async function () {

        await uteisService.getBase('/_bd?c=localizacao&id_conta=' + $scope._regConta._id + '&_sort=createdAt')
            .then((res) => {
                $scope._regLocalizacao = res.filter((item) => item.id_nivel == null);
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

        await uteisService.getBase('/_bd?c=item&id_conta=' + $scope._regConta._id + '&_sort=createdAt')
            .then((res) => {
                $scope._regItem = res;
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

        await uteisService.getBase('/_bd?c=gateway&id_conta=' + $scope._regConta._id + '&_sort=createdAt')
            .then((res) => {
                $scope._regGateway = res;
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

        await uteisService.getBase('/_bd?c=alerta&id_conta=' + $scope._regConta._id + '&_sort=createdAt')
            .then((res) => {
                $scope._regAlerta = res;
                $scope.$apply();

            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

        $scope.$apply();

    };

    $scope.onLocalizacao = async function (_acao, _edit) {

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;
            $scope.onChecaCadastros()

            $scope.$apply();
        } else {

            $scope.funcaoLoc = _acao;
            $scope.editLoc = _edit;

            modalInstance = new bootstrap.Modal(document.getElementById('modalLocalizacao'));
            modalInstance.show();
        }

    };

    $scope.onItem = async function (_acao, _edit) {

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;
            $scope.onChecaCadastros()

            $scope.$apply();
        } else {

            $scope.funcaoLoc = _acao;
            $scope.editLoc = _edit;

            modalInstance = new bootstrap.Modal(document.getElementById('modalItem'));
            modalInstance.show();
        };

    };

    $scope.onGateway = async function (_acao, _edit) {

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;
            $scope.onChecaCadastros()

            $scope.$apply();
        } else {

            $scope.funcaoLoc = _acao;
            $scope.editLoc = _edit;

            modalInstance = new bootstrap.Modal(document.getElementById('modalGateway'));
            modalInstance.show();
        }

    };

    $scope.onAlerta = async function (_acao, _edit) {

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined

            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;
            $scope.onChecaCadastros()

            $scope.$apply();
        } else {

            $scope.funcaoLoc = _acao;
            $scope.editLoc = _edit;

            modalInstance = new bootstrap.Modal(document.getElementById('modalAlerta'));
            modalInstance.show();
        }

    };

    $scope.onEditar = async function (reg) {
        if (reg == undefined) {

            $scope._editUsuario = {
                _id: uteisService.onGetID(),
                nome: "",
                email: "",
                senha: "",
                tipo: "Aluno",
                fotoPerfil: "",  // Referência a GridFS
                biografia: "",
                instituicao: "",
                seguidores: [], // Relacionamento entre usuários
                seguindo: [],
                dataCadastro: "",
                ultimaAtividade: ""
            };
        } else {
            $scope._editUsuario = JSON.parse(JSON.stringify(reg))
        };
        $scope.$apply();
    };

    $scope.onCadastrar = async function () {
        var modal = document.getElementById('exampleModal');
        console.log(modal)
        var modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) {
            modalInstance.hide();
        }
        return

        uteisService.patchBase('/users', $scope._editUsuario)
            .then((res) => {
                uteisService.onToast('Usuário registrado!', 'info', 2000, 'top-end');
                $scope.onCarregaUsuarios()
                $scope._editUsuario = undefined;
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    };

    $scope.onRemove = async function (reg) {

        uteisService.delBase('/filiado/_id/' + reg._id)
            .then((res) => {

                uteisService.onToast('Ponto removido!', 'info', 2000, 'top-end');
                $scope.onCarregaUsuarios()
                $scope.$apply();

            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    };
});