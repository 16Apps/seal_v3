app.component('totalStatus', {
  bindings: {},

  controller: function (uteisService, $timeout) {
    const $ctrl = this;

    $ctrl.statusResumo = [];
    $ctrl.carregando = false;
    $ctrl.erroKpi = null;
    $ctrl.titulo = '';
    $ctrl.icon = 'bi bi-ui-checks';
    $ctrl.color = 'purple';
    $ctrl.corLilas = '#9b7EBD';

    const LABEL_STATUS = {
      ativo: 'Ativos',
      inativo: 'Inativos',
      perda: 'Perdas',
      ausente: 'Ausentes',
      emtransporte: 'Em Transporte',
      manutencao: 'Manutenção',
      descartado: 'Descartados',
      sem_status: 'Sem Status'
    };

    const COR_STATUS = {
      ativo: 'success',
      inativo: 'secondary',
      perda: 'danger',
      ausente: 'warning',
      emtransporte: 'warning',
      manutencao: 'info',
      descartado: 'dark',
      sem_status: 'secondary'
    };

    /** status chave → valores possíveis no banco (perda/perca) */
    const CONSULTAS_STATUS = [
      { status: 'ativo', valores: ['ativo'], sempre: true },
      { status: 'perda', valores: ['perda', 'perca'], sempre: true },
      { status: 'ausente', valores: ['ausente'], sempre: true },
      { status: 'emtransporte', valores: ['emtransporte'], sempre: false },
      { status: 'inativo', valores: ['inativo'], sempre: false },
      { status: 'manutencao', valores: ['manutencao'], sempre: false },
      { status: 'descartado', valores: ['descartado'], sempre: false }
    ];

    function aplicarTema() {
      $ctrl._regConta = uteisService.normalizarConta(uteisService.getCookie('_conta'));
      const sku = $ctrl._regConta?.params_nomenclatura_itens?.sku || 'Item';
      $ctrl.titulo = sku + 's';
      $ctrl.icon = 'bi bi-ui-checks';
      $ctrl.color = 'purple';
      $ctrl.corLilas = '#9b7EBD';
    }

    function totalDeResposta(data) {
      if (!data) return 0;
      return Number(data.total) || 0;
    }

    function carregarUmStatus(idConta, valores) {
      return Promise.all(
        valores.map(function (valor) {
          const url = '/total/' + encodeURIComponent(idConta) + '/item/status/' + encodeURIComponent(valor);
          return uteisService.getBase(url).then(totalDeResposta).catch(function () { return 0; });
        })
      ).then(function (totais) {
        return totais.reduce(function (acc, n) { return acc + n; }, 0);
      });
    }

    function carregar() {
      aplicarTema();

      const conta = $ctrl._regConta || {};
      const idConta = conta._id != null ? conta._id : conta.id;
      if (!idConta) {
        $ctrl.erroKpi = 'Conta local não encontrada';
        $ctrl.statusResumo = [];
        return;
      }

      $ctrl.carregando = true;
      $ctrl.erroKpi = null;

      Promise.all(
        CONSULTAS_STATUS.map(function (cfg) {
          return carregarUmStatus(idConta, cfg.valores).then(function (total) {
            return {
              status: cfg.status,
              total: total,
              label: LABEL_STATUS[cfg.status] || cfg.status,
              cor: COR_STATUS[cfg.status] || 'warning',
              sempre: cfg.sempre
            };
          });
        })
      )
        .then(function (rows) {
          $timeout(function () {
            $ctrl.statusResumo = rows.filter(function (row) {
              return row.total > 0;
            });
            aplicarTema();
            $ctrl.carregando = false;
          });
        })
        .catch(function (err) {
          $timeout(function () {
            $ctrl.statusResumo = [];
            $ctrl.erroKpi = (err && err.data && err.data.erro) || (err && err.statusText) || 'Erro ao carregar totais por status';
            $ctrl.carregando = false;
          });
        });
    }

    $ctrl.$onInit = function () {
      carregar();
    };
  },

  templateUrl: 'components/kpis/total-status/total-status.html'
});
