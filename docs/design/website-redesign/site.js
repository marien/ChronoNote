// ChronoNote website: shared script for every page (theme switch, nav, the token renderer, Mac key names).
// Plain JS, no build step. Pages read the renderer from window.CN.
(function () {
  "use strict";
  var root = document.documentElement;

  /* ---- theme: system / light / dark, remembered per browser ------------------------------------------ */
  var KEY = "chrononote-theme";
  function stored() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }
  function apply(mode) {
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
    document.querySelectorAll(".theme button").forEach(function (b) { b.setAttribute("aria-checked", String(b.dataset.mode === mode)); });
    var frame = document.getElementById("demoFrame");
    try { if (frame && frame.contentDocument) syncFrameTheme(frame); } catch (e) { /* cross-origin */ }
  }
  function effective() {
    var m = stored();
    return m === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : m;
  }
  function syncFrameTheme(frame) { frame.contentDocument.documentElement.setAttribute("data-theme", effective()); }
  apply(stored());
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { apply(stored()); });

  var ICONS = {
    system: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  };
  var LABELS = { system: "Match system", light: "Light", dark: "Dark" };
  document.querySelectorAll(".theme").forEach(function (box) {
    box.setAttribute("role", "radiogroup");
    box.setAttribute("aria-label", "Colour theme");
    ["system", "light", "dark"].forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button"; b.dataset.mode = m; b.setAttribute("role", "radio"); b.title = LABELS[m];
      b.setAttribute("aria-label", LABELS[m]); b.innerHTML = ICONS[m];
      b.onclick = function () { try { localStorage.setItem(KEY, m); } catch (e) { /* private mode */ } apply(m); };
      box.append(b);
    });
  });
  apply(stored());

  /* ---- nav ----------------------------------------------------------------------------------------------- */
  var nav = document.getElementById("nav");
  if (nav) {
    addEventListener("scroll", function () { nav.classList.toggle("scrolled", scrollY > 8); }, { passive: true });
    var mb = nav.querySelector(".menu-btn");
    if (mb) mb.onclick = function () { var o = nav.classList.toggle("open"); mb.setAttribute("aria-expanded", String(o)); };
    nav.querySelectorAll("ul a").forEach(function (a) { a.addEventListener("click", function () { nav.classList.remove("open"); }); });
  }

  /* ---- dates: everything is relative to today, like the demo ---------------------------------------------- */
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  var today = new Date(); today.setHours(12, 0, 0, 0);
  function add(n) { var d = new Date(today); d.setDate(d.getDate() + n); return d; }
  function nextDow(dow) { var d = new Date(today); d.setDate(d.getDate() + ((((dow - d.getDay()) + 7) % 7) || 7)); return d; }

  /* ---- a small renderer for the token vocabulary ------------------------------------------------------------ */
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  var LEAD = [
    ["=> ", "➔", "g-follow", "g3"], ["# ", "☐", "g-open", "g2"], ["v ", "☑", "g-done", "g2"], ["> ", "☐", "g-defer", "g2"],
    ["x ", "☒", "g-cancel", "g2"], ["- ", "•", "", "g2"], ["* ", "•", "", "g2"], ["o ", "○", "g-topic", "g2"],
    [". ", "◉", "g-topic", "g2"], [", ", "◌", "g-topic", "g2"],
  ];
  var DIM = { "v ": 1, "> ": 1, "x ": 1, ". ": 1 };
  function inline(s) {
    return esc(s)
      .replace(/\((&gt;|&lt;)(\d{4}-\d{2}-\d{2}#[^)]*)\)/g, function (_, dir, target) { return '<span class="link">(' + (dir === "&gt;" ? "→" : "←") + target + ")</span>"; })
      .replace(/\((@[\w-]+)\)/g, '<span class="badge"><span class="par">(</span>$1<span class="par">)</span></span>')
      .replace(/(^|\s)(@[\w-]+)(?![^<]*<\/span>)/g, '$1<span class="badge">$2</span>')
      .replace(/by:(\d{4}-\d{2}-\d{2})/g, '<span class="due"><span class="g g3">⚑</span>$1</span>');
  }
  function render(line) {
    var rest = line, out = "", lead = null, i, L;
    if (rest.indexOf("! ") === 0) return '<span class="g g2 emph-mark">!</span><span class="emph">' + inline(rest.slice(2)) + "</span>";
    for (i = 0; i < LEAD.length; i++) if (rest.indexOf(LEAD[i][0]) === 0) { lead = LEAD[i]; break; }
    var indent = (rest.match(/^ +/) || [""])[0];
    if (!lead && indent) { var inner = render(rest.slice(indent.length)); return indent + inner; }
    if (!lead) {
      var m = rest.match(/^(\d+(?:\.\d+)*[.)] )/);
      return m ? '<span class="dim">' + esc(m[1]) + "</span>" + inline(rest.slice(m[1].length)) : inline(rest);
    }
    out += '<span class="g ' + lead[3] + " " + lead[2] + '">' + lead[1] + "</span>";
    rest = rest.slice(lead[0].length);
    if (lead[0] === "=> ") for (i = 1; i < 5; i++) { L = LEAD[i]; if (rest.indexOf(L[0]) === 0) { out += '<span class="g ' + L[3] + " " + L[2] + '">' + L[1] + "</span>"; rest = rest.slice(2); break; } }
    var t = rest.match(/^\(([\w -]+)\) /);
    if (t && lead[0] !== "- " && lead[0] !== "* ") { out += '<span class="tag"><span class="par">(</span>' + esc(t[1]) + '<span class="par">)</span></span> '; rest = rest.slice(t[0].length); }
    var body = inline(rest).replace(/ =&gt; # /g, ' <span class="g g3 g-follow">➔</span><span class="g g2 g-open">☐</span>');
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

  /* ---- Mac visitors see Cmd (the app's own rule; Ctrl+Space is Cmd+Enter there) ------------------------------ */
  var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || "";
  if (/mac/i.test(platform)) {
    document.querySelectorAll("kbd").forEach(function (el) {
      if (el.textContent === "Ctrl+Space") el.textContent = "Cmd+Enter";
      else if (el.textContent.indexOf("Ctrl") === 0) el.textContent = "Cmd" + el.textContent.slice(4);
    });
  }

  window.CN = { iso: iso, today: today, add: add, nextDow: nextDow, esc: esc, render: render, renderNote: renderNote, rawNote: rawNote, syncFrameTheme: syncFrameTheme };
})();
