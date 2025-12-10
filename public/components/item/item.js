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
    $ctrl._labelsCategoria = undefined
    $ctrl._regConta = {};
    $ctrl._listCategorias = [];
    $ctrl._listNivel1 = [];
    $ctrl._listNivel2 = [];
    $ctrl._listNivel3 = [];
    $ctrl._listNivel4 = [];

    $ctrl._regAddAssociacao = {
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
      await $ctrl.onCarregaItens();
      await $ctrl.onCarregaNiveis('01');
      await $ctrl.onCarregaCategoriasItens();

      const tabTrigger = document.querySelector('#itens-a-tab');
      const tab = new bootstrap.Tab(tabTrigger);
      tab.show();

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

          mov_livre: 0,
          mov_tracking: 0,
          mov_acao: 'em_transporte',
          mov_colaborador: 'indiferente',
          mov_local: '',
          mov_data_hora: ''
        };

        $ctrl.onBaseAssocicao()

      } else {

        $timeout(async () => {
          $ctrl._editItem = JSON.parse(JSON.stringify(reg));
          $ctrl._editItem.ativo = "" + $ctrl._editItem.ativo;
          $ctrl._editItem.id_categoria = $ctrl._editItem.id_categoria;
          $ctrl._editItem.mov_livre = $ctrl._editItem.mov_livre == 1 ? true : false;
          $ctrl._editItem.mov_tracking = $ctrl._editItem.mov_tracking == 1 ? true : false;

          $ctrl._editItem['_foto'] = '../assets/images/icon_cadastro.fw.png'
          if ($ctrl._editItem.foto) {
            $ctrl._editItem._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editItem.foto
          };

          $ctrl.onBaseAssocicao();

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

          $ctrl.onCarregaPosicoes()
          $ctrl.onLabelsCategoria();

        }, 10)


      };



    };

    $ctrl.onLabelsCategoria = async function () {

      $timeout(async () => {
        let iFind = $ctrl._listCategorias.findIndex((item) => item._id == $ctrl._editItem.id_categoria)
        $ctrl._labelsCategoria = $ctrl._listCategorias[iFind]
      }, 10)


    };


    $ctrl.onBaseAssocicao = async function () {

      let _url = '/_bd?c=associacao&id_item=' + $ctrl._editItem._id

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {

            if (res.length > 0) {
              $ctrl._editAssocicao = res[0]
            } else {
              $ctrl._editAssocicao = {
                _id: uteisService.onGetID(),
                id_conta: $ctrl._regConta._id,
                id_colaborador: '',
                id_item: $ctrl._editItem._id,
                id_categoria: '',
                ativo: 1,
                intervalo: 10,
                range_rssi: 30,
                descricao: '',
                associados: []
              }

            }
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });

    }


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

    $ctrl.onCarregaPosicoes = async function () {

      let _url = '/posicao/item/' + $ctrl._editItem._id

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listPosicoes = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
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

    $ctrl.onCarregaCategoriasItens = async function () {

      let _url = '/_bd?c=categoria_item&id_conta=' + $ctrl._regConta._id
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listCategoriasItens = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };


    $ctrl.onCategoria = async function (_acao, _edit) {

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

      const off = bootstrap.Offcanvas.getOrCreateInstance('#offcanvasBottom');
      off.show();

    };


    $ctrl.onSalvarCategoria = function () {

      if ($ctrl._editCategoria.descricao == '') {
        uteisService.onToast('Informe uma descrição para o Item.', 'warning', 3000, 'top-end');
        return;
      };

      uteisService.patchBase('/categoria', $ctrl._editCategoria)
        .then((res) => {
          uteisService.onToast('Item registrado!', 'success', 3000, 'top-end');
          $ctrl.onCarregaCategorias();
          $timeout(() => {
            $ctrl._editItem.id_categoria = $ctrl._editCategoria._id
          }, 1200);
          const off = bootstrap.Offcanvas.getOrCreateInstance('#offcanvasBottom');
          off.hide();
        })

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

    $ctrl.onAddAssociacao = async function () {

      if ($ctrl._regAddAssociacao.id_ref == 'item') {

        let iFind = $ctrl._editAssocicao.associados.findIndex((item) => item.id_item == $ctrl._regAddAssociacao.id_item)
        if (iFind == -1) {
          $ctrl._editAssocicao.associados.push({
            _id: uteisService.onGetID(),
            id_item: $ctrl._regAddAssociacao.id_item,
            id_categoria: '',
            quantidade: 1
          })
        } else {
          $ctrl.$ctrl._editAssocicao.associados[iFind].quantidade = $ctrl._regAddAssociacao.quantidade
        }

      } else {


        let iFind = $ctrl._editAssocicao.associados.findIndex((item) => item.id_categoria == $ctrl._regAddAssociacao.id_categoria)
        if (iFind == -1) {
          $ctrl._editAssocicao.associados.push({
            _id: uteisService.onGetID(),
            id_item: '',
            id_categoria: $ctrl._regAddAssociacao.id_categoria,
            quantidade: $ctrl._regAddAssociacao.quantidade
          })
        } else {
          $ctrl._editAssocicao.associados[iFind].quantidade = $ctrl._regAddAssociacao.quantidade
        }

      }


    };

    $ctrl.onRemoveAssociacao = async function (item) {
      alert(item._id)
      $ctrl._editAssocicao.associados = $ctrl._editAssocicao.associados.filter((assoc) => assoc._id != item._id);
    }


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

          uteisService.patchBase('/associacao', $ctrl._editAssocicao)

          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          $ctrl.fechar();
        })

    };

    $ctrl.onExcluir = function () {

      uteisService.onQuestion("Atenção!", "Deseja realmente excluir esse Registro?")
        .then(async (res) => {
          if (res) {
            uteisService.delBase('item/_id/' + $ctrl._editItem._id)
            uteisService.onToast('Registrado excuido!', 'success', 3000, 'top-end');
            $ctrl.fechar();
          }
        })
    }

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



    $ctrl.formataDataHora = function (data) {
      const date = moment(data, 'YYYY-MM-DD HH:mm:ss')
        .subtract(3, 'hours'); // Remove 3 horas

      return date.format('DDMMM HH[h]mm');
    };


  },
  templateUrl: 'components/item/item.html'
});