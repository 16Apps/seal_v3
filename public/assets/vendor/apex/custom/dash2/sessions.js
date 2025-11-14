var options = {
  chart: {
    height: 218,
    type: "bar",
    toolbar: {
      show: false,
    },
  },
  plotOptions: {
    bar: {
      columnWidth: "40%",
      borderRadius: 12,
      distributed: true,
      dataLabels: {
        position: "top",
      },
    },
  },
  series: [
    {
      name: "Designation",
      data: [52, 73, 34, 66, 49],
    },
  ],
  legend: {
    show: false,
  },
  xaxis: {
    categories: ["Email", "Referral", "Organic", "Direct", "Campaign"],
    axisBorder: {
      show: false,
    },
    yaxis: {
      show: false,
    },

    tooltip: {
      enabled: true,
    },
    labels: {
      show: true,
      rotate: -45,
      rotateAlways: true,
    },
  },
  grid: {
    borderColor: "#575e6d",
    strokeDashArray: 5,
    xaxis: {
      lines: {
        show: true,
      },
    },
    yaxis: {
      lines: {
        show: false,
      },
    },
    padding: {
      top: 0,
      right: 10,
      left: 20,
      bottom: -20,
    },
  },
  tooltip: {
    y: {
      formatter: function (val) {
        return val;
      },
    },
  },
  colors: [
    "#005f73",
    "#0a9396",
    "#94d2bd",
    "#e9d8a6",
    "#ee9b00",
    "#ca6702",
    "#bb3e03",
  ],
};
var chart = new ApexCharts(document.querySelector("#sessions"), options);
chart.render();
