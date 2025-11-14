
app.controller('usersCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regUsuarios = []
    $scope._editUsuario = undefined;



    $scope.$watch('$viewContentLoaded', async function () {
        // alert('gabriel dumont')
        $scope._regConta = await uteisService.getCookie('16clin_conta')
        // console.log($scope._regConta)
        $scope.onCarregaUsuarios()
    });

    $scope.onCarregaUsuarios = async function () {

        await uteisService.getBase(`?c=users`)
            .then((res) => {
                console.log(res)
                $scope._regUsuarios = res;
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
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