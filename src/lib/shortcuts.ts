/** Single source of truth for every keyboard shortcut ChronoNote defines
 * or documents — both the matching logic (`App.svelte`'s window-level
 * dispatcher) and every place a shortcut is *displayed* (the Shortcuts &
 * Symbols drawer, the command palette's hints, TopBar/StatusBar
 * tooltips, the About drawer) read from this one table instead of each
 * keeping its own hand-written copy. That consolidation was overdue
 * regardless of platform — six independently-maintained copies of the
 * same ~20 shortcuts is its own drift risk — but became unavoidable once
 * Mac support meant every one of those copies needed to become
 * platform-aware at once.
 *
 * Platform awareness: `combo.mod` resolves to Cmd on Mac, Ctrl elsewhere
 * (`platform.ts`). Matching is strict — a combo only fires with the
 * platform-correct modifier, never either (see `matchesCombo`), so the
 * displayed label is always a complete, accurate description of what
 * actually works.
 *
 * What's deliberately NOT in this table:
 *   - `Escape` and "click a glyph" (two literal rows in `DRAWER_ROWS`,
 *     below) — not modifier-bearing combos, nothing to make Mac-aware.
 *   - The Action Drawer's own local `Ctrl+Space` (`ActionDrawerModal
 *     .svelte`) — its handler already treats a bare `Enter` specially
 *     (jump to that action), so adding a Cmd+Enter alias the way the
 *     editor's own cycle-state binding gets one below would collide with
 *     that existing Enter handling. Left as a known, documented
 *     Mac limitation (mouse click still always works) rather than
 *     risking a regression to fix it under this same pass.
 */
import { isMac } from "./platform";
import type { TranslationKey } from "./i18n/schema";

export interface ComboSpec {
  /** Ctrl (Win/Linux) or Cmd (Mac) — resolved by `matchesCombo`/`formatCombo`. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** `KeyboardEvent.code` — physical key, not the shifted/localized character. */
  code: string;
  /** Restrict this specific combo to certain platforms. Omit = all. Used
   * for the caret-navigation pair (mac keeps CodeMirror's own default
   * page-scroll there instead) and to drop `Ctrl+Space` /
   * `Ctrl+Y`-as-redo on Mac, where each is either OS-reserved or simply
   * not how CodeMirror binds it there. */
  platforms?: ("mac" | "other")[];
}

