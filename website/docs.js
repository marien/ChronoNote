// ChronoNote website: the docs pages (guide, your files, troubleshooting, privacy). §440.
// - the contents list highlights the section in view, and folds away on a phone
// - the guide's shortcut filter
// - Try links open the live demo in a drawer beside the page
(function () {
  "use strict";
  var CN = window.CN;

  /* ---- contents ----------------------------------------------------------------------------------------------- */
  var box = document.querySelector(".toc details");
  if (box) {
    var links = Array.prototype.slice.call(box.querySelectorAll("a[href^='#']"));
    var targets = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
    var spy = function () {
      var cur = 0;
      targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top < 120) cur = i; });
      links.forEach(function (a, i) {
        a.classList.toggle("on", i === cur);
        if (i === cur) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
    };
    addEventListener("scroll", spy, { passive: true });
    spy();
    var narrow = matchMedia("(max-width: 999px)");
    var fold = function () { box.open = !narrow.matches; };
    narrow.addEventListener("change", fold);
    fold();
    links.forEach(function (a) { a.addEventListener("click", function () { if (narrow.matches) box.open = false; }); });
  }

  /* ---- the shortcut filter ------------------------------------------------------------------------------------------- */
  var filter = document.getElementById("scFilter");
  if (filter) {
    var rows = Array.prototype.slice.call(document.querySelectorAll(".shortcut-row"));
    var groups = Array.prototype.slice.call(document.querySelectorAll(".sc-group"));
    var count = document.getElementById("scCount");
    count.textContent = rows.length + " shortcuts";
    filter.addEventListener("input", function () {
      var q = filter.value.trim().toLowerCase().replace(/\s+/g, "");
      var shown = 0;
      rows.forEach(function (row) {
        var hit = !q || row.textContent.toLowerCase().replace(/\s+/g, "").indexOf(q) >= 0;
        row.hidden = !hit;
        if (hit) shown++;
      });
      groups.forEach(function (g) { g.hidden = !g.querySelector(".shortcut-row:not([hidden])"); });
      count.textContent = q ? shown + " of " + rows.length : rows.length + " shortcuts";
      document.getElementById("scEmpty").hidden = shown > 0;
    });
  }

  /* ---- Try links: the demo opens in a drawer --------------------------------------------------------------------------- */
  var drawer = document.getElementById("drawer");
  if (!drawer) return;
  var scrim = document.getElementById("scrim"), frame = document.getElementById("demoFrame");
  var NAMES = {
    today: "Today's note", actions: "Action drawer", history: "Section history", week: "Week review", search: "Search",
    palette: "Command palette", date: "Date picker", due: "Due dates", zen: "Zen mode",
  };
  var opener = null;
  function close() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    scrim.hidden = true;
    if (opener) opener.focus();
  }
  function open(feature, from) {
    opener = from;
    document.getElementById("drawerWhat").textContent = NAMES[feature] || "";
    document.getElementById("drawerFull").href = "demo.html?try=" + feature;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    scrim.hidden = false;
    document.getElementById("drawerClose").focus();
    CN.demo(frame, feature);
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-try]");
    if (!t) return;
    e.preventDefault();
    open(t.dataset.try, t);
  });
  document.getElementById("drawerClose").addEventListener("click", close);
  scrim.addEventListener("click", close);
  addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer.classList.contains("open") && !drawer.contains(document.activeElement)) close();
  });
})();
