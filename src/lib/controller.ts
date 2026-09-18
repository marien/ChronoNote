/** Facade for the app's behaviour + state, kept so every component can go
 * on importing from `./controller` while the implementation lives in
 * focused modules. The v0.5.0 refactor split the former ~1200-line
 * `controller.ts` into these; the dependency graph between them is a
 * clean DAG (stores ← persistence/tabSort ← paste ← tabs ← actions /
 * history / boot ← directory).
 *
 *   stores               app state (Svelte stores, editorApi, view-state map)
 *   persistence          disk writes + the "all notes" read-cache
 *   tabSort              pure tab / filename ordering helpers
 *   paste                copy/paste deferral (§64, §82) + §86 undo link
 *   tabs                 tab lifecycle, date picker, jumpToFileLine
 *   actions              the Action Drawer (Ctrl/Cmd+Shift+A)
 *   history              section history (Ctrl/Cmd+Shift+H)
 *   search               cross-tab search (Ctrl/Cmd+Shift+F)
 *   calendarSyncActions  Calendar sync — both agenda sources (paste + .agenda.json) + review
 *   copyForward          "Copy to next occurrence" (#66)
 *   menu                 static-modal openers (Settings / Shortcuts / …)
 *   boot                 startup, session restore, standing subscriptions
 *   directory            notes-directory switching (§39)
 *   drift                external-modification / conflict detection (§94)
 *   commandPalette       Ctrl/Cmd+K unified command/nav palette (§107)
 *   updates              GitHub-releases update check (§update-check)
 *   exportImport         export/import (web-app design doc, Phase 1)
 *   windowChrome         merged-titlebar window controls (minimize/maximize/close)
 */
export * from "./stores";
export * from "./persistence";
export * from "./tabSort";
export * from "./paste";
export * from "./drift";
export * from "./tabs";
export * from "./actions";
export * from "./history";
export * from "./search";
export * from "./calendarSyncActions";
export * from "./syncConflicts";
export * from "./copyForward";
export * from "./menu";
export * from "./boot";
export * from "./directory";
export * from "./commandPalette";
export * from "./updates";
export * from "./exportImport";
export * from "./windowChrome";
