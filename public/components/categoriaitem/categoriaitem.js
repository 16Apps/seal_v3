app.component('categoriaitem', {
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

    $ctrl._regAddAssociacao = {
      id_ref: 'categoriaitem',
      id_item: '',
      id_categoria: '',
      quantidade: 1
    };

    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta');
      $ctrl._regConta = uteisService.normalizarConta($ctrl._regConta);
    };

    $ctrl.$onChanges = function (changes) {

      if ($ctrl.funcao == 'add') {
        $ctrl.onEditar(undefined)
      } else if ($ctrl.funcao == 'edit') {
        $ctrl.onEditar($ctrl.edit)
      };

    };

    $ctrl.onEditar = async function (reg) {

      if (reg == undefined) {

        $ctrl._editCategoria = {
          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          descricao: '',
          foto: '',
          _foto: '../assets/images/icon_cadastro.fw.png',
          codif_epc: 'manual',
          codif_epc_inicial: '',
          codif_epc_comprimento: '',
          tag: '',
          observacao: ''
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
        uteisService.onToast('Informe uma descrição para o Item.', 'warning', 3000, 'top-end');
        return;
      };

      uteisService.patchBase('/categoria_item', $ctrl._editCategoria)
        .then((res) => {

          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          $ctrl.onFechar();
        })

    };

    $ctrl.onExcluir = function () {

      uteisService.onQuestion("Atenção!", "Deseja realmente excluir esse Registro?")
        .then(async (res) => {
          if (res) {
            uteisService.delBase('categoria_item/_id/' + $ctrl._editCategoria._id)
            uteisService.onToast('Registrado excuido!', 'success', 3000, 'top-end');
            $ctrl.fechar();
          }
        })
    }

    $ctrl.fechar = function () {
      // dispara o callback do pai
      $ctrl.onFechar();
    };

  },
  templateUrl: 'components/categoriaitem/categoriaitem.html'
});