/**
 * KPI — gráficos de pizza (ApexCharts).
 *
 * Formato reutilizável (binding `dados-grafico` ou resposta futura com `agrupamentos`):
 *   [
 *     {
 *       titulo: 'Opcional — título acima do gráfico',
 *       fatias: [ { label, value, color?, rotuloPct?, tooltipPlano? } ]
 *     }
 *   ]
 *
 * Rota padrão (quando `dados-grafico` não é um array): GET /kpi/itens_por_local_capacidade
 * Cada local com capacidade_maxima > 0 vira um pizza: fatias proporcionais a ocupado / livre / excedente,
 * com percentuais alinhados a `percentual_ocupacao` da API quando existir.
 * Resposta com `agrupamentos` continua opcional (cada item = um gráfico).
 */
app.component('pizza', {
  bindings: {
    /** Quando é um array, os dados vêm só daqui (sem chamada HTTP). */
    dadosGrafico: '<?',
    /** @deprecated layout antigo: só nível 1 */
    idNivel: '<?',
    idNivelLoc1: '<?',
    idNivelLoc2: '<?',
    idNivelLoc3: '<?',
    idNivelLoc4: '<?',
    /** Sobrescreve o título do card. */
    tituloPrincipal: '@?',
    /** Determina a rota usada. '' (padrão) = capacidade. 'tempo_no_local' = /kpi/itens_por_tempo_no_local */
    pizzaKind: '<?',
    tempoAnos: '<?',
    tempoMeses: '<?',
    tempoSemanas: '<?',
    tempoDias: '<?',
    tempoHoras: '<?',
    tempoMinutos: '<?'
  },

  controller: [
    'uteisService',
    '$timeout',
    '$scope',
    '$element',
    function (uteisService, $timeout, $scope, $element) {
      const $ctrl = this;
      let chartInstances = [];

      $ctrl.carregando = false;
      $ctrl.erro = null;
      $ctrl.localizacaoTrilha = '';
      /** @type {Array<{ titulo: string, subtitulo?: string, fatias: Array<{ label: string, value: number, color?: string, rotuloPct?: string, tooltipHtml?: string }> }>} */
      $ctrl.chartGroups = [];
      $ctrl._regConta = null;
      $ctrl.titulo = '';

      function coresPaleta() {
        return [
          '#1e3a8a',
          '#2563eb',
          '#0ea5e9',
          '#0369a1',
          '#c9184a',
          '#ff758f',
          '#e5989b',
          '#10b981',
          '#f59e0b',
          '#8b5cf6'
        ];
      }

      function normalizarFatias(bruto) {
        if (!Array.isArray(bruto)) return [];
        const out = [];
        for (let i = 0; i < bruto.length; i++) {
          const f = bruto[i];
          if (!f || typeof f !== 'object') continue;
          const label = String(f.label != null ? f.label : f.descricao != null ? f.descricao : f.nome != null ? f.nome : '').trim();
          const value = Number(f.value != null ? f.value : f.total != null ? f.total : f.valor != null ? f.valor : 0) || 0;
          const color = f.color || f.cor || undefined;
          if (!label && value <= 0) continue;
          out.push({
            label: label || '—',
            value: value,
            color: color,
            rotuloPct: f.rotuloPct,
            tooltipPlano: f.tooltipPlano
          });
        }
        return out.filter(function (x) {
          return x.value > 0;
        });
      }

      function normalizarGruposDeEntrada(arr) {
        if (!Array.isArray(arr)) return [];
        const grupos = [];
        for (let g = 0; g < arr.length; g++) {
          const row = arr[g];
          if (!row || typeof row !== 'object') continue;
          const titulo = String(row.titulo != null ? row.titulo : row.title != null ? row.title : '').trim();
          const fatias = normalizarFatias(row.fatias || row.slices || row.series || row.itens);
          if (!fatias.length) continue;
          const st = String(row.subtitulo != null ? row.subtitulo : '').trim();
          grupos.push({ titulo: titulo, subtitulo: st, fatias: fatias });
        }
        return grupos;
      }

      function arredondarPct(n) {
        const x = Number(n);
        if (n == null || isNaN(x)) return 0;
        return Math.round(x * 100) / 100;
      }

      /**
       * Fatias para um único endereço: áreas = ocupado (até o máx.) / livre / excedente.
       * Rótulos destacam % de ocupação e fração (ex.: 8% e 8/100).
       */
      function fatiasOcupacaoPorLocal(row) {
        const max = Number(row.capacidade_maxima) || 0;
        const items = Number(row.total_itens) || 0;
        if (max <= 0) return null;

        const livre = Math.max(0, max - items);
        const excedente = Math.max(0, items - max);
        const ocupAteMax = Math.min(items, max);

        let pctOcupApi = row.percentual_ocupacao;
        if (pctOcupApi != null && pctOcupApi !== '' && !isNaN(Number(pctOcupApi))) {
          pctOcupApi = arredondarPct(pctOcupApi);
        } else {
          pctOcupApi = max > 0 ? arredondarPct((items / max) * 100) : 0;
        }
        const pctLivre = max > 0 ? arredondarPct((livre / max) * 100) : 0;

        const corOcup = '#c9184a';
        const corLivre = '#6a994e';
        const corExc = '#dc2626';

        const fatias = [];

        if (ocupAteMax > 0) {
          fatias.push({
            label: 'Ocupados · ' + pctOcupApi + '% · ' + ocupAteMax + '/' + max,
            value: ocupAteMax,
            color: corOcup,
            rotuloPct: pctOcupApi + '%\n' + ocupAteMax + '/' + max,
            tooltipPlano:
              ocupAteMax +
              '/' +
              max +
              ' lugares ocupados (' +
              pctOcupApi +
              '% da capacidade máxima).'
          });
        }
        if (livre > 0) {
          fatias.push({
            label: 'Livres · ' + pctLivre + '% · ' + livre + '/' + max,
            value: livre,
            color: corLivre,
            rotuloPct: pctLivre + '%\n' + livre + '/' + max,
            tooltipPlano:
              livre +
              '/' +
              max +
              ' lugares livres (' +
              pctLivre +
              '% do total).'
          });
        }
        if (excedente > 0) {
          fatias.push({
            label: 'Acima da capacidade · +' + excedente,
            value: excedente,
            color: corExc,
            rotuloPct: '+' + excedente + '\n' + items + '/' + max,
            tooltipPlano:
              'Acima da capacidade (' +
              max +
              '): +' +
              excedente +
              ' ' +
              (excedente === 1 ? 'item' : 'itens') +
              ' (total ' +
              items +
              ').'
          });
        }

        return fatias.length ? fatias : null;
      }

      /**
       * Converte resposta da rota /kpi/itens_por_local_capacidade (ou formato estendido) em grupos de pizza.
       */
      function mapearRespostaItensPorLocalCapacidade(res) {
        if (!res || typeof res !== 'object') return [];

        if (Array.isArray(res.agrupamentos) && res.agrupamentos.length) {
          return normalizarGruposDeEntrada(res.agrupamentos);
        }

        const porLocal = Array.isArray(res.por_local) ? res.por_local : [];
        const grupos = [];

        for (let i = 0; i < porLocal.length; i++) {
          const row = porLocal[i];
          if (!row) continue;
          const max = Number(row.capacidade_maxima) || 0;
          const titLoc = String(row.descricao || row.tag || row.id_localizacao || '').trim() || '—';
          if (max <= 0) continue;
          const fatias = fatiasOcupacaoPorLocal(row);
          if (!fatias || !fatias.length) continue;
          const items = Number(row.total_itens) || 0;
          const pctTxt =
            row.percentual_ocupacao != null && row.percentual_ocupacao !== '' && !isNaN(Number(row.percentual_ocupacao))
              ? arredondarPct(row.percentual_ocupacao) + '% ocupação'
              : arredondarPct(max > 0 ? (items / max) * 100 : 0) + '% ocupação';
          grupos.push({
            titulo: titLoc,
            subtitulo: 'Cap. máx. ' + max + ' · ' + items + '/' + max + ' · ' + pctTxt,
            fatias: fatias
          });
        }

        const semCapFatias = [];
        for (let j = 0; j < porLocal.length; j++) {
          const r = porLocal[j];
          if (!r) continue;
          if ((Number(r.capacidade_maxima) || 0) > 0) continue;
          const it = Number(r.total_itens) || 0;
          if (it <= 0) continue;
          const nome = String(r.descricao || r.tag || '—').trim() || '—';
          semCapFatias.push({
            label: nome + ' · ' + it + ' itens',
            value: it
          });
        }
        const semCapNorm = normalizarFatias(semCapFatias);
        if (semCapNorm.length) {
          grupos.push({
            titulo: 'Sem capacidade máxima',
            subtitulo: 'Distribuição por volume (sem teto definido)',
            fatias: semCapNorm
          });
        }

        const sem = Number(res.total_itens_sem_local) || 0;
        if (sem > 0) {
          grupos.push({
            titulo: 'Sem localização',
            subtitulo: '',
            fatias: normalizarFatias([
              { label: 'Itens sem endereço · ' + sem, value: sem, color: '#64748b' }
            ])
          });
        }

        return grupos;
      }

      function coletarIdsLocOrdenados() {
        const l1 = String($ctrl.idNivelLoc1 || '').trim();
        const l2 = String($ctrl.idNivelLoc2 || '').trim();
        const l3 = String($ctrl.idNivelLoc3 || '').trim();
        const l4 = String($ctrl.idNivelLoc4 || '').trim();
        const chain = [l1, l2, l3, l4].filter(Boolean);
        if (chain.length) return chain;
        const legado = String($ctrl.idNivel || '').trim();
        return legado ? [legado] : [];
      }

      function sincronizarTrilhaLocalizacao() {
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

      function kindNorm() {
        return String($ctrl.pizzaKind || '').trim();
      }

      function tempoIntervalo() {
        const num = (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        };
        return {
          anos: num($ctrl.tempoAnos),
          meses: num($ctrl.tempoMeses),
          semanas: num($ctrl.tempoSemanas),
          dias: num($ctrl.tempoDias),
          horas: num($ctrl.tempoHoras),
          minutos: num($ctrl.tempoMinutos)
        };
      }

      function formatarIntervalo(interv) {
        const ordem = [
          ['anos', 'ano', 'anos'],
          ['meses', 'mês', 'meses'],
          ['semanas', 'semana', 'semanas'],
          ['dias', 'dia', 'dias'],
          ['horas', 'hora', 'horas'],
          ['minutos', 'minuto', 'minutos']
        ];
        const partes = [];
        for (let i = 0; i < ordem.length; i++) {
          const k = ordem[i][0];
          const sing = ordem[i][1];
          const plur = ordem[i][2];
          const v = interv && interv[k] ? Number(interv[k]) : 0;
          if (v > 0) partes.push(v + ' ' + (v === 1 ? sing : plur));
        }
        return partes.join(' ');
      }

      function montarUrlKpi() {
        const contaBruta = uteisService.getCookie('_conta');
        const conta = uteisService.normalizarConta(contaBruta) || contaBruta;
        const idConta = conta && (conta._id != null ? conta._id : conta.id);
        if (!idConta) return null;

        $ctrl._regConta = conta;
        const p = $ctrl._regConta.params_nomenclatura_itens;
        const sku = p && p.sku ? p.sku : 'SKU';

        const l1 = String($ctrl.idNivelLoc1 || '').trim();
        const l2 = String($ctrl.idNivelLoc2 || '').trim();
        const l3 = String($ctrl.idNivelLoc3 || '').trim();
        const l4 = String($ctrl.idNivelLoc4 || '').trim();
        const legado = String($ctrl.idNivel || '').trim();

        const kind = kindNorm();
        let url;

        if (kind === 'tempo_no_local') {
          if (!$ctrl.tituloPrincipal) {
            $ctrl.titulo = 'Tempo de permanência por ' + sku + 's';
          }
          url = '/kpi/itens_por_tempo_no_local?id_conta=' + encodeURIComponent(idConta);
          if (l1) url += '&id_nivel_loc1=' + encodeURIComponent(l1);
          if (l2) url += '&id_nivel_loc2=' + encodeURIComponent(l2);
          if (l3) url += '&id_nivel_loc3=' + encodeURIComponent(l3);
          if (l4) url += '&id_nivel_loc4=' + encodeURIComponent(l4);
          if (!l1 && !l2 && !l3 && !l4 && legado) {
            url += '&id_nivel_loc1=' + encodeURIComponent(legado);
          }
          const interv = tempoIntervalo();
          if (interv.anos) url += '&anos=' + interv.anos;
          if (interv.meses) url += '&meses=' + interv.meses;
          if (interv.semanas) url += '&semanas=' + interv.semanas;
          if (interv.dias) url += '&dias=' + interv.dias;
          if (interv.horas) url += '&horas=' + interv.horas;
          if (interv.minutos) url += '&minutos=' + interv.minutos;
          return url;
        }

        if (!$ctrl.tituloPrincipal) {
          $ctrl.titulo = sku + 's por localização (capacidade)';
        }

        url = '/kpi/itens_por_local_capacidade?id_conta=' + encodeURIComponent(idConta);
        if (l1) url += '&id_nivel_loc1=' + encodeURIComponent(l1);
        if (l2) url += '&id_nivel_loc2=' + encodeURIComponent(l2);
        if (l3) url += '&id_nivel_loc3=' + encodeURIComponent(l3);
        if (l4) url += '&id_nivel_loc4=' + encodeURIComponent(l4);
        if (!l1 && !l2 && !l3 && !l4 && legado) {
          url += '&id_nivel_loc1=' + encodeURIComponent(legado);
        }
        return url;
      }

      function mapearRespostaTempoNoLocal(res) {
        if (!res || typeof res !== 'object') return [];
        const acima = Number(res.acima_do_tempo) || 0;
        const abaixo = Number(res.abaixo_do_tempo) || 0;
        if (acima <= 0 && abaixo <= 0) return [];

        const intervTxt = formatarIntervalo(res.intervalo) || formatarIntervalo(tempoIntervalo());
        const trilha = String(res.trilha_localizacao || '').trim();
        const subtitulo = (trilha ? trilha : '') + (intervTxt ? ' · corte: ' + intervTxt : '');

        const fatias = [];
        if (acima > 0) {
          fatias.push({
            label: 'Há mais de ' + intervTxt + ' · ' + acima,
            value: acima,
            color: '#c9184a',
            rotuloPct: undefined,
            tooltipPlano: acima + ' itens com permanência ACIMA de ' + intervTxt + '.'
          });
        }
        if (abaixo > 0) {
          fatias.push({
            label: 'Há menos de ' + intervTxt + ' · ' + abaixo,
            value: abaixo,
            color: '#10b981',
            rotuloPct: undefined,
            tooltipPlano: abaixo + ' itens com permanência ABAIXO de ' + intervTxt + '.'
          });
        }

        return [{
          titulo: '',
          subtitulo: subtitulo,
          fatias: fatias
        }];
      }

      function destruirCharts() {
        for (let i = 0; i < chartInstances.length; i++) {
          try {
            if (chartInstances[i]) chartInstances[i].destroy();
          } catch (e) { /* noop */ }
        }
        chartInstances = [];
      }

      function montarGrupos(grupos) {
        return grupos.map(function (g) {
          return {
            titulo: g.titulo || '',
            subtitulo: g.subtitulo != null ? String(g.subtitulo).trim() : '',
            fatias: g.fatias
          };
        });
      }

      /**
       * Slots vêm do ng-repeat na ordem dos grupos; não usar getElementById (o DOM ainda pode não existir no mesmo tick do $http).
       */
      function coletarSlotsMontagem() {
        const root = $element && $element[0];
        if (!root) return [];
        return root.querySelectorAll('.pizza-kpi-row .pizza-kpi-chart-slot');
      }

      function desenharCharts() {
        destruirCharts();
        const grupos = $ctrl.chartGroups;
        if (!grupos.length) return;

        const mounts = coletarSlotsMontagem();
        if (!mounts.length || mounts.length < grupos.length) {
          console.warn('pizza KPI: slots no DOM insuficientes (esperado ' + grupos.length + ', encontrado ' + mounts.length + ').');
          return;
        }

        const paleta = coresPaleta();

        for (let g = 0; g < grupos.length; g++) {
          const grupo = grupos[g];
          const labels = grupo.fatias.map(function (f) {
            return f.label;
          });
          const series = grupo.fatias.map(function (f) {
            return f.value;
          });
          const colors = grupo.fatias.map(function (f, i) {
            return f.color || paleta[i % paleta.length];
          });

          const el = mounts[g];
          if (!el) continue;

          const options = {
            chart: {
              type: 'pie',
              height: 320,
              toolbar: { show: false },
              animations: { enabled: true }
            },
            labels: labels,
            series: series,
            colors: colors,
            legend: {
              position: 'bottom',
              fontSize: '11px',
              height: 'auto'
            },
            dataLabels: {
              enabled: true,
              style: {
                fontSize: '11px',
                fontWeight: 600
              },
              minAngleToShowLabel: 0,
              formatter: function (val, opts) {
                const idx = opts.seriesIndex;
                const f = grupo.fatias[idx];
                if (f && f.rotuloPct) return f.rotuloPct;
                return Math.round(val * 10) / 10 + '%';
              }
            },
            tooltip: {
              // theme: 'dark', // Isso aplica automaticamente um fundo escuro com textos brancos/legíveis
              style: {
                fontSize: '12px',
                fontFamily: undefined,
                // color: '#ffffff'
              },
              y: {
                formatter: function (val, opts) {
                  const idx = opts.seriesIndex;
                  const f = grupo.fatias[idx];
                  if (f && f.tooltipPlano) return f.tooltipPlano + ' (fatia: ' + val + ')';
                  return val;
                }
              }
            },
            plotOptions: {
              pie: {
                expandOnClick: false,
                donut: { labels: { show: false } }
              }
            }
          };

          const inst = new ApexCharts(el, options);
          chartInstances.push(inst);
          inst.render();
        }
      }

      function aplicarGrupos(gruposNormalizados) {
        $ctrl.chartGroups = montarGrupos(gruposNormalizados);
        $scope.$evalAsync(function () {
          $timeout(function () {
            desenharCharts();
            const g = $ctrl.chartGroups.length;
            const n = coletarSlotsMontagem().length;
            if (g > 0 && n < g) {
              $timeout(desenharCharts, 80);
            }
          }, 0);
        });
      }

      function carregar() {
        if (Array.isArray($ctrl.dadosGrafico)) {
          const norm = normalizarGruposDeEntrada($ctrl.dadosGrafico);
          if (!$ctrl.tituloPrincipal) {
            $ctrl.titulo = 'Distribuição';
          }
          aplicarGrupos(norm);
          return;
        }

        const url = montarUrlKpi();
        if (!url) {
          $ctrl.erro = 'Conta local não encontrada';
          $ctrl.chartGroups = [];
          destruirCharts();
          return;
        }

        $ctrl.carregando = true;
        $ctrl.erro = null;

        const kind = kindNorm();

        uteisService
          .getBase(url)
          .then(function (res) {
            const grupos = kind === 'tempo_no_local'
              ? mapearRespostaTempoNoLocal(res)
              : mapearRespostaItensPorLocalCapacidade(res);
            aplicarGrupos(grupos);
          })
          .catch(function (err) {
            console.error('Erro ao carregar pizza KPI:', err);
            $ctrl.chartGroups = [];
            destruirCharts();
            $ctrl.erro = 'Não foi possível carregar o gráfico';
          })
          .finally(function () {
            $ctrl.carregando = false;
          });
      }

      $ctrl.$onInit = function () {
        if ($ctrl.tituloPrincipal) {
          $ctrl.titulo = String($ctrl.tituloPrincipal).trim();
        }
      };

      $ctrl.$postLink = function () {
        sincronizarTrilhaLocalizacao();
        carregar();
      };

      $ctrl.$onChanges = function (changes) {
        if (!changes) return;
        const mudouLoc =
          (changes.idNivel && changes.idNivel.currentValue !== changes.idNivel.previousValue) ||
          (changes.idNivelLoc1 && changes.idNivelLoc1.currentValue !== changes.idNivelLoc1.previousValue) ||
          (changes.idNivelLoc2 && changes.idNivelLoc2.currentValue !== changes.idNivelLoc2.previousValue) ||
          (changes.idNivelLoc3 && changes.idNivelLoc3.currentValue !== changes.idNivelLoc3.previousValue) ||
          (changes.idNivelLoc4 && changes.idNivelLoc4.currentValue !== changes.idNivelLoc4.previousValue);
        const mudouTitulo =
          changes.tituloPrincipal &&
          changes.tituloPrincipal.currentValue !== changes.tituloPrincipal.previousValue;

        if (mudouTitulo && $ctrl.tituloPrincipal) {
          $ctrl.titulo = String($ctrl.tituloPrincipal).trim();
        }

        if (mudouLoc) sincronizarTrilhaLocalizacao();

        const precisaRecarregar =
          (changes.idNivel && !changes.idNivel.isFirstChange()) ||
          (changes.idNivelLoc1 && !changes.idNivelLoc1.isFirstChange()) ||
          (changes.idNivelLoc2 && !changes.idNivelLoc2.isFirstChange()) ||
          (changes.idNivelLoc3 && !changes.idNivelLoc3.isFirstChange()) ||
          (changes.idNivelLoc4 && !changes.idNivelLoc4.isFirstChange()) ||
          (changes.dadosGrafico && !changes.dadosGrafico.isFirstChange()) ||
          (changes.pizzaKind && !changes.pizzaKind.isFirstChange()) ||
          (changes.tempoAnos && !changes.tempoAnos.isFirstChange()) ||
          (changes.tempoMeses && !changes.tempoMeses.isFirstChange()) ||
          (changes.tempoSemanas && !changes.tempoSemanas.isFirstChange()) ||
          (changes.tempoDias && !changes.tempoDias.isFirstChange()) ||
          (changes.tempoHoras && !changes.tempoHoras.isFirstChange()) ||
          (changes.tempoMinutos && !changes.tempoMinutos.isFirstChange());

        if (precisaRecarregar) carregar();
      };

      $ctrl.$onDestroy = function () {
        destruirCharts();
      };
    }
  ],

  templateUrl: 'components/kpis/pizza/pizza.html'
});
