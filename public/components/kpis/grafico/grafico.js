app.component('grafico', {
  bindings: {
    tipo: '<',
    /** @deprecated layout antigo: só nível 1 */
    idNivel: '<',
    idNivelLoc1: '<',
    idNivelLoc2: '<',
    idNivelLoc3: '<',
    idNivelLoc4: '<'
  },

  controller: [
    'uteisService',
    '$timeout',
    function (uteisService, $timeout) {
      const $ctrl = this;
      let chartInstance = null;

      $ctrl.options = {
        headers: { 'Content-Type': 'application/json' }
      };

      $ctrl.carregando = false;
      $ctrl.erro = null;
      $ctrl.temDados = false;
      $ctrl.dados = null;
      $ctrl.totalSemVinculo = 0;
      $ctrl.chartDomId = '';
      $ctrl._regConta = null;
      /** Trilha legível (descrições) dos níveis de localização aplicados ao filtro. */
      $ctrl.localizacaoTrilha = '';

      function nomeSerieSku() {
        const p = $ctrl._regConta && $ctrl._regConta.params_nomenclatura_itens;
        const sku = (p && p.sku) ? p.sku : 'SKU';
        return sku + 's';
      }

      function coresPorTipoGrafico() {
        const tipoNorm = String($ctrl.tipo || '').trim();
        if (tipoNorm === 'categorias') {
          return [
            '#1e3a8a',
            '#1d4ed8',
            '#2563eb',
            '#3b82f6',
            '#0ea5e9',
            '#0284c7',
            '#0369a1'
          ];
        }
        return [
          '#c9184a',
          '#ff4d6d',
          '#ff758f',
          '#e27396',
          '#ef476f',
          '#e5989b',
          '#b5838d'
        ];
      }

      function montarUrlItensCategorias() {
        const contaBruta = uteisService.getCookie('_conta');
        const conta = uteisService.normalizarConta(contaBruta) || contaBruta;
        const idConta = conta && (conta._id != null ? conta._id : conta.id);
        if (!idConta) return null;

        $ctrl._regConta = conta;
        let url = '';

        const tipoNorm = String($ctrl.tipo || '').trim();

        if (tipoNorm === 'categorias') {

          $ctrl.titulo = $ctrl._regConta.params_nomenclatura_itens.sku  + 's Agrupados por  ' +$ctrl._regConta.params_nomenclatura_itens.itens;
          url = '/kpi/itens_por_categoria/total?id_conta=' + encodeURIComponent(idConta);

        } else if (tipoNorm === 'itens_categorias') {

          $ctrl.titulo = $ctrl._regConta.params_nomenclatura_itens.sku + 's Agrupados por ' + $ctrl._regConta.params_nomenclatura_itens.categorias;
          url = '/kpi/itens_categorias/total?id_conta=' + encodeURIComponent(idConta);

        } else if (tipoNorm === 'inf_compl1') {

          $ctrl.titulo = $ctrl._regConta.params_nomenclatura_itens.sku + 's Agrupados por Inf. Complementar 1';
          url = '/kpi/itens_por_inf_compl1/total?id_conta=' + encodeURIComponent(idConta);

        } else if (tipoNorm === 'itens_por_inf_compl1') {

          $ctrl.titulo = 'Movimentação por ' + $ctrl._regConta.params_nomenclatura_itens.sku + 's Agrupados por Inf. Complementar';
          url = '/kpi/posicao/itens_por_inf_compl1?id_conta=' + encodeURIComponent(idConta);

        }

        const l1 = String($ctrl.idNivelLoc1 || '').trim();
        const l2 = String($ctrl.idNivelLoc2 || '').trim();
        const l3 = String($ctrl.idNivelLoc3 || '').trim();
        const l4 = String($ctrl.idNivelLoc4 || '').trim();
        if (l1) url += '&id_nivel_loc1=' + encodeURIComponent(l1);
        if (l2) url += '&id_nivel_loc2=' + encodeURIComponent(l2);
        if (l3) url += '&id_nivel_loc3=' + encodeURIComponent(l3);
        if (l4) url += '&id_nivel_loc4=' + encodeURIComponent(l4);
        if (!l1 && !l2 && !l3 && !l4) {
          const legado = String($ctrl.idNivel || '').trim();
          if (legado) {
            url += '&id_nivel_loc1=' + encodeURIComponent(legado);
          }
        }
        return url;
      }

      function coletarIdsLocOrdenados () {
        const l1 = String($ctrl.idNivelLoc1 || '').trim();
        const l2 = String($ctrl.idNivelLoc2 || '').trim();
        const l3 = String($ctrl.idNivelLoc3 || '').trim();
        const l4 = String($ctrl.idNivelLoc4 || '').trim();
        const chain = [l1, l2, l3, l4].filter(Boolean);
        if (chain.length) return chain;
        const legado = String($ctrl.idNivel || '').trim();
        return legado ? [legado] : [];
      }

      function sincronizarTrilhaLocalizacao () {
        $ctrl.localizacaoTrilha = '';
        const contaBruta = uteisService.getCookie('_conta');
        const conta = uteisService.normalizarConta(contaBruta) || contaBruta;
        const idConta = conta && (conta._id != null ? conta._id : conta.id);
        const chain = coletarIdsLocOrdenados();
        if (!idConta || !chain.length) return;

        const url = '/_bd?c=localizacao&id_conta=' + encodeURIComponent(idConta) + '&ativo=1';
        uteisService
          .getBase(url)
          .then(function (rows) {
            if (!Array.isArray(rows)) rows = [];
            const byId = {};
            for (let i = 0; i < rows.length; i++) {
              const r = rows[i];
              if (r && r._id) byId[r._id] = r;
            }
            const partes = chain.map(function (id) {
              const r = byId[id];
              if (r && (r.descricao || r.tag)) return String(r.descricao || r.tag).trim() || id;
              return id;
            });
            $ctrl.localizacaoTrilha = partes.join(' › ');
          })
          .catch(function () {
            $ctrl.localizacaoTrilha = chain.join(' › ');
          });
      }

      function obterCategoriasELabels() {
        const data = $ctrl.dados;
        const labels = [];
        const valores = [];
        const tipoNorm = String($ctrl.tipo || '').trim();
        if (data && data.length) {
          for (let i = 0; i < data.length; i++) {
            labels.push(data[i].descricao || '');
            if (tipoNorm === 'itens_por_inf_compl1') {
              valores.push(Number(data[i].total_itens) || 0);
            } else {
              valores.push(Number(data[i].total) || 0);
            }
          }
        }
        const sv = parseInt($ctrl.totalSemVinculo, 10) || 0;
        if (sv > 0) {
          labels.push('Sem Vinculo');
          valores.push(sv);
        }
        return { labels, valores };
      }

      function syncTemDados() {
        const { labels } = obterCategoriasELabels();
        $ctrl.temDados = labels.length > 0;
      }

      function desenharOuAtualizarGrafico() {
        const { labels, valores } = obterCategoriasELabels();
        syncTemDados();
        if (!labels.length) {
          if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
          }
          return;
        }

        const el = document.getElementById($ctrl.chartDomId);
        if (!el) {
          console.warn('grafico KPI: elemento #' + $ctrl.chartDomId + ' não encontrado.');
          return;
        }

        const seriesName = nomeSerieSku();
        const area = el.closest('.grafico-kpi-chart-area') || el.parentElement;
        const chartH = Math.max((area && area.clientHeight) || 0, 220);

        if (chartInstance) {
          chartInstance.updateOptions({
            chart: { height: chartH },
            series: [{ name: seriesName, data: valores }],
            xaxis: { categories: labels },
            colors: coresPorTipoGrafico()
          });
          return;
        }

        const options = {
          chart: {
            height: chartH,
            type: 'bar',
            toolbar: { show: false },
            parentHeightOffset: 0
          },
          plotOptions: {
            bar: {
              columnWidth: '40%',
              borderRadius: 12,
              distributed: true,
              dataLabels: {
                position: 'top',
                style: {
                  fontSize: '30px',
                  fontWeight: 'bold',
                  colors: ['#fff']
                }
              }
            }
          },
          series: [{ name: seriesName, data: valores }],
          legend: { show: false },
          xaxis: {
            categories: labels,
            axisBorder: { show: false },
            yaxis: { show: false },
            tooltip: { enabled: true },
            labels: {
              show: true,
              rotate: -45,
              rotateAlways: true
            }
          },
          grid: {
            borderColor: '#575e6d',
            strokeDashArray: 5,
            xaxis: { lines: { show: true } },
            yaxis: { lines: { show: false } },
            padding: { top: 0, right: 10, left: 20, bottom: -20 }
          },
          tooltip: {
            y: {
              formatter: function (val) {
                return val;
              }
            }
          },
          colors: coresPorTipoGrafico()
        };

        chartInstance = new ApexCharts(el, options);
        chartInstance.render();
      }

      function carregar() {
        const url = montarUrlItensCategorias();
        if (!url) {
          $ctrl.erro = 'Conta local não encontrada';
          $ctrl.temDados = false;
          $ctrl.dados = null;
          $ctrl.totalSemVinculo = 0;
          if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
          }
          return;
        }

        $ctrl.carregando = true;
        $ctrl.erro = null;

        uteisService
          .getBase(url)
          .then(function (res) {
            let rows = [];
            let totalSemVinculo = 0;
            const tipoNorm = String($ctrl.tipo || '').trim();
            if (Array.isArray(res)) {
              rows = res;
            } else if (res && typeof res === 'object') {
              if (tipoNorm === 'itens_por_inf_compl1') {
                rows = Array.isArray(res.por_inf_compl1) ? res.por_inf_compl1 : [];
              } else {
                rows = Array.isArray(res.porCategoria) ? res.porCategoria : [];
              }
              totalSemVinculo = res.totalSemVinculo != null ? Number(res.totalSemVinculo) : 0;
            }
            $ctrl.dados = rows;
            $ctrl.totalSemVinculo = totalSemVinculo;
            syncTemDados();
            $timeout(function () {
              desenharOuAtualizarGrafico();
            }, 0);
          })
          .catch(function (err) {
            console.error('Erro ao carregar itens por categoria:', err);
            $ctrl.dados = null;
            $ctrl.temDados = false;
            $ctrl.totalSemVinculo = 0;
            $ctrl.erro = 'Não foi possível carregar o gráfico';
            if (chartInstance) {
              chartInstance.destroy();
              chartInstance = null;
            }
          })
          .finally(function () {
            $ctrl.carregando = false;
          });
      }

      $ctrl.$onInit = function () {
        $ctrl.chartDomId = 'grafico-kpi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      };

      $ctrl.$postLink = function () {
        sincronizarTrilhaLocalizacao();
        carregar();
      };

      $ctrl.$onChanges = function (changes) {
        if (!changes) return;
        const mudouLoc =
          (changes.idNivel && !changes.idNivel.isFirstChange()) ||
          (changes.idNivelLoc1 && !changes.idNivelLoc1.isFirstChange()) ||
          (changes.idNivelLoc2 && !changes.idNivelLoc2.isFirstChange()) ||
          (changes.idNivelLoc3 && !changes.idNivelLoc3.isFirstChange()) ||
          (changes.idNivelLoc4 && !changes.idNivelLoc4.isFirstChange());
        const mudou =
          (changes.tipo && !changes.tipo.isFirstChange()) ||
          mudouLoc;
        if (mudouLoc) sincronizarTrilhaLocalizacao();
        if (mudou) carregar();
      };

      $ctrl.$onDestroy = function () {
        if (chartInstance) {
          chartInstance.destroy();
          chartInstance = null;
        }
      };
    }
  ],

  templateUrl: 'components/kpis/grafico/grafico.html'
});
