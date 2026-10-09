<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from "svelte";
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
  import EmptyState from "../EmptyState.svelte";
  import { t } from "../../i18n";
  import type { HistoryDestination, SectionOccurrence } from "../../types";
  import { clampIndex, wrapIndex } from "./virtualList";

  let selectedIndex = $state(0);

  // Anchor/focus line-selection model (2026-09-25 redesign, from chat
  // feedback on the browse-and-carry-forward redesign): `selAnchor` is the
  // line the selection started from, `focusLineIdx` is the end the
  // keyboard/mouse is currently moving — the same anchor+focus pair a text
  // editor uses, so Shift+Arrow can grow *or shrink* a range instead of
  // only ever extending from a fixed starting click the way a plain
  // Shift+click model does. `lineSelection` (the `{from, to}` actually
  // used for rendering/take-over) is always derived from the two, never
  // set directly.
  let selAnchor = $state<number | null>(null);
  let focusLineIdx = $state<number | null>(null);
  let lineSelection = $state<{ from: number; to: number } | null>(null);
  let isDraggingLines = false;
  // "agenda": copy the lines as they are with only the agenda topics reopened, leaving this note untouched.
  let takeOverMode: "whole" | "action-only" | "agenda" = $state("agenda");

  const occurrences = $derived($historyOccurrences);
  // Re-clamps the stored index when the list shrinks; writes only when the value actually changes.
  // `.pre` so the body below never renders from an out-of-range index.
  $effect.pre(() => {
    const clamped = clampIndex(selectedIndex, occurrences.length);
    if (clamped !== selectedIndex) selectedIndex = clamped;
  });
  const selectedOcc = $derived(occurrences[selectedIndex] as SectionOccurrence | undefined);
  const openedFromFilename = $derived($tabs.find((t) => t.id === $historyOpenedFromTabId)?.filename);

  // Chat feedback: "keep today's tab button and destination section tab
  // button always in view in the tab bar, even when moving to earlier or
  // later dates" — these two indices identify which occurrence (if any)
  // each one is. `-1` (no match) is a legitimate, common case — e.g. no
  // section exists today yet — and simply means nothing gets pinned.
  const todayOccIndex = $derived(occurrences.findIndex((o) => o.date === $currentDateISO));
  const openedFromOccIndex = $derived(occurrences.findIndex((o) => o.filename === openedFromFilename));

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
  const usableDestinations = $derived(
    selectedOcc ? $historyDestinations.filter((d) => destinationFilename(d) !== selectedOcc.filename) : [],
  );

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
  $effect.pre(() => {
    const filename = selectedOcc?.filename;
    if (filename !== lastSelectedFilename) {
      lastSelectedFilename = filename;
      selAnchor = null;
      focusLineIdx = null;
      lineSelection = null;
      takeOverMode = "agenda";
    }
  });

  const singleLineActionOnly = $derived(
    selectedOcc && lineSelection && lineSelection.from === lineSelection.to
      ? controller.historyActionOnlyText(selectedOcc.lines[lineSelection.from - selectedOcc.startLineIdx])
      : null,
  );
  $effect.pre(() => {
    if (!singleLineActionOnly && takeOverMode === "action-only") takeOverMode = "agenda";
  });
  const takeOverOptions = $derived([
    { value: "whole", label: $t("history.takeover.wholeLine") },
    ...(singleLineActionOnly ? [{ value: "action-only", label: $t("history.takeover.actionOnly") }] : []),
    { value: "agenda", label: $t("history.takeover.asAgenda"), title: $t("history.takeover.asAgendaTitle") },
  ]);

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
  let stripOverflowing = $state(false);
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
  let todayPinState: PinState = $state("visible");
  let sourcePinState: PinState = $state("visible");

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

  // Re-measures whenever the list changes; the helper awaits, so it runs untracked.
  $effect(() => {
    void occurrences;
    untrack(() => void refreshStripLayout());
  });
  async function refreshStripLayout() {
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
  const pinnedEntries = $derived(computePinnedEntries(todayOccIndex, openedFromOccIndex, todayPinState, sourcePinState));
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

  let bodyEl: HTMLDivElement | undefined = $state();
  function scrollLineIntoView(abs: number) {
    bodyEl?.querySelector<HTMLElement>(`[data-line-idx="${abs}"]`)?.scrollIntoView({ block: "nearest" });
  }

  // Back to the top whenever the browsed occurrence changes (after the DOM has updated).
  $effect(() => {
    void selectedOcc;
    untrack(() => void scrollBodyToTop());
  });
  async function scrollBodyToTop() {
    await tick();
    if (bodyEl) bodyEl.scrollTop = 0;
  }

  /** Ctrl/Cmd+A: select every line of the browsed occurrence (to copy a whole agenda at once). */
  function selectAllLines() {
    if (!selectedOcc || selectedOcc.lines.length === 0) return;
    selAnchor = selectedOcc.startLineIdx;
    focusLineIdx = selectedOcc.startLineIdx + selectedOcc.lines.length - 1;
    recomputeSelection();
  }

  /** Keys while the focus is on one of the take-over bar's controls (reached with Tab from the selected lines): the
   * buttons get their own keys (Enter / Space press them, Left / Right move between Whole line / As agenda), and
   * Shift+Tab from the first control goes back to the lines. Returns whether the key was handled here. */
  function onTakeOverBarKeydown(e: KeyboardEvent, bar: HTMLElement): boolean {
    const controls = [...bar.querySelectorAll<HTMLButtonElement>("button")];
    const target = e.target as HTMLElement;
    if (e.key === "Tab" && e.shiftKey && target === controls[0]) {
      e.preventDefault();
      e.stopPropagation(); // not the modal's focus trap: it would wrap to the last control
      bodyContainerEl?.focus();
      return true;
    }
    if (e.key === "Enter" || e.key === " ") return true; // the browser presses the focused button
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && target.classList.contains("segmented-option")) {
      e.preventDefault();
      const options = [...bar.querySelectorAll<HTMLButtonElement>(".segmented-option")];
      const next = options[options.indexOf(target as HTMLButtonElement) + (e.key === "ArrowLeft" ? -1 : 1)];
      next?.focus();
      next?.click();
      return true;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      return true;
    }
    return false;
  }

  function onKeydown(e: KeyboardEvent) {
    const bar = (e.target as HTMLElement | null)?.closest?.(".history-takeover-bar") as HTMLElement | null;
    if (bar && onTakeOverBarKeydown(e, bar)) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAllLines();
    } else if (e.key === "ArrowDown") {
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
    aria-label={$t("history.modal.ariaLabel")}
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="section-history" size={15} />
      <div class="modal-input">{$t("history.modal.titlePrefix", { header: $historyTargetHeader })}</div>
      {#if $historyLoading}
        <span class="modal-counter"><span class="modal-spinner" aria-label={$t("common.loading")}>⟳</span> {$t("history.modal.loadingCounter")}</span>
      {:else}
        <span class="modal-counter">{$t("history.modal.dateCount", { count: occurrences.length })}</span>
      {/if}
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        onclick={controller.closeAllModals}
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
          <span class="history-occ-date">{occ.date}</span>
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
              tabindex="-1"
              title={heat ? $t("history.occ.title.hasContent", { date: occ.date }) : $t("history.occ.title.empty", { date: occ.date })}
              onclick={() => {
                selectedIndex = index;
                bodyContainerEl?.focus();
              }}
              ondblclick={() => controller.jumpToHistoryLine(occ)}
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
          title={heat ? $t("history.occ.title.hasContent", { date: occ.date }) : $t("history.occ.title.empty", { date: occ.date })}
          onclick={() => selectAndReveal(p.index)}
          ondblclick={() => controller.jumpToHistoryLine(occ)}
        >
          <span class="history-occ-date">{occ.date}</span>
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

    <div class="history-body" tabindex="-1" bind:this={bodyContainerEl}>
      <div class="history-detail">
        {#if selectedOcc}
          <div class="hp-context history-select-body" bind:this={bodyEl}>
            {#if selectedOcc.lines.length === 0}
              <div class="hp-line hp-muted">{$t("history.body.emptySection")}</div>
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
                  onmousedown={(e) => {
                    e.preventDefault();
                    startLineSelection(abs, e.shiftKey);
                  }}
                  onmouseenter={() => dragOverLine(abs)}
                >
                  {#each parseGlyphLine(line) as part}<span class={part.cls ?? ""}>{part.text}</span>{/each}
                </div>
              {/each}
            {/if}
          </div>
          {#if lineSelection && usableDestinations.length > 0}
            <div class="history-takeover-bar">
              <Segmented
                options={takeOverOptions}
                value={takeOverMode}
                onChange={(v) => (takeOverMode = v as "whole" | "action-only" | "agenda")}
              />
              {#each usableDestinations as dest}
                <button type="button" class="icon-btn btn-primary" onclick={() => takeOver(dest)}>{dest.label}</button>
              {/each}
              <span class="history-takeover-hint">
                {takeOverMode === "agenda" ? $t("history.takeover.agendaHint") : $t("history.takeover.hint")}
              </span>
            </div>
          {:else if usableDestinations.length === 0}
            <div class="hp-note">{$t("history.takeover.none")}</div>
          {/if}
        {:else if occurrences.length === 0 && !$historyLoading}
          <EmptyState
            icon="section-history"
            title={$t("history.strip.emptyTitle")}
            subtitle={$t("history.strip.empty")}
          />
        {:else}
          <div class="hp-empty">{$t("history.body.selectPrompt")}</div>
        {/if}
      </div>
    </div>

    <div class="modal-footer">
      <div>
        <kbd>↑/↓</kbd> {$t("history.footer.selectLine")} · <kbd>Shift+↑/↓</kbd> {$t("history.footer.extend")} ·
        <kbd>←/→</kbd> {$t("history.footer.switchDate")} ·
        <kbd>Enter</kbd> {$t("history.footer.jumpToSource")} · <kbd>Dbl-click</kbd> {$t("history.footer.dblClickHint")}
        {#if lineSelection && usableDestinations[0]}
          · <kbd>Shift+Enter</kbd> {usableDestinations[0].label}
        {/if}
      </div>
      <div><kbd>Esc</kbd> {$t("common.close")}</div>
    </div>
  </div>
</div>

<style>
/* §154 bug: nothing capped the modal's overall height, so a long "From"
 * occurrence (`.hp-context`, itself already scrollable) just grew the
 * whole card past the viewport instead of scrolling internally — its
 * `flex: 1 1 auto` sizing only kicks in once an ancestor actually has a
 * bounded height to divide up. Capping the card here gives `.history-body`
 * (now `flex: 1`) a real budget, which `.hp-context` shares via its own
 * `overflow-y: auto`.
 *
 * 2026-09-25 follow-up: a `max-height` let the card shrink to fit a short
 * occurrence and grow for a long one, which meant the whole modal visibly
 * resized every time Left/Right switched to a differently-sized date —
 * chat feedback asked for a constant ~80% of the window instead. A plain
 * `height` (not `max-height`) fixes it at that size regardless of content;
 * a short occurrence just leaves empty space in `.hp-context` rather than
 * shrinking the card down to meet it. */

.history-modal-card {
  height: 80vh;
}

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
  opacity: 0.55;
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

/* The occurrence's full glyph-rendered body — the drawer's primary
 * content, since browsing it in context is the whole point of this
 * design (both the 2026-09-24 and 2026-09-25 redesigns). */

.history-detail {
  flex: 1;
  min-height: 0;
  background: var(--surface-canvas);
  padding: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hp-context {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
  background: var(--surface-raised);
  border-radius: var(--radius-control);
  padding: 7px 9px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.hp-line {
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.5em;
}

.hp-line.hp-muted {
  color: var(--muted);
  font-style: italic;
}

/* Each line of the occurrence body is its own selectable row — a click
 * (or Shift+click to extend a range) picks what "take it over" carries
 * forward. Quiet by default, same treatment as any other selectable list
 * row in the app, so the body still reads primarily as text, not a form. */

.history-select-line {
  cursor: pointer;
  border-radius: var(--radius-control);
  margin: 0 -4px;
  padding: 0 4px;
}

.history-select-line:hover {
  background: var(--surface-hover, rgba(128, 128, 128, 0.1));
}

.history-select-line.history-line-selected {
  color: var(--text);
  font-weight: 600;
  background: rgba(128, 128, 128, 0.2);
}

.hp-note {
  font-size: var(--type-caption);
  color: var(--muted);
  flex-shrink: 0;
}

.hp-empty {
  color: var(--muted);
  font-size: 12px;
  margin: auto;
  text-align: center;
}

/* The destination button(s) for a live line selection — computed once
 * when the drawer opened (`historyDestinations`), never more than two. */

.history-takeover-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* Chat feedback: the destination button(s) alone didn't say what taking a
 * line over actually does — a short, always-present explanation next to
 * them instead of relying on the button label alone to carry it. */

.history-takeover-hint {
  font-size: var(--type-caption);
  color: var(--muted);
  flex-basis: 100%;
}

/* 2026-09-25 redesign (chat feedback on the browse-and-carry-forward
 * redesign): the occurrence list is now a compact horizontal strip above
 * the note body, not a vertical sidebar beside it — a recurring section's
 * handful of recent dates were the ones actually browsed, and a tall list
 * of one-row-per-date entries mostly just sat there empty next to a much
 * busier note pane. `.history-body` is a single column now (no more
 * side-by-side `.history-main` + `.history-detail`), so it's just the
 * remaining vertical space below the strip. */

.history-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  outline: none;
}
</style>
