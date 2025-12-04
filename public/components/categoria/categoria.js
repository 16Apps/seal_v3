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

    $ctrl._regAddAssociacao = {
      id_ref: 'categoria',
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

      await $ctrl.onCarregaCategorias();
      await $ctrl.onCarregaItens();

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

        $ctrl.onBaseAssocicao();

      };

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

      if ($ctrl._editCategoria.descricao == '') {
        uteisService.onToast('Informe uma descrição para o Gateway.', 'warning', 3000, 'top-end');
        return;
      };

      uteisService.patchBase('/categoria', $ctrl._editCategoria)
        .then((res) => {

          uteisService.patchBase('/associacao', $ctrl._editAssocicao)

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