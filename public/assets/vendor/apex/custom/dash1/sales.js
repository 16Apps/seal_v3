var options = {
  chart: {
    height: 270,
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
    width: 3,
  },
  series: [
    {
      name: "Sales",
      data: [200, 500, 400, 900, 700, 800, 600],
    },
  ],
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
      right: 0,
      bottom: 10,
      left: 0,
    },
  },
  xaxis: {
    type: "day",
    categories: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
  yaxis: {
    labels: {
      show: false,
    },
  },
  colors: ["#1791bd", "#bf7a6a"],
  markers: {
    size: 6,
    opacity: 0.3,
    colors: ["#1791bd", "#bf7a6a"],
    strokeColor: "#ffffff",
    strokeWidth: 2,
    hover: {
      size: 7,
    },
  },
};

var chart = new ApexCharts(document.querySelector("#sales"), options);
chart.render();
