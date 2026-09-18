/** Android shell integration: the native side (MainActivity.kt, see
 * `src-tauri/android-overrides/`) exposes a `ChronoNoteAndroid` bridge.
 * It pushes real system-bar/keyboard insets into CSS variables and lets the
 * page tell Android whether the app's theme is light or dark so the status
 * and navigation bar icons stay readable. A no-op anywhere the bridge
 * doesn't exist (desktop, web app, demo, tests). */
interface AndroidBridge {
  getInsets(): string;
  setSystemBarsLight(light: boolean): void;
}

declare global {
  interface Window {
    ChronoNoteAndroid?: AndroidBridge;
    __applyAndroidInsets?: (insets: Insets) => void;
  }
}

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function applyInsets(i: Insets) {
  const s = document.documentElement.style;
  s.setProperty("--inset-top", `${i.top}px`);
  s.setProperty("--inset-right", `${i.right}px`);
  s.setProperty("--inset-bottom", `${i.bottom}px`);
  s.setProperty("--inset-left", `${i.left}px`);
}

/** The app's effective theme: an explicit `data-theme` wins; otherwise it
 * follows the system, same as `app.css`. */
function appThemeIsLight(): boolean {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit === "light";
  return !window.matchMedia("(prefers-color-scheme: dark)").matches;
}

let wired = false;

export function initAndroidChrome() {
  const bridge = window.ChronoNoteAndroid;
  if (!bridge || wired) return;
  wired = true;

  window.__applyAndroidInsets = applyInsets;
  try {
    applyInsets(JSON.parse(bridge.getInsets()) as Insets);
  } catch {
    // Native side will push the values on its next insets change.
  }

  const syncBars = () => bridge.setSystemBarsLight(appThemeIsLight());
  syncBars();
  new MutationObserver(syncBars).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncBars);
}
