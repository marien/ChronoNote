import type { NoteTab } from "../../types";

/** Dated tabs show just the date; scratchpads keep their given name. */
export const tabLabel = (t: NoteTab) => (t.isScratchpad ? t.filename : t.filename.replace(/\.txt$/, ""));

/** #68/#72: a daily tab's date relative to today — past/today/future get
 * a distinct look (§68's own CSS) so today's tab, the one most work
 * happens in, stands out from yesterday's leftovers and next week's
 * placeholders without having to read every label. A scratchpad has no
 * date of its own, so it's excluded (`""`, no extra class). Takes
 * `today` as a parameter rather than reading `todayISO()` itself —
 * called from the template on every render, so it needs `$currentDateISO`
 * (a real reactive dependency, kept live by `boot.ts`'s
 * `wireDateRollover`) to actually refresh at midnight, rather than a
 * plain function call that only happens to re-run when something else
 * Svelte is already watching triggers a re-render. */
export const tabDateClass = (t: NoteTab, today: string): string => {
  if (t.isScratchpad) return "";
  const date = t.filename.slice(0, 10);
  return date < today ? "past" : date > today ? "future" : "today";
};

/** Waits for the next paint frame — used instead of Svelte's own `tick()`
 * everywhere below. `tick()` resolves via Svelte's reactive scheduler,
 * and awaiting it inside a function invoked from a reactive block (a
 * `$:` statement when this was written, an `$effect` since runes; both
 * `settleLayout` and `scrollActiveTabIntoView` were called that way)
 * hands control back to that same scheduler on resume — which can decide
 * the originating statement is still "active" and re-run it, and if the
 * resumed code does anything that looks like more reactive work, this
 * repeats forever. That was the cause of a real hard freeze here: with
 * `scrollActiveTabIntoView` using `await tick()`, switching tabs could
 * lock up the whole window (unresponsive to clicks and shortcuts) —
 * confirmed by swapping this one call for `requestAnimationFrame`, which
 * sits outside Svelte's scheduler entirely and doesn't retrigger it.
 * Still gives a render pass to wait for (needed so a *newly created*
 * tab's element exists in the DOM before code below tries to measure or
 * scroll to it), just via the browser's own frame clock instead. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export const TAB_BAR_PADDING = 16; // `#tab-bar`'s horizontal padding (room for the active tab's base curves)
export const FIT_MARGIN = 8;
// §merged-titlebar follow-up: how much of a neighboring tab to leave
// peeking in when scrolling the active tab into view at an edge.
export const TAB_EDGE_PEEK = 24;
// Matches `.titlebar-commands`' `gap` (02-top-bar.css) — only manifests between buttons, so a
// collapsed button's real width in the row is its own plus this.
export const COMMAND_GAP = 2;
// `.titlebar-drag-gutter`'s `min-width` — the part of it that is not spare room.
export const GUTTER_MIN = 48;

export const DRAG_THRESHOLD = 5;
export const NEW_MENU_MAX_WIDTH = 320; // `.more-actions-pop`'s max-width: keeps it on screen near the right edge

export function rectWidth(el: HTMLElement | undefined): number {
  return el ? el.getBoundingClientRect().width : 0;
}

// #57: `tabs.subscribe` on its own over-fires, though — every keystroke
// calls `updateActiveTabContent()`, which is a `tabs.set()` on every
// single content change, not just a tab being added/removed/renamed.
// `settleLayout()`'s "try a better tier" branches unconditionally flip
// state and measure again even when nothing about the available width
// could possibly have changed, so a plain `tabs.subscribe(() =>
// settleLayout())` visibly flashed labels/buttons on and off on every
// keystroke while typing — the exact bug reported. `layoutSignature`
// below reduces a tab list to just the fields that can actually change
// rendered width (identity, scratchpad-ness, filename, and the
// scratchpad "unsaved" dot's on/off state) — a keystroke changes a
// tab's `content` but never any of those, so the signature comes out
// identical and `settleLayout()` is never even called.
export function layoutSignature(list: NoteTab[]): string {
  return list
    .map(
      (t) =>
        `${t.id}:${t.isScratchpad ? "s" : "d"}:${t.filename}:${t.isScratchpad && t.content.trim() !== "" ? 1 : 0}`,
    )
    .join("|");
}
