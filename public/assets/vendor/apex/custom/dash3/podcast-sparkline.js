// Sparkline 1
var options1 = {
  series: [
    {
      name: "Views",
      data: [1, 2, 1, 2, 1, 2, 3],
    },
  ],
  chart: {
    type: "bar",
    height: 40,
    width: 60,
    sparkline: {
      enabled: true,
    },
  },
  colors: ["#1791bd"],
  plotOptions: {
    bar: {
      borderRadius: 3,
      columnWidth: '70%',
      endingShape: 'rounded',
    },
  },
  xaxis: {
    type: "day",
    categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  tooltip: {
    theme: 'dark',
    y: {
      formatter: function (val) {
        return val + "K";
      },
    },
  },
};
var chart1 = new ApexCharts(document.querySelector("#views1"), options1);
chart1.render();


// Sparkline 2
var options2 = {
  series: [
    {
      name: "Views",
      data: [1, 2, 3, 1, 2, 1, 3],
    },
  ],
  chart: {
    type: "bar",
    height: 40,
    width: 60,
    sparkline: {
      enabled: true,
    },
  },
  colors: ["#04a777"],
  plotOptions: {
    bar: {
      borderRadius: 3,
      columnWidth: '70%',
      endingShape: 'rounded',
    },
  },
  xaxis: {
    type: "day",
    categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  tooltip: {
    theme: 'dark',
    y: {
      formatter: function (val) {
        return val + "K";
      },
    },
  },
};
var chart2 = new ApexCharts(document.querySelector("#views2"), options2);
chart2.render();


// Sparkline 3
var options3 = {
  series: [
    {
      name: "Views",
      data: [2, 1, 3, 2, 2, 1, 2],
    },
  ],
  chart: {
    type: "bar",
    height: 40,
    width: 60,
    sparkline: {
      enabled: true,
    },
  },
  colors: ["#ffc857"],
  plotOptions: {
    bar: {
      borderRadius: 3,
      columnWidth: '70%',
      endingShape: 'rounded',
    },
  },
  xaxis: {
    type: "day",
    categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  tooltip: {
    theme: 'dark',
    y: {
      formatter: function (val) {
        return val + "K";
      },
    },
  },
};
var chart3 = new ApexCharts(document.querySelector("#views3"), options3);
chart3.render();
