// Morris Bar Chart
Morris.Bar({
  element: "morrisBar",
  data: [
    { x: "2016 Q1", y: 2, z: 4, a: 2 },
    { x: "2016 Q2", y: 5, z: 3, a: 1 },
    { x: "2016 Q3", y: 2, z: 7, a: 4 },
    { x: "2016 Q4", y: 5, z: 6, a: 3 },
  ],
  xkey: "x",
  ykeys: ["y", "z", "a"],
  labels: ["Y", "Z", "A"],
  resize: true,
  hideHover: "auto",
  gridLineColor: "#575e6d",
  barColors: [
    "#005f73",
    "#0a9396",
    "#94d2bd",
    "#e9d8a6",
    "#ee9b00",
    "#ca6702",
    "#bb3e03",
  ],
});
