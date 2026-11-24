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

  /* ---- the marks, drawn the way the app draws them (§535) -------------------------------------------------------------
     Not the app's tokenizer (src/lib/grammar/tokenize.ts), but its rules for everything the site shows, and the app's
     look (src/styles/03-editor.css): boxes and circles drawn in CSS, `(topic)` and due dates as grey pills, forward links
     as pills with an arrow, an emphasised line bold in the emphasis colour, resolved lines muted. As in the app, every
     character stays in the text (transparent where a glyph covers it), so a line is exactly as wide as its raw text. */
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  var BOX = { "#": "g-open", v: "g-done", ">": "g-defer", x: "g-cancel" };
  var RING = { o: "g-topic-open", ".": "g-topic-done", ",": "g-topic-skipped" };
  var RESOLVED = { v: 1, ">": 1, x: 1, ".": 1, ",": 1 };
  // `symbol + space` drawn as a 2ch glyph; the symbol stays in the DOM, transparent.
  function mark(sym) {
    if (BOX[sym]) return '<span class="g g2 ' + BOX[sym] + '"><span class="ink">' + esc(sym) + "</span> </span>";
    if (RING[sym]) return '<span class="g g2 ' + RING[sym] + '"><span class="ink">' + esc(sym) + "</span> </span>";
    return '<span class="g g2 g-bullet">• </span>';
  }
  // `=>` and its spaces (n characters): the first three become the 3ch arrow, any further spaces stay text.
  function arrow(n) { return '<span class="g g3 g-follow">➔</span>' + " ".repeat(Math.max(0, n - 3)); }
  // A name's `@` may not follow a word character, `@` or `/`, except a `/` right after a name (`@a/@b`, §534).
  var NAME = "[\\p{L}\\p{M}\\p{N}_-]", GLUE = "[\\p{L}\\p{M}\\p{N}_@/]";
  var INLINE = new RegExp(
    "(=>\\s+)(?:@(" + NAME + "+)|([#vx>])\\s|([o.,])\\s)?" +
      "|(?:(?<!" + GLUE + ")|(?<=(?<!" + GLUE + ")@" + NAME + "+(?:/@" + NAME + "+)*/))@(" + NAME + "+)" +
      "|\\(([<>])(\\d{4}-\\d{2}-\\d{2})(?:#([^)]*))?\\)" +
      "|(?<!\\S)by:(\\d{4}-\\d{2}-\\d{2})(?!\\S)",
    "gu"
  );
  function due(date, resolved) {
    var t = iso(today), status = resolved ? "resolved" : date < t ? "overdue" : date === t ? "today" : "later";
    return '<span class="due due-' + status + '"><span class="due-flag">by:</span>' + date + "</span>";
  }
  // The text after a line's leading marks: arrows, names, forward links and due dates, as tokenize.ts finds them.
  // `state` is the symbol of the action part being read (it changes at `=> # `): a due date belongs to an action only.
  function inline(s, state) {
    var out = "", at = 0, m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(s)) !== null) {
      out += esc(s.slice(at, m.index));
      if (m[1] !== undefined) {
        out += arrow(m[1].length);
        state = m[3] || m[4];
        if (m[2] !== undefined) out += '<span class="badge">@' + esc(m[2]) + "</span>";
        else if (state) out += mark(state);
      } else if (m[9] !== undefined && !BOX[state]) {
        out += esc(m[0]);
      } else if (m[5] !== undefined) {
        out += '<span class="badge">@' + esc(m[5]) + "</span>";
      } else if (m[6] !== undefined) {
        out += '<span class="fwd"><span class="fwd-dir fwd-' + (m[6] === ">" ? "to" : "from") + '">(' + esc(m[6]) + "</span>" + m[7] +
          (m[8] !== undefined ? '<span class="fwd-sep">#</span>' + esc(m[8]) : "") + '<span class="fwd-paren">)</span></span>';
      } else {
        out += due(m[9], state !== "#");
      }
      at = m.index + m[0].length;
    }
    return out + esc(s.slice(at));
  }
  // `(topic)` right after an action or topic mark: a pill, the parentheses transparent.
  function tag(rest) {
    var t = rest.match(/^\(([^\s()@][^\s()]*)\)/);
    return t ? ['<span class="tag"><span class="par">(</span>' + esc(t[1]) + '<span class="par">)</span></span>', rest.slice(t[0].length)] : ["", rest];
  }
  function render(line) {
    var indent = (line.match(/^ +/) || [""])[0];
    var rest = line.slice(indent.length), out = esc(indent), m;
    if (/^\\[#vx>o.,!*-]/.test(rest)) return out + '<span class="esc">\\</span>' + inline(rest.slice(1));
    if (rest.indexOf("! ") === 0) {
      rest = rest.slice(2);
      var bullet = /^[-*] /.test(rest) ? '<span class="g g2 g-bullet">• </span>' : "";
      if (bullet) rest = rest.slice(2);
      return out + '<span class="emph">! ' + bullet + inline(rest) + "</span>";
    }
    var sym, head;
    if ((m = rest.match(/^=>\s+([#vx>o.,])\s/))) {
      // `=> # ` leading a line: a consequence, with a state of its own.
      sym = m[1]; head = arrow(m[0].length - 2) + mark(sym); rest = rest.slice(m[0].length);
    } else if ((m = rest.match(/^([#vx>o.,]) /))) {
      sym = m[1]; head = mark(sym); rest = rest.slice(2);
    } else if ((m = rest.match(/^[-*] /))) {
      return out + mark("-") + inline(rest.slice(2));
    } else {
      return out + inline(rest); // a follow-up (`=> `, `=> @name`), a numbered item or plain text
    }
    if (/^[-*] /.test(rest)) { head += mark("-"); rest = rest.slice(2); } // `# - item`: a bullet after the mark
    var emph = rest.indexOf("! ") === 0;
    if (emph) rest = rest.slice(2);
    var tg = tag(rest);
    var body = tg[0] + inline(tg[1], sym);
    if (emph) body = '<span class="emph">! ' + body + "</span>";
    if (!RESOLVED[sym]) return out + head + body;
    // A resolved line is muted, as in the app; a resolved topic with an open action after its arrow mutes only the topic.
    var split = body.search(/<span class="g g3 g-follow">➔<\/span> *<span class="g g2 g-(open|topic-open)">/);
    return split < 0 ? out + '<span class="resolved">' + head + body + "</span>"
      : out + '<span class="resolved">' + head + body.slice(0, split) + "</span>" + body.slice(split);
  }
  function renderNote(text) {
    var lines = text.split("\n");
    return lines.map(function (l, i) {
      // A section title stays plain text; its `===` underline is a double rule over exactly those characters.
      if (/^=+$/.test(l) && i > 0 && lines[i - 1].trim()) return '<span class="ln"><span class="rule">' + esc(l) + "</span></span>";
      if (lines[i + 1] && /^=+$/.test(lines[i + 1]) && l.trim()) return '<span class="ln">' + esc(l) + "</span>";
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
