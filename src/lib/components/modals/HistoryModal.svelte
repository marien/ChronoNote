<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import {
    currentDateISO,
    historyDestinations,
    historyLoading,
    historyOccurrences,
    historyOpenedFromTabId,
    historyTargetHeader,
    tabs,
  } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { parseGlyphLine } from "../../editor/glyphLine";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import type { HistoryDestination, SectionOccurrence } from "../../types";
  import { clampIndex, wrapIndex } from "./virtualList";

  let selectedIndex = 0;

  // Anchor/focus line-selection model (2026-09-25 redesign, from chat
  // feedback on the browse-and-carry-forward redesign): `selAnchor` is the
  // line the selection started from, `focusLineIdx` is the end the
  // keyboard/mouse is currently moving — the same anchor+focus pair a text
  // editor uses, so Shift+Arrow can grow *or shrink* a range instead of
  // only ever extending from a fixed starting click the way a plain
  // Shift+click model does. `lineSelection` (the `{from, to}` actually
  // used for rendering/take-over) is always derived from the two, never
  // set directly.
  let selAnchor: number | null = null;
  let focusLineIdx: number | null = null;
  let lineSelection: { from: number; to: number } | null = null;
  let isDraggingLines = false;
  let takeOverMode: "whole" | "action-only" = "whole";

  $: occurrences = $historyOccurrences;
  $: selectedIndex = clampIndex(selectedIndex, occurrences.length);
  $: selectedOcc = occurrences[selectedIndex] as SectionOccurrence | undefined;
  $: openedFromFilename = $tabs.find((t) => t.id === $historyOpenedFromTabId)?.filename;

  // Chat feedback: "keep today's tab button and destination section tab
  // button always in view in the tab bar, even when moving to earlier or
  // later dates" — these two indices identify which occurrence (if any)
  // each one is. `-1` (no match) is a legitimate, common case — e.g. no
  // section exists today yet — and simply means nothing gets pinned.
  $: todayOccIndex = occurrences.findIndex((o) => o.date === $currentDateISO);
  $: openedFromOccIndex = occurrences.findIndex((o) => o.filename === openedFromFilename);

  /** The file a destination would actually write to — "here" always
   * targets the tab History was opened from, "today"/"next" a specific
   * date. Used to filter `$historyDestinations` down to ones that aren't
   * just pointing back at the occurrence currently being browsed. */
  function destinationFilename(dest: HistoryDestination): string | undefined {
    return dest.kind === "here" ? openedFromFilename : `${dest.date}.txt`;
  }

  // 2026-09-26: replaces a blanket "no take-over at all when browsing the
  // note History was opened from" rule with a per-destination check — that
  // rule was both too broad and, in one shape, silently wrong. Too broad:
  // opened from a *past* note, its own occurrence is a perfectly good
  // source to forward from — "Today"/"Next occurrence" are different files
  // entirely, so there's something real to carry it to. Wrong the other
  // way: browsing *today's own* occurrence while "Today" is offered as a
  // destination is exactly as self-referential as the case the old rule
  // caught, but the old rule only compared against the opened-from
  // filename, not each destination's own target — so it let that one
  // through, and writing a take-over's source and target to the very same
  // file raced two separate read-modify-write passes against each other,
  // silently dropping the insertion and keeping only the source's own
  // deferred-line edit (a real, reported bug, not just a UX rough edge).
  $: usableDestinations = selectedOcc
    ? $historyDestinations.filter((d) => destinationFilename(d) !== selectedOcc!.filename)
    : [];

  /** #68/#96 precedent, applied to the occurrence strip: a date's own
   * relationship to today, independent of whether it's the one currently
   * selected — dims a past date, accents today, greens a future one. The
   * selected tab's own colored underline (`.active.past`/`.active.future`
   * in `app.css`) follows the same class. Takes `today` as a parameter for
   * the same reason `TopBar`'s `tabDateClass` does: a template expression
   * needs a real reactive dependency to refresh at midnight, not just a
   * plain `todayISO()` call it happens not to re-run. */
  function occDateClass(occ: SectionOccurrence, today: string): string {
    return occ.date < today ? "past" : occ.date > today ? "future" : "today";
  }

  let bodyContainerEl: HTMLDivElement;
  let hasFocusedOpenedFrom = false;

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
  $: if (!hasFocusedOpenedFrom && occurrences.length > 0) {
    hasFocusedOpenedFrom = true;
    focusOpenedFromOccurrence();
  }

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

  async function focusOpenedFromOccurrence() {
    const idx = occurrences.findIndex((o) => o.filename === openedFromFilename);
    if (idx !== -1) selectedIndex = idx;
    await waitForStripRendered();
    // Settle whether the scroll arrows are showing *before* scrolling —
    // measuring/scrolling against a strip that's about to narrow (once
    // the arrows appear) would land the wrong scroll position.
    updateStripOverflow();
    await tick();
    scrollOccIntoView();
  }

  onMount(() => {
    bodyContainerEl?.focus();
    // A drag started with the mouse still down when it leaves the line
    // list (over the takeover bar, or right off the modal) must still
    // stop on mouseup — listen on the window, not just the list itself.
    window.addEventListener("mouseup", stopDrag);
    // On `document`, not a template `on:keydown` on some div — a plain
    // `<div>` holding a keydown listener has no ARIA role that makes it
    // "interactive," which `svelte-check` rightly flags; the real fix is
    // the same one `focusTrap` already uses for Tab (see that file's own
    // comment): listen where the keys land regardless of which specific
    // element inside the modal currently has focus, rather than routing
    // everything through one div's own focus state. `onDestroy` below
    // removes it, so it's scoped to exactly this modal's lifetime.
    document.addEventListener("keydown", onKeydown);
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
    window.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("keydown", onKeydown);
    stripResizeObserver?.disconnect();
  });

  function stopDrag() {
    isDraggingLines = false;
  }

  // Reset the line selection whenever the browsed occurrence changes —
  // it's meaningless carried over to a different occurrence's lines.
  let lastSelectedFilename: string | undefined;
  $: if (selectedOcc?.filename !== lastSelectedFilename) {
    lastSelectedFilename = selectedOcc?.filename;
    selAnchor = null;
    focusLineIdx = null;
    lineSelection = null;
    takeOverMode = "whole";
  }

  $: singleLineActionOnly =
    selectedOcc && lineSelection && lineSelection.from === lineSelection.to
      ? controller.historyActionOnlyText(selectedOcc.lines[lineSelection.from - selectedOcc.startLineIdx])
      : null;
  $: if (!singleLineActionOnly && takeOverMode === "action-only") takeOverMode = "whole";

  function recomputeSelection() {
    lineSelection =
      selAnchor !== null && focusLineIdx !== null
        ? { from: Math.min(selAnchor, focusLineIdx), to: Math.max(selAnchor, focusLineIdx) }
        : null;
  }

  /** Mouse: a plain click selects exactly the clicked line (anchor and
   * focus both land there); a Shift+click extends the existing anchor to
   * the clicked line, same as before this redesign. Also arms
   * `isDraggingLines`, so a click that turns into a drag (see
   * `dragOverLine`) grows the very same selection instead of starting a
   * fresh one. */
  function startLineSelection(abs: number, shiftKey: boolean) {
    if (shiftKey && selAnchor !== null) {
      focusLineIdx = abs;
    } else {
      selAnchor = abs;
      focusLineIdx = abs;
    }
    isDraggingLines = true;
    recomputeSelection();
  }

  /** Click-and-move-the-mouse multi-line selection: each line the pointer
   * enters while the button is still down becomes the new focus end,
   * exactly like dragging a text selection. */
  function dragOverLine(abs: number) {
    if (!isDraggingLines) return;
    focusLineIdx = abs;
    recomputeSelection();
  }

  /** Up/Down: move the line selection within the browsed occurrence.
   * Plain arrow moves a single-line selection; Shift+arrow grows or
   * shrinks the range from wherever the anchor already is (a real
   * anchor+focus model, not just "extend from the last click"). Clamped
   * at the occurrence's own first/last line — vertical movement doesn't
   * wrap the way occurrence switching does. */
  function moveLineCursor(delta: -1 | 1, extend: boolean) {
    if (!selectedOcc || selectedOcc.lines.length === 0) return;
    const first = selectedOcc.startLineIdx;
    const last = selectedOcc.startLineIdx + selectedOcc.lines.length - 1;
    const base = focusLineIdx ?? (delta > 0 ? first - 1 : last + 1);
    const next = Math.min(last, Math.max(first, base + delta));
    if (extend) {
      if (selAnchor === null) selAnchor = focusLineIdx ?? next;
    } else {
      selAnchor = next;
    }
    focusLineIdx = next;
    recomputeSelection();
    scrollLineIntoView(next);
  }

  /** Left/Right: cycle between occurrence dates, wrapping at either end —
   * the same wrap-around `Ctrl/Cmd+Tab` already uses for the main tab
   * strip this drawer's own strip is modeled on. */
  function moveOccurrence(delta: -1 | 1) {
    if (occurrences.length === 0) return;
    selectedIndex = wrapIndex(selectedIndex, occurrences.length, delta);
    scrollOccIntoView();
  }

  async function takeOver(dest: HistoryDestination) {
    if (!selectedOcc || !lineSelection) return;
    const sourceLines = selectedOcc.lines.slice(
      lineSelection.from - selectedOcc.startLineIdx,
      lineSelection.to - selectedOcc.startLineIdx + 1,
    );
    const insertLines = controller.historyTakeOverLines(sourceLines, takeOverMode);
    const destArg =
      dest.kind === "here"
        ? ({ kind: "here", tabId: dest.tabId } as const)
        : ({ kind: dest.kind, date: dest.date, headerText: dest.headerText } as const);
    await controller.carryHistorySelectionForward(
      selectedOcc.filename,
      lineSelection.from,
      lineSelection.to,
      $historyTargetHeader,
      destArg,
      insertLines,
    );
    selAnchor = null;
    focusLineIdx = null;
    lineSelection = null;
    await controller.refreshHistoryOccurrences();
  }

  let stripEl: HTMLDivElement;
  function scrollOccIntoView() {
    stripEl?.querySelector<HTMLElement>(`[data-occ-index="${selectedIndex}"]`)?.scrollIntoView({
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
  let stripOverflowing = false;
  let stripResizeObserver: ResizeObserver | null = null;
  const STRIP_SCROLL_STEP = 160;

  function updateStripOverflow() {
    if (stripEl) stripOverflowing = stripEl.scrollWidth > stripEl.clientWidth + 1;
  }

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
  type PinState = "visible" | "off-left" | "off-right";
  let todayPinState: PinState = "visible";
  let sourcePinState: PinState = "visible";

  function pinStateFor(index: number): PinState {
    if (index === -1 || !stripEl) return "visible";
    const el = stripEl.querySelector<HTMLElement>(`[data-occ-index="${index}"]`);
    if (!el) return "visible";
    const stripRect = stripEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.right <= stripRect.left) return "off-left";
    if (elRect.left >= stripRect.right) return "off-right";
    return "visible";
  }

  function updatePinStates() {
    todayPinState = pinStateFor(todayOccIndex);
    sourcePinState = pinStateFor(openedFromOccIndex);
  }

  function refreshStripChrome() {
    updateStripOverflow();
    updatePinStates();
  }

  $: refreshStripLayout(occurrences);
  async function refreshStripLayout(_occs: SectionOccurrence[]) {
    await waitForStripRendered();
    refreshStripChrome();
  }

  /** The (at most two) pinned tabs' duplicate slots outside the scrollable
   * strip, grouped by which side they render on. An occurrence that's
   * *both* today and the one History was opened from (opened from today)
   * gets a single merged entry, not two overlapping duplicates of the
   * same tab. */
  interface PinnedEntry {
    key: string;
    index: number;
    side: "left" | "right";
    classes: string;
  }
  $: pinnedEntries = computePinnedEntries(todayOccIndex, openedFromOccIndex, todayPinState, sourcePinState);
  function computePinnedEntries(
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

  /** A pinned slot's own click — select and actually scroll the real tab
   * into view (unlike a normal in-strip tab click, which doesn't need to:
   * it's already visible, or it wouldn't be clickable). */
  function selectAndReveal(index: number) {
    selectedIndex = index;
    bodyContainerEl?.focus();
    scrollOccIntoView();
  }

  // A pinned slot appearing *as a result of* the scroll a click just did
  // (e.g. wrapping to the far end can scroll the opened-from tab out of
  // view, pinning a duplicate of it and narrowing the strip a little)
  // lands scrollLeft close to, but not quite exactly at, the new edge —
  // the strip's own available width just changed out from under it. A
  // tolerance margin here (rather than requiring exact equality) means
  // that still reads as "at the edge" for the next click's own wrap
  // check, instead of silently falling back to a small nudge.
  const EDGE_TOLERANCE = 40;

  // Wrapping to the far-right end is a moving target: the `scrollTo` below
  // is issued against *today's* maxScroll, but if that scroll itself
  // scrolls the opened-from/today tab out of view, a pinned slot pops in
  // partway through the animation and narrows the strip — growing
  // maxScroll out from under the in-flight scroll, so it lands short of
  // the (now-further) true end. Corrected once the scroll settles, rather
  // than predicting the pinned slot up front, since that would require
  // resolving a circular "layout depends on scroll position which depends
  // on layout" dependency for what's a one-frame visual nudge either way.
  function scrollStripToEndCorrecting(el: HTMLDivElement) {
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

  let bodyEl: HTMLDivElement;
  function scrollLineIntoView(abs: number) {
    bodyEl?.querySelector<HTMLElement>(`[data-line-idx="${abs}"]`)?.scrollIntoView({ block: "nearest" });
  }

  $: scrollBodyToTop(selectedOcc);
  async function scrollBodyToTop(_occ: SectionOccurrence | undefined) {
    await tick();
    if (bodyEl) bodyEl.scrollTop = 0;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveLineCursor(1, e.shiftKey);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveLineCursor(-1, e.shiftKey);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveOccurrence(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveOccurrence(-1);
    } else if (e.key === "Enter" && e.shiftKey) {
      // The keyboard equivalent of clicking the primary take-over button
      // (chat feedback: "move to a line with the arrows, select multiple
      // lines if needed, press shortcut to insert into section on main
      // tab") — always the *first* of `usableDestinations`, which is
      // always the nearest one (the note History was opened from, or
      // "Today" when browsing from further in the past). A no-op with
      // nothing selected or no usable destination for this occurrence,
      // same as the button itself being absent then.
      e.preventDefault();
      if (lineSelection && usableDestinations[0]) {
        takeOver(usableDestinations[0]);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedOcc) {
        controller.jumpToHistoryLine(selectedOcc, lineSelection ? lineSelection.from : undefined);
      }
    } else if (e.key === "Escape") {
      controller.closeAllModals();
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div
    class="modal-card history-modal-card modal-xl"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label="Section history"
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="section-history" size={15} />
      <div class="modal-input">Section History: "{$historyTargetHeader}"</div>
      {#if $historyLoading}
        <span class="modal-counter"><span class="modal-spinner" aria-label="Loading">⟳</span> Loading…</span>
      {:else}
        <span class="modal-counter">{occurrences.length} {occurrences.length === 1 ? "date" : "dates"}</span>
      {/if}
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label="Close dialog"
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>

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
          aria-label="Scroll dates left"
          on:click={() => scrollOccStrip(-1)}
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
          title={heat ? `Double-click to jump to ${occ.date}` : `No content yet — double-click to jump to ${occ.date}`}
          on:click={() => selectAndReveal(p.index)}
          on:dblclick={() => controller.jumpToHistoryLine(occ)}
        >
          <span class="history-occ-date">{occ.date}</span>
          {#if heat}<span class="occ-dot has-{heat}" aria-hidden="true"></span>{/if}
        </button>
      {/each}
      <div
        class="history-occ-strip"
        role="tablist"
        aria-label="Occurrences"
        bind:this={stripEl}
        on:scroll={updatePinStates}
      >
        {#if $historyLoading}
          <span class="history-occ-loading"><span class="modal-spinner" aria-label="Loading">⟳</span> Loading history…</span>
        {:else if occurrences.length === 0}
          <span class="history-occ-loading">No prior occurrences found across open or closed notes.</span>
        {:else}
          {#each occurrences as occ, index (occ.filename)}
            {@const heat = controller.occurrenceHeat(occ)}
            <button
              type="button"
              class="history-occ-tab {index === selectedIndex ? 'active' : ''} {heat ? '' : 'empty'} {occDateClass(occ, $currentDateISO)}"
              role="tab"
              aria-selected={index === selectedIndex}
              data-occ-index={index}
              tabindex="-1"
              title={heat ? `Double-click to jump to ${occ.date}` : `No content yet — double-click to jump to ${occ.date}`}
              on:click={() => {
                selectedIndex = index;
                bodyContainerEl?.focus();
              }}
              on:dblclick={() => controller.jumpToHistoryLine(occ)}
            >
              <span class="history-occ-date">{occ.date}</span>
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
          title={heat ? `Double-click to jump to ${occ.date}` : `No content yet — double-click to jump to ${occ.date}`}
          on:click={() => selectAndReveal(p.index)}
          on:dblclick={() => controller.jumpToHistoryLine(occ)}
        >
          <span class="history-occ-date">{occ.date}</span>
          {#if heat}<span class="occ-dot has-{heat}" aria-hidden="true"></span>{/if}
        </button>
      {/each}
      {#if stripOverflowing}
        <button
          type="button"
          class="icon-btn history-occ-scroll-btn"
          aria-label="Scroll dates right"
          on:click={() => scrollOccStrip(1)}
        >
          <Icon name="chevron-right" size={14} />
        </button>
      {/if}
    </div>

    <div class="history-body" tabindex="-1" bind:this={bodyContainerEl}>
      <div class="history-detail">
        {#if selectedOcc}
          <div class="hp-context history-select-body" bind:this={bodyEl}>
            {#if selectedOcc.lines.length === 0}
              <div class="hp-line hp-muted">(nothing in this section yet)</div>
            {:else}
              {#each selectedOcc.lines as line, i}
                {@const abs = selectedOcc.startLineIdx + i}
                {@const inSel = !!lineSelection && abs >= lineSelection.from && abs <= lineSelection.to}
                <div
                  class="hp-line history-select-line {inSel ? 'history-line-selected' : ''}"
                  role="option"
                  aria-selected={inSel}
                  tabindex="-1"
                  data-line-idx={abs}
                  on:mousedown|preventDefault={(e) => startLineSelection(abs, e.shiftKey)}
                  on:mouseenter={() => dragOverLine(abs)}
                >
                  {#each parseGlyphLine(line) as part}<span class={part.cls ?? ""}>{part.text}</span>{/each}
                </div>
              {/each}
            {/if}
          </div>
          {#if lineSelection && usableDestinations.length > 0}
            <div class="history-takeover-bar">
              {#if singleLineActionOnly}
                <Segmented
                  options={[
                    { value: "whole", label: "Whole line" },
                    { value: "action-only", label: "Action only" },
                  ]}
                  value={takeOverMode}
                  onChange={(v) => (takeOverMode = v as "whole" | "action-only")}
                />
              {/if}
              {#each usableDestinations as dest}
                <button type="button" class="icon-btn btn-primary" on:click={() => takeOver(dest)}>{dest.label}</button>
              {/each}
              <span class="history-takeover-hint">
                Moves the selected line(s) to the end of that section — marked forwarded (») in this
                occurrence, not deleted.
              </span>
            </div>
          {:else if usableDestinations.length === 0}
            <div class="hp-note">There's nowhere else to carry this over to from this occurrence.</div>
          {/if}
        {:else}
          <div class="hp-empty">Select an occurrence to browse it.</div>
        {/if}
      </div>
    </div>

    <div class="modal-footer">
      <div>
        <kbd>↑/↓</kbd> Select line · <kbd>Shift+↑/↓</kbd> Extend · <kbd>←/→</kbd> Switch date ·
        <kbd>Enter</kbd> Jump to source · <kbd>Dbl-click</kbd> a date to jump there
        {#if lineSelection && usableDestinations[0]}
          · <kbd>Shift+Enter</kbd> {usableDestinations[0].label}
        {/if}
      </div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
