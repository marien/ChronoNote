<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import * as controller from "../../../controller";
  import { currentDateISO, historyLoading, historyTargetHeader } from "../../../controller";
  import Icon from "../../../icons/Icon.svelte";
  import { t } from "../../../i18n";
  import type { SectionOccurrence } from "../../../types";
  import { noteDateLabel } from "../../../noteDateLabel";
  import {
    EDGE_TOLERANCE,
    STRIP_SCROLL_STEP,
    type PinState,
    computePinnedEntries,
    occDateClass,
    pinStateFor,
    scrollStripToEndCorrecting,
  } from "./historyHelpers";

  interface Props {
    occurrences: SectionOccurrence[];
    selectedIndex: number;
    openedFromFilename: string | undefined;
    onFocusBody: () => void;
  }
  let {
    occurrences,
    selectedIndex = $bindable(),
    openedFromFilename,
    onFocusBody,
  }: Props = $props();

  // Chat feedback: "keep today's tab button and destination section tab
  // button always in view in the tab bar, even when moving to earlier or
  // later dates" — these two indices identify which occurrence (if any)
  // each one is. `-1` (no match) is a legitimate, common case — e.g. no
  // section exists today yet — and simply means nothing gets pinned.
  const todayOccIndex = $derived(occurrences.findIndex((o) => o.date === $currentDateISO));
  const openedFromOccIndex = $derived(occurrences.findIndex((o) => o.filename === openedFromFilename));

  // Declared first: the `$effect.pre` below runs during the component's first render and reaches stripEl through
  // focusOpenedFromOccurrence; a `let` read before its line has run throws (an unhandled rejection on every open,
  // which the error reporting would now show to the user).
  let stripEl: HTMLDivElement | undefined;
  let hasFocusedOpenedFrom = false;
  let lastTargetHeader = $state("");
  $effect.pre(() => {
    if ($historyTargetHeader !== lastTargetHeader) {
      lastTargetHeader = $historyTargetHeader;
      hasFocusedOpenedFrom = false;
      selectedIndex = 0;
    }
  });

  // 2026-09-27 bug fix: `historyOccurrences` always starts as `[]` and
  // fills in once the disk read resolves — genuinely *after* `onMount` in
  // every case, since `openMeetingHistory()` clears it and opens the modal
  // before awaiting that read (the whole point of #62's spinner). Doing
  // this focus-on-open logic in `onMount` (the previous approach, `await
  // tick()` then search) ran while `occurrences` was still empty, found no
  // match, and silently left `selectedIndex` at its default of 0 — which,
  // now that the strip sorts oldest-first, is the *oldest* date rather
  // than the one History was opened from. Doing it here instead, the first
  // time the list actually has anything in it, means it always runs
  // against real data regardless of how long the read takes.
  // Runs once, the first time the list has anything in it. `$effect.pre`: the index is written
  // before anything renders, and `selectedOcc` (the body) is a `$derived` computed on read, so the
  // strip and the body can no longer disagree (§215/§270). The index is still assigned here, not
  // inside the helper; the helper only scrolls (untracked, so it adds no dependencies).
  $effect.pre(() => {
    if (!hasFocusedOpenedFrom && occurrences.length > 0) {
      hasFocusedOpenedFrom = true;
      const idx = occurrences.findIndex((o) => o.filename === openedFromFilename);
      if (idx !== -1) selectedIndex = idx;
      untrack(() => void focusOpenedFromOccurrence());
    }
  });

  /** Waits until the strip's own tab buttons actually match `occurrences`
   * — found by tracing a real bug: a single `await tick()` isn't always
   * enough here. `openMeetingHistory()` sets `historyOccurrences` (which
   * this component reacts to) *before* `historyLoading` flips back to
   * `false` — a fast mock can settle both within the same handful of
   * microtasks, so a fixed one- or two-tick wait sometimes ran with the
   * loading-spinner branch of the template still mounted (zero tabs in
   * the DOM), leaving `selectedIndex` set correctly but nothing to
   * scroll to yet. Polling for the real tab count is robust regardless of
   * how many Svelte update cycles it actually takes to land. */
  async function waitForStripRendered() {
    for (let i = 0; i < 5; i++) {
      if (stripEl && stripEl.querySelectorAll("[data-occ-index]").length === occurrences.length) return;
      await tick();
    }
  }

  /** Scrolls the strip to the (already selected) opened-from occurrence once the tabs are rendered. */
  async function focusOpenedFromOccurrence() {
    await waitForStripRendered();
    // Settle whether the scroll arrows are showing *before* scrolling —
    // measuring/scrolling against a strip that's about to narrow (once
    // the arrows appear) would land the wrong scroll position.
    updateStripOverflow();
    await tick();
    scrollOccIntoView();
  }

  onMount(() => {
    // #61 precedent (TopBar's own tab strip): the occurrence strip can
    // overflow its own width once there are enough dates — a
    // `ResizeObserver` on the strip catches a *window*-driven width
    // change; `refreshStripOverflow` below (triggered off `occurrences`
    // itself) catches a *content* change (more/fewer tabs) that doesn't
    // necessarily resize the strip's own box at all.
    if (stripEl) {
      stripResizeObserver = new ResizeObserver(() => refreshStripChrome());
      stripResizeObserver.observe(stripEl);
    }
  });

  onDestroy(() => {
    stripResizeObserver?.disconnect();
  });

  export function scrollOccIntoView(index: number = selectedIndex) {
    stripEl?.querySelector<HTMLElement>(`[data-occ-index="${index}"]`)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    // `scrollIntoView` with no `behavior` is an instant jump — the new
    // scroll position is already final by the time this line runs, so
    // this can safely recompute pin visibility (and overflow, in case
    // content changed too) synchronously rather than waiting on the
    // `scroll` event (which a smooth scroll, e.g. `scrollOccStrip`, still
    // needs — see the strip's own `on:scroll`).
    refreshStripChrome();
  }

  // Chat feedback: "I miss the left and right buttons that the main tab
  // bar has" — the same scroll-the-strip-not-the-selection behavior as
  // `TopBar`'s own `.tab-scroll-btn`s (§52): only shown once the strip
  // genuinely overflows, wraps to the far end past either edge.
  let stripOverflowing = $state(false);
  let stripResizeObserver: ResizeObserver | null = null;

  function updateStripOverflow() {
    if (stripEl) stripOverflowing = stripEl.scrollWidth > stripEl.clientWidth + 1;
  }

  let todayPinState: PinState = $state("visible");
  let sourcePinState: PinState = $state("visible");

  function updatePinStates() {
    todayPinState = pinStateFor(stripEl, todayOccIndex);
    sourcePinState = pinStateFor(stripEl, openedFromOccIndex);
  }

  function refreshStripChrome() {
    updateStripOverflow();
    updatePinStates();
  }

  // Re-measures whenever the list changes; the helper awaits, so it runs untracked.
  $effect(() => {
    void occurrences;
    untrack(() => void refreshStripLayout());
  });
  async function refreshStripLayout() {
    await waitForStripRendered();
    refreshStripChrome();
  }

  const pinnedEntries = $derived(computePinnedEntries(todayOccIndex, openedFromOccIndex, todayPinState, sourcePinState));

  /** A pinned slot's own click — select and actually scroll the real tab
   * into view (unlike a normal in-strip tab click, which doesn't need to:
   * it's already visible, or it wouldn't be clickable). */
  function selectAndReveal(index: number) {
    selectedIndex = index;
    onFocusBody();
    scrollOccIntoView(index);
  }

  function scrollOccStrip(direction: 1 | -1) {
    if (!stripEl) return;
    const maxScroll = stripEl.scrollWidth - stripEl.clientWidth;
    const atLeftEdge = stripEl.scrollLeft <= EDGE_TOLERANCE;
    const atRightEdge = stripEl.scrollLeft >= maxScroll - EDGE_TOLERANCE;
    if (direction === -1 && atLeftEdge) {
      scrollStripToEndCorrecting(stripEl);
    } else if (direction === 1 && atRightEdge) {
      stripEl.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      stripEl.scrollBy({ left: direction * STRIP_SCROLL_STEP, behavior: "smooth" });
    }
  }
