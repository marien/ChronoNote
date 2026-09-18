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
 *   - `Escape` and "click a glyph" (`ShortcutsModal.svelte`'s own two
 *     extra rows) — not modifier-bearing combos, nothing to make
 *     Mac-aware.
 *   - The Action Drawer's own local `Ctrl+Space` (`ActionDrawerModal
 *     .svelte`) — its handler already treats a bare `Enter` specially
 *     (jump to that action), so adding a Cmd+Enter alias the way the
 *     editor's own cycle-state binding gets one below would collide with
 *     that existing Enter handling. Left as a known, documented
 *     Mac limitation (mouse click still always works) rather than
 *     risking a regression to fix it under this same pass.
 */
import { isMac } from "./platform";

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
  /** Description shown in the Shortcuts & Symbols drawer. */
  label: string;
  combos: ComboSpec[];
  /** Non-keyboard text appended after the formatted combo(s), e.g. "middle-click". */
  extra?: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "commandPalette",
    label: "Command palette — run any command, jump to a tab, date or action",
    combos: [{ mod: true, code: "KeyK" }],
  },
  {
    id: "newScratchpad",
    label: "New scratchpad",
    combos: [
      { mod: true, code: "KeyN" },
      { mod: true, code: "KeyT" },
    ],
  },
  {
    id: "reopenClosedTab",
    label: "Reopen most recently closed tab",
    combos: [
      { mod: true, shift: true, code: "KeyT" },
      { mod: true, shift: true, code: "KeyN" },
    ],
  },
  {
    id: "openDateNote",
    label: "Open/create a dated note",
    combos: [{ mod: true, code: "KeyO" }],
  },
  {
    id: "closeTab",
    label: "Close current tab / close a tab",
    combos: [{ mod: true, code: "KeyW" }],
    extra: "middle-click",
  },
  {
    id: "cycleTab",
    label: "Next / previous tab",
    combos: [
      { mod: true, code: "Tab" },
      { mod: true, shift: true, code: "Tab" },
    ],
  },
  {
    id: "indentDedent",
    label: "Indent / dedent (in editor)",
    combos: [{ code: "Tab" }, { shift: true, code: "Tab" }],
  },
  {
    id: "undoRedo",
    label: "Undo / redo (kept per tab)",
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
    label: "Close the current line's open action (# → v, in editor)",
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
    label: "Reopen the current line's done action (v → #, in editor)",
    combos: [
      // Same Space-avoided-on-Mac reasoning as `cycleLineState` above —
      // no Mac binding involving Space, Cmd+Shift+Enter instead.
      { mod: true, shift: true, code: "Space", platforms: ["other"] },
      { mod: true, shift: true, code: "Enter" },
    ],
  },
  {
    id: "markSelectionOpen",
    label: "Set every line in the selection to open (in editor)",
    combos: [{ mod: true, shift: true, code: "KeyO" }],
  },
  // #70: the same idea as markSelectionOpen, direct to each of the other
  // three states — matching `ACTION_CYCLE_ORDER` (tokens.ts), the same
  // order cycleLineState steps through.
  {
    id: "setActionOpen",
    label: "Set every line in the selection to open, including plain lines (in editor)",
    combos: [{ mod: true, code: "Digit1" }],
  },
  {
    id: "setActionDone",
    label: "Set every line in the selection to done, including plain lines (in editor)",
    combos: [{ mod: true, code: "Digit2" }],
  },
  {
    id: "setActionDeferred",
    label: "Set every line in the selection to deferred, including plain lines (in editor)",
    combos: [{ mod: true, code: "Digit3" }],
  },
  {
    id: "setActionWontDo",
    label: "Set every line in the selection to won't-do, including plain lines (in editor)",
    combos: [{ mod: true, code: "Digit4" }],
  },
  {
    id: "jumpAction",
    label: "Jump to next / previous open action (in editor, wraps)",
    combos: [{ code: "F2" }, { shift: true, code: "F2" }],
  },
  {
    id: "caretLineNav",
    label: "Caret to start of line, then previous line / start of next line (in editor)",
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
    label: "Convert current line into a section header",
    combos: [{ mod: true, shift: true, code: "KeyS" }],
  },
  {
    id: "openActions",
    label: "Actions",
    combos: [{ mod: true, shift: true, code: "KeyA" }],
  },
  {
    id: "openHistory",
    label: "Section history",
    combos: [{ mod: true, shift: true, code: "KeyH" }],
  },
  {
    id: "findInNote",
    label: "Find in this note (floating bar; Enter / Shift+Enter to step)",
    combos: [{ mod: true, code: "KeyF" }],
  },
  {
    id: "crossTabSearch",
    label: "Cross-tab search",
    combos: [{ mod: true, shift: true, code: "KeyF" }],
  },
  {
    id: "syncCalendar",
    label: "Sync calendar for this day",
    combos: [{ mod: true, shift: true, code: "KeyC" }],
  },
  {
    id: "openSettings",
    label: "Settings",
    combos: [{ mod: true, code: "Comma" }],
  },
  {
    id: "openAbout",
    label: "About ChronoNote",
    combos: [{ mod: true, shift: true, code: "Comma" }],
  },
  {
    id: "openShortcutsHelp",
    label: "This drawer",
    combos: [
      { mod: true, code: "Slash" },
      { mod: true, shift: true, code: "Slash" },
    ],
  },
  {
    id: "copyToNextOccurrence",
    label: "Copy the selection (or current line) to the next occurrence of this section",
    combos: [{ mod: true, shift: true, code: "Period" }],
  },
];

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
