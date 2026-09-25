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
    $ctrl._listNivel1 = [];
    $ctrl._listNivel2 = [];
    $ctrl._listNivel3 = [];
    $ctrl._listNivel4 = [];
    $ctrl._seqNiveis = 0;

    $ctrl._regAddAssociacao = {
      id_ref: 'categoria',
      id_item: '',
      id_categoria: '',
      quantidade: 1
    };

    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };

    function normalizaIdNivel(v) {
      if (v == null || v === '') return '';
      if (typeof v === 'object' && v._id) return String(v._id);
      return String(v);
    }

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta');
      $ctrl._regConta = uteisService.normalizarConta($ctrl._regConta);
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
      await $ctrl.onCarregaCategoriasItem();

      const tabTrigger = document.querySelector('#categorias-a-tab');
      const tab = new bootstrap.Tab(tabTrigger);
      tab.show();

      $ctrl._seqNiveis += 1;
      const seq = $ctrl._seqNiveis;

      $ctrl._listNivel1 = [];
      $ctrl._listNivel2 = [];
      $ctrl._listNivel3 = [];
      $ctrl._listNivel4 = [];

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
          valor_labelInf1: '',
          valor_labelInf2: '',
          valor_labelInf3: '',
          valor_labelInf4: '',
          valor_labelInf5: '',
          estoque_minimo: 0,
          estoque_maximo: 0,
          valor: '0',
          id_nivel_cat1: '',
          id_nivel_cat2: '',
          id_nivel_cat3: '',
          id_nivel_cat4: '',

          id_nivel_loc1: '',
          id_nivel_loc2: '',
          id_nivel_loc3: '',
          id_nivel_loc4: '',
        };

        await $ctrl.onCarregaNiveis('01', true, seq);

      } else {

        $ctrl._editCategoria = angular.copy(reg);
        $ctrl._editCategoria.ativo = "" + $ctrl._editCategoria.ativo;

        $ctrl._editCategoria.id_nivel_loc1 = normalizaIdNivel($ctrl._editCategoria.id_nivel_loc1);
        $ctrl._editCategoria.id_nivel_loc2 = normalizaIdNivel($ctrl._editCategoria.id_nivel_loc2);
        $ctrl._editCategoria.id_nivel_loc3 = normalizaIdNivel($ctrl._editCategoria.id_nivel_loc3);
        $ctrl._editCategoria.id_nivel_loc4 = normalizaIdNivel($ctrl._editCategoria.id_nivel_loc4);

        $ctrl._editCategoria['_foto'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editCategoria.foto) {
          $ctrl._editCategoria._foto = uteisService.apiUrl_() + '/image/' + $ctrl._editCategoria.foto
        };

        await $ctrl.onCarregaNiveis('01', true, seq);

        if ($ctrl._editCategoria.id_nivel_loc1) {
          await $ctrl.onCarregaNiveis('02', true, seq);

          if ($ctrl._editCategoria.id_nivel_loc2) {
            await $ctrl.onCarregaNiveis('03', true, seq);

            if ($ctrl._editCategoria.id_nivel_loc3) {
              await $ctrl.onCarregaNiveis('04', true, seq);
            }
          }
        }

        $ctrl.onBaseAssocicao();

      };

    };

    $ctrl.onMudaNivel = async function (nivel) {
      if (nivel === '02') {
        $ctrl._editCategoria.id_nivel_loc2 = '';
        $ctrl._editCategoria.id_nivel_loc3 = '';
        $ctrl._editCategoria.id_nivel_loc4 = '';
      } else if (nivel === '03') {
        $ctrl._editCategoria.id_nivel_loc3 = '';
        $ctrl._editCategoria.id_nivel_loc4 = '';
      } else if (nivel === '04') {
        $ctrl._editCategoria.id_nivel_loc4 = '';
      }
      $ctrl._seqNiveis += 1;
      await $ctrl.onCarregaNiveis(nivel, true, $ctrl._seqNiveis);
    };

    $ctrl.onCarregaNiveis = async function (nivel, limparFilhos, seq) {
      const seqAtual = seq != null ? seq : $ctrl._seqNiveis;

      let id_nivel = null;
      if (nivel == '02') {
        id_nivel = $ctrl._editCategoria.id_nivel_loc1;
      } else if (nivel == '03') {
        id_nivel = $ctrl._editCategoria.id_nivel_loc2;
      } else if (nivel == '04') {
        id_nivel = $ctrl._editCategoria.id_nivel_loc3;
      }

      if (nivel !== '01' && !id_nivel) {
        if (nivel == '02') {
          $ctrl._listNivel2 = [];
          $ctrl._listNivel3 = [];
          $ctrl._listNivel4 = [];
        } else if (nivel == '03') {
          $ctrl._listNivel3 = [];
          $ctrl._listNivel4 = [];
        } else if (nivel == '04') {
          $ctrl._listNivel4 = [];
        }
        return;
      }

      let _url = '/_bd?c=localizacao&id_conta=' + $ctrl._regConta._id + '&id_nivel=' + id_nivel;
      _url += '&sort=descricao';

      try {
        const res = await uteisService.getBase(_url);
        if (seqAtual !== $ctrl._seqNiveis) return;

        const lista = Array.isArray(res) ? res : [];

        if (nivel == '01') {
          $ctrl._listNivel1 = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel2 = [];
            $ctrl._listNivel3 = [];
            $ctrl._listNivel4 = [];
          }
        } else if (nivel == '02') {
          $ctrl._listNivel2 = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel3 = [];
            $ctrl._listNivel4 = [];
          }
        } else if (nivel == '03') {
          $ctrl._listNivel3 = lista;
          if (limparFilhos !== false) {
            $ctrl._listNivel4 = [];
          }
        } else if (nivel == '04') {
          $ctrl._listNivel4 = lista;
        }
      } catch (error) {
        uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
      }
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

    $ctrl.onCarregaCategoriasItem = async function () {

      let _url = '/_bd?c=categoria_item&id_conta=' + $ctrl._regConta._id
      _url += '&sort=descricao'

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._listCategoriasItem = res
          }, 10);

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
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

    $ctrl.onBaseAssocicao = async function () {

      let _url = '/_bd?c=associacao&id_categoria=' + $ctrl._editCategoria._id

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
                id_item: '',
                id_categoria: $ctrl._editCategoria._id,
                ativo: 1,
                intervalo: 10,
                range_rssi: 30,
                cond_presenca: 'todos',
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

      } else if ($ctrl._regAddAssociacao.id_ref == 'generico') {

        let iFind = $ctrl._editAssocicao.associados.findIndex((item) => item._id == $ctrl._regAddAssociacao._id)
        if (iFind == -1) {
          $ctrl._editAssocicao.associados.push({
            _id: uteisService.onGetID(),
            id_item: '',
            id_categoria: '',
            quantidade: $ctrl._regAddAssociacao.quantidade
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

    $ctrl.onEditarAssociacao = function (_id) {
      let item = $ctrl._editAssocicao.associados.find((item) => item._id == _id)

      if (item) {
        $ctrl._regAddAssociacao = {
          id_ref: item.id_item ? 'item' : item.id_categoria ? 'categoria' : 'generico',
          id_item: item.id_item,
          id_categoria: item.id_categoria,
          quantidade: item.quantidade
        }
      }
    }
    
    $ctrl.onApagarAssociacao = function (_id) {

      uteisService.onQuestion("Atenção!", "Deseja realmente excluir essa associação?")
        .then((res) => {
          if (res) {
            $timeout(() => {
              $ctrl._editAssocicao.associados = $ctrl._editAssocicao.associados.filter((item) => item._id != _id)
              uteisService.onToast('Associação excluída!', 'success', 3000, 'top-end');
            }, 100);
          }
        })
    }


    $ctrl.idItemDescricao = function (_idItem, _idCategoria, desc) {

      if (_idItem == '' && _idCategoria == '') {
        if (desc) {
          return 'Genérico';
        } else {	
          return '';
        }

      } else if (_idItem != '') {
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

      if ($ctrl._editCategoria.descricao == '') {
        uteisService.onToast('Informe uma descrição para o Item.', 'warning', 3000, 'top-end');
        return;
      };

      uteisService.patchBase('/categoria', $ctrl._editCategoria)
        .then((res) => {

          uteisService.patchBase('/associacao', $ctrl._editAssocicao)

          uteisService.onToast('Registrado!', 'success', 3000, 'top-end');
          $ctrl.onFechar();
        })

    };

    $ctrl.onExcluir = function () {

      uteisService.onQuestion("Atenção!", "Deseja realmente excluir esse Registro?")
        .then(async (res) => {
          if (res) {
            uteisService.delBase('categoria/_id/' + $ctrl._editCategoria._id)
            uteisService.onToast('Registrado excuido!', 'success', 3000, 'top-end');
            $ctrl.fechar();
          }
        })
    }



    $ctrl.fechar = function () {
      $ctrl._seqNiveis += 1;
      $ctrl._listNivel1 = [];
      $ctrl._listNivel2 = [];
      $ctrl._listNivel3 = [];
      $ctrl._listNivel4 = [];
      $ctrl.onFechar();
    };

  },
  templateUrl: 'components/categoria/categoria.html'
});