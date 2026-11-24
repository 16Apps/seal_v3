app.component('trackingregra', {
  bindings: {
    acao: '@',
    funcao: '<',
    edit: '<',
    idUser: '<',
    onFechar: '&'
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this;

    $ctrl._editRegra = {};
    $ctrl._regConta = {};
    $ctrl._salvando = false;
    $ctrl._listDispositivos = [];
    $ctrl._carregandoDispositivos = false;
    $ctrl._pesquisaDispositivo = '';

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta') || {};
      $ctrl._regConta = uteisService.normalizarConta($ctrl._regConta);
    };

    $ctrl.$onChanges = function () {
      if ($ctrl.funcao == 'add') {
        $ctrl.onEditar(undefined);
      } else if ($ctrl.funcao == 'edit') {
        $ctrl.onEditar($ctrl.edit);
      }
    };

    function num(v, def) {
      var n = Number(v);
      return Number.isFinite(n) ? n : (def != null ? def : 0);
    }

    $ctrl.onEditar = function (reg) {
      $ctrl._listDispositivos = [];
      $ctrl._pesquisaDispositivo = '';

      $timeout(function () {
        var tabTrigger = document.querySelector('#trackingregra-a-tab');
        if (tabTrigger && typeof bootstrap !== 'undefined') {
          bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
        }
      }, 50);

      if (reg == undefined) {
        $ctrl._editRegra = {
          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          descricao: '',
          janela_analise: 0,
          gordura_percentual: 0,
          minima_rssi: 0,
          tolerancia_sem_leitura: 0
        };
      } else {
        $ctrl._editRegra = angular.copy(reg);
        $ctrl._editRegra.ativo = String($ctrl._editRegra.ativo != null ? $ctrl._editRegra.ativo : 1);
        $ctrl._editRegra.janela_analise = num($ctrl._editRegra.janela_analise, 0);
        $ctrl._editRegra.gordura_percentual = num($ctrl._editRegra.gordura_percentual, 0);
        $ctrl._editRegra.minima_rssi = num($ctrl._editRegra.minima_rssi, 0);
        $ctrl._editRegra.tolerancia_sem_leitura = num($ctrl._editRegra.tolerancia_sem_leitura, 0);
      }
    };

    $ctrl.onAbrirDispositivos = function () {
      $ctrl.onCarregaDispositivos();
    };

    $ctrl.onCarregaDispositivos = async function () {
      if (!$ctrl._editRegra || !$ctrl._editRegra._id || !$ctrl._regConta || !$ctrl._regConta._id) {
        $ctrl._listDispositivos = [];
        return;
      }

      $ctrl._carregandoDispositivos = true;
      try {
        var url = '/_bd?c=gateway&id_conta=' + encodeURIComponent($ctrl._regConta._id)
          + '&id_tracking_regra=' + encodeURIComponent($ctrl._editRegra._id)
          + '&_sort=descricao';
        var res = await uteisService.getBase(url);
        var lista = Array.isArray(res) ? res : [];
        lista.forEach(function (g) {
          g._foto = '../assets/images/icon_cadastro.fw.png';
          if (g.foto && String(g.foto).indexOf('assets') < 0) {
            g._foto = uteisService.apiUrl_() + '/image/' + g.foto;
          }
          g._modoLabel = g.modo === 'fixo' ? 'Fixo' : (g.modo === 'fluxo' ? 'Fluxo' : 'Móvel');
        });
        $ctrl._listDispositivos = lista;
      } catch (e) {
        $ctrl._listDispositivos = [];
        uteisService.onToast('Erro ao carregar dispositivos da regra.', 'error', 2500, 'top-end');
      } finally {
        $ctrl._carregandoDispositivos = false;
        $timeout(angular.noop);
      }
    };

    $ctrl.filtraDispositivo = function (item) {
      var q = ($ctrl._pesquisaDispositivo || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      if (!q) return true;
      var desc = String(item.descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      var tokem = String(item.tokem || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return desc.indexOf(q) !== -1 || tokem.indexOf(q) !== -1;
    };

    $ctrl.onSalvar = function () {
      if ($ctrl._salvando) return;

      if (!$ctrl._editRegra.descricao || String($ctrl._editRegra.descricao).trim() === '') {
        uteisService.onToast('Informe a descrição da regra.', 'warning', 3000, 'top-end');
        return;
      }

      var payload = angular.copy($ctrl._editRegra);
      payload.ativo = Number(payload.ativo) === 0 ? 0 : 1;
      payload.janela_analise = num(payload.janela_analise, 0);
      payload.gordura_percentual = num(payload.gordura_percentual, 0);
      payload.minima_rssi = num(payload.minima_rssi, 0);
      payload.tolerancia_sem_leitura = num(payload.tolerancia_sem_leitura, 0);
      payload.id_conta = payload.id_conta || $ctrl._regConta._id;
      ['leituras_minima', 'diferenca_rssi', 'confirmacoes_consecutivas', 'tempo_minimo_local'].forEach(function (k) {
        delete payload[k];
      });

      $ctrl._salvando = true;
      uteisService.patchBase('/trackingregra', payload)
        .then(function () {
          uteisService.onToast('Regra salva!', 'success', 2500, 'top-end');
          $ctrl.onFechar();
        })
        .catch(function () {
          uteisService.onToast('Erro ao salvar a regra.', 'error', 3000, 'top-end');
        })
        .finally(function () {
          $ctrl._salvando = false;
          $timeout(angular.noop);
        });
    };

    $ctrl.onExcluir = function () {
      if (!$ctrl._editRegra || !$ctrl._editRegra._id) return;

      uteisService.onQuestion('Atenção!', 'Deseja realmente excluir essa regra?')
        .then(function (ok) {
          if (!ok) return;
          uteisService.delBase('trackingregra/_id/' + $ctrl._editRegra._id)
            .then(function () {
              uteisService.onToast('Regra excluída!', 'success', 2500, 'top-end');
              $ctrl.fechar();
            })
            .catch(function () {
              uteisService.onToast('Erro ao excluir a regra.', 'error', 3000, 'top-end');
            });
        });
    };

    $ctrl.fechar = function () {
      $ctrl.onFechar();
    };
  },

  templateUrl: 'components/trackingregra/trackingregra.html'
});
