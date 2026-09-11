/** The plain "open a static modal" actions — Settings, Shortcuts, the
 * glyph legend, About — plus the About drawer's external project link.
 * Each is a one-liner over the `modal` store; grouped here so the feature
 * modules and the facade stay focused on behaviour. Split out of
 * `controller.ts` in the v0.5.0 refactor. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { justUpdatedToVersion, modal } from "./stores";

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

/** §update-check: the About drawer's "What's changed" link, once an
 * update is found — the release page for the specific version found,
 * so it always shows the right one even mid-check-for-a-newer-one. */
export function openReleasePage(version: string) {
  api.openExternalUrl(`${PROJECT_URL}/releases/tag/v${version}`).catch(() => {});
}

/** #50: the status-bar "Updated to vX.Y.Z" link — opens that version's
 * release page and dismisses the banner in one action (there's no
 * separate close button; this is the app's only way to act on it, and it
 * only ever shows once per version anyway). */
export function openJustUpdatedReleaseNotes() {
  const version = get(justUpdatedToVersion);
  if (version) openReleasePage(version);
  justUpdatedToVersion.set(null);
}
