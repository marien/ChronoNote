/** The plain "open a static modal" actions — Settings, Shortcuts, the
 * glyph legend, About — plus the About drawer's external project link.
 * Each is a one-liner over the `modal` store; grouped here so the feature
 * modules and the facade stay focused on behaviour. Split out of
 * `controller.ts` in the v0.5.0 refactor. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { justUpdatedToVersion, modal, settingsInitialTab } from "./stores";

export function openSettings() {
  modal.set("settings");
}

/** #71: the status bar's folder icon/name — opens Settings landed
 * directly on the "Notes & Sync" tab (where the notes-folder
 * "Browse…" control lives) instead of the usual default first tab. */
export function openSettingsOnNotesFolder() {
  settingsInitialTab.set("calendar");
  modal.set("settings");
}

export function openShortcutsHelp() {
  modal.set("shortcuts");
}

/** #56: the top bar's "More" button, shown once the window is too narrow
 * for every action button to stay visible (`TopBar.svelte`'s
 * `settleLayout`). */
export function openMoreActions() {
  modal.set("topBarMore");
}

/** Kept as its own entry point (Ctrl/Cmd+Shift+/, the command palette, the
 * About drawer's link) but the symbols legend now lives in the same
 * combined Shortcuts & Symbols drawer. */
export function openGlyphLegend() {
  modal.set("shortcuts");
}

export const PROJECT_URL = "https://github.com/marien/ChronoNote";
/** The marketing site (landing page, guide, live demo) — §138/§139.
 * Distinct from `PROJECT_URL` (the GitHub repo itself): most people
 * looking for docs or "what is this" want the website, not the source. */
export const WEBSITE_URL = "https://chrononote.mariendegelder.nl";

export function openAbout() {
  modal.set("about");
}

/** Opens a link in the OS's default browser rather than inside the app's
 * own webview — used by the About drawer's Links section. Errors are
 * swallowed rather than surfaced: worst case a click does nothing, which
 * isn't worth a toast/modal of its own. */
export function openProjectLink() {
  api.openExternalUrl(PROJECT_URL).catch(() => {});
}

/** §follow-up: About's "show the website too" — the marketing site
 * alongside the existing GitHub link. */
export function openWebsiteLink() {
  api.openExternalUrl(WEBSITE_URL).catch(() => {});
}

/** §update-check follow-up: the About drawer's "What's changed" link and
 * the "Updated to vX.Y.Z" launch banner's "What's new" link both open
 * here — the repo's full releases list, newest first, rather than a
 * single version's tag page. Marien: checking in after a few missed
 * releases meant "What's changed" only showed the *latest* one, and
 * seeing what changed in between meant clicking through each
 * intermediate tag by hand. GitHub's releases list already shows every
 * release's full notes stacked in order, so opening it once does the
 * same job with no extra tooling — the reader just keeps scrolling past
 * however many versions they missed instead of re-navigating per tag. */
export function openReleasesPage() {
  api.openExternalUrl(`${PROJECT_URL}/releases`).catch(() => {});
}

/** #50: the status-bar "Updated to vX.Y.Z" link — opens the releases list
 * and dismisses the banner in one action (there's no separate close
 * button; this is the app's only way to act on it, and it only ever
 * shows once per version anyway). */
export function openJustUpdatedReleaseNotes() {
  if (get(justUpdatedToVersion)) openReleasesPage();
  justUpdatedToVersion.set(null);
}
