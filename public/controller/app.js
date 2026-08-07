var app = angular
    .module('myApp', ['angularMoment', 'ngMask'])
    .factory('params', function () {

        // valores universais
        return {
            env: 'Modelo 16Apps',
            timeAdd: 0
        }

    });

app.controller('appCtrl', function ($scope, $http, $location, params, uteisService, $timeout) {

    $scope._regConta = undefined
    $scope._regColaborador = undefined



    $scope.$watch('$viewContentLoaded', async function () {
        this.options = {
            headers: { 'Content-Type': 'application/json' }
        };

        $scope.bleWidget = JSON.parse(localStorage.getItem('bleWidget')) || {
            gateway: '',
            minimizado: false,
            status: 'Parado',
            ultimaTag: '123',
            ultimaRssi: 0,
            ultimaData: '',
            total: 0
        };

        if ($scope.bleWidget.status == 'Ativo') {
            setTimeout(() => {
                // $scope.onLogs();
            }, 3000);
        }

        $scope.isActive = function (viewLocation) {
            const currentUrl = $location.absUrl();
            let url = currentUrl.split('/')
            return viewLocation === url[3];
        };

        $scope._regConta = uteisService.getCookie('_conta');
        $scope._regConta = uteisService.normalizarConta($scope._regConta);

   
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

    $scope.$watch('bleWidget', function (novo) {
        localStorage.setItem('bleWidget', JSON.stringify(novo));
    }, true);

    $scope.onLogs = async function () {

        let _regGateway = $scope._listRegsGateways.filter(g => g._id == $scope.bleWidget.gateway)[0];
        if (_regGateway) {
            const payload = {
                tokem: _regGateway.tokem,
                antena: '0',
                id_nivel_loc1: _regGateway.id_nivel_loc1,
                id_nivel_loc2: _regGateway.id_nivel_loc2,
                id_nivel_loc3: _regGateway.id_nivel_loc3,
                id_nivel_loc4: _regGateway.id_nivel_loc4,
                id_nivel_loc1_final: _regGateway.id_nivel_loc1_final,
                id_nivel_loc2_final: _regGateway.id_nivel_loc2_final,
                id_nivel_loc3_final: _regGateway.id_nivel_loc3_final,
                id_nivel_loc4_final: _regGateway.id_nivel_loc4_final
            };

            $http.post('/ble/start', payload).then((res) => {
                // $scope.bleWidget.status = 'Ativo';
                console.log(res.data);
            }).catch((err) => {
                // $scope.bleWidget.status = 'Parado';
                console.error(err);
            });
        }

        // Desconecta socket anterior se existir
        if ($scope.socket) {
            $scope.socket.disconnect();
            $scope.socket = null;
        }

        // Limpa leituras anteriores
        $scope._regLeituras = [];

        // Cria nova conexão socket
        $scope.socket = io(); // conexão padrão

        $scope.socket.on($scope.bleWidget.gateway, function (data) {
            try {
                // Se os dados vierem como string JSON, converte para objeto
                let leitura = typeof data === 'string' ? JSON.parse(data) : data;

                // Adiciona timestamp de recebimento
                leitura._timestamp_recebido = new Date().toISOString();

                $timeout(() => {
                    $scope.bleWidget.status = 'Ativo';
                    $scope.bleWidget.ultimaTag = leitura.tag;
                    $scope.bleWidget.ultimaRssi = leitura.rssi;
                    $scope.bleWidget.ultimaData = moment(leitura.data_leitura).format('HH[h]mm:ss');

                    // Mantém apenas os 50 últimos registros

                    // Adiciona no início da lista (mais recente primeiro)
                    $scope._regLeituras.unshift(leitura);

                    if ($scope._regLeituras.length > 50) {
                        $scope._regLeituras = $scope._regLeituras.slice(0, 50);
                    }
                }, 0);
            } catch (error) {
                console.error('Erro ao processar leitura:', error, data);
            }
        });

    };

    $scope.pararBleWidget = async function () {
        $scope.bleWidget.status = 'Parado';
        $scope.socket.disconnect();
        $scope.socket = null;

        $http.post('/ble/stop').then((res) => {
            $scope.bleWidget.status = 'Parado';
            console.log(res.data);
        }).catch((err) => {
            console.error(err);
        });

    };






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