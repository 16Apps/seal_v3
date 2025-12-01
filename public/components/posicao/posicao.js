app.component('posicao', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this

    $ctrl._editPosicao = {};
    $ctrl._regConta = {};

    $ctrl._regAddItem = {
      id_ref: 'item',
      id_item: '',
      id_categoria: '',
      quantidade: 1
    };



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
      await $ctrl.onCarregaNiveisDestino('01')
      await $ctrl.onCarregaItens();
      await $ctrl.onCarregaCategorias();

      const tabTrigger = document.querySelector('#categorias-a-tab');
      const tab = new bootstrap.Tab(tabTrigger);
      tab.show();

      if (reg == undefined) {

        $ctrl._editPosicao = {

          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          id_doc: '',
          descricao: '',
          observacao: '',

          icone: '',
          _icone: '../assets/images/icon_cadastro.fw.png',

          partida_data: '',
          tolerancia: 30,

          status: 'aberta',
          status_data: '',

          id_nivel_loc1: '',
          id_nivel_loc2: '',
          id_nivel_loc3: '',
          id_nivel_loc4: { type: String, ref: 'Localizacao' },

          itens: [],

          previsao_chegada_data: '',
          previsao_chegada_tolerancia: 30,

          id_nivel_loc1_destino: '',
          id_nivel_loc2_destino: '',
          id_nivel_loc3_destino: '',
          id_nivel_loc4_destino: '',
        };

      } else {

        $ctrl._editPosicao = reg;
        $ctrl._editPosicao.ativo = "" + $ctrl._editPosicao.ativo;
        $ctrl._editPosicao.partida_data = moment($ctrl._editPosicao.partida_data).format('DD/MM/YYYY HH:mm:ss');
        let d = new Date($ctrl._editPosicao.partida_data); // ex: '2025-06-09T22:48:00.000Z'
        d.setHours(d.getHours() + 0); // +3
        $ctrl._editPosicao.partida_data = d;

        $ctrl._editPosicao.previsao_chegada_data = moment($ctrl._editPosicao.previsao_chegada_data).format('DD/MM/YYYY HH:mm:ss')
        d = new Date($ctrl._editPosicao.previsao_chegada_data); // ex: '2025-06-09T22:48:00.000Z'
        d.setHours(d.getHours() + 0); // +3
        $ctrl._editPosicao.previsao_chegada_data = d;

        $ctrl._editPosicao['_foto'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editPosicao.foto) {
          $ctrl._editPosicao._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editPosicao.foto
        };

        if ($ctrl._editPosicao.id_nivel_loc1) {

          await $ctrl.onCarregaNiveis('02')

          $timeout(async () => {
            if ($ctrl._editPosicao.id_nivel_loc2) {
              await $ctrl.onCarregaNiveis('03')

              $timeout(async () => {
                if ($ctrl._editPosicao.id_nivel_loc3) {
                  await $ctrl.onCarregaNiveis('04')
                };
              }, 200)
            }
          }, 200)
        }

        if ($ctrl._editPosicao.id_nivel_loc1_destino) {

          await $ctrl.onCarregaNiveisDestino('02')

          $timeout(async () => {
            if ($ctrl._editPosicao.id_nivel_loc2_destino) {
              await $ctrl.onCarregaNiveisDestino('03')

              $timeout(async () => {
                if ($ctrl._editPosicao.id_nivel_loc3_destino) {
                  await $ctrl.onCarregaNiveisDestino('04')
                };
              }, 200)
            }
          }, 200)
        }



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

    $ctrl.onCarregaItens = async function () {

      // !!! Itens vinculados ao local escolhido
      let _url = '/_bd?c=item&id_conta=' + $ctrl._regConta._id
      _url += '&pop=id_categoria';

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listItens = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onCarregaNiveis = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc1
      } else if (nivel == '03') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc2
      } else if (nivel == '04') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc3
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

    $ctrl.onCarregaNiveisDestino = async function (nivel) {

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc1_destino
      } else if (nivel == '03') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc2_destino
      } else if (nivel == '04') {
        id_nivel = $ctrl._editPosicao.id_nivel_loc3_destino
      }

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            if (nivel == '01') {
              $ctrl._listNivel1Destino = res
              $ctrl._listNivel2Destino = []
              $ctrl._listNivel3Destino = [];
              $ctrl._listNivel4Destino = [];
            } else if (nivel == '02') {
              $ctrl._listNivel2Destino = res
              $ctrl._listNivel3Destino = [];
              $ctrl._listNivel4Destino = [];
            } else if (nivel == '03') {
              $ctrl._listNivel3Destino = res
              $ctrl._listNivel4Destino = [];

            } else if (nivel == '04') {
              $ctrl._listNivel4Destino = res
            };
          }, 900)
        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };

    $ctrl.onDefineLocal = async function (_setar) {

      if (_setar) {
        let iFind = $ctrl._listItens.findIndex((item) => item._id == $ctrl._regAddItem.id_item)
        $ctrl._editPosicao.id_nivel_loc1 = $ctrl._listItens[iFind].id_nivel_loc1
        $ctrl._editPosicao.id_nivel_loc2 = $ctrl._listItens[iFind].id_nivel_loc2
        $ctrl._editPosicao.id_nivel_loc3 = $ctrl._listItens[iFind].id_nivel_loc3
        $ctrl._editPosicao.id_nivel_loc4 = $ctrl._listItens[iFind].id_nivel_loc4

        if ($ctrl._editPosicao.id_nivel_loc1) {

          await $ctrl.onCarregaNiveis('02')

          $timeout(async () => {
            if ($ctrl._editPosicao.id_nivel_loc2) {
              await $ctrl.onCarregaNiveis('03')

              $timeout(async () => {
                if ($ctrl._editPosicao.id_nivel_loc3) {
                  await $ctrl.onCarregaNiveis('04')
                };
              }, 200)
            }
          }, 200)
        }

      } else {
        $ctrl._editPosicao.id_nivel_loc1 = ''
        $ctrl._editPosicao.id_nivel_loc2 = ''
        $ctrl._editPosicao.id_nivel_loc3 = ''
        $ctrl._editPosicao.id_nivel_loc4 = ''
      }

    }

    $ctrl.onAddItem = async function () {

      if ($ctrl._regAddItem.id_ref == 'item') {

        let iFind = $ctrl._editPosicao.itens.findIndex((item) => item.id_item == $ctrl._regAddItem.id_item)
        let iFindItem = $ctrl._listItens.findIndex((item) => item._id == $ctrl._regAddItem.id_item)


        if (iFind == -1) {
          $ctrl._editPosicao.itens.push({
            _id: uteisService.onGetID(),
            id_item: $ctrl._regAddItem.id_item,
            id_categoria: '',

            tag: $ctrl._listItens[iFindItem].tag,
            ean: '',
            rssi: '',

            quantidade: 1,
            status: 'pendente',
            status_data: '',
            id_gatweway: '',
            id_colaborador: '',


            status_destino: '',
            status_destino_data: '',

          })
        } else {
          $ctrl._editPosicao.itens[iFind].quantidade = $ctrl._regAddItem.quantidade
        }

      } else {


        let iFind = $ctrl._editPosicao.itens.findIndex((item) => item.id_categoria == $ctrl._regAddItem.id_categoria)
        if (iFind == -1) {
          $ctrl._editPosicao.itens.push({
            _id: uteisService.onGetID(),
            id_item: '',
            id_categoria: $ctrl._regAddItem.id_categoria,
            quantidade: $ctrl._regAddItem.quantidade,
            status: 'pendente',
            status_data: '',
            id_gatweway: '',
            id_colaborador: '',
          })
        } else {
          $ctrl._editPosicao.itens[iFind].quantidade = $ctrl._regAddItem.quantidade
        }

      }


    };

    $ctrl.onGetFoto = function () {

      document.getElementById('imgLogo').click();
      document.getElementById('imgLogo').onchange = function () {

        $ctrl._editPosicao._foto = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editPosicao._foto = e.target.result;
                  $ctrl._editPosicao.foto = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }

      };
    };


    $ctrl.onSalvar = function () {

      if ($ctrl._editPosicao.id_doc == '') {
        uteisService.onToast('Informe um iD para identificar o Documento.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-a-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };

      if ($ctrl._editPosicao.partida_data == '') {
        uteisService.onToast('Informe a data de partida.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-a-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };

      if ($ctrl._editPosicao.itens.length == 0) {
        uteisService.onToast('Selecione os itens que serão Movimentados.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-b-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };

      if ($ctrl._editPosicao.previsao_chegada_data == '') {
        uteisService.onToast('Informe a data de previsão de chegada.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-c-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };


      if ($ctrl._editPosicao.id_nivel_loc1_destino == '') {
        uteisService.onToast('Selecione o Local de destino.', 'warning', 3000, 'top-end');
        const tabTrigger = document.querySelector('#categorias-c-tab');
        const tab = new bootstrap.Tab(tabTrigger);
        tab.show();
        return;
      };

      uteisService.patchBase('/posicao', $ctrl._editPosicao)
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
  templateUrl: 'components/posicao/posicao.html'
});