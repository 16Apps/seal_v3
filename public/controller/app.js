var app = angular
    .module('myApp', ['angularMoment', 'ngMask'])
    .factory('params', function () {

        // valores universais
        return {
            env: 'Modelo 16Apps'
        }

    });

app.controller('appCtrl', function ($scope, $http, $location, params, uteisService) {

    $scope._regConta = undefined
    $scope._regColaborador = undefined

    $scope.$watch('$viewContentLoaded', async function () {
        this.options = {
            headers: { 'Content-Type': 'application/json' }
        };

        $scope.isActive = function (viewLocation) {
            const currentUrl = $location.absUrl();
            let url = currentUrl.split('/')
            return viewLocation === url[3];
        };


        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png'
        if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
            let _url = uteisService.apiUrl_();
            $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
        };

        $scope._regColaborador = uteisService.getCookie('_colaborador')
        const nome = $scope._regColaborador?.nome || '';

        let primeira = ''
        let ultima = ''

        if (!nome.trim()) return '';
        const partes = nome.trim().split(/\s+/);

        if (partes.length === 1) {
            primeira = partes[0].charAt(0).toUpperCase();
        }
        primeira = partes[0].charAt(0).toUpperCase();
        
        if (partes.length > 1) {
            ultima = partes[partes.length - 1].charAt(0).toUpperCase();
        }

        $scope._regColaborador['_nomeAbr'] = primeira + ultima

        $scope.onCarregaRegsColaborador();
        $scope.onCarregaRegsGateways();

    });

    $scope.onCarregaRegsColaborador = async function () {

        let _url = '/_bd?c=registro_colaborador&id_conta=' + $scope._regConta._id;
        _url += '&pop=id_colaborador_ident&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';
        _url += '&_sort=updatedAt'
        await uteisService.getBase(_url)
            .then((res) => {

                res = res.filter((item) => item.id_colaborador_ident)

                res.map((item) => {

                    item.id_colaborador_ident['_foto'] = '../assets/images/icon_avatar.png'

                    if (item.id_colaborador_ident.foto && !item.id_colaborador_ident.foto.includes('assets')) {
                        item.id_colaborador_ident._foto = uteisService.apiUrl_() + '/image/' + item.id_colaborador_ident.foto
                    };

                });

                $scope._listRegsColaborador = res
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.' + error, 'error', 5000, 'top-end');
            });

    };

    $scope.onCarregaRegsGateways = async function () {

        const agora = new Date();

        let _url = '/_bd?c=gateway&id_conta=' + $scope._regConta._id
        _url += '&_sort=updatedAt'

        await uteisService.getBase(_url)
            .then((res) => {

                res.map((item) => {

                    item['_foto'] = '../assets/images/icon_cadastro.fw.png'

                    if (item.foto && !item.foto.includes('assets')) {
                        item._foto = uteisService.apiUrl_() + '/image/' + item.foto
                    };

                    // ⏱️ Verifica tempo desde o último update
                    if (item.updatedAt) {
                        const diffSeg = (agora - new Date(item.updatedAt)) / 1000; // diferença em segundos
                        item.sem_conexao = diffSeg > 10; // mais de 10 segundos → sem conexão
                    } else {
                        item.sem_conexao = true; // sem timestamp → assume desconectado
                    }

                });


                $scope._listRegsGateways = res
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });

    }


    $scope.formataDataHora = function (data) {
        const date = moment(data, 'YYYY-MM-DD HH:mm:ss'); // Parse the complete date and time
        return date.format('DDMMM HH[h]mm'); // Format the date and time
    };


    $scope._onMessage = async function () {

        // uteisService.onMsgBox('Olá','teste','error')
        uteisService.onQuestion('Está tudo certo...', 'info', 2000, 'top-end')

    };

});