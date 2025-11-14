app.component('mapa', {
  bindings: {
    idNivel: '<'
  },

  controller: function (uteisService, $http, $timeout, $interval) {
    const $ctrl = this
    $ctrl._timeMapa = false;
let polygons = [];
let markers = [];

    $ctrl._regNivel = {}

    //mapa
    let map;
    let drawingManager;

    $ctrl._regTotais = {
      itens: 0,
      parado: 0,
      movimento: 0,
      gateways_ativo: 0,
    }

    $ctrl.options = {
      headers: { 'Content-Type': 'application/json' }
    };

    $ctrl.$onInit = function () {
      $ctrl._regConta = uteisService.getCookie('_conta');

      // uteisService.getBase('/_bd?c=localizacao&_id=' + $ctrl.idNivel) // + '&id_nivel=null'
      //   .then((res) => {
      //     $ctrl._regNivel = res[0]
      //     $ctrl.initMap2();
      //   })
    };

    $ctrl.$onChanges = function (changes) {

      if ($ctrl.idNivel) {
        $timeout(() => {
          uteisService.getBase('/_bd?c=localizacao&_id=' + $ctrl.idNivel) // + '&id_nivel=null'
            .then((res) => {
              $ctrl._regNivel = res[0]
              $ctrl.initMap2();
            })
        }, 10)
      }


    };

    // Mapa Google
    $ctrl.initMap2 = function () {

      $ctrl._regTotais.itens = 0
      $ctrl._regTotais.parado = 0;


      const latitude = parseFloat($ctrl._regNivel.latitude);
      const longitude = parseFloat($ctrl._regNivel.longitude);

      // const latitude = parseFloat("-23.627691");
      // const longitude = parseFloat("-46.655297");

      map = new google.maps.Map(document.getElementById('map2'), {
        center: { lat: latitude, lng: longitude },
        zoom: 15,
        heading: 45,  // rotação real
        mapTypeId: "roadmap",
        disableDefaultUI: true,
        styles: [
          // Oculta textos e labels
          { elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },

          // // Fundo geral escuro (blueprint)
          // { elementType: "geometry", stylers: [{ color: "#778da9" }] },
          { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0b1f36" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a2342" }] },

          // Ruas com traçado azul
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#0f2c52" }] },
          { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#15518a" }] },

          // Trilhos / linhas de transporte
          { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#124c7d" }] },

          // Contornos administrativos
          { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1e4e8c" }] },

          // 🔹 Áreas construídas (edifícios)
          {
            featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [
              { color: "#132b4a" },   // tom mais claro que o fundo
              { lightness: 10 }       // realce leve
            ]
          },
          {
            featureType: "poi.business", elementType: "geometry.fill", stylers: [
              { color: "#1a3a6e" },   // cor de edifícios e quarteirões
              { visibility: "on" },
              { saturation: -20 }
            ]
          },
          {
            featureType: "poi.business", elementType: "geometry.stroke", stylers: [
              { color: "#245d9a" },
              { weight: 0.5 },
              { visibility: "on" }
            ]
          }
        ]
      });

      drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false, //true
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_CENTER,
          drawingModes: ['polygon']
        },
        polygonOptions: {
          fillColor: '#778da9',
          fillOpacity: 0.35,
          strokeWeight: 2,
          strokeColor: '#415a77',
          clickable: true,
          editable: true,
          zIndex: 1
        }
      });
      drawingManager.setMap(map);


let updMapa = () => {
  // 🔹 Limpa polígonos e marcadores anteriores
  polygons.forEach(p => p.setMap(null));
  markers.forEach(m => m.setMap(null));
  polygons = [];
  markers = [];

  uteisService.getBase('/localizacao/com-areas/' + $ctrl._regConta._id)
    .then((res) => {
      let locais = (res || []).filter((item) => item.nivel_id != null);
      $ctrl._regTotais.itens = 0;
      let c = 0;

      const areaColors = [
        { stroke: '#1d3557', fill: '#457b9d' },
        { stroke: '#78290f', fill: '#e76f51' },
        { stroke: '#2a9d8f', fill: '#99d98c' },
        { stroke: '#ffb703', fill: '#f4d35e' },
        { stroke: '#7209b7', fill: '#b388eb' }
      ];

      locais.forEach(loc => {
        if (!loc.areasData?.length) return;

        loc.areasData.forEach((area, i) => {
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

          // centro do polígono
          const bounds = new google.maps.LatLngBounds();
          polygon.getPath().forEach(p => bounds.extend(p));
          const labelPos = bounds.getCenter();

          // marcador com nome fixo
          const labelMarker = new google.maps.Marker({
            position: labelPos,
            map: map,
            label: {
              text: loc.descricao,
              color: "#343a40",
              fontWeight: "bold",
              fontSize: "13px"
            },
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }
          });
          markers.push(labelMarker);

          // InfoWindow
          const info = new google.maps.InfoWindow({
            content: `<b>${loc.descricao}</b>`,
            position: labelPos
          });
          polygon.addListener('click', () => info.open(map));

          // 🔸 cria marcadores dos itens
          $ctrl._regTotais.itens += loc.total_itens;
          const numPins = loc.total_itens;

          if (google.maps.geometry && google.maps.geometry.poly) {
            for (let i = 0; i < numPins; i++) {
              let randomPoint;
              let attempts = 0;
              do {
                const lat = bounds.getSouthWest().lat() + Math.random() * (bounds.getNorthEast().lat() - bounds.getSouthWest().lat());
                const lng = bounds.getSouthWest().lng() + Math.random() * (bounds.getNorthEast().lng() - bounds.getSouthWest().lng());
                randomPoint = new google.maps.LatLng(lat, lng);
                attempts++;
              } while (!google.maps.geometry.poly.containsLocation(randomPoint, polygon) && attempts < 30);

              if (google.maps.geometry.poly.containsLocation(randomPoint, polygon)) {
                const marker = new google.maps.Marker({
                  position: randomPoint,
                  map: map,
                  icon: {
                    url: "../assets/images/icon_cadeira.fw.png",
                    scaledSize: new google.maps.Size(42, 42),
                    anchor: new google.maps.Point(16, 32)
                  }
                });
                markers.push(marker);
              }
            }
          }
        });
      });
    });
};

      updMapa()
      if ($ctrl._timeMapa == false) {
        $ctrl._timeMapa = true;

        // substitui setInterval por $interval
        $interval(() => {
          updMapa()
        }, 5000);
      }


      //}

    };



    // Final Mapa Google

    $ctrl.fechar = function () {
      // dispara o callback do pai
      $ctrl.onFechar();
    };

    ///////// final


  },
  templateUrl: 'components/mapa/mapa.html'
});