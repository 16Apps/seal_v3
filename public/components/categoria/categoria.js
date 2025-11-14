app.component('categoria', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this

    $ctrl._editCategoria = {};
    $ctrl._regConta = {};

    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta');
    };

    $ctrl.$onChanges = function (changes) {


      if ($ctrl.funcao == 'add') {
        $ctrl.onEditar(undefined)
      } else if ($ctrl.funcao == 'edit') {
        $ctrl.onEditar($ctrl.edit)
      }

    };

    $ctrl.onEditar = async function (reg) {

      if (reg == undefined) {

        $ctrl._editCategoria = {

          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          descricao: '',
          ean: '',
          observacao: '',
          foto: '',
          _foto: '../assets/images/icon_cadastro.fw.png',
          labelInf1: '',
          labelInf2: '',
          labelInf3: '',
          labelInf4: '',
          labelInf5: '',
          estoque_minimo: 0,
          estoque_maximo: 0,
          valor: '0',
          id_nivel_cat1: '',
          id_nivel_cat2: '',
          id_nivel_cat3: '',
          id_nivel_cat4: '',
        };

      } else {

        $ctrl._editCategoria = reg;
        $ctrl._editCategoria.ativo = "" + $ctrl._editCategoria.ativo;

        $ctrl._editCategoria['_foto'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editCategoria.foto) {
          $ctrl._editCategoria._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editCategoria.foto
        };

      };

    };

    $ctrl.onGetFoto = function () {

      document.getElementById('imgLogo').click();
      document.getElementById('imgLogo').onchange = function () {

        $ctrl._editCategoria._foto = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editCategoria._foto = e.target.result;
                  $ctrl._editCategoria.foto = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }

      };
    };


    $ctrl.onSalvar = function () {

      if ($ctrl._editCategoria.descricao == '') {
        uteisService.onToast('Informe uma descrição para o Gateway.', 'warning', 3000, 'top-end');
        return;
      };

      uteisService.patchBase('/categoria', $ctrl._editCategoria)
        .then((res) => {
          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          $ctrl.onFechar();
        })

    };

    $ctrl.fechar = function () {
      // dispara o callback do pai
      $ctrl.onFechar();
    };

  },
  templateUrl: 'components/categoria/categoria.html'
});