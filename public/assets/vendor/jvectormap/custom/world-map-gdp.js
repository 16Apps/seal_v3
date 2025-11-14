// World Map GDP
$(function () {
  $("#world-map-gdp").vectorMap({
    map: "world_mill_en",
    zoomOnScroll: false,
    series: {
      regions: [
        {
          values: gdpData,
          scale: ["#216869", "#49a078", "#9cc5a1", "#dce1de"],
          normalizeFunction: "polynomial",
        },
      ],
    },
    backgroundColor: "transparent",
    onRegionTipShow: function (e, el, code) {
      el.html(el.html() + " (GDP - " + gdpData[code] + ")");
    },
  });
});
