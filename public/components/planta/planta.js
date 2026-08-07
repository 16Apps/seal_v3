app.component('planta', {
  bindings: {
    idNivelPlanta: '<',
    mostrarLegendaDescricao: '<',
    tamanhoFonteLegenda: '<',
    zoomInicial: '<',
    mostrarMarcacaoArea: '<'
  },

  controller: function (uteisService, $http, $timeout, $interval) {
    const $ctrl = this
    $ctrl._timePlanta = false;

    $ctrl._idNivelEdit = '';
    $ctrl._listNivel2 = [];
    $ctrl._listNivel3 = [];
    $ctrl._listNivel4 = [];

    $ctrl._editNivelSub2 = undefined;
    $ctrl._editNivelSub3 = undefined;
    $ctrl._editNivelSub4 = undefined;

    $ctrl.plantaSrc = ''; // sua planta
    $ctrl.imgW = 0; $ctrl.imgH = 0;
    $ctrl.centroide = (points) => centroide(points);

    $ctrl._regPlanta = { areasData: [] }; // inicial vazio
    $ctrl.zoomStep = 0.2; // quanto aumenta/diminui por clique
    $ctrl.zoom = 1.0;               // fator de escala
    $ctrl.pan = { x: 0, y: 0 };  // deslocamento
    $ctrl._ajusteInicialAplicado = false;
    $ctrl.panning = false;        // arrastando?
    let panStart = { x: 0, y: 0 };
    let mouseStart = { x: 0, y: 0 };

    $ctrl.drawing = false;
    $ctrl.currentPoints = [];     // pontos do polígono em edição
    $ctrl.areas = [];

    // ap site survey
    $ctrl._editAP = {
      // _id: "",
      descricao: "",
      mac: "",
      rssi: "",
      range: "",
      // full_aps: true
    };
    $ctrl._listAPs = [];
    $ctrl._editApModo = false;
    $ctrl._nivelAp2 = "";
    $ctrl._nivelAp3 = "";
    $ctrl._nivelAp4 = "";

    $ctrl._nivelItens2 = "";
    $ctrl._nivelItens3 = "";
    $ctrl._nivelItens4 = "";

    $ctrl._regTotais = {
      itens: 0,
      parado: 0,
      movimento: 0,
      gateways_ativo: 0,
    }
    $ctrl.descricaoNivel = '';

    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };

    $ctrl.$onInit = function () {

      $ctrl._regConta = uteisService.getCookie('_conta');
      $ctrl._mostrarLegendaDescricao = resolveBoolean($ctrl.mostrarLegendaDescricao, true);
      $ctrl._tamanhoFonteLegenda = resolveFontSize($ctrl.tamanhoFonteLegenda, 14);
      $ctrl.zoom = resolveZoom($ctrl.zoomInicial, 1.0);
      $ctrl._mostrarMarcacaoArea = resolveBoolean($ctrl.mostrarMarcacaoArea, true);


    };

    $ctrl.$onChanges = function (changes) {
      $ctrl._mostrarLegendaDescricao = resolveBoolean($ctrl.mostrarLegendaDescricao, true);
      $ctrl._tamanhoFonteLegenda = resolveFontSize($ctrl.tamanhoFonteLegenda, 14);
      $ctrl._mostrarMarcacaoArea = resolveBoolean($ctrl.mostrarMarcacaoArea, true);
      if (changes.zoomInicial) {
        $ctrl.zoom = resolveZoom($ctrl.zoomInicial, 1.0);
      }

      if ($ctrl.idNivelPlanta) {
        $ctrl._ajusteInicialAplicado = false;
        $timeout(async () => {

          uteisService.getBase('/_bd?c=localizacao&_id=' + $ctrl.idNivelPlanta) // + '&id_nivel=null'
            .then((res) => {
              $ctrl._editNivel = res[0]
              $ctrl.descricaoNivel = ($ctrl._editNivel && $ctrl._editNivel.descricao) ? $ctrl._editNivel.descricao : '';

              $ctrl._editNivel['_planta_baixa'] = ''
              $ctrl.plantaSrc = '';

              if ($ctrl._editNivel.planta_baixa) {
                $ctrl._editNivel._planta_baixa = uteisService.apiUrl_() + '/image/' + $ctrl._editNivel.planta_baixa

                $ctrl.onCarregaPlanta();
              };

              uteisService.getBase('/localizacao/subniveis/' + $ctrl.idNivelPlanta)
                .then((res) => {
                  $ctrl._listPlantaNivel1 = res.niveis
                  $ctrl.onCarregaPlanta();
                })
            })
            .catch(() => {
              $ctrl.descricaoNivel = '';
            })



        }, 10)
      }
    };


    // Planta Baixa

    $ctrl.onCarregaPlanta = async function () {

      $ctrl.plantaSrc = $ctrl._editNivel._planta_baixa
      $ctrl.initPlanta();

    }

    function ajustarPlantaAoViewport () {
      const viewport = document.getElementById('viewport');
      if (!viewport || !$ctrl.imgW || !$ctrl.imgH) return;

      const viewportW = viewport.clientWidth || 0;
      const viewportH = viewport.clientHeight || 0;
      if (!viewportW || !viewportH) return;

      // Ajuste "contain": imagem inteira cabe no componente sem cortar.
      const escala = Math.min(viewportW / $ctrl.imgW, viewportH / $ctrl.imgH);
      $ctrl.zoom = Math.max(0.1, escala);

      const renderW = $ctrl.imgW * $ctrl.zoom;
      const renderH = $ctrl.imgH * $ctrl.zoom;
      $ctrl.pan.x = (viewportW - renderW) / 2;
      $ctrl.pan.y = (viewportH - renderH) / 2;
    }

    $ctrl.initPlanta = function () {
      const img = new Image();
      img.onload = () => {
        $timeout(() => {
          $ctrl.imgW = img.naturalWidth;
          $ctrl.imgH = img.naturalHeight;
          if (!$ctrl._ajusteInicialAplicado) {
            ajustarPlantaAoViewport();
            $ctrl._ajusteInicialAplicado = true;
          }
          $ctrl.loadPlanta('abc123'); // 👈 aqui você chama o carregamento da planta

        }, 500);
      };
      img.src = $ctrl.plantaSrc;


      $ctrl.onCarregaPlantaZonas()

      if ($ctrl._timePlanta == false) {
        $ctrl._timePlanta = true;

        // substitui setInterval por $interval
        $interval(() => {
          $ctrl.onCarregaPlanta();
        }, 5000);
      }



    };

    // 🔹 Atualiza apenas os valores dentro das áreas (sem redesenhar)
    $ctrl.atualizaValoresAreas = async function () {
      if (!$ctrl._regConta || !$ctrl._regConta._id) return;

      try {
        const res = await uteisService.getBase('/localizacao/com-planta/' + $ctrl._regConta._id);
        $timeout(() => {

           $ctrl.loadPlanta();

        }, 10)


        // Força atualização visual
        // $ctrl.$applyAsync();
        console.log('♻️ Áreas atualizadas com novos valores');
      } catch (err) {
        console.error('Erro ao atualizar valores das áreas:', err);
      }
    };

    $ctrl.onCarregaPlantaZonas = async function (plantaId) {

      $ctrl._regPlanta = [{
        "areasData": []
      }]

      let _nivelFiltro = '2';
      let _listaNivel = $ctrl._listPlantaNivel1

      for (let i = 0; i < _listaNivel.length; i++) {
        const nivel = _listaNivel[i];

        // 🔎 Verifica se areasData existe e tem pelo menos 1 item
        if (nivel?.areasData?.length > 0 && Array.isArray(nivel.areasData[0].points)) {

          // 🔎 Garante que o destino também está pronto
          if (!$ctrl._regPlanta[0].areasData) {
            $ctrl._regPlanta[0].areasData = [];
          }

          // 🔹 Faz o push com segurança
          $ctrl._regPlanta[0].areasData.push({
            _id: nivel._id,
            descricao: nivel.descricao,
            points: nivel.areasData[0].points
          });

        } else {
          console.warn(`⚠️ Nível ${i} sem dados válidos de área:`, nivel);
        }
      }

      $ctrl._regPlanta = $ctrl._regPlanta[0]
      $ctrl.loadPlanta();

    }

    $ctrl.loadPlanta = async function (plantaId) {

      uteisService.getBase('/localizacao/com-planta/' + $ctrl._regConta._id) // + '&id_nivel=null'
        .then((res) => {
          let locaisItens = res || [];

          try {

            const planta = $ctrl._regPlanta; // ou conforme sua API retorna

            const normalizeAreaKey = (value) => {
              if (value === null || value === undefined) return '';
              return String(value)
                .trim()
                .split(';')[0] // alguns fluxos podem enviar "<id>;area"
                .replace(/^\{"\$oid":"(.*)"\}$/, '$1');
            };

            const totalFromLocal = (local) => {
              if (!local) return 0;
              const total = Number(local.total_itens);
              return Number.isFinite(total) ? total : 0;
            };

            const totalByAreaId = new Map();
            locaisItens.forEach((local) => {
              const areaKey = normalizeAreaKey(local && local._id);
              if (!areaKey) return;
              totalByAreaId.set(areaKey, totalFromLocal(local));
            });

            $ctrl.areas = [];

            (planta.areasData || []).forEach((a, idx) => {
              const areaKey = normalizeAreaKey(a && a._id);
              const totalItem = areaKey && totalByAreaId.has(areaKey)
                ? totalByAreaId.get(areaKey)
                : 0;

              $ctrl.areas.push({
                points: a.points.map(p => ({ x: Number(p.x), y: Number(p.y) })),
                addressId1: a._id || null,
                nome: a.descricao ? a.descricao : ('Área ' + (idx + 1)),
                fillColor: 'rgba(0,128,255,0.15)',  // cor padrão
                strokeColor: '#0080ff',
                textColor: '#004080',
                icon: 'wifi',        // material-symbols-rounded
                valor: totalItem
              });
            });

            console.log('Planta carregada com', $ctrl.areas.length, 'áreas');
          } catch (err) {
            console.error('Erro ao carregar planta:', err);
          }


        })


    };

    // ===== Helpers =====
    function clientToImageCoords(evt) {
      const viewport = document.getElementById('viewport').getBoundingClientRect();
      const xScreen = evt.clientX - viewport.left;
      const yScreen = evt.clientY - viewport.top;
      // inverte o transform do stage: (p - pan) / zoom
      const xImg = (xScreen - $ctrl.pan.x) / $ctrl.zoom;
      const yImg = (yScreen - $ctrl.pan.y) / $ctrl.zoom;
      return {
        x: Math.max(0, Math.min($ctrl.imgW, xImg)),
        y: Math.max(0, Math.min($ctrl.imgH, yImg))
      };
    }

    $ctrl.polyToAttr = (pts) => pts.map(p => `${p.x},${p.y}`).join(' ');

    // ===== Zoom (centrado no cursor) =====
    $ctrl.onWheel = function (evt) {


      evt.preventDefault();
      const oldZoom = $ctrl.zoom;
      const delta = evt.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(4, Math.max(0.4, oldZoom * delta));

      // manter o ponto do cursor fixo ao dar zoom
      const before = clientToImageCoords(evt); // coords na imagem antes do zoom
      $ctrl.zoom = newZoom;
      const after = clientToImageCoords(evt);  // coords na imagem depois do zoom

      $ctrl.pan.x += (after.x - before.x) * newZoom;
      $ctrl.pan.y += (after.y - before.y) * newZoom;


      //$ctrl.$applyAsync();
    };

    // ===== Pan (arrastar) =====
    $ctrl.onMouseDown = function (evt) {
      // se estiver desenhando, o click será tratado no onStageClick
      if ($ctrl.drawing) return;
      $ctrl.panning = true;
      panStart = { ...$ctrl.pan };
      mouseStart = { x: evt.clientX, y: evt.clientY };
    };
    $ctrl.onMouseMove = function (evt) {
      if (!$ctrl.panning) return;
      $ctrl.pan.x = panStart.x + (evt.clientX - mouseStart.x);
      $ctrl.pan.y = panStart.y + (evt.clientY - mouseStart.y);

      //$ctrl.$applyAsync();
    };

    $ctrl.onMouseUp = function () { $ctrl.panning = false; };

    // ===== Desenho do polígono =====
    $ctrl.startDrawing = function () {
      $ctrl.drawing = true;
      $ctrl.currentPoints = [];
    };
    $ctrl.cancelDrawing = function () {
      $ctrl.drawing = false;
      $ctrl.currentPoints = [];
    };

    $ctrl.onStageClick = function (evt) {
      $timeout(() => {
        if (!$ctrl.drawing) return;
        const p = clientToImageCoords(evt);

        // se já tem ponto, clique próximo ao primeiro fecha o polígono
        if ($ctrl.currentPoints.length > 2) {
          const first = $ctrl.currentPoints[0];
          const dx = p.x - first.x, dy = p.y - first.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 12) { // tolerância (px na imagem)
            $ctrl.finishDrawing();
            return;
          }
        }

        $ctrl.currentPoints.push({ x: Math.round(p.x), y: Math.round(p.y) });
      }, 500)
      //$ctrl.$applyAsync();
    };

    function centroide(points) {
      const x = points.reduce((a, p) => a + p.x, 0) / points.length;
      const y = points.reduce((a, p) => a + p.y, 0) / points.length;
      return { x, y };
    }

    function resolveBoolean(value, defaultValue) {
      if (value === undefined || value === null) return defaultValue;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
      }
      return Boolean(value);
    }

    function resolveFontSize(value, defaultValue) {
      const size = Number(value);
      if (!Number.isFinite(size) || size <= 0) return defaultValue;
      return size;
    }

    function resolveZoom(value, defaultValue) {
      const zoom = Number(value);
      if (!Number.isFinite(zoom)) return defaultValue;
      return Math.min(4, Math.max(0.4, zoom));
    }

    $ctrl.finishDrawing = function () {
      if ($ctrl.currentPoints.length < 3) return;

      let _local
      if ($ctrl._nivelPlanta4) {
        let iFind = $ctrl._listPlantaNivel4.findIndex((item) => item._id == $ctrl._nivelPlanta4)
        _local = $ctrl._listPlantaNivel4[iFind]
      } else if ($ctrl._nivelPlanta3) {
        let iFind = $ctrl._listPlantaNivel3.findIndex((item) => item._id == $ctrl._nivelPlanta3)
        _local = $ctrl._listPlantaNivel3[iFind]
      } else if ($ctrl._nivelPlanta2) {
        let iFind = $ctrl._listPlantaNivel2.findIndex((item) => item._id == $ctrl._nivelPlanta2)
        _local = $ctrl._listPlantaNivel2[iFind]
      }

      //let iFind = $ctrl._listNivel2.findIndex((item) => item._id == $ctrl._editPlanta.id_nivel_loc2)

      const area = {
        points: angular.copy($ctrl.currentPoints),
        addressId1: _local._id,
        nome: _local.descricao, // 👈 nome automático
        fillColor: 'rgba(0,128,255,0.15)',  // cor padrão
        strokeColor: '#0080ff',
        textColor: '#004080'
      };

      if (!_local.areasData) {
        _local.areasData = [];
      }

      if (!_local.areasData[0]) {
        _local.areasData.push({});
      }

      // if (!$ctrl._listNivel2[iFind].areasData) {
      //   $ctrl._listNivel2[iFind].areasData = [];
      // }

      // if (!$ctrl._listNivel2[iFind].areasData[0]) {
      //   $ctrl._listNivel2[iFind].areasData.push({});
      // }

      _local.areasData[0].points = area.points;

      uteisService.patchBase('/localizacao', _local)

      $ctrl.areas.push(area);
      $ctrl.drawing = false;
      $ctrl.currentPoints = [];
    };

    $ctrl.setAreaStyle = function (areaIdOrIndex, options = {}) {
      // Buscar a área por índice ou ID
      $timeout(() => {
        const area = typeof areaIdOrIndex === 'number'
          ? $ctrl.areas[areaIdOrIndex]
          : $ctrl.areas.find(a => a.addressId1 === areaIdOrIndex);

        if (!area) return;

        // 🔹 Atualiza propriedades passadas
        if (options.fillColor) area.fillColor = options.fillColor;
        if (options.textColor) area.textColor = options.textColor;
        if (options.strokeColor) area.strokeColor = options.strokeColor;
        if (options.nome) area.nome = options.nome;
      }, 500)
      // Atualiza a view
      //$ctrl.$applyAsync();
    };

    $ctrl.onSelectArea = function (area, evt) {
      $timeout(() => {
        evt.stopPropagation(); // evita conflito com clique de desenho
        $ctrl.areas.forEach(a => a.fillColor = 'rgba(0,128,255,0.15)');
        area.fillColor = 'rgba(255,255,0,0.25)';
        area.textColor = '#000';
      }, 500)
      //$ctrl.$applyAsync();
    };

    $ctrl.zoomIn = function () {

      $ctrl.setAreaStyle('idLocal01', {
        fillColor: 'rgba(0,255,0,0.25)',
        textColor: '#006400',
        nome: 'Recebimento'
      });

      $ctrl.zoom = Math.min(4, $ctrl.zoom + $ctrl.zoomStep);
    };

    $ctrl.zoomOut = function () {

      $ctrl.zoom = Math.max(0.4, $ctrl.zoom - $ctrl.zoomStep);
    };



    // Final Planta Baixa



  },
  templateUrl: 'components/planta/planta.html'
});