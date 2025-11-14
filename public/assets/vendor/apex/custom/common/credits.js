// Sparkline 1
var options1 = {
  series: [80],
  chart: {
    type: "radialBar",
    width: 80,
    height: 80,
    sparkline: {
      enabled: true,
    },
  },
  colors: ["#fe5f55"],
  plotOptions: {
    radialBar: {
      hollow: {
        margin: 0,
        size: "60%",
      },
      track: {
        background: "#495160",
        margin: 0,
      },
      dataLabels: {
        show: true,
        name: {
          show: false,
        },
        value: {
          show: true,
          formatter: function (val) {
            return val;
          },
        },
      },
    },
  },
};
var chart1 = new ApexCharts(document.querySelector("#credits"), options1);
chart1.render();