</script>

    <!-- 2026-09-25 redesign: occurrences as a compact horizontal strip
         (the same idea as the main window's tab strip, sized down) instead
         of a tall vertical sidebar list — a recurring section's handful of
         recent dates were the ones actually used, and the list ate space
         better spent on the note body next to it. Each tab's dot mirrors
         the date picker's own 3-tier completion heat (`computeDayHeat`,
         `.cal-day`'s `.has-*` dots) so the same color already means the
         same thing everywhere in the app: amber = open actions, green =
         all resolved, muted = a note with no actions at all. No dot at
         all = genuinely empty ("no content yet"). -->
    <div class="history-occ-strip-row">
      {#if stripOverflowing}
        <button
          type="button"
          class="icon-btn history-occ-scroll-btn"
          aria-label={$t("history.strip.scrollLeft")}
          onclick={() => scrollOccStrip(-1)}
        >
          <Icon name="chevron-left" size={14} />
        </button>
      {/if}
      <!-- 2026-09-28: pinned duplicates of today's tab / the opened-from
           tab, rendered *outside* the scrollable strip only once their
           real in-strip tab has actually scrolled out of view
           (`pinnedEntries`). Being an ordinary flex sibling of the strip
           (not a `position: sticky` overlay, which is what this replaced
           — chat feedback that it hovered over whatever scrolled
           underneath it), it shrinks the strip's own available width to
           make room for itself, the same way the scroll-arrow buttons
           already do. -->
      {#each pinnedEntries.filter((p) => p.side === "left") as p (p.key)}
        {@const occ = occurrences[p.index]}
        {@const heat = controller.occurrenceHeat(occ)}
        <button
          type="button"
          class="history-occ-tab pinned-slot {p.classes} {p.index === selectedIndex ? 'active' : ''} {heat ? '' : 'empty'} {occDateClass(occ, $currentDateISO)}"
          role="tab"
          aria-selected={p.index === selectedIndex}
          title={heat ? $t("history.occ.title.hasContent", { date: occ.date }) : $t("history.occ.title.empty", { date: occ.date })}
          onclick={() => selectAndReveal(p.index)}
          ondblclick={() => controller.jumpToHistoryLine(occ)}
        >
          <span class="history-occ-date" title={occ.date}>{$noteDateLabel(occ.date)}</span>
          {#if heat}<span class="occ-dot has-{heat}" aria-hidden="true"></span>{/if}
        </button>
      {/each}
      <div
        class="history-occ-strip"
        role="tablist"
        aria-label={$t("history.strip.ariaLabel")}
        bind:this={stripEl}
        onscroll={updatePinStates}
      >
        {#if $historyLoading}
          <span class="history-occ-loading"><span class="modal-spinner" aria-label={$t("common.loading")}>⟳</span> {$t("history.strip.loading")}</span>
        {:else if occurrences.length === 0}
          <span class="history-occ-loading">{$t("history.strip.empty")}</span>
        {:else}
          {#each occurrences as occ, index (occ.filename)}
            {@const heat = controller.occurrenceHeat(occ)}
            <button
              type="button"
              class="history-occ-tab {index === selectedIndex ? 'active' : ''} {heat ? '' : 'empty'} {occDateClass(occ, $currentDateISO)}"
              role="tab"
              aria-selected={index === selectedIndex}
              data-occ-index={index}
              tabindex={index === selectedIndex ? 0 : -1}
              title={heat ? $t("history.occ.title.hasContent", { date: occ.date }) : $t("history.occ.title.empty", { date: occ.date })}
              onclick={() => {
                selectedIndex = index;
                onFocusBody();
              }}
              ondblclick={() => controller.jumpToHistoryLine(occ)}
            >
              <span class="history-occ-date" title={occ.date}>{$noteDateLabel(occ.date)}</span>
              {#if heat}<span class="occ-dot has-{heat}" aria-hidden="true"></span>{/if}
            </button>
          {/each}
        {/if}
      </div>
      {#each pinnedEntries.filter((p) => p.side === "right") as p (p.key)}
        {@const occ = occurrences[p.index]}
        {@const heat = controller.occurrenceHeat(occ)}
        <button
          type="button"
          class="history-occ-tab pinned-slot {p.classes} {p.index === selectedIndex ? 'active' : ''} {heat ? '' : 'empty'} {occDateClass(occ, $currentDateISO)}"
          role="tab"
          aria-selected={p.index === selectedIndex}
          title={heat ? $t("history.occ.title.hasContent", { date: occ.date }) : $t("history.occ.title.empty", { date: occ.date })}
          onclick={() => selectAndReveal(p.index)}
          ondblclick={() => controller.jumpToHistoryLine(occ)}
        >
          <span class="history-occ-date" title={occ.date}>{$noteDateLabel(occ.date)}</span>
          {#if heat}<span class="occ-dot has-{heat}" aria-hidden="true"></span>{/if}
        </button>
      {/each}
      {#if stripOverflowing}
        <button
          type="button"
          class="icon-btn history-occ-scroll-btn"
          aria-label={$t("history.strip.scrollRight")}
          onclick={() => scrollOccStrip(1)}
        >
          <Icon name="chevron-right" size={14} />
        </button>
      {/if}
    </div>

<style>
/* The occurrence strip: one small tab per date, modeled on the main
 * window's own tab strip (`#tab-bar`/`.tab`) but sized down for a modal.
 * Horizontally scrollable (no visible scrollbar, same treatment as
 * `#tab-bar`) rather than collapsing/overflowing — occurrence counts here
 * are rarely huge, and keyboard Left/Right (`moveOccurrence`) plus
 * `scrollOccIntoView` keep the selected tab reachable either way.
 *
 * 2026-09-27 follow-up: split into a row (`-row`, carries the chrome
 * background/border and the #52-style scroll-arrow buttons, chat feedback:
 * "I miss the left and right buttons that the main tab bar has") and the
 * actual scrollable strip inside it — the arrows need to sit outside the
 * scrolling area, the same relationship `#tab-bar`'s own arrows have to
 * it.
 *
 * 2026-09-28 follow-up: `.pinned-slot` tabs (see further down) are ordinary
 * flex siblings of `.history-occ-strip` in this same row, not an overlay —
 * `gap` here is what keeps them visually separated from the strip and the
 * scroll buttons once one appears. */

.history-occ-strip-row {
  display: flex;
  align-items: stretch;
  gap: 2px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--edge-soft);
  background: var(--surface-chrome);
}

.history-occ-scroll-btn {
  flex-shrink: 0;
  padding: 0 6px;
}

.history-occ-strip {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 5px 10px;
}

.history-occ-strip::-webkit-scrollbar {
  height: 0;
}

.history-occ-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
  font-size: 11px;
  color: var(--muted);
}

.history-occ-tab {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: var(--type-caption);
  white-space: nowrap;
  cursor: pointer;
}

.history-occ-tab:hover {
  background: var(--surface-raised);
  color: var(--text);
}

/* Chat feedback: "visually connect the tab buttons to the content" tried
 * matching the active tab's background to `.history-detail`'s own
 * (`--surface-canvas`) — but `--surface-canvas` (#1e1e1e) is actually
 * *darker* than the strip's own `--surface-chrome` (#252526), so the
 * "highlighted" tab ended up less prominent than its unselected siblings,
 * and unreadable combined with the past-date dimming below ("gray on
 * gray"). Back to `--surface-raised` (#37373b, clearly lighter — the same
 * token every other active/hovered control in the app uses), which stays
 * legible regardless of which date-class also applies. The squared bottom
 * corners are kept — a purely geometric "this tab belongs to the panel
 * below it" cue that doesn't depend on a color contrast that can break. */

.history-occ-tab.active {
  background: var(--surface-raised);
  color: var(--text);
  font-weight: 600;
  border-radius: 5px 5px 0 0;
  box-shadow: inset 0 -2px 0 var(--tab-active-border);
}

.history-occ-tab.empty {
  opacity: 0.55;
}

/* Chat feedback: "the colored line on the tab needs to follow the color
 * scheme of the main tabs" — the exact same #68/#96 treatment `.tab`/
 * `.tab.active` get in the main window's own strip, just applied to
 * `.history-occ-date` (there's no icon here) instead of `.tab-icon`. The
 * main tab strip only ever dims a *decorative* icon for a past tab, never
 * its label text, so an active-but-past tab there stays fully legible;
 * `.history-occ-date` is this tab's only text at all, so dimming it while
 * also active caused the same "hard to see" problem the background fix
 * above did. `:not(.active)` keeps the dimming for at-a-glance scanning
 * of the *un*selected tabs, matching what "past" means everywhere else,
 * while the selected tab is always shown at full strength regardless of
 * its date. */

.history-occ-tab:global(.past):not(.active) .history-occ-date {
  /* D5: dimmed with the secondary text colour (4.5:1 on the grey tab) instead of opacity, which fell to 2.3:1. */
  color: var(--text-secondary);
}

.history-occ-tab.today .history-occ-date {
  opacity: 1;
  color: var(--tab-active-border);
}

.history-occ-tab:global(.future) .history-occ-date {
  opacity: 1;
  color: var(--state-ok);
}

.history-occ-tab.active:global(.past) {
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--muted) 45%, transparent);
}

.history-occ-tab.active:global(.future) {
  box-shadow: inset 0 -2px 0 var(--state-ok);
}

/* Chat feedback: "keep today's tab button and destination section tab
 * button always in view in the tab bar, even when moving to earlier or
 * later dates" — 2026-09-27 first tried this as `position: sticky`
 * against `.history-occ-strip`'s own scrollport (a "frozen column"), but
 * that made the pinned tab visually hover *over* whatever else was
 * scrolling underneath it, which 2026-09-28 chat feedback specifically
 * didn't want. Replaced with a genuine layout reflow instead: `.pinned-
 * slot` (`pinnedEntries` in the script, computed from each pinned
 * occurrence's real in-strip tab actually having scrolled out of view —
 * see `pinStateFor`) is a small duplicate tab rendered as an ordinary flex
 * sibling of `.history-occ-strip` *outside* the scrollable area, in the
 * same row as the scroll-arrow buttons — being a real sibling rather than
 * an overlay, it shrinks the strip's own available width to make room for
 * itself instead of floating above anything. `.pinned-today`/`.pinned-
 * source` (kept as class names, no longer sticky-positioned) mark which
 * occurrence a slot duplicates, purely for styling/testing — an
 * occurrence that's both (opened from today) gets one merged slot with
 * both classes, not two overlapping duplicates. */

/* `.history-occ-strip-row`'s `align-items: stretch` only centers a child
 * that has no explicit cross-size of its own — `.history-occ-tab`'s fixed
 * `height: 26px` overrides that stretch and falls back to `flex-start`
 * (per the flexbox spec), which pinned this duplicate to the *top* of the
 * row instead of level with the rest of the tab strip (the real in-strip
 * tabs look right only because `.history-occ-strip` itself stretches full
 * height and re-centers *its own* children with `align-items: center`,
 * a step a `.pinned-slot` — a direct sibling of that strip, not a child of
 * it — never goes through). `align-self: center` puts it back on the same
 * row as everything else. */

.history-occ-tab.pinned-slot {
  border: 1px solid var(--edge-soft);
  align-self: center;
}

/* Mirrors the date picker's own `.cal-day` completion dots exactly
 * (`computeDayHeat`/`occurrenceHeat`) — the same colors mean the same
 * thing everywhere: amber = open actions, green = all resolved, muted =
 * a note with no actions at all. No dot (the `.empty` tab above) = the
 * section genuinely has no content yet. */

.occ-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.occ-dot:global(.has-pending) {
  background: var(--state-warn);
}

.occ-dot:global(.has-done) {
  background: var(--glyph-done-color);
}

.occ-dot:global(.has-log) {
  background: var(--text-tertiary);
  opacity: 0.45;
}
</style>
