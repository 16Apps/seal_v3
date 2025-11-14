var options = {
  chart: {
    height: 335,
    type: "bar",
    toolbar: { show: false },
    fontFamily: "inherit",
    animations: { enabled: true, easing: "easeinout", speed: 800 }
  },
  plotOptions: {
    bar: {
      horizontal: false,
      columnWidth: "35%",
      borderRadius: 9,
      endingShape: "rounded"
    }
  },
  dataLabels: { enabled: false },
  stroke: {
    show: true,
    width: 2,
    colors: ["transparent"]
  },
  series: [
    { name: "Revenue", data: [2000, 3000, 4000] },
    { name: "Income", data: [2500, 3500, 4500] }
  ],
  legend: {
    show: true,
    position: "top",
    horizontalAlign: "right",
    fontSize: "13px",
    markers: { radius: 12 }
  },
  xaxis: {
    categories: ["2022", "2023", "2024"],
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: { style: { colors: "#a3aab7", fontSize: "13px" } }
  },
  yaxis: {
    show: true,
    labels: {
      style: { colors: "#a3aab7", fontSize: "13px" },
      formatter: function (val) { return "$" + val / 1000 + "k"; }
    }
  },
  fill: { opacity: 0.9, type: "solid" },
  tooltip: {
    theme: "dark",
    y: {
      formatter: function (val) {
        return "$" + val.toLocaleString() + "k";
      }
    }
  },
  grid: {
    borderColor: "#575e6d",
    strokeDashArray: 5,
    xaxis: { lines: { show: true } },
    yaxis: { lines: { show: true } },
    padding: { top: 0, right: 0, bottom: 0, left: 20 }
  },
  colors: ["#70c1b3", "#247ba0"],
  responsive: [{
    breakpoint: 600,
    options: {
      chart: { height: 250 },
      legend: { position: "bottom", horizontalAlign: "center" }
    }
  }]
};

var chart = new ApexCharts(document.querySelector("#orders"), options);
chart.render();
