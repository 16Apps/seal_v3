app.controller('widgetCtrl', function ($scope, $http, params, uteisService, $timeout, $interval, $compile) {

  $scope._regConta = {};
  $scope._regColaborador = {};
  $scope._regResumoItens = [];
  $scope.kpiTotalTipo = 'movimentacoes';
  $scope.id_nivelPlanta = 'f3005790-a635';
  $scope.temWidgets = false;
  $scope.layoutAlterado = false;

  /** Opções do KPI Total (rótulo → collection na rota /total/...) */


  $scope.exibirModalTotal = false;
  $scope._semMolduraTotalPendente = false;

  $scope.abrirModalTotal = function (semMoldura) {
    $scope._semMolduraTotalPendente = !!semMoldura;
    $scope.exibirModalTotal = true;
  };

  $scope.cancelarModalTotal = function () {
    $scope.exibirModalTotal = false;
  };

  $scope.confirmarKpiTotal = function (op) {
    if (!op || !op.collection) return;
    $scope.exibirModalTotal = false;
    $scope.addWidget('total', $scope._semMolduraTotalPendente, {
      kpiCollection: op.collection,
      kpiLabel: op.label
    });
  };



  $scope.exibirModalGrafico = false;
  $scope._semMolduraGraficoPendente = false;

  $scope.abrirModalGrafico = function (semMoldura) {
    $scope._semMolduraGraficoPendente = !!semMoldura;
    $scope.exibirModalGrafico = true;
  };

  $scope.cancelarModalGrafico = function () {
    $scope.exibirModalGrafico = false;
  };

  $scope.confirmarGraficoTipo = async function (op) {
    if (!op || !op.graficoTipo) return;
    $scope.exibirModalGrafico = false;
    $scope._graficoPendente = { graficoTipo: op.graficoTipo, graficoLabel: op.label };
    $scope.modalLocContext = 'grafico';
    $scope._plantaVisualTipo = '';
    $scope.exibirModalPlanta = true;
    resetGraficoLocPicker();
    await carregarTodasLocalizacoesGrafico();
  };

  /** 'planta' | 'grafico' — planta: só raiz; gráfico: drill 4 níveis (mesma regra do emulador). */
  $scope.modalLocContext = 'planta';
  $scope._graficoPendente = null;

  $scope.exibirModalPlanta = false;
  $scope._semMolduraPlantaPendente = false;
  $scope._plantaVisualTipo = '';
  $scope._localizacoesPlanta = [];
  /** Lista completa para drill do gráfico (filhos via id_nivel). */
  $scope._listLocGrafico = [];
  $scope._graficoLocDrill = { chain: [], search: '' };
  $scope._graficoLocPicker = { selectedIds: [null, null, null, null] };
  $scope._carregandoModalPlanta = false;
  $scope._erroModalPlanta = '';

  function isNivelRaizLocalizacao (loc) {
    if (!loc) return false;
    if (loc.id_nivel == null) return true;
    const nivel = String(loc.id_nivel).trim().toLowerCase();
    return nivel === '' || nivel === 'null';
  }

  function idNivelPaiLoc (loc) {
    if (!loc) return null;
    const p = loc.id_nivel;
    if (p && typeof p === 'object' && p._id !== undefined) return p._id;
    return p;
  }

  function localizacaoFilhosWidget (list, parentId) {
    if (!list || !list.length) return [];
    const out = list.filter(function (l) {
      if (parentId == null || parentId === '') return isNivelRaizLocalizacao(l);
      return idNivelPaiLoc(l) === parentId;
    });
    out.sort(function (a, b) {
      return String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR');
    });
    return out;
  }

  function resetGraficoLocPicker () {
    $scope._graficoLocDrill = { chain: [], search: '' };
    $scope._graficoLocPicker = { selectedIds: [null, null, null, null] };
  }

  function applyGraficoIdsFromLocArray (locArr) {
    const dp = $scope._graficoLocPicker;
    if (!dp) return;
    for (let i = 0; i < 4; i++) {
      dp.selectedIds[i] = locArr[i] ? locArr[i]._id : null;
    }
  }

  $scope.widgetGraficoLocHasChildren = function (loc) {
    if (!loc) return false;
    const list = $scope._listLocGrafico || [];
    return localizacaoFilhosWidget(list, loc._id).length > 0;
  };

  $scope.widgetGraficoListItems = function () {
    const list = $scope._listLocGrafico || [];
    const ch = ($scope._graficoLocDrill && $scope._graficoLocDrill.chain) || [];
    const parentId = ch.length ? ch[ch.length - 1]._id : null;
    let items = localizacaoFilhosWidget(list, parentId);
    const q = ($scope._graficoLocDrill && $scope._graficoLocDrill.search || '').trim().toLowerCase();
    if (q) {
      items = items.filter(function (l) {
        return (String(l.descricao || '').toLowerCase().indexOf(q) !== -1) ||
          (String(l.tag || '').toLowerCase().indexOf(q) !== -1);
      });
    }
    return items;
  };

  $scope.widgetGraficoCrumbDisplay = function () {
    const ch = ($scope._graficoLocDrill && $scope._graficoLocDrill.chain) || [];
    if (!ch.length) return 'Níveis principais';
    return ch.map(function (l) { return l.descricao || l._id; }).join(' › ') + ' ›';
  };

  $scope.widgetGraficoRowIsSelected = function (loc) {
    if (!loc || !$scope._graficoLocPicker) return false;
    const ids = $scope._graficoLocPicker.selectedIds;
    for (let i = 3; i >= 0; i--) {
      if (ids[i]) return ids[i] === loc._id;
    }
    return false;
  };

  $scope.widgetGraficoRowClick = function (loc) {
    if (!loc) return;
    const ch = $scope._graficoLocDrill.chain;
    if ($scope.widgetGraficoLocHasChildren(loc) && ch.length < 3) {
      ch.push(loc);
      for (let c = 0; c < 4; c++) {
        $scope._graficoLocPicker.selectedIds[c] = null;
      }
      return;
    }
    const full = ch.concat([loc]);
    applyGraficoIdsFromLocArray(full);
  };

  $scope.widgetGraficoUseCurrentFolder = function () {
    const ch = $scope._graficoLocDrill.chain;
    if (!ch || !ch.length) return;
    applyGraficoIdsFromLocArray(ch);
  };

  $scope.widgetGraficoCrumbBarClick = function () {
    const ch = $scope._graficoLocDrill.chain;
    if (ch && ch.length) ch.pop();
  };

  $scope.confirmarLocalGrafico = function () {
    const dp = $scope._graficoLocPicker;
    if (!dp || !dp.selectedIds[0]) {
      if (uteisService.onToast) {
        uteisService.onToast('Selecione um local (toque num item sem subníveis ou em “Usar este nível”).', 'warning', 4000, 'top-end');
      }
      return;
    }
    const p = $scope._graficoPendente;
    if (!p || !p.graficoTipo) return;
    $scope.exibirModalPlanta = false;
    $scope._graficoPendente = null;
    const ids = dp.selectedIds;
    const locMeta = {
      idNivelLoc1: ids[0] || '',
      idNivelLoc2: ids[1] || '',
      idNivelLoc3: ids[2] || '',
      idNivelLoc4: ids[3] || ''
    };
    if (p.graficoTipo === 'itens_por_local_capacidade') {
      $scope.addWidget('pizza', $scope._semMolduraGraficoPendente, Object.assign({
        pizzaLabel: p.graficoLabel
      }, locMeta));
    } else if (p.graficoTipo === 'itens_tempo_permanencia') {
      $scope._tempoPendente = {
        pizzaLabel: p.graficoLabel,
        locMeta: locMeta,
        semMoldura: $scope._semMolduraGraficoPendente
      };
      $scope._tempoForm = { anos: 0, meses: 0, semanas: 0, dias: 0, horas: 0, minutos: 0 };
      $scope.exibirModalTempo = true;
      resetGraficoLocPicker();
      return;
    } else {
      $scope.addWidget('grafico', $scope._semMolduraGraficoPendente, Object.assign({
        graficoTipo: p.graficoTipo,
        graficoLabel: p.graficoLabel
      }, locMeta));
    }
    resetGraficoLocPicker();
  };

  $scope.exibirModalTempo = false;
  $scope._tempoPendente = null;
  $scope._tempoForm = { anos: 0, meses: 0, semanas: 0, dias: 0, horas: 0, minutos: 0 };

  $scope.cancelarModalTempo = function () {
    $scope.exibirModalTempo = false;
    $scope._tempoPendente = null;
    $scope._tempoForm = { anos: 0, meses: 0, semanas: 0, dias: 0, horas: 0, minutos: 0 };
  };

  $scope.confirmarModalTempo = function () {
    const f = $scope._tempoForm || {};
    const sanitizar = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    };
    const tempoMeta = {
      tempoAnos: sanitizar(f.anos),
      tempoMeses: sanitizar(f.meses),
      tempoSemanas: sanitizar(f.semanas),
      tempoDias: sanitizar(f.dias),
      tempoHoras: sanitizar(f.horas),
      tempoMinutos: sanitizar(f.minutos)
    };
    const total =
      tempoMeta.tempoAnos +
      tempoMeta.tempoMeses +
      tempoMeta.tempoSemanas +
      tempoMeta.tempoDias +
      tempoMeta.tempoHoras +
      tempoMeta.tempoMinutos;
    if (total <= 0) {
      if (uteisService.onToast) {
        uteisService.onToast('Informe ao menos uma unidade de tempo.', 'warning', 4000, 'top-end');
      }
      return;
    }
    const pend = $scope._tempoPendente;
    if (!pend) {
      $scope.exibirModalTempo = false;
      return;
    }
    $scope.exibirModalTempo = false;
    $scope.addWidget('pizza', !!pend.semMoldura, Object.assign({
      pizzaLabel: pend.pizzaLabel,
      pizzaKind: 'tempo_no_local'
    }, pend.locMeta, tempoMeta));
    $scope._tempoPendente = null;
    $scope._tempoForm = { anos: 0, meses: 0, semanas: 0, dias: 0, horas: 0, minutos: 0 };
  };

  async function carregarTodasLocalizacoesGrafico () {
    if (!$scope._regConta || !$scope._regConta._id) return;
    $scope._carregandoModalPlanta = true;
    $scope._erroModalPlanta = '';
    try {
      const url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id + '&ativo=1';
      const resp = await $http.get(url);
      const lista = Array.isArray(resp.data) ? resp.data : [];
      $scope._listLocGrafico = lista.sort((a, b) =>
        String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR'));
    } catch (e) {
      $scope._listLocGrafico = [];
      $scope._erroModalPlanta = 'Nao foi possivel carregar as localizacoes.';
    } finally {
      $scope._carregandoModalPlanta = false;
    }
  }

  async function carregarLocalizacoesPlantaRaiz () {
    if (!$scope._regConta || !$scope._regConta._id) return;
    $scope._carregandoModalPlanta = true;
    $scope._erroModalPlanta = '';
    try {
      const url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id + '&ativo=1';
      const resp = await $http.get(url);
      const lista = Array.isArray(resp.data) ? resp.data : [];
      $scope._localizacoesPlanta = lista
        .filter(isNivelRaizLocalizacao)
        .sort((a, b) => String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR'));
    } catch (e) {
      $scope._localizacoesPlanta = [];
      $scope._erroModalPlanta = 'Nao foi possivel carregar as localizacoes.';
    } finally {
      $scope._carregandoModalPlanta = false;
    }
  }

  $scope.abrirModalPlanta = async function (semMoldura) {
    $scope._semMolduraPlantaPendente = !!semMoldura;
    $scope.modalLocContext = 'planta';
    $scope._plantaVisualTipo = '';
    $scope._graficoPendente = null;
    $scope.exibirModalPlanta = true;
  };

  $scope.selecionarPlantaVisualTipo = async function (tipo) {
    const t = String(tipo || '').toLowerCase();
    if (t !== 'planta' && t !== 'mapa') return;
    $scope._plantaVisualTipo = t;
    await carregarLocalizacoesPlantaRaiz();
  };

  $scope.voltarEscolhaPlantaVisualTipo = function () {
    $scope._plantaVisualTipo = '';
    $scope._erroModalPlanta = '';
  };

  $scope.cancelarModalPlanta = function () {
    $scope.exibirModalPlanta = false;
    $scope._graficoPendente = null;
    $scope._plantaVisualTipo = '';
    resetGraficoLocPicker();
  };

  $scope.confirmarModalLocalizacaoNivel1 = function (op) {
    if (!op || !op._id) return;
    $scope.exibirModalPlanta = false;
    if ($scope.modalLocContext === 'grafico') {
      return;
    }
    const visualTipo = $scope._plantaVisualTipo === 'mapa' ? 'mapa' : 'planta';
    $scope._plantaVisualTipo = '';
    $scope.addWidget(visualTipo, $scope._semMolduraPlantaPendente, {
      idNivelPlanta: op._id,
      plantaLabel: op.descricao || op.tag || ''
    });
  };

  $scope.exibirModalDeslocamento = false;
  $scope._semMolduraDeslocamentoPendente = false;
  $scope._localizacoesDeslocamento = [];
  $scope._carregandoModalDeslocamento = false;
  $scope._erroModalDeslocamento = '';
  $scope._deslocamentoTipo = '';
  $scope._deslocamentoOrigemDrill = { chain: [], search: '' };
  $scope._deslocamentoDestinoDrill = { chain: [], search: '' };
  $scope._deslocamentoOrigemPicker = { selectedIds: [null, null, null, null] };
  $scope._deslocamentoDestinoPicker = { selectedIds: [null, null, null, null] };

  function resetDeslocamentoPicker (lado) {
    if (lado === 'origem') {
      $scope._deslocamentoOrigemDrill = { chain: [], search: '' };
      $scope._deslocamentoOrigemPicker = { selectedIds: [null, null, null, null] };
      return;
    }
    $scope._deslocamentoDestinoDrill = { chain: [], search: '' };
    $scope._deslocamentoDestinoPicker = { selectedIds: [null, null, null, null] };
  }

  function deslocamentoState (lado) {
    if (lado === 'origem') {
      return {
        drill: $scope._deslocamentoOrigemDrill,
        picker: $scope._deslocamentoOrigemPicker
      };
    }
    return {
      drill: $scope._deslocamentoDestinoDrill,
      picker: $scope._deslocamentoDestinoPicker
    };
  }

  function applyDeslocamentoIdsFromLocArray (lado, locArr) {
    const st = deslocamentoState(lado);
    if (!st || !st.picker) return;
    for (let i = 0; i < 4; i++) {
      st.picker.selectedIds[i] = locArr[i] ? locArr[i]._id : null;
    }
  }

  function deslocamentoSelectedId (lado) {
    const st = deslocamentoState(lado);
    const ids = st && st.picker ? st.picker.selectedIds : [];
    for (let i = 3; i >= 0; i--) {
      if (ids[i]) return ids[i];
    }
    return '';
  }

  function descricaoLocalizacaoPorId (id) {
    const key = String(id || '').trim();
    if (!key) return '';
    const lista = $scope._localizacoesDeslocamento || [];
    const loc = lista.find(function (x) { return x && x._id === key; });
    return loc ? (loc.descricao || loc.tag || loc._id || '') : '';
  }

  $scope.widgetDeslocamentoLocHasChildren = function (lado, loc) {
    if (!loc) return false;
    const list = $scope._localizacoesDeslocamento || [];
    return localizacaoFilhosWidget(list, loc._id).length > 0;
  };

  $scope.widgetDeslocamentoListItems = function (lado) {
    const list = $scope._localizacoesDeslocamento || [];
    const st = deslocamentoState(lado);
    const ch = (st && st.drill && st.drill.chain) || [];
    const parentId = ch.length ? ch[ch.length - 1]._id : null;
    let items = localizacaoFilhosWidget(list, parentId);
    const q = (st && st.drill && st.drill.search || '').trim().toLowerCase();
    if (q) {
      items = items.filter(function (l) {
        return (String(l.descricao || '').toLowerCase().indexOf(q) !== -1) ||
          (String(l.tag || '').toLowerCase().indexOf(q) !== -1);
      });
    }
    return items;
  };

  $scope.widgetDeslocamentoCrumbDisplay = function (lado) {
    const st = deslocamentoState(lado);
    const ch = (st && st.drill && st.drill.chain) || [];
    if (!ch.length) return 'Niveis principais';
    return ch.map(function (l) { return l.descricao || l._id; }).join(' › ') + ' ›';
  };

  $scope.widgetDeslocamentoRowIsSelected = function (lado, loc) {
    if (!loc) return false;
    const st = deslocamentoState(lado);
    const ids = st && st.picker ? st.picker.selectedIds : [];
    for (let i = 3; i >= 0; i--) {
      if (ids[i]) return ids[i] === loc._id;
    }
    return false;
  };

  $scope.widgetDeslocamentoRowClick = function (lado, loc) {
    if (!loc) return;
    const st = deslocamentoState(lado);
    if (!st || !st.drill || !st.picker) return;
    const ch = st.drill.chain;
    if ($scope.widgetDeslocamentoLocHasChildren(lado, loc) && ch.length < 3) {
      ch.push(loc);
      for (let c = 0; c < 4; c++) {
        st.picker.selectedIds[c] = null;
      }
      return;
    }
    const full = ch.concat([loc]);
    applyDeslocamentoIdsFromLocArray(lado, full);
  };

  $scope.widgetDeslocamentoUseCurrentFolder = function (lado) {
    const st = deslocamentoState(lado);
    const ch = st && st.drill ? st.drill.chain : null;
    if (!ch || !ch.length) return;
    applyDeslocamentoIdsFromLocArray(lado, ch);
  };

  $scope.widgetDeslocamentoCrumbBarClick = function (lado) {
    const st = deslocamentoState(lado);
    const ch = st && st.drill ? st.drill.chain : null;
    if (ch && ch.length) ch.pop();
  };

  $scope.widgetDeslocamentoLimparFiltro = function (lado) {
    resetDeslocamentoPicker(lado);
  };

  async function carregarLocalizacoesDeslocamento () {
    if (!$scope._regConta || !$scope._regConta._id) return;
    $scope._carregandoModalDeslocamento = true;
    $scope._erroModalDeslocamento = '';
    try {
      const url = '/_bd?c=localizacao&id_conta=' + $scope._regConta._id + '&ativo=1';
      const resp = await $http.get(url);
      const lista = Array.isArray(resp.data) ? resp.data : [];
      $scope._localizacoesDeslocamento = lista.sort((a, b) =>
        String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR'));
    } catch (e) {
      $scope._localizacoesDeslocamento = [];
      $scope._erroModalDeslocamento = 'Nao foi possivel carregar os enderecos.';
    } finally {
      $scope._carregandoModalDeslocamento = false;
    }
  }

  $scope.abrirModalDeslocamento = async function (semMoldura) {
    $scope._semMolduraDeslocamentoPendente = !!semMoldura;
    $scope._deslocamentoTipo = '';
    resetDeslocamentoPicker('origem');
    resetDeslocamentoPicker('destino');
    $scope.exibirModalDeslocamento = true;
    await carregarLocalizacoesDeslocamento();
  };

  $scope.selecionarDeslocamentoTipo = function (tipo) {
    const t = String(tipo || '').toLowerCase();
    if (t !== 'inventario' && t !== 'conferencia') return;
    $scope._deslocamentoTipo = t;
    if (t === 'inventario') {
      resetDeslocamentoPicker('destino');
    }
  };

  $scope.cancelarModalDeslocamento = function () {
    $scope.exibirModalDeslocamento = false;
    $scope._deslocamentoTipo = '';
    resetDeslocamentoPicker('origem');
    resetDeslocamentoPicker('destino');
  };

  $scope.confirmarModalDeslocamento = function () {
    const tipo = String($scope._deslocamentoTipo || '').toLowerCase();
    if (tipo !== 'inventario' && tipo !== 'conferencia') {
      uteisService.onToast('Selecione Inventário ou Conferência.', 'warning', 2500, 'top-end');
      return;
    }

    const origemIds = ($scope._deslocamentoOrigemPicker && $scope._deslocamentoOrigemPicker.selectedIds) || [];
    const destinoIds = tipo === 'conferencia'
      ? (($scope._deslocamentoDestinoPicker && $scope._deslocamentoDestinoPicker.selectedIds) || [])
      : [null, null, null, null];
    const origemId = deslocamentoSelectedId('origem');
    const destinoId = tipo === 'conferencia' ? deslocamentoSelectedId('destino') : '';
    $scope.exibirModalDeslocamento = false;
    $scope.addWidget('deslocamento', $scope._semMolduraDeslocamentoPendente, {
      posicaoTipo: tipo,
      idNivel: origemId || '',
      idNivelDestino: destinoId || '',
      idNivelLoc1: origemIds[0] || '',
      idNivelLoc2: origemIds[1] || '',
      idNivelLoc3: origemIds[2] || '',
      idNivelLoc4: origemIds[3] || '',
      idNivelLoc1Destino: destinoIds[0] || '',
      idNivelLoc2Destino: destinoIds[1] || '',
      idNivelLoc3Destino: destinoIds[2] || '',
      idNivelLoc4Destino: destinoIds[3] || '',
      origemLabel: descricaoLocalizacaoPorId(origemId),
      destinoLabel: tipo === 'conferencia' ? descricaoLocalizacaoPorId(destinoId) : ''
    });
    $scope._deslocamentoTipo = '';
    resetDeslocamentoPicker('origem');
    resetDeslocamentoPicker('destino');
  };

  let grid = null;
  let _widgetSeq = 0;

  function novoWidgetId () {
    _widgetSeq += 1;
    return 'widget_' + Date.now() + '_' + _widgetSeq + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Próxima linha Y abaixo de todos os itens atuais (evita sobrepor ao adicionar pelo toolbar). */
  function yAbaixoDosExistentes () {
    const nodes = grid.engine.nodes || [];
    if (!nodes.length) return 0;
    let maxBottom = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const bottom = (n.y || 0) + (n.h || 0);
      if (bottom > maxBottom) maxBottom = bottom;
    }
    return maxBottom;
  }

  $scope.$watch('$viewContentLoaded', async function () {

    $scope._regConta = uteisService.getCookie('_conta');
    $scope._regConta['_logo'] = '../assets/images/logo_default.fw.png';

    if ($scope._regConta.logo && $scope._regConta.logo.includes('logo_conta') == false) {
      let _url = uteisService.apiUrl_();
      $scope._regConta._logo = _url + '/image/' + $scope._regConta.logo;
    }

    $scope._regConta = uteisService.normalizarConta($scope._regConta);
    $scope._regColaborador = uteisService.getCookie('_colaborador');

    $scope.graficoTipoOpcoes = [
      {
        label: $scope._regConta.params_nomenclatura_itens.sku + 's por ' + $scope._regConta.params_nomenclatura_itens.itens + 's' ,
        descricao: 'Agrupamento de ' + $scope._regConta.params_nomenclatura_itens.sku + 's por ' + $scope._regConta.params_nomenclatura_itens.itens + 's vinculados',
        graficoTipo: 'categorias'
      },
      {
        label: $scope._regConta.params_nomenclatura_itens.sku + 's por ' + $scope._regConta.params_nomenclatura_itens.categorias + 's' ,
        descricao: 'Agrupamento de ' + $scope._regConta.params_nomenclatura_itens.sku + 's por ' + $scope._regConta.params_nomenclatura_itens.categorias + 's vinculados',
        graficoTipo: 'itens_categorias'
      },
      {
        label: $scope._regConta.params_nomenclatura_itens.sku + 's por Informação Complementar',
        descricao: 'Agrupamento de ' + $scope._regConta.params_nomenclatura_itens.sku + 's por Informação Complementar vinculada',
        graficoTipo: 'inf_compl1'
      },
      {
        label: 'Taxa de Ocupação por ' + $scope._regConta.params_nomenclatura_itens.sku + 's',
        descricao: 'Margem de ocupação de ' + $scope._regConta.params_nomenclatura_itens.sku + 's por endereço',
        graficoTipo: 'itens_por_local_capacidade'
      },
      {
        label: 'Tempo de Permanência por ' + $scope._regConta.params_nomenclatura_itens.sku + 's',
        descricao: $scope._regConta.params_nomenclatura_itens.sku + ' que estão a um determinado tempo no endereço',
        graficoTipo: 'itens_tempo_permanencia'
      },
      {
        label: 'Movimentação por ' + $scope._regConta.params_nomenclatura_itens.sku + 's agrupados por Inf. Complementar',
        descricao: 'Total agrupado por Inf. Complementar movimentadas',
        graficoTipo: 'itens_por_inf_compl1'
      }
    ];

    $scope.kpiTotalOpcoes = [
      { label:$scope._regConta.params_nomenclatura_itens.sku + 's', collection: 'item', descricao: 'Total Armazenado' },
      { label: $scope._regConta.params_nomenclatura_itens.sku + 's por Status', collection: 'item_status', descricao: 'Total agrupado por status (ativo, ausente, em transporte…)' },
      { label: $scope._regConta.params_nomenclatura_itens.itens + 's', collection: 'categoria', descricao: 'Total Armazenado' },
      { label: $scope._regConta.params_nomenclatura_itens.categorias + 's', collection: 'categoria_item', descricao: 'Total Armazenado' },
      { label: 'Endereços', collection: 'localizacao', descricao: 'Total de locais de armazenamento' },
      { label: 'Conferências', collection: 'posicao_conferencia', descricao: 'Total de conferências + % de itens encontrados' },
      { label: 'Inventários', collection: 'posicao_inventario', descricao: 'Total de inventários + % de itens encontrados' },
      { label: 'Registros', collection: 'registro', descricao: 'Total de Registros de Leituras' },
  
    ];

    $timeout(() => {
      $scope.initGrid();
      $scope.carregarLayout();
    }, 300);

  });

  $scope.initGrid = function () {
    grid = GridStack.init({
      cellHeight: 80,
      margin: 8,
      float: true,
      disableOneColumnMode: false,
      resizable: {
        handles: 'e, se, s, sw, w'
      }
    });

    grid.on('change', function () {
      $scope.layoutAlterado = true;
      $scope.atualizarTemWidgets();
      equalizarAlturasKpisMesmaLinha();
    });
    grid.on('added', function () {
      $scope.atualizarTemWidgets();
      $timeout(equalizarAlturasKpisMesmaLinha, 0);
    });
    grid.on('removed', function () {
      $scope.atualizarTemWidgets();
    });

    $scope.atualizarTemWidgets();
  };

  $scope.atualizarTemWidgets = function () {
    const n = (grid && grid.engine && Array.isArray(grid.engine.nodes))
      ? grid.engine.nodes.length
      : 0;
    const tem = n > 0;
    if ($scope.temWidgets === tem) return;
    $timeout(function () {
      $scope.temWidgets = tem;
    });
  };

  /** Alturas padrão por família — só na criação; layout salvo continua mandando. */
  function alturaPadraoPorTipo (tipo, layoutMeta) {
    if (tipo === 'planta' || tipo === 'mapa') return 8;
    if (tipo === 'grafico' || tipo === 'pizza' || tipo === 'deslocamento') return 6;
    if (tipo === 'total') return 4;
    return 5;
  }

  var TIPOS_ALTURA_UNIFORME = {
    grafico: true,
    deslocamento: true,
    pizza: true
  };

  var equalizandoAlturas = false;

  /** Iguala a altura (h) dos KPIs gráfico/processos/pizza que estão na mesma linha (mesmo y). */
  function equalizarAlturasKpisMesmaLinha () {
    if (!grid || !grid.engine || !Array.isArray(grid.engine.nodes)) return;
    if (equalizandoAlturas) return;

    var byY = {};
    grid.engine.nodes.forEach(function (n) {
      if (!n || !n.el) return;
      var card = n.el.querySelector('[data-widget-tipo]');
      var tipo = card && card.getAttribute('data-widget-tipo');
      if (!tipo || !TIPOS_ALTURA_UNIFORME[tipo]) return;
      var key = String(n.y);
      if (!byY[key]) byY[key] = [];
      byY[key].push(n);
    });

    var precisaAtualizar = false;
    Object.keys(byY).forEach(function (key) {
      var group = byY[key];
      if (group.length < 2) return;
      var maxH = Math.max.apply(null, group.map(function (n) { return Number(n.h) || 0; }));
      if (maxH < 1) return;
      group.forEach(function (n) {
        if (n.h !== maxH) precisaAtualizar = true;
      });
    });
    if (!precisaAtualizar) return;

    equalizandoAlturas = true;
    try {
      Object.keys(byY).forEach(function (key) {
        var group = byY[key];
        if (group.length < 2) return;
        var maxH = Math.max.apply(null, group.map(function (n) { return Number(n.h) || 0; }));
        if (maxH < 1) return;
        group.forEach(function (n) {
          if (n.h !== maxH) grid.update(n.el, { h: maxH });
        });
      });
    } finally {
      equalizandoAlturas = false;
    }
  }

  $scope.addWidget = function (tipo, semMoldura, layoutMeta) {
    if (!grid) return;

    semMoldura = !!semMoldura;
    layoutMeta = layoutMeta || {};
    const id = layoutMeta.id || novoWidgetId();

    let content = '';

    const cardClass = semMoldura ? 'widget-card widget-card--bare' : 'widget-card';
    const dataBare = semMoldura ? ' data-sem-moldura="true"' : '';

    const headerPlanta = semMoldura
      ? `<button type="button" class="widget-remove widget-remove--floating" ng-click="removerWidget('${id}')" title="Remover">&times;</button>`
      : `
          <div class="widget-header">
            <span><i class="bi bi-map"></i> Planta Baixa</span>
            <button type="button" class="widget-remove" ng-click="removerWidget('${id}')">&times;</button>
          </div>`;

    const headerMapa = semMoldura
      ? `<button type="button" class="widget-remove widget-remove--floating" ng-click="removerWidget('${id}')" title="Remover">&times;</button>`
      : `
          <div class="widget-header">
            <span><i class="bi bi-geo-alt"></i> Mapa</span>
            <button type="button" class="widget-remove" ng-click="removerWidget('${id}')">&times;</button>
          </div>`;

    const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    if (tipo === 'planta') {
      const idNivelPlantaRaw = layoutMeta.idNivelPlanta != null
        ? String(layoutMeta.idNivelPlanta)
        : String($scope.id_nivelPlanta || '');
      const idNivelPlantaEsc = escAttr(idNivelPlantaRaw);
      const plantaLabelRaw = layoutMeta.plantaLabel != null ? String(layoutMeta.plantaLabel) : '';
      const plantaLabelEsc = escAttr(plantaLabelRaw);
      content = `
        <div class="${cardClass}" data-widget-id="${id}" data-widget-tipo="planta" data-id-nivel-planta="${idNivelPlantaEsc}" data-planta-label="${plantaLabelEsc}"${dataBare}>
          ${headerPlanta}
          <div class="widget-body">
            <planta
              id-nivel-planta="'${idNivelPlantaEsc}'"
              mostrar-legenda-descricao="true"
              tamanho-fonte-legenda="24"
              zoom-inicial="1"
              mostrar-marcacao-area="true">
            </planta>
          </div>
        </div>
      `;
    }

    if (tipo === 'mapa') {
      const idNivelPlantaRaw = layoutMeta.idNivelPlanta != null
        ? String(layoutMeta.idNivelPlanta)
        : (layoutMeta.idNivel != null ? String(layoutMeta.idNivel) : String($scope.id_nivelPlanta || ''));
      const idNivelPlantaEsc = escAttr(idNivelPlantaRaw);
      const plantaLabelRaw = layoutMeta.plantaLabel != null ? String(layoutMeta.plantaLabel) : '';
      const plantaLabelEsc = escAttr(plantaLabelRaw);
      content = `
        <div class="${cardClass}" data-widget-id="${id}" data-widget-tipo="mapa" data-id-nivel-planta="${idNivelPlantaEsc}" data-planta-label="${plantaLabelEsc}"${dataBare}>
          ${headerMapa}
          <div class="widget-body">
            <mapa id-nivel="'${idNivelPlantaEsc}'" titulo="'${plantaLabelEsc}'"></mapa>
          </div>
        </div>
      `;
    }

    if (tipo === 'grafico') {
      let gTipo = layoutMeta.graficoTipo != null ? String(layoutMeta.graficoTipo) : 'itens_categorias';
      if (gTipo !== 'categorias' && gTipo !== 'itens_categorias' && gTipo !== 'inf_compl1' && gTipo !== 'itens_por_inf_compl1') {
        gTipo = 'itens_categorias';
      }
      const gLabelRaw = layoutMeta.graficoLabel != null ? String(layoutMeta.graficoLabel) : '';
      const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const tituloGrafPadrao = gTipo === 'categorias'
        ? 'Gráfico — Categorias'
        : (gTipo === 'inf_compl1'
          ? 'Gráfico — Inf. complementar 1'
          : (gTipo === 'itens_por_inf_compl1' ? 'Gráfico — Movimentação por inf. complementar' : 'Gráfico — Itens por tipo'));
      const tituloGraf = gLabelRaw ? escHtml(gLabelRaw) : tituloGrafPadrao;
      const gLabelEsc = escAttr(gLabelRaw);
      let loc1 = layoutMeta.idNivelLoc1 != null ? String(layoutMeta.idNivelLoc1).trim() : '';
      let loc2 = layoutMeta.idNivelLoc2 != null ? String(layoutMeta.idNivelLoc2).trim() : '';
      let loc3 = layoutMeta.idNivelLoc3 != null ? String(layoutMeta.idNivelLoc3).trim() : '';
      let loc4 = layoutMeta.idNivelLoc4 != null ? String(layoutMeta.idNivelLoc4).trim() : '';
      if (!loc1 && layoutMeta.idNivelPlanta != null && String(layoutMeta.idNivelPlanta).trim()) {
        loc1 = String(layoutMeta.idNivelPlanta).trim();
      }
      const idNivelPlantaDeepest = loc4 || loc3 || loc2 || loc1 || String($scope.id_nivelPlanta || '');
      const loc1Esc = escAttr(loc1);
      const loc2Esc = escAttr(loc2);
      const loc3Esc = escAttr(loc3);
      const loc4Esc = escAttr(loc4);
      const idNivelPlantaEsc = escAttr(idNivelPlantaDeepest);

      const headerGraficoDin = semMoldura
        ? `<button type="button" class="widget-remove widget-remove--floating" ng-click="removerWidget('${id}')" title="Remover">&times;</button>`
        : `
          <div class="widget-header">
            <span><i class="bi bi-bar-chart-line"></i> ${tituloGraf}</span>
            <button type="button" class="widget-remove" ng-click="removerWidget('${id}')">&times;</button>
          </div>`;

      content = `
        <div class="${cardClass}" data-widget-id="${id}" data-widget-tipo="grafico" data-grafico-tipo="${gTipo}" data-grafico-label="${gLabelEsc}" data-id-nivel-planta="${idNivelPlantaEsc}" data-id-nivel-loc1="${loc1Esc}" data-id-nivel-loc2="${loc2Esc}" data-id-nivel-loc3="${loc3Esc}" data-id-nivel-loc4="${loc4Esc}"${dataBare}>
          ${headerGraficoDin}
          <div class="widget-body">
            <grafico tipo="'${gTipo}'" id-nivel-loc1="'${loc1Esc}'" id-nivel-loc2="'${loc2Esc}'" id-nivel-loc3="'${loc3Esc}'" id-nivel-loc4="'${loc4Esc}'"></grafico>
          </div>
        </div>
      `;
    }

    if (tipo === 'pizza') {
      const pizzaLabelRaw = layoutMeta.pizzaLabel != null ? String(layoutMeta.pizzaLabel) : '';
      const pizzaKindRaw = layoutMeta.pizzaKind != null ? String(layoutMeta.pizzaKind).trim() : '';
      const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const tituloPadraoPizza = pizzaKindRaw === 'tempo_no_local'
        ? 'Tempo de permanência'
        : 'Taxa de ocupação';
      const tituloPizza = pizzaLabelRaw ? escHtml(pizzaLabelRaw) : tituloPadraoPizza;
      const pizzaLabelEsc = escAttr(pizzaLabelRaw);
      const pizzaKindEsc = escAttr(pizzaKindRaw);
      const tituloPrincipalAttr = pizzaLabelRaw
        ? ` titulo-principal="${escAttr(pizzaLabelRaw)}"`
        : '';

      const intNumStr = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '0';
      };
      const tempoAnos = intNumStr(layoutMeta.tempoAnos);
      const tempoMeses = intNumStr(layoutMeta.tempoMeses);
      const tempoSemanas = intNumStr(layoutMeta.tempoSemanas);
      const tempoDias = intNumStr(layoutMeta.tempoDias);
      const tempoHoras = intNumStr(layoutMeta.tempoHoras);
      const tempoMinutos = intNumStr(layoutMeta.tempoMinutos);

      let loc1 = layoutMeta.idNivelLoc1 != null ? String(layoutMeta.idNivelLoc1).trim() : '';
      let loc2 = layoutMeta.idNivelLoc2 != null ? String(layoutMeta.idNivelLoc2).trim() : '';
      let loc3 = layoutMeta.idNivelLoc3 != null ? String(layoutMeta.idNivelLoc3).trim() : '';
      let loc4 = layoutMeta.idNivelLoc4 != null ? String(layoutMeta.idNivelLoc4).trim() : '';
      if (!loc1 && layoutMeta.idNivelPlanta != null && String(layoutMeta.idNivelPlanta).trim()) {
        loc1 = String(layoutMeta.idNivelPlanta).trim();
      }
      const idNivelPlantaDeepest = loc4 || loc3 || loc2 || loc1 || String($scope.id_nivelPlanta || '');
      const loc1Esc = escAttr(loc1);
      const loc2Esc = escAttr(loc2);
      const loc3Esc = escAttr(loc3);
      const loc4Esc = escAttr(loc4);
      const idNivelPlantaEsc = escAttr(idNivelPlantaDeepest);

      const headerPizza = semMoldura
        ? `<button type="button" class="widget-remove widget-remove--floating" ng-click="removerWidget('${id}')" title="Remover">&times;</button>`
        : `
          <div class="widget-header">
            <span><i class="bi bi-pie-chart"></i> ${tituloPizza}</span>
            <button type="button" class="widget-remove" ng-click="removerWidget('${id}')">&times;</button>
          </div>`;

      content = `
        <div class="${cardClass}" data-widget-id="${id}" data-widget-tipo="pizza" data-pizza-label="${pizzaLabelEsc}" data-pizza-kind="${pizzaKindEsc}" data-tempo-anos="${tempoAnos}" data-tempo-meses="${tempoMeses}" data-tempo-semanas="${tempoSemanas}" data-tempo-dias="${tempoDias}" data-tempo-horas="${tempoHoras}" data-tempo-minutos="${tempoMinutos}" data-id-nivel-planta="${idNivelPlantaEsc}" data-id-nivel-loc1="${loc1Esc}" data-id-nivel-loc2="${loc2Esc}" data-id-nivel-loc3="${loc3Esc}" data-id-nivel-loc4="${loc4Esc}"${dataBare}>
          ${headerPizza}
          <div class="widget-body">
            <pizza pizza-kind="'${pizzaKindEsc}'" tempo-anos="${tempoAnos}" tempo-meses="${tempoMeses}" tempo-semanas="${tempoSemanas}" tempo-dias="${tempoDias}" tempo-horas="${tempoHoras}" tempo-minutos="${tempoMinutos}" id-nivel-loc1="'${loc1Esc}'" id-nivel-loc2="'${loc2Esc}'" id-nivel-loc3="'${loc3Esc}'" id-nivel-loc4="'${loc4Esc}'"${tituloPrincipalAttr}></pizza>
          </div>
        </div>
      `;
    }

    if (tipo === 'deslocamento') {
      const posicaoTipoRaw = layoutMeta.posicaoTipo != null ? String(layoutMeta.posicaoTipo).trim().toLowerCase() : '';
      const posicaoTipo = (posicaoTipoRaw === 'inventario' || posicaoTipoRaw === 'conferencia')
        ? posicaoTipoRaw
        : '';
      const tituloProcesso = posicaoTipo === 'inventario'
        ? 'Processos — Inventários'
        : (posicaoTipo === 'conferencia' ? 'Processos — Conferências' : 'Processos');
      const origemRaw = layoutMeta.idNivel != null ? String(layoutMeta.idNivel).trim() : '';
      const destinoRaw = posicaoTipo === 'inventario'
        ? ''
        : (layoutMeta.idNivelDestino != null ? String(layoutMeta.idNivelDestino).trim() : '');
      const origemLoc1Raw = layoutMeta.idNivelLoc1 != null ? String(layoutMeta.idNivelLoc1).trim() : '';
      const origemLoc2Raw = layoutMeta.idNivelLoc2 != null ? String(layoutMeta.idNivelLoc2).trim() : '';
      const origemLoc3Raw = layoutMeta.idNivelLoc3 != null ? String(layoutMeta.idNivelLoc3).trim() : '';
      const origemLoc4Raw = layoutMeta.idNivelLoc4 != null ? String(layoutMeta.idNivelLoc4).trim() : '';
      const destinoLoc1Raw = posicaoTipo === 'inventario'
        ? ''
        : (layoutMeta.idNivelLoc1Destino != null ? String(layoutMeta.idNivelLoc1Destino).trim() : '');
      const destinoLoc2Raw = posicaoTipo === 'inventario'
        ? ''
        : (layoutMeta.idNivelLoc2Destino != null ? String(layoutMeta.idNivelLoc2Destino).trim() : '');
      const destinoLoc3Raw = posicaoTipo === 'inventario'
        ? ''
        : (layoutMeta.idNivelLoc3Destino != null ? String(layoutMeta.idNivelLoc3Destino).trim() : '');
      const destinoLoc4Raw = posicaoTipo === 'inventario'
        ? ''
        : (layoutMeta.idNivelLoc4Destino != null ? String(layoutMeta.idNivelLoc4Destino).trim() : '');
      const origemLabelRaw = layoutMeta.origemLabel != null ? String(layoutMeta.origemLabel) : '';
      const destinoLabelRaw = posicaoTipo === 'inventario'
        ? ''
        : (layoutMeta.destinoLabel != null ? String(layoutMeta.destinoLabel) : '');
      const origemEsc = escAttr(origemRaw);
      const destinoEsc = escAttr(destinoRaw);
      const origemLoc1Esc = escAttr(origemLoc1Raw);
      const origemLoc2Esc = escAttr(origemLoc2Raw);
      const origemLoc3Esc = escAttr(origemLoc3Raw);
      const origemLoc4Esc = escAttr(origemLoc4Raw);
      const destinoLoc1Esc = escAttr(destinoLoc1Raw);
      const destinoLoc2Esc = escAttr(destinoLoc2Raw);
      const destinoLoc3Esc = escAttr(destinoLoc3Raw);
      const destinoLoc4Esc = escAttr(destinoLoc4Raw);
      const origemLabelEsc = escAttr(origemLabelRaw);
      const destinoLabelEsc = escAttr(destinoLabelRaw);
      const posicaoTipoEsc = escAttr(posicaoTipo);
      const headerDeslocamento = semMoldura
        ? `<button type="button" class="widget-remove widget-remove--floating" ng-click="removerWidget('${id}')" title="Remover">&times;</button>`
        : `
          <div class="widget-header">
            <span><i class="bi bi-diagram-3"></i> ${tituloProcesso}</span>
            <button type="button" class="widget-remove" ng-click="removerWidget('${id}')">&times;</button>
          </div>`;

      content = `
        <div class="${cardClass}" data-widget-id="${id}" data-widget-tipo="deslocamento" data-posicao-tipo="${posicaoTipoEsc}" data-id-nivel="${origemEsc}" data-id-nivel-destino="${destinoEsc}" data-id-nivel-loc1="${origemLoc1Esc}" data-id-nivel-loc2="${origemLoc2Esc}" data-id-nivel-loc3="${origemLoc3Esc}" data-id-nivel-loc4="${origemLoc4Esc}" data-id-nivel-loc1-destino="${destinoLoc1Esc}" data-id-nivel-loc2-destino="${destinoLoc2Esc}" data-id-nivel-loc3-destino="${destinoLoc3Esc}" data-id-nivel-loc4-destino="${destinoLoc4Esc}" data-origem-label="${origemLabelEsc}" data-destino-label="${destinoLabelEsc}"${dataBare}>
          ${headerDeslocamento}
          <div class="widget-body">
            <deslocamento tipo="'${posicaoTipoEsc}'" id-nivel="'${origemEsc}'" id-nivel-destino="'${destinoEsc}'" id-nivel-loc1="'${origemLoc1Esc}'" id-nivel-loc2="'${origemLoc2Esc}'" id-nivel-loc3="'${origemLoc3Esc}'" id-nivel-loc4="'${origemLoc4Esc}'" id-nivel-loc1-destino="'${destinoLoc1Esc}'" id-nivel-loc2-destino="'${destinoLoc2Esc}'" id-nivel-loc3-destino="'${destinoLoc3Esc}'" id-nivel-loc4-destino="'${destinoLoc4Esc}'" origem-label="'${origemLabelEsc}'" destino-label="'${destinoLabelEsc}'"></deslocamento>
          </div>
        </div>
      `;
    }

    if (tipo === 'total') {
      const kpiCol = (layoutMeta.kpiCollection || 'item').replace(/[^a-z0-9_]/gi, '');
      const kpiLabelRaw = layoutMeta.kpiLabel != null ? String(layoutMeta.kpiLabel) : '';
      const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const kpiLabelEsc = escAttr(kpiLabelRaw);
      const tituloHeader = kpiLabelRaw ? ('Total — ' + escHtml(kpiLabelRaw)) : 'Total';
      const ehStatus = kpiCol === 'item_status';

      const headerTotalDin = semMoldura
        ? `<button type="button" class="widget-remove widget-remove--floating" ng-click="removerWidget('${id}')" title="Remover">&times;</button>`
        : `
          <div class="widget-header">
            <span><i class="bi bi-calculator"></i> ${tituloHeader}</span>
            <button type="button" class="widget-remove" ng-click="removerWidget('${id}')">&times;</button>
          </div>`;

      const corpoTotal = ehStatus
        ? `<total-status></total-status>`
        : `<total tipo="'${kpiCol}'" id-nivel="id_nivelPlanta"></total>`;

      content = `
        <div class="${cardClass}" data-widget-id="${id}" data-widget-tipo="total" data-kpi-collection="${kpiCol}" data-kpi-label="${kpiLabelEsc}"${dataBare}>
          ${headerTotalDin}
          <div class="widget-body">
            ${corpoTotal}
          </div>
        </div>
      `;
    }

    const restaurando =
      layoutMeta.id != null && layoutMeta.x != null && layoutMeta.y != null;

    let gx;
    let gy;
    let gw;
    let gh;
    if (restaurando) {
      gx = layoutMeta.x;
      gy = layoutMeta.y;
      gw = layoutMeta.w != null ? layoutMeta.w : 6;
      // Preserva h salvo; só usa padrão se o layout antigo não tiver altura.
      gh = layoutMeta.h != null ? layoutMeta.h : alturaPadraoPorTipo(tipo, layoutMeta);
    } else {
      gx = layoutMeta.x != null ? layoutMeta.x : 0;
      gy = layoutMeta.y != null ? layoutMeta.y : yAbaixoDosExistentes();
      gw = layoutMeta.w != null ? layoutMeta.w : 6;
      gh = layoutMeta.h != null ? layoutMeta.h : alturaPadraoPorTipo(tipo, layoutMeta);
    }

    const el = grid.addWidget({
      id: id,
      x: gx,
      y: gy,
      w: gw,
      h: gh,
      content: content
    });

    $compile(el)($scope);
    $scope.atualizarTemWidgets();
  };

  $scope.removerWidget = function (id) {
    if (!grid) return;

    const el = document.querySelector(`.grid-stack-item[gs-id="${id}"]`);

    if (el) {
      grid.removeWidget(el);
    }
    $scope.atualizarTemWidgets();
  };

  async function obterContaParaPatch () {
    const rows = await uteisService.getBase('/_bd?c=conta&_id=' + $scope._regConta._id);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  $scope.salvarLayout = async function () {
    if (!grid) return;

    const layout = grid.save(false);

    const widgets = layout.map(item => {
      const el = document.querySelector(`.grid-stack-item[gs-id="${item.id}"]`);
      const card = el ? el.querySelector('.widget-card[data-widget-tipo]') : null;

      const semMoldura = !!(card && card.getAttribute('data-sem-moldura') === 'true');
      const widgetTipo = card ? card.getAttribute('data-widget-tipo') : '';
      const kpiCollection = card && widgetTipo === 'total'
        ? card.getAttribute('data-kpi-collection')
        : null;
      const kpiLabel = card && widgetTipo === 'total'
        ? card.getAttribute('data-kpi-label')
        : null;
      const graficoTipo = card && widgetTipo === 'grafico'
        ? card.getAttribute('data-grafico-tipo')
        : null;
      const graficoLabel = card && widgetTipo === 'grafico'
        ? card.getAttribute('data-grafico-label')
        : null;
      const idNivelPlanta = card && (widgetTipo === 'planta' || widgetTipo === 'mapa' || widgetTipo === 'grafico' || widgetTipo === 'pizza')
        ? card.getAttribute('data-id-nivel-planta')
        : null;
      const idNivelLoc1 = card && (widgetTipo === 'grafico' || widgetTipo === 'pizza')
        ? card.getAttribute('data-id-nivel-loc1')
        : null;
      const idNivelLoc2 = card && (widgetTipo === 'grafico' || widgetTipo === 'pizza')
        ? card.getAttribute('data-id-nivel-loc2')
        : null;
      const idNivelLoc3 = card && (widgetTipo === 'grafico' || widgetTipo === 'pizza')
        ? card.getAttribute('data-id-nivel-loc3')
        : null;
      const idNivelLoc4 = card && (widgetTipo === 'grafico' || widgetTipo === 'pizza')
        ? card.getAttribute('data-id-nivel-loc4')
        : null;
      const deslocamentoLoc1 = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-loc1')
        : null;
      const deslocamentoLoc2 = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-loc2')
        : null;
      const deslocamentoLoc3 = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-loc3')
        : null;
      const deslocamentoLoc4 = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-loc4')
        : null;
      const deslocamentoLoc1Destino = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-loc1-destino')
        : null;
      const deslocamentoLoc2Destino = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-loc2-destino')
        : null;
      const deslocamentoLoc3Destino = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-loc3-destino')
        : null;
      const deslocamentoLoc4Destino = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-loc4-destino')
        : null;
      const pizzaLabel = card && widgetTipo === 'pizza'
        ? card.getAttribute('data-pizza-label')
        : null;
      const pizzaKind = card && widgetTipo === 'pizza'
        ? card.getAttribute('data-pizza-kind')
        : null;
      const tempoAnos = card && widgetTipo === 'pizza'
        ? card.getAttribute('data-tempo-anos')
        : null;
      const tempoMeses = card && widgetTipo === 'pizza'
        ? card.getAttribute('data-tempo-meses')
        : null;
      const tempoSemanas = card && widgetTipo === 'pizza'
        ? card.getAttribute('data-tempo-semanas')
        : null;
      const tempoDias = card && widgetTipo === 'pizza'
        ? card.getAttribute('data-tempo-dias')
        : null;
      const tempoHoras = card && widgetTipo === 'pizza'
        ? card.getAttribute('data-tempo-horas')
        : null;
      const tempoMinutos = card && widgetTipo === 'pizza'
        ? card.getAttribute('data-tempo-minutos')
        : null;
      const plantaLabel = card && (widgetTipo === 'planta' || widgetTipo === 'mapa')
        ? card.getAttribute('data-planta-label')
        : null;
      const idNivel = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel')
        : null;
      const idNivelDestino = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-id-nivel-destino')
        : null;
      const origemLabel = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-origem-label')
        : null;
      const destinoLabel = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-destino-label')
        : null;
      const posicaoTipo = card && widgetTipo === 'deslocamento'
        ? card.getAttribute('data-posicao-tipo')
        : null;

      return {
        id: item.id,
        tipo: widgetTipo,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        config: {
          semMoldura,
          idNivelPlanta: idNivelPlanta || undefined,
          plantaLabel: plantaLabel || undefined,
          kpiCollection: kpiCollection || undefined,
          kpiLabel: kpiLabel || undefined,
          graficoTipo: graficoTipo || undefined,
          graficoLabel: graficoLabel || undefined,
          pizzaLabel: pizzaLabel || undefined,
          pizzaKind: pizzaKind || undefined,
          tempoAnos: tempoAnos || undefined,
          tempoMeses: tempoMeses || undefined,
          tempoSemanas: tempoSemanas || undefined,
          tempoDias: tempoDias || undefined,
          tempoHoras: tempoHoras || undefined,
          tempoMinutos: tempoMinutos || undefined,
          idNivelLoc1: idNivelLoc1 || undefined,
          idNivelLoc2: idNivelLoc2 || undefined,
          idNivelLoc3: idNivelLoc3 || undefined,
          idNivelLoc4: idNivelLoc4 || undefined,
          idNivel: idNivel || undefined,
          idNivelDestino: idNivelDestino || undefined,
          idNivelLoc1Deslocamento: deslocamentoLoc1 || undefined,
          idNivelLoc2Deslocamento: deslocamentoLoc2 || undefined,
          idNivelLoc3Deslocamento: deslocamentoLoc3 || undefined,
          idNivelLoc4Deslocamento: deslocamentoLoc4 || undefined,
          idNivelLoc1DestinoDeslocamento: deslocamentoLoc1Destino || undefined,
          idNivelLoc2DestinoDeslocamento: deslocamentoLoc2Destino || undefined,
          idNivelLoc3DestinoDeslocamento: deslocamentoLoc3Destino || undefined,
          idNivelLoc4DestinoDeslocamento: deslocamentoLoc4Destino || undefined,
          origemLabel: origemLabel || undefined,
          destinoLabel: destinoLabel || undefined,
          posicaoTipo: posicaoTipo || undefined
        }
      };
    });

    try {
      const reg = await obterContaParaPatch();
      if (!reg || !reg._id) {
        uteisService.onToast('Conta nao encontrada para salvar o layout.', 'error', 4000, 'top-end');
        return;
      }
      reg.widget_layout = widgets;
      await uteisService.patchBase('/conta', reg);
      uteisService.onToast('Layout salvo na conta!', 'success', 3000, 'top-end');
    } catch (e) {
      console.error(e);
      uteisService.onToast('Erro ao salvar layout no servidor.', 'error', 4000, 'top-end');
    }
  };

  $scope.carregarLayout = async function () {
    if (!grid || !$scope._regConta || !$scope._regConta._id) return;

    try {
      const reg = await obterContaParaPatch();
      if (!reg || !Array.isArray(reg.widget_layout) || !reg.widget_layout.length) {
        $scope.atualizarTemWidgets();
        return;
      }

      reg.widget_layout.forEach(widget => {
        const semMoldura = !!(widget.config && widget.config.semMoldura);
        const cfg = widget.config || {};
        const layoutMeta = {
          id: widget.id,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
          idNivelPlanta: cfg.idNivelPlanta,
          plantaLabel: cfg.plantaLabel,
          kpiCollection: cfg.kpiCollection,
          kpiLabel: cfg.kpiLabel,
          graficoTipo: cfg.graficoTipo,
          graficoLabel: cfg.graficoLabel,
          pizzaLabel: cfg.pizzaLabel,
          pizzaKind: cfg.pizzaKind,
          tempoAnos: cfg.tempoAnos,
          tempoMeses: cfg.tempoMeses,
          tempoSemanas: cfg.tempoSemanas,
          tempoDias: cfg.tempoDias,
          tempoHoras: cfg.tempoHoras,
          tempoMinutos: cfg.tempoMinutos,
          idNivelLoc1: cfg.idNivelLoc1,
          idNivelLoc2: cfg.idNivelLoc2,
          idNivelLoc3: cfg.idNivelLoc3,
          idNivelLoc4: cfg.idNivelLoc4,
          idNivel: cfg.idNivel,
          idNivelDestino: cfg.idNivelDestino,
          origemLabel: cfg.origemLabel,
          destinoLabel: cfg.destinoLabel,
          posicaoTipo: cfg.posicaoTipo
        };
        if (widget.tipo === 'deslocamento') {
          layoutMeta.idNivelLoc1 = cfg.idNivelLoc1Deslocamento;
          layoutMeta.idNivelLoc2 = cfg.idNivelLoc2Deslocamento;
          layoutMeta.idNivelLoc3 = cfg.idNivelLoc3Deslocamento;
          layoutMeta.idNivelLoc4 = cfg.idNivelLoc4Deslocamento;
          layoutMeta.idNivelLoc1Destino = cfg.idNivelLoc1DestinoDeslocamento;
          layoutMeta.idNivelLoc2Destino = cfg.idNivelLoc2DestinoDeslocamento;
          layoutMeta.idNivelLoc3Destino = cfg.idNivelLoc3DestinoDeslocamento;
          layoutMeta.idNivelLoc4Destino = cfg.idNivelLoc4DestinoDeslocamento;
        }
        $scope.addWidget(widget.tipo, semMoldura, layoutMeta);
      });
      $timeout(equalizarAlturasKpisMesmaLinha, 50);
      $scope.atualizarTemWidgets();
    } catch (e) {
      console.error(e);
      uteisService.onToast('Erro ao carregar layout da conta.', 'error', 4000, 'top-end');
    }
  };

  $scope.limparLayout = async function () {
    if (!grid) return;

    grid.removeAll();
    $scope.atualizarTemWidgets();

    try {
      const reg = await obterContaParaPatch();
      if (reg && reg._id) {
        reg.widget_layout = [];
        await uteisService.patchBase('/conta', reg);
      }
    } catch (e) {
      console.error(e);
      uteisService.onToast('Layout limpo na tela, mas falhou ao atualizar o servidor.', 'warning', 4000, 'top-end');
      return;
    }

    uteisService.onToast('Layout limpo!', 'success', 3000, 'top-end');
  };

});