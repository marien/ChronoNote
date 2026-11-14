// CodeMirror inspects `navigator.platform` once at module import time to pick
// `win:` / `linux:` / `mac:` keybindings; jsdom leaves it empty, so set Win32
// before any test imports `@codemirror/view`.
if (typeof navigator !== "undefined" && !navigator.platform) {
  Object.defineProperty(navigator, "platform", {
    value: "Win32",
    configurable: true,
  });
}
