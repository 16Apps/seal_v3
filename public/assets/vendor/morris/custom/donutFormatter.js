Morris.Donut({
  element: "donutFormatter",
  data: [
    { value: 155, label: "voo", formatted: "at least 70%" },
    { value: 12, label: "bar", formatted: "approx. 15%" },
    { value: 10, label: "baz", formatted: "approx. 10%" },
    { value: 5, label: "A really really long label", formatted: "at most 5%" },
  ],
  resize: true,
  hideHover: "auto",
  formatter: function (x, data) {
    return data.formatted;
  },
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
});
