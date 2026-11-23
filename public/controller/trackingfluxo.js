app.controller('trackingFluxoCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = {};
    $scope._listFluxos = [];
    $scope._listFluxosBase = [];
    $scope._pesquisa = '';
    $scope.sortField = 'descricao';
    $scope.sortReverse = false;

    var modalInstance = undefined;

    function podeAcessarTrackingFluxo(colaborador) {
        if (!colaborador) return false;
        var perfil = String(colaborador.perfil || '').toLowerCase();
        if (perfil === 'admin') return true;
        var mods = Array.isArray(colaborador.acesso_modulos) ? colaborador.acesso_modulos : [];
        return mods.some(function (m) {
            var v = String(m || '').toLowerCase();
            return v === 'trackingfluxo' || v === 'tracking';
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

        if (!podeAcessarTrackingFluxo($scope._regColaborador)) {
            uteisService.onToast('Sem permissão para acessar Fluxos de Tracking.', 'error', 3000, 'top-end');
            window.location.href = '/start';
            return;
        }

        $scope.onCarregaRegistros();
    });

    $scope.onCarregaRegistros = async function () {
        var url = '/_bd?c=trackingfluxo&id_conta=' + $scope._regConta._id
            + '&pop=id_categoria&_sort=descricao';

        await uteisService.getBase(url)
            .then(function (res) {
                var lista = Array.isArray(res) ? res : [];
                lista.forEach(function (item) {
                    item._qtdEtapas = Array.isArray(item.etapas) ? item.etapas.length : 0;
                    item._categoriaDesc = (item.id_categoria && item.id_categoria.descricao)
                        ? item.id_categoria.descricao
                        : '—';
                });
                $scope._listFluxos = lista;
                $scope._listFluxosBase = lista;
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
            $scope._listFluxos = $scope._listFluxosBase;
            return;
        }

        $scope._listFluxos = ($scope._listFluxosBase || []).filter(function (item) {
            var descricao = String(item.descricao || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            var cat = String(item._categoriaDesc || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return descricao.indexOf(pesquisa) !== -1 || cat.indexOf(pesquisa) !== -1;
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

    var _fluxoBindTimer = null;

    $scope.onTrackingFluxo = async function (_acao, _edit) {
        // Cancela bind atrasado anterior (evita fechar sobrescrever o próximo abrir)
        if (_fluxoBindTimer) {
            clearTimeout(_fluxoBindTimer);
            _fluxoBindTimer = null;
        }

        if (modalInstance != undefined) {
            modalInstance.hide();
            modalInstance = undefined;
            $scope.onCarregaRegistros();
            $scope.funcaoLoc = '';
            $scope.editLoc = undefined;

            _fluxoBindTimer = setTimeout(function () {
                _fluxoBindTimer = null;
                $scope.$applyAsync(function () {
                    $scope.funcaoLoc = '';
                    $scope.editLoc = undefined;
                });
            }, 10);

            $scope.$applyAsync();
        } else {
            modalInstance = new bootstrap.Modal(document.getElementById('modalTrackingFluxo'));
            modalInstance.show();

            _fluxoBindTimer = setTimeout(function () {
                _fluxoBindTimer = null;
                $scope.$applyAsync(function () {
                    $scope.funcaoLoc = _acao;
                    $scope.editLoc = _edit;
                });
            }, 10);
        }
    };
});
