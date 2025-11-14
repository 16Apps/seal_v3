var options = {
  chart: {
    height: 380,
    type: "area",
    toolbar: {
      show: false,
    },
    animations: {
      enabled: true,
      easing: 'easeinout',
      speed: 800,
      animateGradually: {
        enabled: true,
        delay: 150
      },
      dynamicAnimation: {
        enabled: true,
        speed: 350
      }
    }
  },
  dataLabels: {
    enabled: false,
  },
  stroke: {
    curve: "smooth",
    width: 4,
    lineCap: 'round'
  },
  series: [
    {
      name: "Sales",
      data: [10, 40, 15, 40, 20, 35, 20, 10, 31, 43, 56, 29],
    },
    {
      name: "Revenue",
      data: [2, 8, 25, 7, 20, 20, 51, 35, 42, 20, 33, 67],
    },
  ],
  grid: {
    borderColor: "rgba(94, 119, 147, 0.25)",
    strokeDashArray: 6,
    xaxis: {
      lines: {
        show: true,
        colors: ["#ebedf2"]
      },
    },
    yaxis: {
      lines: {
        show: false,
      },
    },
    row: {
      colors: ['transparent', 'rgba(67, 97, 238, 0.05)']
    },
    column: {
      colors: ['transparent']
    },
    padding: {
      top: 0,
      right: 20,
      bottom: 10,
      left: 20,
    },
  },
  xaxis: {
    categories: [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ],
    labels: {
      style: {
        colors: "#b4bfd5",
        fontSize: '13px',
        fontWeight: 500,
      }
    },
    axisBorder: {
      show: false
    },
    axisTicks: {
      show: false
    }
  },
  yaxis: {
    labels: {
      show: false,
    },
  },
  colors: ["#a1c181", "#619b8a"],
  fill: {
    type: "gradient",
    gradient: {
      type: "vertical",
      shadeIntensity: 1,
      inverseColors: false,
      opacityFrom: 0.9,
      opacityTo: 0.1,
      stops: [20, 100]
    }
  },
  markers: {
    size: 0,
    opacity: 0.2,
    colors: ["#4361ee", "#805dca"],
    strokeColor: "#ffffff",
    strokeWidth: 3,
    hover: {
      size: 8,
    },
  },
  tooltip: {
    theme: "light",
    style: {
      fontSize: '13px',
      fontFamily: 'Poppins, sans-serif',
    },
    x: {
      show: true,
      format: 'dd MMM'
    },
    y: {
      formatter: function (value) {
        return value.toLocaleString()
      }
    },
    marker: {
      show: false,
    },
    cssClass: 'apexcharts-tooltip-custom',
    shared: true,
    intersect: false
  },
  legend: {
    position: 'top',
    horizontalAlign: 'right',
    offsetY: -25,
    fontSize: '14px',
    fontFamily: 'Poppins, sans-serif',
    fontWeight: 500,
    markers: {
      width: 12,
      height: 12,
      radius: 6,
      offsetX: -3
    },
    itemMargin: {
      horizontal: 18,
      vertical: 5
    },
    labels: {
      colors: '#3e3f46'
    }
  },
  responsive: [
    {
      breakpoint: 768,
      options: {
        chart: {
          height: 320
        },
        legend: {
          position: 'bottom',
          horizontalAlign: 'center',
          offsetY: 15,
          offsetX: 0
        }
      }
    }
  ]
};

var chart = new ApexCharts(document.querySelector("#visitorsGraph"), options);

chart.render();
