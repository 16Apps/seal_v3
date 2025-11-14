app.component('equipamento', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this

    $ctrl._editEquipamento = {};
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

        $ctrl._editEquipamento = {

          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          descricao: '',
          ean: '',
          observacao: '',
          foto: '',
          _foto: '../assets/images/icon_cadastro.fw.png',
          modelo: '',
          serial: '',
          identificador: '',
          metodo_comunicacao: '',
          metodo_comunicacao_url: '',
        };

      } else {

        $ctrl._editEquipamento = reg;
        $ctrl._editEquipamento.ativo = "" + $ctrl._editEquipamento.ativo;

        $ctrl._editEquipamento['_foto'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editEquipamento.foto) {
          $ctrl._editEquipamento._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editEquipamento.foto
        };

      };

    };

    $ctrl.onGetFoto = function () {

      document.getElementById('imgLogo').click();
      document.getElementById('imgLogo').onchange = function () {

        $ctrl._editEquipamento._foto = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editEquipamento._foto = e.target.result;
                  $ctrl._editEquipamento.foto = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }

      };
    };


    $ctrl.onSalvar = function () {

      if ($ctrl._editEquipamento.descricao == '') {
        uteisService.onToast('Informe uma descrição para o Gateway.', 'warning', 3000, 'top-end');
        return;
      };

      uteisService.patchBase('/equipamento', $ctrl._editEquipamento)
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
  templateUrl: 'components/equipamento/equipamento.html'
});