document.addEventListener("DOMContentLoaded", function () {
  var calendarEl = document.getElementById("dayGrid");
  var calendar = new FullCalendar.Calendar(calendarEl, {
    headerToolbar: {
      left: "prevYear,prev,next,nextYear today",
      center: "title",
      right: "dayGridMonth,dayGridWeek,dayGridDay",
    },
    initialDate: "2024-10-12",
    navLinks: true, // can click day/week names to navigate views
    editable: true,
    dayMaxEvents: true, // allow "more" link when too many events
    events: [
      {
        title: "All Day Event",
        start: "2024-10-01",
        color: "#005f73",
      },
      {
        title: "Long Event",
        start: "2024-10-07",
        end: "2024-10-10",
        color: "#0a9396",
      },
      {
        groupId: 999,
        title: "Birthday",
        start: "2024-10-09T16:00:00",
        color: "#94d2bd",
      },
      {
        groupId: 999,
        title: "Birthday",
        start: "2024-10-16T16:00:00",
        color: "#e9d8a6",
      },
      {
        title: "Conference",
        start: "2024-10-11",
        end: "2024-10-13",
        color: "#ee9b00",
      },
      {
        title: "Meeting",
        start: "2024-10-14T10:30:00",
        end: "2024-10-14T12:30:00",
        color: "#ca6702",
      },
      {
        title: "Lunch",
        start: "2024-10-16T12:00:00",
        color: "#bb3e03",
      },
      {
        title: "Meeting",
        start: "2024-10-18T14:30:00",
        color: "#ae2012",
      },
      {
        title: "Interview",
        start: "2024-10-21T17:30:00",
        color: "#9b2226",
      },
      {
        title: "Meeting",
        start: "2024-10-22T20:00:00",
        color: "#001219",
      },
      {
        title: "Birthday",
        start: "2024-10-13T07:00:00",
        color: "#0a9396",
      },
      {
        title: "Click for Google",
        url: "http://bootstrap.gallery/",
        start: "2024-10-28",
        color: "#ee9b00",
      },
      {
        title: "Interview",
        start: "2024-10-20",
        color: "#bb3e03",
      },
      {
        title: "Product Launch",
        start: "2024-10-29",
        color: "#005f73",
      },
      {
        title: "Leave",
        start: "2024-10-25",
        color: "#ef233c",
      },
    ],
  });

  calendar.render();
});
