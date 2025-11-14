// Morris Donut
Morris.Donut({
  element: "donutColors",
  data: [
    { value: 30, label: "foo" },
    { value: 15, label: "bar" },
    { value: 10, label: "baz" },
    { value: 5, label: "A really really long label" },
  ],
  backgroundColor: "#2a3039",
  labelColor: "#95a0b1",
  colors: [
    "#005f73",
    "#0a9396",
    "#94d2bd",
    "#e9d8a6",
    "#ee9b00",
    "#ca6702",
    "#bb3e03",],
  resize: true,
  hideHover: "auto",
  gridLineColor: "#575e6d",
  formatter: function (x) {
    return x + "%";
  },
});
