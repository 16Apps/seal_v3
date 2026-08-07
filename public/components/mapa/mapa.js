app.component('mapa', {
  bindings: {
    idNivel: '<',
    titulo: '<?'
  },

  controller: function (uteisService, $timeout, $interval, $element) {
    const $ctrl = this;

    let polygons = [];
    let markers = [];
    let map = null;
    let mapDomId = '';
    let refreshTimer = null;
    let loadSeq = 0;

    $ctrl._regNivel = null;
    $ctrl._regConta = null;
    $ctrl.descricaoNivel = '';
    $ctrl.carregando = false;
    $ctrl.erro = null;
    $ctrl._regTotais = {
      itens: 0,
      parado: 0,
      movimento: 0,
      gateways_ativo: 0
    };

    function getMapEl() {
      const root = $element && $element[0];
      if (!root) return null;
      if (mapDomId) {
        const byId = document.getElementById(mapDomId);
        if (byId) return byId;
      }
      return root.querySelector('[data-mapa-canvas]');
    }

    function ensureMapElId() {
      const el = getMapEl();
      if (!el) return null;
      if (!mapDomId) {
        mapDomId = 'mapa-widget-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      }
      el.id = mapDomId;
      return el;
    }

    function limparOverlays() {
      polygons.forEach(function (p) { p.setMap(null); });
      markers.forEach(function (m) { m.setMap(null); });
      polygons = [];
      markers = [];
    }

    function pararRefresh() {
      if (refreshTimer) {
        $interval.cancel(refreshTimer);
        refreshTimer = null;
      }
    }

    function parseCoord(valor) {
      const n = parseFloat(valor);
      return Number.isFinite(n) ? n : null;
    }

    function pertenceAoNivelSelecionado(loc, idNivel) {
      if (!loc || !idNivel) return false;
      const id = String(idNivel);
      if (String(loc._id) === id) return true;
      if (String(loc.nivel_id || '') === id) return true;
      if (String(loc.id_nivel || '') === id) return true;
      if (String(loc.id_nivel_loc1 || '') === id) return true;
      return false;
    }

    function atualizarAreasNoMapa() {
      if (!map || !$ctrl._regConta || !$ctrl._regConta._id) return;

      limparOverlays();

      uteisService.getBase('/localizacao/com-areas/' + $ctrl._regConta._id)
        .then(function (res) {
          let locais = Array.isArray(res) ? res.slice() : [];
          const idNivel = String($ctrl.idNivel || '').trim();

          // Prioriza áreas do nível selecionado / filhos; se nada vier, mostra todas com área.
          let filtrados = locais.filter(function (item) {
            return item && Array.isArray(item.areasData) && item.areasData.length
              && pertenceAoNivelSelecionado(item, idNivel);
          });

          if (!filtrados.length) {
            filtrados = locais.filter(function (item) {
              return item && Array.isArray(item.areasData) && item.areasData.length;
            });
          }

          $ctrl._regTotais.itens = 0;
          let c = 0;
          const areaColors = [
            { stroke: '#1d3557', fill: '#457b9d' },
            { stroke: '#78290f', fill: '#e76f51' },
            { stroke: '#2a9d8f', fill: '#99d98c' },
            { stroke: '#ffb703', fill: '#f4d35e' },
            { stroke: '#7209b7', fill: '#b388eb' }
          ];

          filtrados.forEach(function (loc) {
            (loc.areasData || []).forEach(function (area) {
              const pontos = area.pointsLatLng || [];
              if (!pontos.length) return;

              const color = areaColors[c];
              c = (c + 1) % areaColors.length;

              const polygon = new google.maps.Polygon({
                paths: pontos,
                strokeColor: color.stroke,
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: color.fill,
                fillOpacity: 0.4,
                map: map
              });
              polygons.push(polygon);

              const bounds = new google.maps.LatLngBounds();
              polygon.getPath().forEach(function (p) { bounds.extend(p); });
              const labelPos = bounds.getCenter();

              const labelMarker = new google.maps.Marker({
                position: labelPos,
                map: map,
                label: {
                  text: String(loc.descricao || 'Área'),
                  color: '#edf0f5',
                  fontWeight: 'bold',
                  fontSize: '13px'
                },
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }
              });
              markers.push(labelMarker);

              const info = new google.maps.InfoWindow({
                content: '<b>' + (loc.descricao || '') + '</b>',
                position: labelPos
              });
              polygon.addListener('click', function () { info.open(map); });

              const numPins = Number(loc.total_itens) || 0;
              $ctrl._regTotais.itens += numPins;
              $ctrl._regTotais.parado += numPins;

              if (google.maps.geometry && google.maps.geometry.poly && numPins > 0) {
                for (let i = 0; i < numPins; i++) {
                  let randomPoint = null;
                  let attempts = 0;
                  do {
                    const lat = bounds.getSouthWest().lat()
                      + Math.random() * (bounds.getNorthEast().lat() - bounds.getSouthWest().lat());
                    const lng = bounds.getSouthWest().lng()
                      + Math.random() * (bounds.getNorthEast().lng() - bounds.getSouthWest().lng());
                    randomPoint = new google.maps.LatLng(lat, lng);
                    attempts++;
                  } while (!google.maps.geometry.poly.containsLocation(randomPoint, polygon) && attempts < 30);

                  if (google.maps.geometry.poly.containsLocation(randomPoint, polygon)) {
                    markers.push(new google.maps.Marker({
                      position: randomPoint,
                      map: map,
                      icon: {
                        url: '../assets/images/icon_cadeira.fw.png',
                        scaledSize: new google.maps.Size(42, 42),
                        anchor: new google.maps.Point(16, 32)
                      }
                    }));
                  }
                }
              }
            });
          });
        })
        .catch(function (err) {
          console.error('Erro ao carregar áreas do mapa:', err);
        });
    }

    function initMapCanvas() {
      const mapEl = ensureMapElId();
      if (!mapEl) {
        $ctrl.erro = 'Container do mapa não encontrado.';
        return false;
      }

      if (typeof google === 'undefined' || !google.maps) {
        $ctrl.erro = 'Google Maps não carregado.';
        return false;
      }

      const latitude = parseCoord($ctrl._regNivel && $ctrl._regNivel.latitude);
      const longitude = parseCoord($ctrl._regNivel && $ctrl._regNivel.longitude);

      if (latitude == null || longitude == null) {
        $ctrl.erro = 'Localização sem latitude/longitude cadastradas.';
        return false;
      }

      map = new google.maps.Map(mapEl, {
        center: { lat: latitude, lng: longitude },
        zoom: 16,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        styles: [
          { elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0b1f36' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a2342' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#0f2c52' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#15518a' }] },
          { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#124c7d' }] },
          { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e4e8c' }] },
          {
            featureType: 'landscape.man_made',
            elementType: 'geometry.fill',
            stylers: [{ color: '#132b4a' }, { lightness: 10 }]
          },
          {
            featureType: 'poi.business',
            elementType: 'geometry.fill',
            stylers: [{ color: '#1a3a6e' }, { visibility: 'on' }, { saturation: -20 }]
          },
          {
            featureType: 'poi.business',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#245d9a' }, { weight: 0.5 }, { visibility: 'on' }]
          }
        ]
      });

      // GridStack / widget: força recalcular tamanho após montar.
      $timeout(function () {
        if (!map) return;
        google.maps.event.trigger(map, 'resize');
        map.setCenter({ lat: latitude, lng: longitude });
      }, 120);

      return true;
    }

    function carregar() {
      const idNivel = String($ctrl.idNivel || '').trim();
      if (!idNivel) {
        $ctrl.erro = 'Nível não informado.';
        $ctrl.descricaoNivel = '';
        return;
      }

      if (!$ctrl._regConta || !$ctrl._regConta._id) {
        $ctrl._regConta = uteisService.normalizarConta(uteisService.getCookie('_conta'));
      }
      if (!$ctrl._regConta || !$ctrl._regConta._id) {
        $ctrl.erro = 'Conta local não encontrada.';
        return;
      }

      const seq = ++loadSeq;
      $ctrl.carregando = true;
      $ctrl.erro = null;
      $ctrl.descricaoNivel = String($ctrl.titulo || '').trim();

      uteisService.getBase('/_bd?c=localizacao&_id=' + encodeURIComponent(idNivel))
        .then(function (res) {
          if (seq !== loadSeq) return;
          const nivel = Array.isArray(res) ? res[0] : res;
          if (!nivel) {
            $ctrl.erro = 'Localização não encontrada.';
            $ctrl._regNivel = null;
            return;
          }

          $ctrl._regNivel = nivel;
          $ctrl.descricaoNivel = nivel.descricao || $ctrl.descricaoNivel || 'Mapa';

          limparOverlays();
          pararRefresh();

          if (!initMapCanvas()) return;

          atualizarAreasNoMapa();
          refreshTimer = $interval(function () {
            atualizarAreasNoMapa();
          }, 5000);
        })
        .catch(function (err) {
          if (seq !== loadSeq) return;
          console.error(err);
          $ctrl.erro = 'Não foi possível carregar o mapa.';
          $ctrl._regNivel = null;
        })
        .finally(function () {
          if (seq !== loadSeq) return;
          $ctrl.carregando = false;
        });
    }

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.normalizarConta(uteisService.getCookie('_conta'));
      mapDomId = 'mapa-widget-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      if ($ctrl.titulo) $ctrl.descricaoNivel = String($ctrl.titulo);
    };

    $ctrl.$postLink = function () {
      ensureMapElId();
      // Garante carga após o DOM do widget existir (GridStack + compile).
      $timeout(carregar, 50);
    };

    $ctrl.$onChanges = function (changes) {
      if (!changes) return;
      if (changes.titulo && $ctrl.titulo) {
        $ctrl.descricaoNivel = String($ctrl.titulo);
      }
      if (changes.idNivel && !changes.idNivel.isFirstChange()) {
        $timeout(carregar, 0);
      }
    };

    $ctrl.$onDestroy = function () {
      pararRefresh();
      limparOverlays();
      map = null;
    };
  },

  templateUrl: 'components/mapa/mapa.html'
});
