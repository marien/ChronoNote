/** The plain "open a static modal" actions — Settings, Shortcuts, the
 * glyph legend, About — plus the About drawer's external project link.
 * Each is a one-liner over the `modal` store; grouped here so the feature
 * modules and the facade stay focused on behaviour. Split out of
 * `controller.ts` in the v0.5.0 refactor. */
import * as api from "./tauriApi";
import { modal } from "./stores";

export function openSettings() {
  modal.set("settings");
}

export function openShortcutsHelp() {
  modal.set("shortcuts");
}

/** Kept as its own entry point (Ctrl+Shift+/, the command palette, the
 * About drawer's link) but the symbols legend now lives in the same
 * combined Shortcuts & Symbols drawer. */
export function openGlyphLegend() {
  modal.set("shortcuts");
}

export const PROJECT_URL = "https://github.com/marien/ChronoNote";

export function openAbout() {
  modal.set("about");
}

/** Opens a link in the OS's default browser rather than inside the app's
 * own webview — used by the About drawer's project link. Errors are
 * swallowed rather than surfaced: worst case a click does nothing, which
 * isn't worth a toast/modal of its own. */
export function openProjectLink() {
  api.openExternalUrl(PROJECT_URL).catch(() => {});
}
