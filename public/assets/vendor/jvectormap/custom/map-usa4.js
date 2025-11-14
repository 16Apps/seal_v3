$(function () {
  // Improved: Added area data to each marker for tooltips and color scale
  var cityMarkers = [
    { latLng: [32.9, -97.03], name: "Dallas/FW, TX", area: 230.2 },
    { latLng: [34.11, -79.24], name: "Marion S.C", area: 750.9 },
    { latLng: [40.09, -74.51], name: "Levittown, Pa", area: 440.28 },
    { latLng: [32.33, -92.55], name: "Arcadia, La", area: 180.15 },
    { latLng: [35.53, -111.25], name: "Cameron, Ariz", area: 69.35 }, // Fixed longitude
    { latLng: [39.46, -86.09], name: "Indianapolis", area: 280.9 },
    { latLng: [38.32, -82.41], name: "Ironton, Ohio", area: 510.5 },
    { latLng: [38.5, -104.49], name: "Colorado Springs", area: 99.6 },
    { latLng: [45.14, -120.11], name: "Condon", area: 135.5 },
    // Add more markers as needed, area: null if unknown
  ];

  $("#us-map4").vectorMap({
    map: "us_aea_en",
    scaleColors: [
      "#30758e",
      "#3c92b1",
      "#63a8c1",
      "#8abed0",
      "#b1d3e0",
      "#c5dee8",
    ],
    normalizeFunction: "polynomial",
    focusOn: { x: 2, y: 0, scale: 1 },
    zoomOnScroll: false,
    zoomMin: 1,
    hoverColor: true,
    regionStyle: {
      initial: { fill: "#3c92b1" },
      hover: { "fill-opacity": 0.8 },
    },
    markerStyle: {
      initial: {
        fill: "#d2a968",
        stroke: "#ffffff",
        r: 7, // Slightly larger for visibility
      },
      hover: {
        stroke: "#000",
        "stroke-width": 2,
        "fill-opacity": 1,
      },
    },
    backgroundColor: "transparent",
    markers: cityMarkers.map(m => ({ latLng: m.latLng, name: m.name })),
    series: {
      markers: [
        {
          attribute: "fill",
          scale: ["#b1d3e0", "#30758e"],
          values: cityMarkers.reduce((acc, m, i) => {
            acc[i] = m.area || 0;
            return acc;
          }, {}),
        },
        {
          attribute: "r",
          scale: [10, 20],
          values: cityMarkers.reduce((acc, m, i) => {
            acc[i] = m.area || 0;
            return acc;
          }, {}),
        },
      ],
    },
    onMarkerTipShow: function (event, label, index) {
      var marker = cityMarkers[index];
      if (marker && marker.area) {
        label.html(
          `<b>${marker.name}</b><br>Area: ${marker.area}`
        );
      }
    },
  });
});
