app.component('deslocamento', {

  bindings: {
    tipo: '<',
    idNivel: '<?',
    idNivelDestino: '<?',
    idNivelLoc1: '<?',
    idNivelLoc2: '<?',
    idNivelLoc3: '<?',
    idNivelLoc4: '<?',
    idNivelLoc1Destino: '<?',
    idNivelLoc2Destino: '<?',
    idNivelLoc3Destino: '<?',
    idNivelLoc4Destino: '<?',
    origemLabel: '<?',
    destinoLabel: '<?'
  },

  controller: function (uteisService, $timeout, $element) {

    const $ctrl = this;
    let chartInstance = null;

    $ctrl.carregando = false;
    $ctrl.erro = null;
    $ctrl.titulo = 'Processos';
    $ctrl.chartDomId = '';
    $ctrl.totalGeralRegistros = 0;
    $ctrl.totalItensMovimentados = 0;
    $ctrl.totalPorStatus = [];
    $ctrl.totalPorDiaUltimos5Dias = [];
    $ctrl.descricaoFiltroOrigem = '';
    $ctrl.descricaoFiltroDestino = '';

    function tipoPosicaoNorm() {
      const t = String($ctrl.tipo || '').trim().toLowerCase();
      return (t === 'inventario' || t === 'conferencia') ? t : '';
    }

    function aplicarTitulo() {
      const t = tipoPosicaoNorm();
      if (t === 'inventario') $ctrl.titulo = 'Inventários';
      else if (t === 'conferencia') $ctrl.titulo = 'Conferências';
      else $ctrl.titulo = 'Processos';
    }

    function formatarNumero(n) {
      return Number(n || 0).toLocaleString('pt-BR');
    }

    function fmtDiaISO(iso) {
      if (!iso || typeof iso !== 'string') return '';
      const p = iso.split('-');
      if (p.length !== 3) return iso;
      return p[2] + '/' + p[1];
    }

    function limparGrafico() {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
    }

    function montarUrlResumo() {
      const contaBruta = uteisService.getCookie('_conta');
      const conta = uteisService.normalizarConta(contaBruta) || contaBruta;
      const idConta = conta && (conta._id != null ? conta._id : conta.id);
      if (!idConta) return null;

      let url = '/kpi/posicao/resumo?id_conta=' + encodeURIComponent(idConta);
      const tipo = tipoPosicaoNorm();
      if (tipo) url += '&tipo=' + encodeURIComponent(tipo);

      const origemLoc1 = String($ctrl.idNivelLoc1 || '').trim();
      const origemLoc2 = String($ctrl.idNivelLoc2 || '').trim();
      const origemLoc3 = String($ctrl.idNivelLoc3 || '').trim();
      const origemLoc4 = String($ctrl.idNivelLoc4 || '').trim();
      const destinoLoc1 = tipo === 'inventario' ? '' : String($ctrl.idNivelLoc1Destino || '').trim();
      const destinoLoc2 = tipo === 'inventario' ? '' : String($ctrl.idNivelLoc2Destino || '').trim();
      const destinoLoc3 = tipo === 'inventario' ? '' : String($ctrl.idNivelLoc3Destino || '').trim();
      const destinoLoc4 = tipo === 'inventario' ? '' : String($ctrl.idNivelLoc4Destino || '').trim();
      const origem = String($ctrl.idNivel || '').trim();
      const destino = tipo === 'inventario' ? '' : String($ctrl.idNivelDestino || '').trim();

      if (origemLoc1) url += '&id_nivel_loc1=' + encodeURIComponent(origemLoc1);
      if (origemLoc2) url += '&id_nivel_loc2=' + encodeURIComponent(origemLoc2);
      if (origemLoc3) url += '&id_nivel_loc3=' + encodeURIComponent(origemLoc3);
      if (origemLoc4) url += '&id_nivel_loc4=' + encodeURIComponent(origemLoc4);
      if (destinoLoc1) url += '&id_nivel_loc1_destino=' + encodeURIComponent(destinoLoc1);
      if (destinoLoc2) url += '&id_nivel_loc2_destino=' + encodeURIComponent(destinoLoc2);
      if (destinoLoc3) url += '&id_nivel_loc3_destino=' + encodeURIComponent(destinoLoc3);
      if (destinoLoc4) url += '&id_nivel_loc4_destino=' + encodeURIComponent(destinoLoc4);

      const temOrigemHierarquica = origemLoc1 || origemLoc2 || origemLoc3 || origemLoc4;
      const temDestinoHierarquico = destinoLoc1 || destinoLoc2 || destinoLoc3 || destinoLoc4;
      if (!temOrigemHierarquica && origem) url += '&id_nivel=' + encodeURIComponent(origem);
      if (!temDestinoHierarquico && destino) url += '&id_nivel_destino=' + encodeURIComponent(destino);
      return url;
    }

    function atualizarDescricoesFiltro() {
      const tipo = tipoPosicaoNorm();
      const origemId = String($ctrl.idNivelLoc4 || $ctrl.idNivelLoc3 || $ctrl.idNivelLoc2 || $ctrl.idNivelLoc1 || $ctrl.idNivel || '').trim();
      const destinoId = tipo === 'inventario'
        ? ''
        : String($ctrl.idNivelLoc4Destino || $ctrl.idNivelLoc3Destino || $ctrl.idNivelLoc2Destino || $ctrl.idNivelLoc1Destino || $ctrl.idNivelDestino || '').trim();
      const origemDesc = String($ctrl.origemLabel || '').trim();
      const destinoDesc = String($ctrl.destinoLabel || '').trim();

      $ctrl.descricaoFiltroOrigem = origemId ? (origemDesc || origemId) : '';
      $ctrl.descricaoFiltroDestino = destinoId ? (destinoDesc || destinoId) : '';
    }

    function aplicarResposta(res) {
      const data = res && typeof res === 'object' ? res : {};
      $ctrl.totalPorDiaUltimos5Dias = Array.isArray(data.total_por_dia_ultimos_5_dias)
        ? data.total_por_dia_ultimos_5_dias
        : [];
      $ctrl.totalGeralRegistros = Number(data.total_geral_registros) || 0;
      $ctrl.totalItensMovimentados = Number(data.total_itens_movimentados) || 0;
      $ctrl.totalPorStatus = Array.isArray(data.total_por_status) ? data.total_por_status : [];
    }

    function desenharGrafico() {
      limparGrafico();
      const el = document.getElementById($ctrl.chartDomId);
      if (!el) return;

      const rows = Array.isArray($ctrl.totalPorDiaUltimos5Dias) ? $ctrl.totalPorDiaUltimos5Dias : [];
      const categories = rows.map(function (r) { return fmtDiaISO(r.dia); });
      const valores = rows.map(function (r) { return Number(r.total_registros) || 0; });
      const area = el.closest('.kpi-widget-chart') || el.parentElement;
      const chartH = Math.max((area && area.clientHeight) || 0, 220);

      const options = {
        chart: {
          type: 'area',
          height: chartH,
          toolbar: { show: false },
          animations: { enabled: true },
          parentHeightOffset: 0
        },
        series: [{
          name: 'Registros',
          data: valores
        }],
        xaxis: {
          categories: categories,
          labels: { style: { colors: '#94a3b8' } }
        },
        yaxis: {
          min: 0,
          labels: {
            formatter: function (val) { return Math.round(val); },
            style: { colors: '#94a3b8' }
          }
        },
        stroke: {
          width: 4,
          curve: 'smooth'
        },
        markers: {
          size: 5,
          strokeWidth: 2,
          colors: ['#7dd3fc'],
          strokeColors: '#ffffff'
        },
        dataLabels: { enabled: false },
        grid: {
          borderColor: 'rgba(148,163,184,0.25)',
          strokeDashArray: 4
        },
        tooltip: {
          y: {
            formatter: function (v) {
              return formatarNumero(v) + ' registros';
            }
          }
        },
        colors: ['#7dd3fc'],
        fill: {
          type: 'gradient',
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.35,
            opacityTo: 0.03,
            stops: [0, 100]
          }
        },
        noData: {
          text: 'Sem dados nas 5 datas mais recentes com registros'
        }
      };

      chartInstance = new ApexCharts(el, options);
      chartInstance.render();
    }

    function carregar() {
      aplicarTitulo();
      atualizarDescricoesFiltro();

      const url = montarUrlResumo();
      if (!url) {
        $ctrl.erro = 'Conta local não encontrada';
        aplicarResposta({});
        limparGrafico();
        return;
      }

      $ctrl.carregando = true;
      $ctrl.erro = null;
      uteisService
        .getBase(url)
        .then(function (res) {
          aplicarResposta(res);
          $timeout(desenharGrafico, 0);
        })
        .catch(function (err) {
          console.error('Erro ao carregar resumo de processos:', err);
          $ctrl.erro = 'Não foi possível carregar os indicadores';
          aplicarResposta({});
          limparGrafico();
        })
        .finally(function () {
          $ctrl.carregando = false;
        });
    }

    $ctrl.formatarNumero = formatarNumero;
    $ctrl.ehInventario = function () {
      return tipoPosicaoNorm() === 'inventario';
    };

    $ctrl.$onInit = function () {
      $ctrl.chartDomId = 'deslocamento-kpi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      aplicarTitulo();
      atualizarDescricoesFiltro();
    };

    $ctrl.$postLink = function () {
      const root = $element && $element[0];
      if (root) {
        const mount = root.querySelector('[data-deslocamento-chart]');
        if (mount) mount.id = $ctrl.chartDomId;
      }
      carregar();
    };

    $ctrl.$onChanges = function (changes) {
      if (!changes) return;
      const mudou =
        (changes.tipo && !changes.tipo.isFirstChange()) ||
        (changes.idNivel && !changes.idNivel.isFirstChange()) ||
        (changes.idNivelDestino && !changes.idNivelDestino.isFirstChange()) ||
        (changes.idNivelLoc1 && !changes.idNivelLoc1.isFirstChange()) ||
        (changes.idNivelLoc2 && !changes.idNivelLoc2.isFirstChange()) ||
        (changes.idNivelLoc3 && !changes.idNivelLoc3.isFirstChange()) ||
        (changes.idNivelLoc4 && !changes.idNivelLoc4.isFirstChange()) ||
        (changes.idNivelLoc1Destino && !changes.idNivelLoc1Destino.isFirstChange()) ||
        (changes.idNivelLoc2Destino && !changes.idNivelLoc2Destino.isFirstChange()) ||
        (changes.idNivelLoc3Destino && !changes.idNivelLoc3Destino.isFirstChange()) ||
        (changes.idNivelLoc4Destino && !changes.idNivelLoc4Destino.isFirstChange()) ||
        (changes.origemLabel && !changes.origemLabel.isFirstChange()) ||
        (changes.destinoLabel && !changes.destinoLabel.isFirstChange());
      aplicarTitulo();
      atualizarDescricoesFiltro();
      if (mudou) carregar();
    };

    $ctrl.$onDestroy = function () {
      limparGrafico();
    };

  },

  templateUrl: 'components/kpis/deslocamento/deslocamento.html'

});
