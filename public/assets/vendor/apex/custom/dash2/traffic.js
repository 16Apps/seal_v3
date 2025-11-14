var options = {
  chart: {
    height: 380,
    type: "area",
    toolbar: {
      show: false,
    },
  },
  dataLabels: {
    enabled: false,
  },
  stroke: {
    curve: "smooth",
    width: 4,
    colors: ["#53b3cb"],
  },
  series: [
    {
      name: "Visitors",
      data: [10, 40, 15, 40, 35, 96, 69],
    },
  ],
  grid: {
    borderColor: "#575e6d", // Grid color same as line
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
      right: 20,
      bottom: 0,
      left: 20,
    },
  },
  xaxis: {
    categories: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    labels: {
      style: {
        colors: "#6c757d",
        fontSize: "12px",
      },
    },
  },
  yaxis: {
    labels: {
      show: false,
    },
  },
  colors: ["#53b3cb"],
  fill: {
    type: "gradient",
    gradient: {
      shade: 'light',
      type: "vertical",
      shadeIntensity: 0.4,
      gradientToColors: ["rgba(83, 179, 203, 0.05)"], // Faded line color
      inverseColors: false,
      opacityFrom: 0.5,
      opacityTo: 0.05,
      stops: [0, 100],
    },
  },
  markers: {
    size: 4,
    colors: ["#53b3cb"],
    strokeColor: "#fff",
    strokeWidth: 2,
    hover: {
      size: 7,
    },
  },
  tooltip: {
    y: {
      formatter: function (val) {
        return val + "k";
      },
    },
  },
};

var chart = new ApexCharts(document.querySelector("#traffic"), options);
chart.render();
