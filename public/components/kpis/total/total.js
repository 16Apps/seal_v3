app.component('total', {

  bindings: {
    tipo: '<',
    idNivel: '<'
  },


  controller: function (uteisService, $http, $timeout, $interval) {

    const $ctrl = this;
    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };


    $ctrl.totalKpi = null;
    $ctrl.carregando = false;
    $ctrl.erroKpi = null;

    $ctrl.titulo = '';
    $ctrl.titulosub = '';
    $ctrl.icon = 'bi bi-bar-chart-line';
    $ctrl.color = 'secondary';
    $ctrl.exibirPercentual = false;
    $ctrl.percentualEncontrados = null;

    function mapPosicaoTipo(collection) {
      if (collection === 'posicao_conferencia') return 'conferencia';
      if (collection === 'posicao_inventario') return 'inventario';
      return null;
    }

    function aplicarTemaPorCollection (collection) {

      $ctrl._regConta = uteisService.getCookie('_conta');
      $ctrl._regConta = uteisService.normalizarConta($ctrl._regConta);


      if (collection === 'item') {
        $ctrl.titulo = $ctrl._regConta.params_nomenclatura_itens.sku + 's';
        $ctrl.titulosub = 'Total Armazenado';
        $ctrl.icon = 'bi bi-box';
        $ctrl.color = 'warning';
        $ctrl.exibirPercentual = false;
        return;
      }
      if (collection === 'localizacao') {
        $ctrl.titulo = 'Endereços';
        $ctrl.titulosub = 'Total de locais de armazenamento';
        $ctrl.icon = 'bi bi-geo-alt';
        $ctrl.color = 'success';
        $ctrl.exibirPercentual = false;
        return;
      }
      if (collection === 'categoria') {
        $ctrl.titulo = $ctrl._regConta.params_nomenclatura_itens.itens + 's';
        $ctrl.titulosub = 'Total dos tipos de Itens ';
        $ctrl.icon = 'bi bi-box';
        $ctrl.color = 'danger';
        $ctrl.exibirPercentual = false;
        return;
      }
      if (collection === 'categoria_item') {
        $ctrl.titulo = $ctrl._regConta.params_nomenclatura_itens.categorias + 's';
        $ctrl.titulosub = 'Total de categorias de itens';
        $ctrl.icon = 'bi bi-box';
        $ctrl.color = 'info';
        $ctrl.exibirPercentual = false;
        return;
      }
      if (collection === 'posicao' || collection === 'posicao_conferencia') {
        $ctrl.titulo = collection === 'posicao_conferencia' ? 'Conferências' : 'Ordens de Posição';
        $ctrl.titulosub = collection === 'posicao_conferencia' ? '' : 'Total de Movimentações';
        $ctrl.icon = 'bi bi-pin-map-fill';
        $ctrl.color = 'primary';
        $ctrl.exibirPercentual = collection === 'posicao_conferencia';
        return;
      }
      if (collection === 'posicao_inventario') {
        $ctrl.titulo = 'Inventários';
        $ctrl.titulosub = '';
        $ctrl.icon = 'bi bi-clipboard-check';
        $ctrl.color = 'info';
        $ctrl.exibirPercentual = true;
        return;
      }
      if (collection === 'registro') {
        $ctrl.titulo = 'Registros';
        $ctrl.titulosub = 'Total de Registros de Leituras';
        $ctrl.icon = 'bi bi-tags-fill';
        $ctrl.color = 'success';
        $ctrl.exibirPercentual = false;
        return;
      }

      $ctrl.titulo = collection || 'Total';
      $ctrl.titulosub = '';
      $ctrl.icon = 'bi bi-bar-chart-line';
      $ctrl.color = 'secondary';
      $ctrl.exibirPercentual = false;
    }

    $ctrl.nomeCollection = function () {
      return String($ctrl.tipo || '').trim();
    };

    $ctrl.temCollection = function () {
      return $ctrl.nomeCollection().length > 0;
    };



    function carregarTotalColecao() {

      const collection = $ctrl.nomeCollection();

      if (!collection) {
        $ctrl.totalKpi = null;
        $ctrl.erroKpi = null;
        $ctrl.carregando = false;
        $ctrl.titulo = '';
        $ctrl.titulosub = '';
        $ctrl.icon = 'bi bi-bar-chart-line';
        $ctrl.color = 'secondary';
        $ctrl.exibirPercentual = false;
        $ctrl.percentualEncontrados = null;
        return;
      }

      aplicarTemaPorCollection(collection);

 

      const contaBruta = uteisService.getCookie('_conta');
      const conta = uteisService.normalizarConta(contaBruta) || contaBruta;
      const idConta = conta && (conta._id != null ? conta._id : conta.id);

      if (!idConta) {
        $ctrl.erroKpi = 'Conta local não encontrada';
        $ctrl.totalKpi = null;
        $ctrl.percentualEncontrados = null;
        return;
      };

      const tipoPosicao = mapPosicaoTipo(collection);
      let url;

      if (tipoPosicao) {
        url = uteisService.apiUrl_() + '/kpi/posicao/por_tipo?id_conta='
          + encodeURIComponent(idConta)
          + '&tipo=' + encodeURIComponent(tipoPosicao);
      } else {
        url = uteisService.apiUrl_() + '/total/' + encodeURIComponent(idConta) + '/' + encodeURIComponent(collection);
      }

      $ctrl.carregando = true;
      $ctrl.erroKpi = null;

      $http.get(url, $ctrl.options)

        .then(function (res) {
          $ctrl.totalKpi = res.data;
          $ctrl.percentualEncontrados = (tipoPosicao && res.data)
            ? (res.data.percentual != null ? res.data.percentual : 0)
            : null;
          aplicarTemaPorCollection(collection);
        })
        .catch(function (err) {
          $ctrl.totalKpi = null;
          $ctrl.percentualEncontrados = null;
          $ctrl.erroKpi = (err.data && err.data.erro) || err.statusText || 'Erro ao carregar total';

        })
        .finally(function () {
          $ctrl.carregando = false;
        });
    };


    $ctrl.$onInit = function () {
      carregarTotalColecao();
    };


    $ctrl.$onChanges = function (changes) {

      if (!changes) return;
      const mudouDepoisDoInit =
        (changes.tipo && !changes.tipo.isFirstChange()) ||
        (changes.idNivel && !changes.idNivel.isFirstChange());
      if (mudouDepoisDoInit) carregarTotalColecao();
    };

  },

  templateUrl: 'components/kpis/total/total.html'

});