export interface ShortcutDef {
  id: string;
  combos: ComboSpec[];
  /** Non-keyboard text appended after the formatted combo(s), e.g. "middle-click". */
  extra?: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "commandPalette",
    combos: [{ mod: true, code: "KeyK" }],
  },
  {
    id: "newScratchpad",
    combos: [
      { mod: true, code: "KeyN" },
      { mod: true, code: "KeyT" },
    ],
  },
  {
    id: "reopenClosedTab",
    combos: [
      { mod: true, shift: true, code: "KeyT" },
      { mod: true, shift: true, code: "KeyN" },
    ],
  },
  {
    id: "openDateNote",
    combos: [{ mod: true, code: "KeyO" }],
  },
  {
    id: "closeTab",
    combos: [{ mod: true, code: "KeyW" }],
    extra: "middle-click",
  },
  {
    id: "cycleTab",
    combos: [
      { mod: true, code: "Tab" },
      { mod: true, shift: true, code: "Tab" },
    ],
  },
  {
    id: "indentDedent",
    combos: [{ code: "Tab" }, { shift: true, code: "Tab" }],
  },
  {
    id: "undoRedo",
    combos: [
      { mod: true, code: "KeyZ" },
      // CodeMirror's own historyKeymap doesn't bind Mod-Y as redo on Mac
      // (Cmd+Shift+Z is the native mac redo there) — only shown for
      // Windows/Linux, where it's real.
      { mod: true, code: "KeyY", platforms: ["other"] },
      { mod: true, shift: true, code: "KeyZ" },
    ],
  },
  {
    id: "cycleLineState",
    // #73: narrowed from a full four-state cycle to just "close an open
    // line" — every state is directly reachable via Ctrl+1-4 now, so
    // there's no need for Ctrl+Space to cycle through (or promote a plain
    // line into) all of them.
    combos: [
      // Ctrl+Space collides with macOS's own input-source-switcher
      // shortcut — not offered as a Mac binding at all; Cmd+Enter (below)
      // is the reliable one there instead.
      { mod: true, code: "Space", platforms: ["other"] },
      { mod: true, code: "Enter" },
    ],
  },
  {
    id: "cycleLineStateReverse",
    combos: [
      // Same Space-avoided-on-Mac reasoning as `cycleLineState` above —
      // no Mac binding involving Space, Cmd+Shift+Enter instead.
      { mod: true, shift: true, code: "Space", platforms: ["other"] },
      { mod: true, shift: true, code: "Enter" },
    ],
  },
  {
    id: "markSelectionOpen",
    combos: [{ mod: true, shift: true, code: "KeyO" }],
  },
  // #70: the same idea as markSelectionOpen, direct to each of the other
  // three states — matching `ACTION_CYCLE_ORDER` (tokens.ts), the same
  // order cycleLineState steps through.
  {
    id: "setActionOpen",
    combos: [{ mod: true, code: "Digit1" }],
  },
  {
    id: "setActionDone",
    combos: [{ mod: true, code: "Digit2" }],
  },
  {
    id: "setActionDeferred",
    combos: [{ mod: true, code: "Digit3" }],
  },
  {
    id: "setActionWontDo",
    combos: [{ mod: true, code: "Digit4" }],
  },
  {
    id: "jumpAction",
    combos: [{ code: "F2" }, { shift: true, code: "F2" }],
  },
  {
    id: "caretLineNav",
    // Win/Linux only by design (§90/#24) — macOS keeps CodeMirror's own
    // default page-scroll on these keys instead. Filtered out of the
    // Shortcuts drawer entirely on Mac (see `combosForPlatform`).
    combos: [
      { mod: true, code: "ArrowUp", platforms: ["other"] },
      { mod: true, code: "ArrowDown", platforms: ["other"] },
    ],
  },
  {
    id: "convertToSection",
    combos: [{ mod: true, shift: true, code: "KeyS" }],
  },
  {
    id: "openActions",
    combos: [{ mod: true, shift: true, code: "KeyA" }],
  },
  {
    id: "openHistory",
    combos: [{ mod: true, shift: true, code: "KeyH" }],
  },
  {
    id: "findInNote",
    combos: [{ mod: true, code: "KeyF" }],
  },
  {
    id: "crossTabSearch",
    combos: [{ mod: true, shift: true, code: "KeyF" }],
  },
  {
    id: "syncCalendar",
    combos: [{ mod: true, shift: true, code: "KeyC" }],
  },
  {
    id: "openSettings",
    combos: [{ mod: true, code: "Comma" }],
  },
  {
    id: "openAbout",
    combos: [{ mod: true, shift: true, code: "Comma" }],
  },
  {
    id: "openShortcutsHelp",
    combos: [
      { mod: true, code: "Slash" },
      { mod: true, shift: true, code: "Slash" },
    ],
  },
  {
    id: "copyToNextOccurrence",
    combos: [{ mod: true, shift: true, code: "Period" }],
  },
  {
    id: "toggleZenMode",
    // Shift+F11 is Sublime Text's "Distraction Free Mode" chord, and needs no Ctrl+Alt (which is
    // AltGr on many European layouts and would fire while typing letters like a-with-diaeresis).
    // Plain F11 is deliberately not registered: browsers keep it for their own fullscreen, so it
    // works only in the desktop app, wired in `App.svelte` (and so isn't listed on the web).
    // Mac gets Cmd+Option+Z too (Option is not AltGr there, and F-keys need fn on many Macs).
    combos: [{ shift: true, code: "F11" }, { mod: true, alt: true, code: "KeyZ", platforms: ["mac"] }],
  },
];

/** i18n roadmap: the Shortcuts & Symbols drawer's translation key for
 * each entry's description — the drawer is this table's only display
 * consumer of a *label* (command palette hints, TopBar/StatusBar
 * tooltips, and About all keep their own separately-authored strings).
 * An explicit map, not a `` `shortcuts.${id}.label` `` template lookup,
 * so a missing/renamed id is a `svelte-check` error via `satisfies`
 * below, not a blank row. Covers every real `SHORTCUTS` id plus the two
 * pseudo-ids `DRAWER_ROWS` uses for its non-registry rows. */
