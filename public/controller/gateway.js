app.controller('gatewayCtrl', function ($scope, $http, params, uteisService) {

    $scope._regConta = {};
    $scope._regColaborador = []
    $scope._listGateways = []
    $scope._pesquisa = '';
    $scope.sortField = 'descricao';
    $scope.sortReverse = false;

    var modalInstance = undefined;

    $scope.filtraGateway = function (item) {
        const q = ($scope._pesquisa || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
        if (!q) return true;

        const descricao = String(item.descricao || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        const tokem = String(item.tokem || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        return descricao.indexOf(q) !== -1 || tokem.indexOf(q) !== -1;
    };

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

        let _url = '/_bd?c=gateway&id_conta=' + $scope._regConta._id
        _url += '&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4'
        _url += '&_sort=descricao'

        await uteisService.getBase(_url)
            .then((res) => {

                res.map((item) => {

                    item['_foto'] = '../assets/images/icon_cadastro.fw.png'

                    if (item.foto && !item.foto.includes('assets')) {
                        item._foto = uteisService.apiUrl_() + '/image/' + item.foto
                    };

                    item._ultimoSinal = null;
                    const dados = Array.isArray(item.dados) ? item.dados : [];
                    if (dados.length) {
                        const ultimo = dados.reduce((acc, cur) => {
                            if (!acc) return cur;
                            return new Date(cur.data) > new Date(acc.data) ? cur : acc;
                        }, null);
                        if (ultimo) {
                            item._ultimoSinal = {
                                data: ultimo.data
                                    ? moment(ultimo.data).format('DD/MM/YYYY HH:mm')
                                    : '',
                                valor: ultimo.valor != null ? String(ultimo.valor) : '',
                                descricao: ultimo.descricao || ''
                            };
                        }
                    }

                    item._niveisTexto = $scope.textoNiveisGateway(item);

                });


                $scope._listGateways = res
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    };

    $scope.textoNiveisGateway = function (item) {
        if (!item || item.modo !== 'fixo') return '';

        const partes = [
            item.id_nivel_loc1,
            item.id_nivel_loc2,
            item.id_nivel_loc3,
            item.id_nivel_loc4
        ].map((n) => {
            if (!n) return '';
            if (typeof n === 'object') return n.descricao || '';
            return '';
        }).filter(Boolean);

        return partes.join(' · ');
    };


    $scope.sortBy = function (field) {
        if ($scope.sortField === field) {
            $scope.sortReverse = !$scope.sortReverse;
        } else {
            $scope.sortField = field;
            $scope.sortReverse = false;
        }
    };


    $scope.onGateway = async function (_acao, _edit) {

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
            modalInstance = new bootstrap.Modal(document.getElementById('modalGateway'));
            modalInstance.show();
        }

    };
});