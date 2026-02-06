app.component('alerta', {
  bindings: {
    acao: '@',         // Pai ➜ Filho (valor literal)
    funcao: '<',
    edit: '<',        // recebe dados do pai (objeto ou boolean)
    idUser: '<',      // recebe um valor (ID do usuário)
    onFechar: '&'    // callback (pai define o que acontece quando algo retorna)
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this
    const offcanvasEl = document.getElementById('offcanvasAlerta');
    const bsOffcanvas = new bootstrap.Offcanvas(offcanvasEl);

    $ctrl._editAlertaAcao = {
      acao: ''
    };
    $ctrl._regConta = {};


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
      }

    };

    $ctrl.onEditar = async function (reg) {

      await $ctrl.onCarregaNiveis('01');
      await $ctrl.onEditarAcao(undefined);


      if (reg == undefined) {

        $ctrl._editAlerta = {

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

          acoes: []

        };

      } else {

        $ctrl._editAlerta = reg;
        $ctrl._editAlerta.ativo = "" + $ctrl._editAlerta.ativo;

        $ctrl._editAlerta['_icone'] = '../assets/images/icon_cadastro.fw.png'
        if ($ctrl._editAlerta.icone) {
          $ctrl._editAlerta._icone = uteisService.apiUrl_() + '/image/' + $ctrl._editAlerta.icone
        };

        if ($ctrl._editAlerta.id_nivel_loc1) {

          await $ctrl.onCarregaNiveis('02')

          $timeout(async () => {
            if ($ctrl._editAlerta.id_nivel_loc2) {
              await $ctrl.onCarregaNiveis('03')

              $timeout(async () => {
                if ($ctrl._editAlerta.id_nivel_loc3) {
                  await $ctrl.onCarregaNiveis('04')
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
      _url += '&pop=id_categoria&pop=id_nivel_loc1&pop=id_nivel_loc2&pop=id_nivel_loc3&pop=id_nivel_loc4';

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
        id_nivel = $ctrl._editAlerta.id_nivel_loc1
      } else if (nivel == '03') {
        id_nivel = $ctrl._editAlerta.id_nivel_loc2
      } else if (nivel == '04') {
        id_nivel = $ctrl._editAlerta.id_nivel_loc3
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

        $ctrl._editAlerta._icone = "assets/images/carregando_icon.gif";

        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {

            $http.post(uteisService.apiUrl_() + '/image/save', [{ foto: e.target.result }], $ctrl.options)
              .then(function (res) {
                $timeout(() => {
                  $ctrl._editAlerta._icone = e.target.result;
                  $ctrl._editAlerta.icone = res.data[0].id_foto
                }, 2000)

              }, function (error) { });

          };
          reader.readAsDataURL(file);
        }

      };
    };

    $ctrl.onEditarAcao = async function (reg) {

      await $ctrl.onCarregaItens();
      await $ctrl.onCarregaCategorias();

      if (reg == undefined) {

        $ctrl._editAlertaAcao = {
          _id: uteisService.onGetID(),
          acao: '',
          nivel: 'leve',
          referencia: [{
            valor: '1',
            id_item: '',
            id_categoria: '',
          }]
        };

      } else {

        $ctrl._editAlertaAcao = reg;

      };

    };

    $ctrl.onAddAcao = function () {

      let iFind = $ctrl._editAlerta.acoes.findIndex((item) => item._id == $ctrl._editAlertaAcao._id)

      if (iFind < 0) {
        $ctrl._editAlerta.acoes.push($ctrl._editAlertaAcao);
      } else {
        $ctrl._editAlerta.acoes[iFind] = $ctrl._editAlertaAcao
      }

      $ctrl.onEditarAcao(undefined);

    }

    $ctrl.getTextoAcao = function (value) {
      const opcoes = {
        'aproximar': 'Ao Aproximar do Gateway',
        'distanciar': 'Ao Distânciar do Gateway',
        'sair': 'Sair do Raio de Leitura',
        'tol_max': 'Tolerância Máxima',
        'tol_min': 'Tolerância Mínima',
        'itens_fixo': $ctrl._regConta.params_nomenclatura_itens.sku + ' Fixo'
      };
      return opcoes[value] || '';
    };

    $ctrl.onEditarAlertaItem = async function (_reg) {

      $ctrl._editAlertaAcao.referencia = $ctrl._editAlertaAcao.referencia.filter((item) => item.id_item != '' || item.id_categoria != '')

      $ctrl._editAlertaItem = {
        id_ref: $ctrl._editAlertaAcao.acao == 'itens_fixo' ? 'item' : 'categoria',
        id_item: '',
        id_categoria: '',
        quantidade: 1
      }

      bsOffcanvas.show();
    }

    $ctrl.onRemoveAlertaItem = async function (index) {
      $ctrl._editAlerta.acoes.splice(index, 1);
    }



    $ctrl.onSalvarAlertaItem = function () {

      if ($ctrl._editAlertaItem.id_categoria != '') {
        $ctrl._editAlertaItem.id_item = ''
      }

      if ($ctrl._editAlertaItem.id_item != '') {
        $ctrl._editAlertaItem.quantidade = 1
      }

      if ($ctrl._editAlertaItem.id_item == 'im') {
        $ctrl.onCarregaItensMomento(true)

      } else if ($ctrl._editAlertaItem.id_categoria == 'cm') {
        $ctrl.onCarregaItensMomento(false)

      } else {
        $ctrl._editAlertaAcao.referencia.push({
          id_item: $ctrl._editAlertaItem.id_item,
          id_categoria: $ctrl._editAlertaItem.id_categoria,
          valor: $ctrl._editAlertaItem.quantidade,
        })
      }


      // $ctrl._editAlertaAcao.referencia[0].valor =  $ctrl._editAlertaItem.quantidade;

      // bsOffcanvas.hide();
      // $ctrl.onAddAcao()
    }


    $ctrl.onCarregaItensMomento = async function (_itens) {

      // !!! Itens vinculados ao local escolhido
      let _url = '/_bd?c=item&id_conta=' + $ctrl._regConta._id
      if ($ctrl._editAlerta.id_nivel_loc4) {
        _url += '&id_nivel_loc4=' + $ctrl._editAlerta.id_nivel_loc4
      } else if ($ctrl._editAlerta.id_nivel_loc3) {
        _url += '&id_nivel_loc3=' + $ctrl._editAlerta.id_nivel_loc3 + '&id_nivel_loc4=null'
      } else if ($ctrl._editAlerta.id_nivel_loc2) {
        _url += '&id_nivel_loc2=' + $ctrl._editAlerta.id_nivel_loc2 + '&id_nivel_loc3=null'
      } else if ($ctrl._editAlerta.id_nivel_loc1) {
        _url += '&id_nivel_loc1=' + $ctrl._editAlerta.id_nivel_loc1 + '&id_nivel_loc2=null'
      }

      await uteisService.getBase(_url)
        .then((res) => {

          $timeout(() => {
            $ctrl._editAlertaAcao.referencia = []

            for (let i = 0; i < res.length; i++) {

              if (_itens) {

                $ctrl._editAlertaAcao.referencia.push({
                  id_item: res[i]._id,
                  id_categoria: '',
                  valor: 1,
                })

              } else {

                let iFind = $ctrl._editAlertaAcao.referencia.findIndex((item) => item.id_categoria == res[i].id_categoria)
                if (iFind != -1) {
                  $ctrl._editAlertaAcao.referencia[iFind].valor++
                } else {
                  $ctrl._editAlertaAcao.referencia.push({
                    id_item: '',
                    id_categoria: res[i].id_categoria,
                    valor: 1,
                  })
                }
              }

            }
          }, 10)

        })
        .catch((error) => {
          uteisService.onToast('Algo deu errado, tente novamente por favor.', 'error', 2000, 'top-end');
        });
    };


    $ctrl.onSalvarAlertaItemRegistro = function () {
      //$ctrl._editAlertaAcao.referencia[0].valor = $ctrl._editAlertaItem.quantidade;
      bsOffcanvas.hide();
      $ctrl.onAddAcao()
    }


    $ctrl.onSalvar = function () {

      if ($ctrl._editAlerta.descricao == '') {
        uteisService.onToast('Informe uma descrição para o Gateway.', 'warning', 3000, 'top-end');
        return;
      } else if ($ctrl._editAlerta.id_nivel_loc1 == '') {
        uteisService.onToast('Selecione ao menos um Nível da Localizacão.', 'warning', 3000, 'top-end');
        return;

      } else if ($ctrl._editAlerta.acoes.length == 0) {
        uteisService.onToast('É necessário que tenha no mínimo uma ação.', 'warning', 3000, 'top-end');
        return;
      };

      uteisService.patchBase('/alerta', $ctrl._editAlerta)
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
  templateUrl: 'components/alerta/alerta.html'
});