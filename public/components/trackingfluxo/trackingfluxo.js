app.component('trackingfluxo', {
  bindings: {
    acao: '@',
    funcao: '<',
    edit: '<',
    idUser: '<',
    onFechar: '&'
  },

  controller: function (uteisService, $http, $timeout) {
    const $ctrl = this;

    $ctrl._editFluxo = {};
    $ctrl._regConta = {};
    $ctrl._listCategorias = [];
    $ctrl._listNivel1 = [];
    $ctrl._salvando = false;
    $ctrl._etapaAberta = null;
    $ctrl._editGen = 0;
    $ctrl._seqNivel1 = 0;

    function normalizaId(v) {
      if (v == null || v === '') return '';
      if (typeof v === 'object' && v._id) return String(v._id);
      return String(v);
    }

    function num(v, def) {
      var n = Number(v);
      return Number.isFinite(n) ? n : (def != null ? def : 0);
    }

    function digestUI() {
      $timeout(angular.noop, 0);
    }

    function limparListasNiveis() {
      $ctrl._listNivel1 = [];
      (($ctrl._editFluxo && $ctrl._editFluxo.etapas) || []).forEach(function (e) {
        if (!e) return;
        e._listNivel2 = [];
        e._listNivel3 = [];
        e._listNivel4 = [];
        e._seq = (e._seq || 0) + 1;
      });
    }

    function novaEtapa(numero) {
      return {
        _id: uteisService.onGetID(),
        etapa_numero: numero || 1,
        etapa_descricao: '',
        id_nivel_loc1: '',
        id_nivel_loc2: '',
        id_nivel_loc3: '',
        id_nivel_loc4: '',
        tempo_permanencia_minimo: 0,
        tempo_permanencia_maximo: 0,
        tempo_descolamento_proxima_etapa: 0,
        _listNivel2: [],
        _listNivel3: [],
        _listNivel4: [],
        _seq: 0
      };
    }

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta') || {};
      $ctrl._regConta = uteisService.normalizarConta($ctrl._regConta);
    };

    $ctrl.$onChanges = function (changes) {
      if (!(changes.funcao || changes.edit)) return;

      // Fechar / limpar bindings do pai → invalida carga em andamento
      if ($ctrl.funcao !== 'add' && $ctrl.funcao !== 'edit') {
        $ctrl._editGen += 1;
        $ctrl._seqNivel1 += 1;
        limparListasNiveis();
        return;
      }

      if ($ctrl.funcao == 'add') {
        $ctrl.onEditar(undefined);
      } else if ($ctrl.funcao == 'edit' && $ctrl.edit) {
        $ctrl.onEditar($ctrl.edit);
      }
    };

    $ctrl.onEditar = async function (reg) {
      const gen = ++$ctrl._editGen;

      if (!$ctrl._regConta || !$ctrl._regConta._id) {
        $ctrl._regConta = uteisService.normalizarConta(uteisService.getCookie('_conta') || {});
      }

      limparListasNiveis();

      await $ctrl.onCarregaCategorias();
      if (gen !== $ctrl._editGen) return;

      await $ctrl.onCarregaNivel1();
      if (gen !== $ctrl._editGen) return;

      if (reg == undefined) {
        $ctrl._editFluxo = {
          _id: uteisService.onGetID(),
          id_conta: $ctrl._regConta._id,
          ativo: '1',
          descricao: '',
          id_categoria: '',
          etapas: [novaEtapa(1)]
        };
        $ctrl._etapaAberta = $ctrl._editFluxo.etapas[0]._id;
      } else {
        $ctrl._editFluxo = angular.copy(reg);
        $ctrl._editFluxo.ativo = String($ctrl._editFluxo.ativo != null ? $ctrl._editFluxo.ativo : '1');
        $ctrl._editFluxo.id_categoria = normalizaId($ctrl._editFluxo.id_categoria);

        var etapas = Array.isArray($ctrl._editFluxo.etapas) ? $ctrl._editFluxo.etapas : [];
        $ctrl._editFluxo.etapas = [];

        for (var i = 0; i < etapas.length; i++) {
          if (gen !== $ctrl._editGen) return;

          var e = etapas[i] || {};
          var etapa = {
            _id: e._id || uteisService.onGetID(),
            etapa_numero: num(e.etapa_numero, i + 1),
            etapa_descricao: e.etapa_descricao || '',
            id_nivel_loc1: normalizaId(e.id_nivel_loc1),
            id_nivel_loc2: normalizaId(e.id_nivel_loc2),
            id_nivel_loc3: normalizaId(e.id_nivel_loc3),
            id_nivel_loc4: normalizaId(e.id_nivel_loc4),
            tempo_permanencia_minimo: num(e.tempo_permanencia_minimo, 0),
            tempo_permanencia_maximo: num(e.tempo_permanencia_maximo, 0),
            tempo_descolamento_proxima_etapa: num(e.tempo_descolamento_proxima_etapa, 0),
            _listNivel2: [],
            _listNivel3: [],
            _listNivel4: [],
            _seq: 0
          };
          $ctrl._editFluxo.etapas.push(etapa);
          await $ctrl.carregarFilhosEtapa(etapa);
          if (gen !== $ctrl._editGen) return;
        }

        if (!$ctrl._editFluxo.etapas.length) {
          $ctrl._editFluxo.etapas.push(novaEtapa(1));
        }
        $ctrl.renumerarEtapas();
        $ctrl._etapaAberta = $ctrl._editFluxo.etapas[0]._id;
      }

      digestUI();
    };

    $ctrl.onCarregaCategorias = async function () {
      try {
        var res = await uteisService.getBase(
          '/_bd?c=categoria&id_conta=' + encodeURIComponent($ctrl._regConta._id) + '&sort=descricao'
        );
        $ctrl._listCategorias = Array.isArray(res) ? res.slice() : [];
      } catch (e) {
        $ctrl._listCategorias = [];
      }
    };

    $ctrl.onCarregaNivel1 = async function () {
      $ctrl._seqNivel1 += 1;
      var seq = $ctrl._seqNivel1;
      try {
        var res = await uteisService.getBase(
          '/_bd?c=localizacao&id_conta=' + encodeURIComponent($ctrl._regConta._id) + '&id_nivel=null&sort=descricao'
        );
        if (seq !== $ctrl._seqNivel1) return;
        $ctrl._listNivel1 = Array.isArray(res) ? res.slice() : [];
      } catch (e) {
        if (seq === $ctrl._seqNivel1) {
          $ctrl._listNivel1 = [];
        }
      }
    };

    $ctrl.carregarFilhosPorPai = async function (idPai) {
      if (!idPai) return [];
      try {
        var res = await uteisService.getBase(
          '/_bd?c=localizacao&id_conta=' + encodeURIComponent($ctrl._regConta._id)
          + '&id_nivel=' + encodeURIComponent(idPai) + '&sort=descricao'
        );
        return Array.isArray(res) ? res.slice() : [];
      } catch (e) {
        return [];
      }
    };

    $ctrl.carregarFilhosEtapa = async function (etapa) {
      if (!etapa) return;
      etapa._seq = (etapa._seq || 0) + 1;
      var seq = etapa._seq;

      var n2 = etapa.id_nivel_loc1
        ? await $ctrl.carregarFilhosPorPai(etapa.id_nivel_loc1)
        : [];
      if (seq !== etapa._seq) return;
      etapa._listNivel2 = n2;

      var n3 = etapa.id_nivel_loc2
        ? await $ctrl.carregarFilhosPorPai(etapa.id_nivel_loc2)
        : [];
      if (seq !== etapa._seq) return;
      etapa._listNivel3 = n3;

      var n4 = etapa.id_nivel_loc3
        ? await $ctrl.carregarFilhosPorPai(etapa.id_nivel_loc3)
        : [];
      if (seq !== etapa._seq) return;
      etapa._listNivel4 = n4;
    };

    $ctrl.renumerarEtapas = function () {
      ($ctrl._editFluxo.etapas || []).forEach(function (e, idx) {
        e.etapa_numero = idx + 1;
      });
    };

    $ctrl.onToggleEtapa = function (etapa) {
      if (!etapa) return;
      $ctrl._etapaAberta = ($ctrl._etapaAberta === etapa._id) ? null : etapa._id;
    };

    $ctrl.onAddEtapa = function () {
      if (!$ctrl._editFluxo.etapas) $ctrl._editFluxo.etapas = [];
      var etapa = novaEtapa(($ctrl._editFluxo.etapas.length || 0) + 1);
      $ctrl._editFluxo.etapas.push(etapa);
      $ctrl.renumerarEtapas();
      $ctrl._etapaAberta = etapa._id;
    };

    $ctrl.onRemoverEtapa = function (etapa, $event) {
      if ($event) $event.stopPropagation();
      if (!$ctrl._editFluxo.etapas || $ctrl._editFluxo.etapas.length <= 1) {
        uteisService.onToast('O fluxo precisa ter ao menos uma etapa.', 'warning', 2500, 'top-end');
        return;
      }
      uteisService.onQuestion('Remover etapa', 'Deseja remover esta etapa do fluxo?')
        .then(function (ok) {
          if (!ok) return;
          $ctrl._editFluxo.etapas = $ctrl._editFluxo.etapas.filter(function (e) {
            return e._id !== etapa._id;
          });
          $ctrl.renumerarEtapas();
          if ($ctrl._etapaAberta === etapa._id) {
            $ctrl._etapaAberta = $ctrl._editFluxo.etapas[0] ? $ctrl._editFluxo.etapas[0]._id : null;
          }
          digestUI();
        });
    };

    $ctrl.onMoverEtapa = function (index, dir, $event) {
      if ($event) $event.stopPropagation();
      var lista = $ctrl._editFluxo.etapas || [];
      var novo = index + dir;
      if (novo < 0 || novo >= lista.length) return;
      var tmp = lista[index];
      lista[index] = lista[novo];
      lista[novo] = tmp;
      $ctrl.renumerarEtapas();
    };

    $ctrl.onMudaNivelEtapa = async function (etapa, nivel) {
      if (!etapa) return;
      etapa._seq = (etapa._seq || 0) + 1;
      var seq = etapa._seq;

      if (nivel === 1) {
        etapa.id_nivel_loc2 = '';
        etapa.id_nivel_loc3 = '';
        etapa.id_nivel_loc4 = '';
        etapa._listNivel2 = [];
        etapa._listNivel3 = [];
        etapa._listNivel4 = [];
        if (etapa.id_nivel_loc1) {
          var n2 = await $ctrl.carregarFilhosPorPai(etapa.id_nivel_loc1);
          if (seq !== etapa._seq) return;
          etapa._listNivel2 = n2;
        }
      } else if (nivel === 2) {
        etapa.id_nivel_loc3 = '';
        etapa.id_nivel_loc4 = '';
        etapa._listNivel3 = [];
        etapa._listNivel4 = [];
        if (etapa.id_nivel_loc2) {
          var n3 = await $ctrl.carregarFilhosPorPai(etapa.id_nivel_loc2);
          if (seq !== etapa._seq) return;
          etapa._listNivel3 = n3;
        }
      } else if (nivel === 3) {
        etapa.id_nivel_loc4 = '';
        etapa._listNivel4 = [];
        if (etapa.id_nivel_loc3) {
          var n4 = await $ctrl.carregarFilhosPorPai(etapa.id_nivel_loc3);
          if (seq !== etapa._seq) return;
          etapa._listNivel4 = n4;
        }
      }

      digestUI();
    };

    $ctrl.resumoLocalEtapa = function (etapa) {
      if (!etapa) return 'Sem localização';
      var ids = [
        etapa.id_nivel_loc1,
        etapa.id_nivel_loc2,
        etapa.id_nivel_loc3,
        etapa.id_nivel_loc4
      ].filter(Boolean);
      if (!ids.length) return 'Sem localização';

      function nomeDe(id, listas) {
        for (var i = 0; i < listas.length; i++) {
          var hit = (listas[i] || []).find(function (x) { return x && String(x._id) === String(id); });
          if (hit) return hit.descricao;
        }
        return null;
      }

      var partes = [];
      var n1 = nomeDe(etapa.id_nivel_loc1, [$ctrl._listNivel1]);
      var n2 = nomeDe(etapa.id_nivel_loc2, [etapa._listNivel2]);
      var n3 = nomeDe(etapa.id_nivel_loc3, [etapa._listNivel3]);
      var n4 = nomeDe(etapa.id_nivel_loc4, [etapa._listNivel4]);
      if (n1) partes.push(n1);
      if (n2) partes.push(n2);
      if (n3) partes.push(n3);
      if (n4) partes.push(n4);
      return partes.length ? partes.join(' · ') : (ids.length + ' nível(is)');
    };

    $ctrl.onSalvar = function () {
      if ($ctrl._salvando) return;

      if (!$ctrl._editFluxo.descricao || String($ctrl._editFluxo.descricao).trim() === '') {
        uteisService.onToast('Informe a descrição do fluxo.', 'warning', 3000, 'top-end');
        return;
      }

      var etapas = Array.isArray($ctrl._editFluxo.etapas) ? $ctrl._editFluxo.etapas : [];
      if (!etapas.length) {
        uteisService.onToast('Inclua ao menos uma etapa.', 'warning', 3000, 'top-end');
        return;
      }

      for (var i = 0; i < etapas.length; i++) {
        var e = etapas[i];
        if (!e.etapa_descricao || String(e.etapa_descricao).trim() === '') {
          uteisService.onToast('Informe a descrição da etapa ' + (i + 1) + '.', 'warning', 3000, 'top-end');
          $ctrl._etapaAberta = e._id;
          return;
        }
      }

      var payload = {
        _id: $ctrl._editFluxo._id,
        id_conta: $ctrl._editFluxo.id_conta || $ctrl._regConta._id,
        ativo: String($ctrl._editFluxo.ativo != null ? $ctrl._editFluxo.ativo : '1'),
        descricao: String($ctrl._editFluxo.descricao).trim(),
        id_categoria: normalizaId($ctrl._editFluxo.id_categoria) || '',
        etapas: etapas.map(function (e, idx) {
          return {
            _id: e._id || uteisService.onGetID(),
            etapa_numero: idx + 1,
            etapa_descricao: String(e.etapa_descricao || '').trim(),
            id_nivel_loc1: normalizaId(e.id_nivel_loc1) || '',
            id_nivel_loc2: normalizaId(e.id_nivel_loc2) || '',
            id_nivel_loc3: normalizaId(e.id_nivel_loc3) || '',
            id_nivel_loc4: normalizaId(e.id_nivel_loc4) || '',
            tempo_permanencia_minimo: num(e.tempo_permanencia_minimo, 0),
            tempo_permanencia_maximo: num(e.tempo_permanencia_maximo, 0),
            tempo_descolamento_proxima_etapa: num(e.tempo_descolamento_proxima_etapa, 0)
          };
        })
      };

      $ctrl._salvando = true;
      uteisService.patchBase('/trackingfluxo', payload)
        .then(function () {
          uteisService.onToast('Fluxo salvo!', 'success', 2500, 'top-end');
          $ctrl.fechar();
        })
        .catch(function () {
          uteisService.onToast('Erro ao salvar o fluxo.', 'error', 3000, 'top-end');
        })
        .finally(function () {
          $ctrl._salvando = false;
          digestUI();
        });
    };

    $ctrl.onExcluir = function () {
      if (!$ctrl._editFluxo || !$ctrl._editFluxo._id) return;

      uteisService.onQuestion('Atenção!', 'Deseja realmente excluir esse fluxo?')
        .then(function (ok) {
          if (!ok) return;
          uteisService.delBase('trackingfluxo/_id/' + $ctrl._editFluxo._id)
            .then(function () {
              uteisService.onToast('Fluxo excluído!', 'success', 2500, 'top-end');
              $ctrl.fechar();
            })
            .catch(function () {
              uteisService.onToast('Erro ao excluir o fluxo.', 'error', 3000, 'top-end');
            });
        });
    };

    $ctrl.fechar = function () {
      $ctrl._editGen += 1;
      $ctrl._seqNivel1 += 1;
      limparListasNiveis();
      $ctrl.onFechar();
    };
  },

  templateUrl: 'components/trackingfluxo/trackingfluxo.html'
});
