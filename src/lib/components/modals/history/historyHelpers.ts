import type { TreeConnector } from "../../../editor/actionTreeLines";
import type { HistoryDestination, SectionOccurrence } from "../../../types";

export interface LineSegment {
  kind: "vertical" | "horizontal";
  style: string;
  resolved: boolean;
}

export function lineSegments(lineIdx: number, activeConnectors: TreeConnector[]): LineSegment[] {
  const segments: LineSegment[] = [];
  for (const c of activeConnectors) {
    if (c.children.length === 0) continue;
    const parentIdx = c.parentLineIdx;
    const lastChild = c.children[c.children.length - 1];
    const lastChildIdx = lastChild.lineIdx;
    if (lineIdx < parentIdx || lineIdx > lastChildIdx) continue;

    const x = `calc(4px + ${c.parentCol}ch + var(--glyph-outside-size) / 2)`;

    if (lineIdx === parentIdx) {
      segments.push({
        kind: "vertical",
        style: `left: ${x}; top: 1.5em; bottom: 0;`,
        resolved: c.resolved,
      });
    } else {
      const child = c.children.find((k) => k.lineIdx === lineIdx);
      if (child) {
        const isLast = lineIdx === lastChildIdx;
        segments.push({
          kind: "vertical",
          style: isLast ? `left: ${x}; top: 0; height: 0.75em;` : `left: ${x}; top: 0; bottom: 0;`,
          resolved: c.resolved,
        });
        if (child.col - c.parentCol >= 2) {
          const width = `calc(${child.col - c.parentCol}ch - 2px - var(--glyph-outside-size) / 2)`;
          segments.push({
            kind: "horizontal",
            style: `left: ${x}; top: 0.75em; width: ${width};`,
            resolved: c.resolved,
          });
        }
      } else {
        segments.push({
          kind: "vertical",
          style: `left: ${x}; top: 0; bottom: 0;`,
          resolved: c.resolved,
        });
      }
    }
  }
  return segments;
}

/** The file a destination would actually write to — "here" always
 * targets the tab History was opened from, "today"/"next" a specific
 * date. Used to filter `$historyDestinations` down to ones that aren't
 * just pointing back at the occurrence currently being browsed. */
export function destinationFilename(
  dest: HistoryDestination,
  openedFromFilename: string | undefined,
): string | undefined {
  return dest.kind === "here" ? openedFromFilename : `${dest.date}.txt`;
}

/** #68/#96 precedent, applied to the occurrence strip: a date's own
 * relationship to today, independent of whether it's the one currently
 * selected — dims a past date, accents today, greens a future one. The
 * selected tab's own colored underline (`.active.past`/`.active.future`
 * in `app.css`) follows the same class. Takes `today` as a parameter for
 * the same reason `TopBar`'s `tabDateClass` does: a template expression
 * needs a real reactive dependency to refresh at midnight, not just a
 * plain `todayISO()` call it happens not to re-run. */
export function occDateClass(occ: SectionOccurrence, today: string): string {
  return occ.date < today ? "past" : occ.date > today ? "future" : "today";
}

export const STRIP_SCROLL_STEP = 160;

/** Chat feedback, 2026-09-28: the first version of "keep today's tab and
 * the opened-from tab always in view" used `position: sticky`, which
 * made the pinned tab visually *hover over* whatever else was scrolling
 * underneath it — not what was asked for. This tracks, per pinned
 * occurrence, whether its actual in-strip tab is currently fully inside
 * the strip's own visible viewport ("visible"), or has scrolled fully
 * past the left/right edge ("off-left"/"off-right") — the markup below
 * uses this to render a small duplicate tab *outside* the scrollable
 * strip only when one is genuinely needed, which (being a normal flex
 * sibling, not an overlay) shrinks the strip's own available width to
 * make room for it rather than floating above it. A tab that's already
 * on screen never gets a redundant second copy. */
export type PinState = "visible" | "off-left" | "off-right";

export function pinStateFor(stripEl: HTMLDivElement | undefined, index: number): PinState {
  if (index === -1 || !stripEl) return "visible";
  const el = stripEl.querySelector<HTMLElement>(`[data-occ-index="${index}"]`);
  if (!el) return "visible";
  const stripRect = stripEl.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (elRect.right <= stripRect.left) return "off-left";
  if (elRect.left >= stripRect.right) return "off-right";
  return "visible";
}

/** The (at most two) pinned tabs' duplicate slots outside the scrollable
 * strip, grouped by which side they render on. An occurrence that's
 * *both* today and the one History was opened from (opened from today)
 * gets a single merged entry, not two overlapping duplicates of the
 * same tab. */
export interface PinnedEntry {
  key: string;
  index: number;
  side: "left" | "right";
  classes: string;
}

export function computePinnedEntries(
  todayIdx: number,
  sourceIdx: number,
  todayState: PinState,
  sourceState: PinState,
): PinnedEntry[] {
  const entries: PinnedEntry[] = [];
  if (todayIdx !== -1 && todayIdx === sourceIdx) {
    if (todayState !== "visible") {
      entries.push({
        key: "today-source",
        index: todayIdx,
        side: todayState === "off-left" ? "left" : "right",
        classes: "pinned-today pinned-source",
      });
    }
    return entries;
  }
  if (todayIdx !== -1 && todayState !== "visible") {
    entries.push({ key: "today", index: todayIdx, side: todayState === "off-left" ? "left" : "right", classes: "pinned-today" });
  }
  if (sourceIdx !== -1 && sourceState !== "visible") {
    entries.push({ key: "source", index: sourceIdx, side: sourceState === "off-left" ? "left" : "right", classes: "pinned-source" });
  }
  return entries;
}

// A pinned slot appearing *as a result of* the scroll a click just did
// (e.g. wrapping to the far end can scroll the opened-from tab out of
// view, pinning a duplicate of it and narrowing the strip a little)
// lands scrollLeft close to, but not quite exactly at, the new edge —
// the strip's own available width just changed out from under it. A
// tolerance margin here (rather than requiring exact equality) means
// that still reads as "at the edge" for the next click's own wrap
// check, instead of silently falling back to a small nudge.
export const EDGE_TOLERANCE = 40;

// Wrapping to the far-right end is a moving target: the `scrollTo` below
// is issued against *today's* maxScroll, but if that scroll itself
// scrolls the opened-from/today tab out of view, a pinned slot pops in
// partway through the animation and narrows the strip — growing
// maxScroll out from under the in-flight scroll, so it lands short of
// the (now-further) true end. Corrected once the scroll settles, rather
// than predicting the pinned slot up front, since that would require
// resolving a circular "layout depends on scroll position which depends
// on layout" dependency for what's a one-frame visual nudge either way.
export function scrollStripToEndCorrecting(el: HTMLDivElement) {
  const target = () => el.scrollWidth - el.clientWidth;
  el.scrollTo({ left: target(), behavior: "smooth" });
  let settled = false;
  const correct = () => {
    if (settled) return;
    settled = true;
    el.removeEventListener("scrollend", correct);
    const finalTarget = target();
    if (Math.abs(el.scrollLeft - finalTarget) > 1) {
      el.scrollTo({ left: finalTarget, behavior: "auto" });
    }
  };
  el.addEventListener("scrollend", correct, { once: true });
  // `scrollend` never fires if the initial `scrollTo` turns out to be a
  // no-op (already at that position) — a plain timeout fallback still
  // catches a since-grown target in that case.
  setTimeout(correct, 400);
}
