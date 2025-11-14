app.component('item', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this

    var modalInstance = undefined;

    $ctrl._editItem = {};
    $ctrl._regConta = {};
    $ctrl._listCategorias = [];
    $ctrl._listNivel1 = [];
    $ctrl._listNivel2 = [];
    $ctrl._listNivel3 = [];
    $ctrl._listNivel4 = [];

    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta');
      //$ctrl.onCarregaNiveisPlanta('01');
    };

    $ctrl.$onChanges = function (changes) {

      if ($ctrl.funcao == 'add') {
        $ctrl.onEditar(undefined)
      } else if ($ctrl.funcao == 'edit') {
        $ctrl.onEditar($ctrl.edit)
      }

    };

    $ctrl.onEditar = async function (reg) {

      await $ctrl.onCarregaCategorias();
      await $ctrl.onCarregaNiveis('01');

      if (reg == undefined) {

        $ctrl._editItem = {
          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          id_externo: '',
          status: 'ativo',
          descricao: '',
          id_categoria: '',
          foto: '',
          _foto: '../assets/images/icon_cadastro.fw.png',
          tag: '',
          tag_secundaria: '',
          id_nivel_loc1: '',
          id_nivel_loc2: '',
          id_nivel_loc3: '',
          id_nivel_loc4: '',
          observacao: '',
          registro_atual: {},
          registro_anterior: {},

          mov_livre: '0',
          mov_acao: 'em_transporte',
          mov_colaborador: 'indiferente',
          mov_local: '',
          mov_data_hora: ''
        };

      } else {

        $timeout(async () => {
          $ctrl._editItem = JSON.parse(JSON.stringify(reg));
          $ctrl._editItem.ativo = "" + $ctrl._editItem.ativo;
          $ctrl._editItem.id_categoria = $ctrl._editItem.id_categoria;

          $ctrl._editItem['_foto'] = '../assets/images/icon_cadastro.fw.png'
          if ($ctrl._editItem.foto) {
            $ctrl._editItem._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editItem.foto
          };

          if ($ctrl._editItem.id_nivel_loc1) {

            await $ctrl.onCarregaNiveis('02')

            $timeout(async () => {
              if ($ctrl._editItem.id_nivel_loc2) {
                await $ctrl.onCarregaNiveis('03')

                $timeout(async () => {
                  if ($ctrl._editItem.id_nivel_loc3) {
                    await $ctrl.onCarregaNiveis('04')
                  };
                }, 200)
              }
            }, 200)
          }

        }, 10)


      };

    };

    $ctrl.onCarregaCategorias = async function () {

      let _url = '/_bd?c=categoria&id_conta=' + $ctrl._regConta._id
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listCategorias = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onCategoria = async function (_acao, _edit) {

      $timeout(() => {
        $ctrl.funcaoLoc = _acao;
        $ctrl.editLoc = _edit;
      }, 10);

      if (modalInstance != undefined) {
        modalInstance.hide();
        modalInstance = undefined

        $ctrl.onCarregaCategorias()
        $ctrl.funcaoLoc = '';
        $ctrl.editLoc = undefined;

        $ctrl.$apply();
      } else {
        modalInstance = new bootstrap.Modal(document.getElementById('modalCategoria'));
        modalInstance.show();
      }

    };

    $ctrl.onCarregaNiveis = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editItem.id_nivel_loc1
      } else if (nivel == '03') {
        id_nivel = $ctrl._editItem.id_nivel_loc2
      } else if (nivel == '04') {
        id_nivel = $ctrl._editItem.id_nivel_loc3
      }

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            if (nivel == '01') {
              $ctrl._listNivel1 = res
              $ctrl._listNivel2 = []
              $ctrl._listNivel3 = [];
              $ctrl._listNivel4 = [];
            } else if (nivel == '02') {
              $ctrl._listNivel2 = res
              $ctrl._listNivel3 = [];
              $ctrl._listNivel4 = [];
            } else if (nivel == '03') {
              $ctrl._listNivel3 = res
              $ctrl._listNivel4 = [];

            } else if (nivel == '04') {
              $ctrl._listNivel4 = res
            };
          }, 900)
        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onGetFoto = function () {

      document.getElementById('imgLogo').click();
      document.getElementById('imgLogo').onchange = function () {

        $ctrl._editItem._foto = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editItem._foto = e.target.result;
                  $ctrl._editItem.foto = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }


      };
    };


    $ctrl.onSalvar = function () {

      if ($ctrl._editItem.id_categoria == '') {
        uteisService.onToast('Selecione uma categoria para o item.', 'warning', 3000, 'top-end');
        return;
      };

      if ($ctrl._editItem.tag == '') {
        uteisService.onToast('O campo Tag é obrigatório.', 'warning', 3000, 'top-end');
        return;
      };

      uteisService.patchBase('/item', $ctrl._editItem)
        .then((res) => {
          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          $ctrl.fechar();
        })

    };

    $ctrl.fechar = function () {
      // dispara o callback do pai
      $ctrl._editItem = {};
      $ctrl._listCategorias = [];
      $ctrl._listNivel1 = [];
      $ctrl._listNivel2 = [];
      $ctrl._listNivel3 = [];
      $ctrl._listNivel4 = [];
      $ctrl.onFechar();
    };

  },
  templateUrl: 'components/item/item.html'
});