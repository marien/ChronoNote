// Swaps "Ctrl" to "Cmd" in every <kbd> shortcut mention on a Mac
// visitor's browser. Mirrors the app's own platform.ts detection and
// shortcuts.ts display rules — plain vanilla JS, no build step, matching
// this site's existing no-framework approach.
(function () {
  var platform =
    (navigator.userAgentData && navigator.userAgentData.platform) ||
    navigator.platform ||
    navigator.userAgent ||
    "";
  if (!/mac/i.test(platform)) return;

  document.querySelectorAll("kbd").forEach(function (el) {
    var text = el.textContent;
    if (text === "Ctrl+Space") {
      // Ctrl/Cmd+Space collides with macOS's own input-source-switcher
      // shortcut — the app doesn't offer it there either (see
      // shortcuts.ts's cycleLineState entry); Cmd+Enter is the one that
      // actually works on Mac for this action.
      el.textContent = "Cmd+Enter";
    } else if (text.indexOf("Ctrl") === 0) {
      el.textContent = "Cmd" + text.slice(4);
    }
  });
})();
