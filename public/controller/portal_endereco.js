app.controller('portalEnderecoCtrl', function ($scope, $http, $timeout, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = [];
    $scope._carregando = false;

    $scope._ui = {
        view: 'lista',
        atualizacaoAutomatica: true,
        todosLocais: true
    };

    $scope._kpis = [];
    $scope._enderecos = [];

    var _timerAuto = null;

    function formatarNumero(n) {
        var num = Number(n) || 0;
        return num.toLocaleString('pt-BR');
    }

    function montarKpis(kpis) {
        kpis = kpis || {};
        return [
            {
                valor: formatarNumero(kpis.total_itens),
                label: 'Itens localizados',
                icon: 'bi-box-seam',
                iconClass: 'bg-soft-primary'
            },
            {
                valor: formatarNumero(kpis.total_enderecos),
                label: 'Endereços com itens',
                icon: 'bi-geo-alt',
                iconClass: 'bg-soft-info'
            },
            {
                valor: kpis.tempo_medio_permanencia || '—',
                label: 'Tempo médio de permanência',
                icon: 'bi-clock',
                iconClass: 'bg-soft-warning'
            },
            {
                valor: formatarNumero(kpis.movimentacoes_hoje),
                label: 'Movimentações hoje',
                icon: 'bi-arrow-left-right',
                iconClass: 'bg-soft-success'
            }
        ];
    }

    function urlFoto(foto) {
        if (!foto) return '';
        var f = String(foto);
        if (f.indexOf('http') === 0 || f.indexOf('assets/') === 0 || f.indexOf('../') === 0) {
            return f;
        }
        return uteisService.apiUrl_() + '/image/' + f;
    }

    $scope.onCarregaEnderecos = async function () {
        if (!$scope._regConta || !$scope._regConta._id) return;

        $scope._carregando = true;
        try {
            var url = '/portal/itens-por-endereco?id_conta=' + encodeURIComponent($scope._regConta._id);
            var res = await uteisService.getBase(url).catch(function () { return null; });

            if (!res || res.ok === false) {
                $scope._kpis = montarKpis({});
                $scope._enderecos = [];
                uteisService.onToast('Não foi possível carregar os itens por endereço.', 'warning', 2500, 'top-end');
                return;
            }

            $scope._kpis = montarKpis(res.kpis);

            $scope._enderecos = (res.enderecos || []).map(function (loc, idx) {
                loc.aberto = idx === 0;
                loc.limiteExibicao = loc.limiteExibicao || 7;
                loc.itens = (loc.itens || []).map(function (it) {
                    it.foto = urlFoto(it.foto);
                    return it;
                });
                return loc;
            });
        } finally {
            $scope._carregando = false;
            $timeout(function () { }, 0);
        }
    };

    $scope.onToggleEndereco = function (loc) {
        if (!loc) return;
        loc.aberto = !loc.aberto;
    };

    $scope.onVerTodos = function (loc) {
        if (!loc) return;
        loc.limiteExibicao = (loc.itens || []).length;
    };

    function iniciarAutoUpdate() {
        if (_timerAuto) {
            $timeout.cancel(_timerAuto);
            _timerAuto = null;
        }
        if (!$scope._ui.atualizacaoAutomatica) return;
        _timerAuto = $timeout(async function tick() {
            await $scope.onCarregaEnderecos();
            if ($scope._ui.atualizacaoAutomatica) {
                _timerAuto = $timeout(tick, 30000);
            }
        }, 30000);
    }

    $scope.$watch('_ui.atualizacaoAutomatica', function (novo) {
        if (novo) iniciarAutoUpdate();
        else if (_timerAuto) {
            $timeout.cancel(_timerAuto);
            _timerAuto = null;
        }
    });

    $scope.$on('$destroy', function () {
        if (_timerAuto) $timeout.cancel(_timerAuto);
    });

    $scope.$watch('$viewContentLoaded', async function () {
        $scope._regConta = uteisService.getCookie('_conta') || {};
        $scope._regConta = uteisService.normalizarConta($scope._regConta);
        $scope._regColaborador = uteisService.getCookie('_colaborador') || [];
        await $scope.onCarregaEnderecos();
        iniciarAutoUpdate();
    });

});
