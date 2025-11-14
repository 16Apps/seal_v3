var options = {
  series: [
    {
      name: "Visitors",
      data: [100, 500, 300, 900, 600, 800, 500],
    },
  ],
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
  colors: ["#ef8354", "#1791bd"],
  markers: {
    size: 6,
    opacity: 0.3,
    colors: ["#ef8354", "#1791bd"],
    strokeColor: "#ffffff",
    strokeWidth: 2,
    hover: {
      size: 7,
    },
  },

};

var chart = new ApexCharts(document.querySelector("#visitors"), options);
chart.render();
