var app = angular
    .module('myApp', ['angularMoment', 'ngMask'])
    .factory('params', function () {

        // valores universais
        return {
            env: 'Modelo 16Apps'
        }

    });

app.controller('showRoomCtrl', function ($scope, $http, $location, params, uteisService, $timeout) {

    var modalInstance = undefined;
    $scope._modoCadastro = "solucoes"
    $scope._filtroCategoria = ''

    $scope.$watch('$viewContentLoaded', async function () {
        this.options = {
            headers: { 'Content-Type': 'application/json' }
        };

        $scope.isActive = function (viewLocation) {
            const currentUrl = $location.absUrl();
            let url = currentUrl.split('/')
            return viewLocation === url[3];
        };

        $scope.onCarregaCategorias();
        $scope.onCarregaSolucoes();
        // $scope.onEditCategoria(undefined)

        // $timeout(function () {
        //     var $grid = $('.grid').isotope({
        //         itemSelector: '.templatemo-item-col',
        //         layoutMode: 'fitRows'
        //     });

        //     // Clique nos filtros
        //     $('.filters li').on('click', function () {
        //         $('.filters li').removeClass('active');
        //         $(this).addClass('active');

        //         let value = $(this).attr('data-filter');
        //         $grid.isotope({ filter: value });
        //     });
        // }, 500); // espera Angular criar os elementos

    });

    $scope.onItem = async function () {

        $scope.onEditSolucao(undefined)
        $scope.onCarregaCategorias();

        modalInstance = new bootstrap.Modal(document.getElementById('modalItem'));
        modalInstance.show();

    };

    $scope.onFecharItem = function () {
        if (modalInstance) {
            modalInstance.hide();
        }
    };

    $scope.onMudaModulo = function (_modulo) {

        $scope._modoCadastro = _modulo;
        if (_modulo == 'categorias') {
            $scope.onEditCategoria(undefined)
            $scope.onCarregaCategorias();
        } else {
            $scope.onEditSolucao(undefined)
            $scope.onCarregaSolucoes()
        };
    }

    //Módulo Categorias

    $scope.onCarregaCategorias = async function () {

        let _url = '/_bd?c=sr_categorias'

        await uteisService.getBase(_url)
            .then((res) => {

                res.map((item) => {

                    item['_icown'] = '../assets/images/icon_cadastro.fw.png'

                    if (item.icone && !item.icone.includes('assets')) {
                        item._icone = uteisService.apiUrl_() + '/image/' + item.icone
                    };

                });


                $scope._listCategorias = res
                // alert(res.length)
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    };

    $scope.onEditCategoria = function (_reg) {

        if (_reg == undefined) {
            $scope._editCategoria = {
                _id: uteisService.onGetID(),
                titulo: '',
                descricao: '',
                icone: '',
                _icone: '../assets/images/icon_cadastro.fw.png',
                tag: '',
            };
        } else {

            $scope._editCategoria = JSON.parse(JSON.stringify(_reg));

            $scope._editCategoria['_icone'] = '../assets/images/icon_cadastro.fw.png'
            if ($scope._editCategoria.icone) {
                $scope._editCategoria._icone = uteisService.apiUrl_() + '/image/' + $scope._editCategoria.icone
            };


        }
    };

    $scope.onSalvarCategoria = function () {

        if ($scope._editCategoria.titulo == '') {
            uteisService.onToast('Informe um título', 'warning', 3000, 'top-end');
            return;
        };

        uteisService.patchBase('/sr_categorias', $scope._editCategoria)
            .then((res) => {
                uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
                $scope.onCarregaCategorias();
                $scope.onEditCategoria(undefined)
            })
    };


    $scope.onGetFoto = function () {

        document.getElementById('imgLogo').click();
        document.getElementById('imgLogo').onchange = function () {

            $scope._editItem._foto = "assets/images/carregando_icon.gif";

            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {

                    $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $scope.options)
                        .then(function (res) {
                            $timeout(() => {
                                $scope._editItem._foto = e.target.result;
                                $scope._editItem.foto = res.data[0].id_foto
                            }, 2000)

                        }, function (error) { });

                };
                reader.readAsDataURL(file);
            };
        };
    };

    //Final Módulo Categorias

    //Módulo Soluçoes
    $scope.onCarregaSolucoes = async function () {

        let _url = '/_bd?c=sr_solucoes'
        _url += '&pop=id_categoria'

        await uteisService.getBase(_url)
            .then((res) => {

                res.map((item) => {

                    item['_icone'] = '../assets/images/icon_cadastro.fw.png'
                    if (item.icone && !item.icone.includes('assets')) {
                        item._icone = uteisService.apiUrl_() + '/image/' + item.icone
                    };

                    item['_banner'] = '../assets/images/icon_cadastro.fw.png'
                    if (item.banner && !item.banner.includes('assets')) {
                        item._banner = uteisService.apiUrl_() + '/image/' + item.banner
                    };

                });

                $scope._listSolucoes = res
                console.log(JSON.stringify(res))
                $scope.$apply();
            })
            .catch((error) => {
                uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
            });
    };

    $scope.onFiltraSolucoes = function (_id) {
        $scope._filtroCategoria = _id
        $scope.$apply();
    }


    $scope.onEditSolucao = function (_reg) {

        if (_reg == undefined) {
            $scope._editSolucao = {
                _id: uteisService.onGetID(),
                id_categoria: '',
                titulo: '',
                descricao: '',
                link: '',
                link_apresentacao: '',
                icone: '',
                _icone: '../assets/images/icon_cadastro.fw.png',
                banner: '',
                _banner: '../assets/images/icon_cadastro.fw.png',
                imagens: [],
                videos: []
            };

        } else {

            $scope._editSolucao = JSON.parse(JSON.stringify(_reg));
            $scope._editSolucao.id_categoria = _reg.id_categoria._id

            $scope._editSolucao['_icone'] = '../assets/images/icon_cadastro.fw.png'
            if ($scope._editSolucao.icone) {
                $scope._editSolucao._icone = uteisService.apiUrl_() + '/image/' + $scope._editSolucao.icone
            };

            $scope._editSolucao['_banner'] = '../assets/images/icon_cadastro.fw.png'
            if ($scope._editSolucao.banner) {
                $scope._editSolucao._banner = uteisService.apiUrl_() + '/image/' + $scope._editSolucao.banner
            };


        }
    };

    $scope.onSalvarSolucao = function () {

        if ($scope._editSolucao.id_categoria == '') {
            uteisService.onToast('Selecione uma Categoria', 'warning', 3000, 'top-end');
            return;
        };

        if ($scope._editSolucao.titulo == '') {
            uteisService.onToast('Informe um título', 'warning', 3000, 'top-end');
            return;
        };


        if ($scope._editSolucao.descricao == '') {
            uteisService.onToast('É necessário ter uma descrição da solução.', 'warning', 3000, 'top-end');
            return;
        };

        uteisService.patchBase('/sr_solucoes', $scope._editSolucao)
            .then((res) => {
                uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
                $scope.onCarregaSolucoes();
                $scope.onEditSolucao(undefined)
            })
    };

    $scope.onGetIconSolucao = function () {

        document.getElementById('imgIconeSolucao').click();
        document.getElementById('imgIconeSolucao').onchange = function () {

            $scope._editSolucao._icone = "assets/images/carregando_icon.gif";

            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {

                    $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $scope.options)
                        .then(function (res) {
                            $timeout(() => {
                                $scope._editSolucao._icone = e.target.result;
                                $scope._editSolucao.icone = res.data[0].id_foto
                            }, 2000)

                        }, function (error) { });

                };
                reader.readAsDataURL(file);
            };
        };
    };

    $scope.onGetBannerSolucao = function () {

        document.getElementById('imgBannerSolucao').click();
        document.getElementById('imgBannerSolucao').onchange = function () {

            $scope._editSolucao._banner = "assets/images/carregando_icon.gif";

            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {

                    $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $scope.options)
                        .then(function (res) {
                            $timeout(() => {
                                $scope._editSolucao._banner = e.target.result;
                                $scope._editSolucao.banner = res.data[0].id_foto
                            }, 2000)

                        }, function (error) { });

                };
                reader.readAsDataURL(file);
            };
        };
    };

    $scope.abrirLink = function (item) {
        if (!item.link) return;
        window.open(item.link, '_blank');

    };

    //Final Módulo Soluçoes

});