var options = {
  chart: {
    type: 'donut',
    height: 160,
    sparkline: {
      enabled: true // removes grid, axes, padding
    }
  },
  series: [900, 600, 400],
  labels: ['Desktop', 'Mobile', 'Tablet'],
  colors: ["#1791bd", "#04a777", "#ffc857"],
  legend: {
    show: false
  },
  dataLabels: {
    enabled: true,
    style: {
      fontSize: '12px',
      fontWeight: 'bold',
      color: '#ffffff'
    },
    formatter: function (val, opts) {
      return opts.w.config.series[opts.seriesIndex]; // shows actual session count
    }
  },
  tooltip: {
    y: {
      formatter: function (val) {
        return val + ' Sessions';
      }
    }
  },
  stroke: {
    width: 0
  },
  responsive: [{
    breakpoint: 480,
    options: {
      chart: {
        height: 160
      }
    }
  }]
};

var chart = new ApexCharts(document.querySelector("#device-sessions"), options);
chart.render();