export const SHORTCUT_LABEL_KEYS = {
  commandPalette: "shortcuts.commandPalette.label",
  newScratchpad: "shortcuts.newScratchpad.label",
  reopenClosedTab: "shortcuts.reopenClosedTab.label",
  openDateNote: "shortcuts.openDateNote.label",
  closeTab: "shortcuts.closeTab.label",
  cycleTab: "shortcuts.cycleTab.label",
  indentDedent: "shortcuts.indentDedent.label",
  undoRedo: "shortcuts.undoRedo.label",
  cycleLineState: "shortcuts.cycleLineState.label",
  cycleLineStateReverse: "shortcuts.cycleLineStateReverse.label",
  markSelectionOpen: "shortcuts.markSelectionOpen.label",
  setActionOpen: "shortcuts.setActionOpen.label",
  setActionDone: "shortcuts.setActionDone.label",
  setActionDeferred: "shortcuts.setActionDeferred.label",
  setActionWontDo: "shortcuts.setActionWontDo.label",
  jumpAction: "shortcuts.jumpAction.label",
  caretLineNav: "shortcuts.caretLineNav.label",
  convertToSection: "shortcuts.convertToSection.label",
  openActions: "shortcuts.openActions.label",
  openHistory: "shortcuts.openHistory.label",
  findInNote: "shortcuts.findInNote.label",
  crossTabSearch: "shortcuts.crossTabSearch.label",
  syncCalendar: "shortcuts.syncCalendar.label",
  openSettings: "shortcuts.openSettings.label",
  openAbout: "shortcuts.openAbout.label",
  openShortcutsHelp: "shortcuts.openShortcutsHelp.label",
  copyToNextOccurrence: "shortcuts.copyToNextOccurrence.label",
  toggleZenMode: "shortcuts.toggleZenMode.label",
  clickGlyph: "shortcuts.clickGlyph.label",
  escape: "shortcuts.escape.label",
} satisfies Record<(typeof SHORTCUTS)[number]["id"] | "clickGlyph" | "escape", TranslationKey>;

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function shortcutById(id: string): ShortcutDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown shortcut id: ${id}`);
  return def;
}

/** This def's combos that actually apply on the current platform — the
 * general mechanism both display and (for the App.svelte dispatcher)
 * matching filter through, so a Windows/Linux-only or Mac-only combo
 * simply isn't offered on the other platform. */
export function combosForPlatform(def: ShortcutDef): ComboSpec[] {
  const platform = isMac ? "mac" : "other";
  return def.combos.filter((c) => !c.platforms || c.platforms.includes(platform));
}

const KEY_LABELS: Record<string, string> = {
  Comma: ",",
  Slash: "/",
  Period: ".",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

function keyLabel(code: string): string {
  if (code in KEY_LABELS) return KEY_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function formatCombo(combo: ComboSpec): string {
  const parts: string[] = [];
  if (combo.mod) parts.push(isMac ? "Cmd" : "Ctrl");
  if (combo.shift) parts.push("Shift");
  if (combo.alt) parts.push(isMac ? "Option" : "Alt");
  parts.push(keyLabel(combo.code));
  return parts.join("+");
}

/** The full display string for a shortcut on the current platform —
 * e.g. "Ctrl+N / Ctrl+T" on Windows, "Cmd+Enter" on Mac for a
 * Mac-restricted entry. Empty string if this platform has no working
 * combo for it at all (`caretLineNav` on Mac) — callers should skip
 * rendering the row entirely in that case. */
export function formatShortcut(idOrDef: string | ShortcutDef): string {
  const def = typeof idOrDef === "string" ? shortcutById(idOrDef) : idOrDef;
  const combos = combosForPlatform(def);
  if (combos.length === 0) return "";
  const text = combos.map(formatCombo).join(" / ");
  return def.extra ? `${text} / ${def.extra}` : text;
}

export function matchesCombo(e: KeyboardEvent, combo: ComboSpec): boolean {
  if (e.code !== combo.code) return false;
  const wantMod = combo.mod ?? false;
  const hasMod = isMac ? e.metaKey : e.ctrlKey;
  const hasOtherPlatformsMod = isMac ? e.ctrlKey : e.metaKey;
  if (hasMod !== wantMod) return false;
  // Strict: the *other* platform's modifier held at the same time never
  // counts as a match either — what's displayed is exactly what works.
  if (wantMod && hasOtherPlatformsMod) return false;
  if (!!e.shiftKey !== !!combo.shift) return false;
  if (!!e.altKey !== !!combo.alt) return false;
  return true;
}

/** True if `e` matches any of this shortcut's platform-applicable combos. */
export function matchesShortcut(e: KeyboardEvent, id: string): boolean {
  return combosForPlatform(shortcutById(id)).some((c) => matchesCombo(e, c));
}

/** The rows of the Shortcuts & Symbols drawer, in reading order: a registry id pulls that entry's label (via
 * `SHORTCUT_LABEL_KEYS`) and platform-correct combo text; a `[keys, pseudoId]` tuple is one of the rows that
 * aren't key combinations in the registry (a mouse action, or a key with no modifier) — `pseudoId` looks up
 * its own entry in `SHORTCUT_LABEL_KEYS` the same way a real registry id does, `keys` stays literal (like a
 * formatted combo, not natural-language prose). Lives here, next to the registry, so a test can prove every
 * shortcut in the registry has a row (the drawer had quietly lost Zen mode). */
export const DRAWER_ROWS: (string | [string, string])[] = [
  "commandPalette",
  "newScratchpad",
  "reopenClosedTab",
  "openDateNote",
  "closeTab",
  "cycleTab",
  "indentDedent",
  "undoRedo",
  "cycleLineState",
  "cycleLineStateReverse",
  ["Click a glyph", "clickGlyph"],
  "markSelectionOpen",
  "setActionOpen",
  "setActionDone",
  "setActionDeferred",
  "setActionWontDo",
  "jumpAction",
  "caretLineNav",
  "convertToSection",
  "copyToNextOccurrence",
  "openActions",
  "openHistory",
  "findInNote",
  "crossTabSearch",
  "syncCalendar",
  "toggleZenMode",
  "openSettings",
  "openAbout",
  "openShortcutsHelp",
  ["Escape", "escape"],
];
