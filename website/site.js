// ChronoNote website: the shared script for every page (§440). Plain JS, no build step.
// - the theme switch (system / light / dark, remembered in this browser only)
// - the header (scroll border, phone menu)
// - window.CN: dates relative to today, and a small renderer that draws the marks as the app does
// - window.CN.demo(): opens the live demo in a frame on one feature (?try= on first load, postMessage after that)
// - Mac visitors see Cmd instead of Ctrl in every <kbd>
(function () {
  "use strict";
  var root = document.documentElement;

  /* ---- theme ---------------------------------------------------------------------------------------------- */
  var KEY = "chrononote-theme";
  var dark = matchMedia("(prefers-color-scheme: dark)");
  var frames = [];
  function stored() {
    try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch (e) { return "system"; }
  }
  function effective() { var m = stored(); return m === "system" ? (dark.matches ? "dark" : "light") : m; }
  function apply() {
    var mode = stored();
    if (mode === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
    document.querySelectorAll(".theme button").forEach(function (b) { b.setAttribute("aria-checked", String(b.dataset.mode === mode)); });
    // The browser bar follows the page: both theme-color metas take the chosen theme's colour, or their own again.
    var color = getComputedStyle(root).getPropertyValue("--paper").trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
      if (!meta.dataset.own) meta.dataset.own = meta.getAttribute("content");
      meta.setAttribute("content", mode === "system" || !color ? meta.dataset.own : color);
    });
    frames.forEach(function (f) { post(f, { type: "chrononote-theme", mode: effective() }); });
  }
  var ICONS = {
    system: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  };
  var LABELS = { system: "Match system theme", light: "Light theme", dark: "Dark theme" };
  document.querySelectorAll(".theme").forEach(function (box) {
    box.setAttribute("role", "radiogroup");
    box.setAttribute("aria-label", "Colour theme");
    ["system", "light", "dark"].forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button"; b.dataset.mode = m; b.setAttribute("role", "radio"); b.title = LABELS[m];
      b.setAttribute("aria-label", LABELS[m]); b.innerHTML = ICONS[m];
      b.addEventListener("click", function () {
        try { if (m === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch (e) { /* private window */ }
        apply();
      });
      box.appendChild(b);
    });
  });
  dark.addEventListener("change", apply);
  apply();

  /* ---- header ------------------------------------------------------------------------------------------------ */
  var nav = document.getElementById("nav");
  if (nav) {
    var onScroll = function () { nav.classList.toggle("scrolled", scrollY > 8); };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    var mb = nav.querySelector(".menu-btn");
    if (mb) mb.addEventListener("click", function () { var o = nav.classList.toggle("open"); mb.setAttribute("aria-expanded", String(o)); });
    nav.querySelectorAll("ul a").forEach(function (a) { a.addEventListener("click", function () { nav.classList.remove("open"); }); });
  }

  /* ---- dates: relative to today, like the demo ------------------------------------------------------------------- */
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  var today = new Date(); today.setHours(12, 0, 0, 0);
  function add(n) { var d = new Date(today); d.setDate(d.getDate() + n); return d; }
  function nextDow(dow) { var d = new Date(today); d.setDate(d.getDate() + ((((dow - d.getDay()) + 7) % 7) || 7)); return d; }
  document.querySelectorAll("[data-today]").forEach(function (el) { el.textContent = el.dataset.today.replace("{today}", iso(today)); });

  /* ---- the marks, drawn the way the app draws them --------------------------------------------------------------------
     Not the app's tokenizer: enough of it for the site's own examples and the playground. Every glyph keeps the width
     of the characters it replaces (the app's footprint rule), so text after it never moves. */
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  var LEAD = [
    ["=> ", "➔", "g-follow", "g3"], ["# ", "☐", "g-open", "g2"], ["v ", "☑", "g-done", "g2"], ["> ", "☐", "g-defer", "g2"],
    ["x ", "☒", "g-cancel", "g2"], ["- ", "•", "", "g2"], ["* ", "•", "", "g2"], ["o ", "○", "g-topic", "g2"],
    [". ", "◉", "g-topic", "g2"], [", ", "◌", "g-topic", "g2"],
  ];
  var DIM = { "v ": 1, "> ": 1, "x ": 1, ". ": 1 };
  function glyph(L) { return '<span class="g ' + L[3] + " " + L[2] + '">' + L[1] + "</span>"; }
  function inline(s) {
    return esc(s)
      .replace(/\((&gt;|&lt;)(\d{4}-\d{2}-\d{2}#[^)]*)\)/g, function (_, dir, target) {
        return '<span class="link">(' + (dir === "&gt;" ? "→" : "←") + target + ")</span>";
      })
      .replace(/\((@[\w-]+(?:, @[\w-]+)*)\)/g, function (_, names) {
        return '<span class="par">(</span>' + names.replace(/@[\w-]+/g, '<span class="badge">$&</span>') + '<span class="par">)</span>';
      })
      .replace(/(^|\s)(@[\w-]+)(?![^<]*<\/span>)/g, '$1<span class="badge">$2</span>')
      .replace(/ =&gt; # /g, " " + glyph(LEAD[0]) + glyph(LEAD[1]))
      .replace(/by:(\d{4}-\d{2}-\d{2})/g, '<span class="due"><span class="g g3">⚑</span>$1</span>');
  }
  function render(line) {
    var indent = (line.match(/^ +/) || [""])[0];
    var rest = line.slice(indent.length), out = esc(indent), lead = null, i;
    if (rest.indexOf("! ") === 0) return out + '<span class="g g2 emph-mark">!</span><span class="emph">' + inline(rest.slice(2)) + "</span>";
    for (i = 0; i < LEAD.length; i++) if (rest.indexOf(LEAD[i][0]) === 0) { lead = LEAD[i]; break; }
    if (!lead) {
      var m = rest.match(/^(\d+(?:\.\d+)*[.)] )/);
      return out + (m ? '<span class="dim">' + esc(m[1]) + "</span>" + inline(rest.slice(m[1].length)) : inline(rest));
    }
    out += glyph(lead);
    rest = rest.slice(lead[0].length);
    if (lead[0] === "=> ") for (i = 1; i < 5; i++) if (rest.indexOf(LEAD[i][0]) === 0) { out += glyph(LEAD[i]); rest = rest.slice(2); break; }
    var t = rest.match(/^\(([\w -]+)\) /);
    if (t && lead[0] !== "- " && lead[0] !== "* ") {
      out += '<span class="tag"><span class="par">(</span>' + esc(t[1]) + '<span class="par">)</span></span> ';
      rest = rest.slice(t[0].length);
    }
    var body = inline(rest);
    return out + (DIM[lead[0]] ? '<span class="dim">' + body + "</span>" : body);
  }
  function renderNote(text) {
    var lines = text.split("\n");
    return lines.map(function (l, i) {
      if (/^=+$/.test(l) && i > 0 && lines[i - 1].trim()) return '<span class="ln rule">' + esc(l) + "</span>";
      if (lines[i + 1] && /^=+$/.test(lines[i + 1]) && l.trim()) return '<span class="ln hd">' + esc(l) + "</span>";
      return '<span class="ln">' + (render(l) || " ") + "</span>";
    }).join("");
  }
  function rawNote(text) { return text.split("\n").map(function (l) { return '<span class="ln">' + (esc(l) || " ") + "</span>"; }).join(""); }
  // <pre data-note="raw|render"> holds its example as plain text in the HTML (readable without script); draw it here.
  // In an app side pane ([data-pane]) each .r line is drawn with glyphs. {today}, {today+1}, {today-28}: dates.
  // {friday}: the next Friday, what "by:fri" becomes.
  function dates(s) {
    return s.replace(/\{today([+-]\d+)?\}/g, function (_, n) { return iso(add(+(n || 0))); }).replace(/\{friday\}/g, iso(nextDow(5)));
  }
  function drawNotes(scope) {
    scope = scope || document;
    scope.querySelectorAll("pre[data-note]").forEach(function (el) {
      var text = dates(el.textContent);
      el.innerHTML = el.dataset.note === "raw" ? rawNote(text) : renderNote(text);
    });
    scope.querySelectorAll("[data-pane] .date").forEach(function (el) { el.textContent = dates(el.textContent); });
    scope.querySelectorAll("[data-pane] .r").forEach(function (el) { el.innerHTML = render(el.textContent.replace(/ /g, " ")); });
  }
  drawNotes();
  // Drawing changed heights after the browser jumped to #anchor: jump again.
  if (/^#[\w-]+$/.test(location.hash)) {
    var target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ behavior: "instant" });
  }

  /* ---- the live demo in a frame ----------------------------------------------------------------------------------------
     The first open loads demo-app/?try=<feature>&theme=<site theme>; after that the frame gets a postMessage, so trying
     another feature does not reload the demo. Both are handled by src/lib/testing/demoTry.ts. */
  function post(frame, msg) { try { if (frame.dataset.ready) frame.contentWindow.postMessage(msg, location.origin); } catch (e) { /* not ready */ } }
  // The demo says when it listens; a feature asked for before that is sent then.
  addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== "chrononote-demo-ready") return;
    frames.forEach(function (f) {
      if (f.contentWindow !== e.source) return;
      f.dataset.ready = "1";
      if (f.dataset.pending) { post(f, { type: "chrononote-try", feature: f.dataset.pending }); delete f.dataset.pending; }
    });
  });
  function demo(frame, feature) {
    if (frames.indexOf(frame) < 0) frames.push(frame);
    if (frame.dataset.ready) { post(frame, { type: "chrononote-try", feature: feature }); return; }
    if (frame.dataset.loading) { frame.dataset.pending = feature; return; }
    frame.dataset.loading = "1";
    frame.src = "demo-app/?try=" + encodeURIComponent(feature) + "&theme=" + effective();
  }

  /* ---- Mac: Ctrl is Cmd (and Ctrl+Space is Cmd+Enter there, as in the app) ---------------------------------------------- */
  var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || "";
  var mac = /mac/i.test(platform);
  function macKeys(scope) {
    if (!mac) return;
    (scope || document).querySelectorAll("kbd").forEach(function (el) {
      if (el.textContent === "Ctrl+Space") el.textContent = "Cmd+Enter";
      else if (el.textContent.indexOf("Ctrl") === 0) el.textContent = "Cmd" + el.textContent.slice(4);
    });
  }
  macKeys();

  window.CN = {
    iso: iso, today: today, add: add, nextDow: nextDow, esc: esc,
    render: render, renderNote: renderNote, rawNote: rawNote, drawNotes: drawNotes, macKeys: macKeys, demo: demo,
  };
})();
