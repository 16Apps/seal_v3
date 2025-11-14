app.component('interacao', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this


    $ctrl._editInteracaoAcao = {
      acao: ''
    };
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

      await $ctrl.onCarregaNiveis('01');
      await $ctrl.onEditarAcao(undefined);

      if (reg == undefined) {

        $ctrl._editInteracao = {

          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          id_colaborador: null,

          ativo: '1',
          descricao: '',
          icone: '',
          _icone: '../assets/images/icon_cadastro.fw.png',

          id_nivel_loc1: '',
          id_nivel_loc2: '',
          id_nivel_loc3: '',
          id_nivel_loc4: '',

          enviar_email: true,
          enviar_whats: true,

          acoes: []

        };

      } else {

        $ctrl._editInteracao = reg;
        $ctrl._editInteracao.ativo = "" + $ctrl._editInteracao.ativo;

        $ctrl._editInteracao.enviar_email = $ctrl._editInteracao.enviar_email == 1 ? true : false
        $ctrl._editInteracao.enviar_whats = $ctrl._editInteracao.enviar_whats == 1 ? true : false

        $ctrl._editInteracao['_icone'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editInteracao.icone) {
          $ctrl._editInteracao._icone = uteisService.apiUrl_() + '/image/' + $ctrl._editInteracao.icone
        };

        if ($ctrl._editInteracao.id_nivel_loc1) {

          await $ctrl.onCarregaNiveis('02')

          $timeout(async () => {
            if ($ctrl._editInteracao.id_nivel_loc2) {
              await $ctrl.onCarregaNiveis('03')

              $timeout(async () => {
                if ($ctrl._editInteracao.id_nivel_loc3) {
                  await $ctrl.onCarregaNiveis('04')
                };
              }, 200)
            }
          }, 200)
        }

      };

    };

    $ctrl.onCarregaNiveis = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editInteracao.id_nivel_loc1
      } else if (nivel == '03') {
        id_nivel = $ctrl._editInteracao.id_nivel_loc2
      } else if (nivel == '04') {
        id_nivel = $ctrl._editInteracao.id_nivel_loc3
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


    $ctrl.onGetIcone = function () {

      document.getElementById('imgLogo').click();
      document.getElementById('imgLogo').onchange = function () {

        $ctrl._editInteracao._icone = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editInteracao._icone = e.target.result;
                  $ctrl._editInteracao.icone = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }

      };
    };

    $ctrl.onEditarAcao = async function (reg) {

      if (reg == undefined) {

        $ctrl._editInteracaoAcao = {
          _id: uteisService.onGetID(),
          movimento: '',
          equipamento: '',
          serial: '',
          acao: '',
          comando: ''
        };

      } else {

        $ctrl._editInteracaoAcao = reg;

      };

    };

    $ctrl.onAddAcao = function () {

      let iFind = $ctrl._editInteracao.acoes.findIndex((item) => item._id == $ctrl._editInteracaoAcao._id)

      if (iFind < 0) {
        $ctrl._editInteracao.acoes.push($ctrl._editInteracaoAcao);
      } else {
        $ctrl._editInteracao.acoes[iFind] = $ctrl._editInteracaoAcao
      }

      $ctrl.onEditarAcao(undefined);

    }

    $ctrl.getTextoAcao = function (value) {
      const opcoes = {
        'pdi': 'PDI',
        'tuya': 'Tuya',
        'webhoock': 'Webhook ',

        'entrada': 'Entrada',
        'entrada_i': 'Entrada Inesperada',
        'saida': 'Saída',
        'saida_i': 'Saída Inesperada',

        'tuya_on': 'Ligar',
        'tuya_off': 'Desligar',
        'pdi_display': 'Display',
        'pdi_led_vr': 'Led Verde',
        'pdi_led_vm': 'Led Vermelho',
        'saida': 'pdi_bt_1',
        'saida': 'pdi_bt_2',

        'endpoint_get': 'GET',
        'endpoint_post': 'POST',
        'endpoint_patch': 'PATCH',
        'endpoint_delete': 'DELETE',
      };
      return opcoes[value] || '';
    };

    $ctrl.onEditarAlertaItem = async function (_reg) {

      $ctrl._editInteracaoAcao.referencia = $ctrl._editInteracaoAcao.referencia.filter((item) => item.id_item != '' || item.id_categoria != '')

      $ctrl._editInteracaoItem = {
        id_ref: $ctrl._editInteracaoAcao.acao == 'itens_fixo' ? 'item' : 'categoria',
        id_item: '',
        id_categoria: '',
        quantidade: 1
      }

      bsOffcanvas.show();
    }

    $ctrl.onRemoveAlertaItem = async function (index) {
      $ctrl._editInteracao.acoes.splice(index, 1);
    }



    $ctrl.onSalvarAlertaItem = function () {

      if ($ctrl._editInteracaoItem.id_categoria != '') {
        $ctrl._editInteracaoItem.id_item = ''
      }

      if ($ctrl._editInteracaoItem.id_item != '') {
        $ctrl._editInteracaoItem.quantidade = 1
      }

      if ($ctrl._editInteracaoItem.id_item == 'im') {
        $ctrl.onCarregaItensMomento(true)

      } else if ($ctrl._editInteracaoItem.id_categoria == 'cm') {
        $ctrl.onCarregaItensMomento(false)

      } else {
        $ctrl._editInteracaoAcao.referencia.push({
          id_item: $ctrl._editInteracaoItem.id_item,
          id_categoria: $ctrl._editInteracaoItem.id_categoria,
          valor: $ctrl._editInteracaoItem.quantidade,
        })
      }


      // $ctrl._editInteracaoAcao.referencia[0].valor =  $ctrl._editInteracaoItem.quantidade;

      // bsOffcanvas.hide();
      // $ctrl.onAddAcao()
    }



    $ctrl.onSalvar = function () {

      if ($ctrl._editInteracao.descricao == '') {
        uteisService.onToast('Informe uma descrição para o Gateway.', 'warning', 3000, 'top-end');
        return;
      } else if ($ctrl._editInteracao.id_nivel_loc1 == '') {
        uteisService.onToast('Selecione ao menos um Nível da Localizacão.', 'warning', 3000, 'top-end');
        return;

      } else if ($ctrl._editInteracao.acoes.length == 0) {
        uteisService.onToast('É necessário que tenha no mínimo uma ação.', 'warning', 3000, 'top-end');
        return;
      };

      $ctrl._editInteracao.enviar_email = $ctrl._editInteracao.enviar_email ? 1 : 0
      $ctrl._editInteracao.enviar_whats = $ctrl._editInteracao.enviar_whats ? 1 : 0

      uteisService.patchBase('/interacao', $ctrl._editInteracao)
        .then((res) => {
          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          $ctrl.onFechar();
        })

    };

    $ctrl.idItemDescricao = function (_idItem, _idCategoria, desc) {

      if (_idItem != '') {
        let iFind = $ctrl._listItens.findIndex((item) => item._id == _idItem)
        if (desc) {
          return $ctrl._listItens[iFind].id_categoria.descricao;
        } else {
          return $ctrl._listItens[iFind].tag
        }

      } else {
        let iFind = $ctrl._listCategorias.findIndex((item) => item._id == _idCategoria)
        if (desc) {
          return $ctrl._listCategorias[iFind].descricao;
        } else {
          return $ctrl._listCategorias[iFind].ean
        }

      };

    };


    $ctrl.fechar = function () {
      // dispara o callback do pai
      $ctrl.onFechar();
    };

  },
  templateUrl: 'components/interacao/interacao.html'
});