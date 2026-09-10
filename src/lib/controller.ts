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
 *   actions              the Action Drawer (Ctrl+Shift+A)
 *   history              section history (Ctrl+Shift+H)
 *   search               cross-tab search (Ctrl+Shift+F)
 *   sectionImportActions section import (Ctrl+Shift+I) + its draft
 *   menu                 static-modal openers (Settings / Shortcuts / …)
 *   boot                 startup, session restore, standing subscriptions
 *   directory            notes-directory switching (§39)
 *   drift                external-modification / conflict detection (§94)
 *   commandPalette       Ctrl+K unified command/nav palette (§107)
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
export * from "./sectionImportActions";
export * from "./menu";
export * from "./boot";
export * from "./directory";
export * from "./commandPalette";
