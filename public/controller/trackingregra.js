app.controller('trackingRegraCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = {};
    $scope._listRegras = [];
    $scope._listRegrasBase = [];
    $scope._pesquisa = '';
    $scope.sortField = 'descricao';
    $scope.sortReverse = false;

    var modalInstance = undefined;

    function podeAcessarTrackingRegra(colaborador) {
        if (!colaborador) return false;
        var perfil = String(colaborador.perfil || '').toLowerCase();
        if (perfil === 'admin') return true;
        var mods = Array.isArray(colaborador.acesso_modulos) ? colaborador.acesso_modulos : [];
        return mods.some(function (m) {
            return String(m || '').toLowerCase() === 'trackingregra';
        });
    }

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta') || {};
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png';
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            var _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        }

        $scope._regConta = uteisService.normalizarConta($scope._regConta);
        $scope._regColaborador = uteisService.getCookie('_colaborador') || {};

        if (!podeAcessarTrackingRegra($scope._regColaborador)) {
            uteisService.onToast('Sem permissão para acessar Regras de Tracking.', 'error', 3000, 'top-end');
            window.location.href = '/start';
            return;
        }

        $scope.onCarregaRegistros();
    });

    $scope.onCarregaRegistros = async function () {
        await uteisService.getBase('/_bd?c=trackingregra&id_conta=' + $scope._regConta._id + '&_sort=descricao')
            .then(function (res) {
                var lista = Array.isArray(res) ? res : [];
                $scope._listRegras = lista;
                $scope._listRegrasBase = lista;
                $scope.$applyAsync();
            })
            .catch(function () {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    };

    $scope.onPesquisa = function () {
        var pesquisa = $scope._pesquisa
            ? $scope._pesquisa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            : '';

        if (!pesquisa) {
            $scope._listRegras = $scope._listRegrasBase;
            return;
        }

        $scope._listRegras = ($scope._listRegrasBase || []).filter(function (item) {
            var descricao = String(item.descricao || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return descricao.indexOf(pesquisa) !== -1;
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

    $scope.onTrackingRegra = async function (_acao, _edit) {
        setTimeout(function () {
            $scope.$apply(function () {
                $scope.funcaoLoc = _acao;
                $scope.editLoc = _edit;
            });
        }, 10);

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined;
            $scope.onCarregaRegistros();
            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;
            $scope.$applyAsync();
        } else {
            modalInstance = new bootstrap.Modal(document.getElementById('modalTrackingRegra'));
            modalInstance.show();
        }
    };
});
