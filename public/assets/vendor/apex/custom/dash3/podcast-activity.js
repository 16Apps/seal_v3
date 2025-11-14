var options = {
  chart: {
    height: 360,
    type: 'line',
    toolbar: { show: false },
    fontFamily: 'Inter, sans-serif'
  },
  stroke: {
    width: [0, 4],
    curve: 'smooth'
  },
  plotOptions: {
    bar: {
      columnWidth: '45%',
      borderRadius: 20
    }
  },
  colors: ['#1791bd', '#04a777'],
  series: [
    {
      name: 'Total Albums',
      type: 'column',
      data: [12, 18, 14, 22, 26, 30, 25]
    },
    {
      name: 'Total Hours',
      type: 'line',
      data: [6, 10, 8, 14, 16, 13, 11]
    }
  ],
  xaxis: {
    categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    axisBorder: { show: false },
    labels: {
      style: { fontSize: '13px' }
    }
  },
  yaxis: [
    {
      title: {
        text: 'Albums',
        style: {
          color: '#1791bd',
          fontWeight: 600,
          fontSize: '13px',
        }
      },
      labels: {
        style: { fontSize: '12px' }
      }
    },
    {
      opposite: true,
      title: {
        text: 'Hours',
        style: {
          color: '#04a777',
          fontWeight: 600,
          fontSize: '13px',
        }
      },
      labels: {
        style: { fontSize: '12px' }
      }
    }
  ],
  tooltip: {
    shared: true,
    intersect: false,
    theme: 'light',
    y: {
      formatter: function (val) {
        return val + (val < 15 ? ' hrs' : '');
      }
    }
  },
  legend: {
    position: 'top',
    horizontalAlign: 'right',
    markers: { radius: 4 }
  },
  grid: {
    strokeDashArray: 4
  },
};

var chart = new ApexCharts(document.querySelector("#podcastActivityChart"), options);
chart.render();