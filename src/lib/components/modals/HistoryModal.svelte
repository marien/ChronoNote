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

  // A take-over from an occurrence into itself is a no-op at best (and, if
  // it's the exact tab a "here" destination would write to, a real bug —
  // the write order would clobber whichever of the two happened last) —
  // simplest correct answer is to not offer it: there's nowhere meaningful
  // to carry a line from this note to when this note is where it would land.
  $: isOwnOccurrence = !!selectedOcc && selectedOcc.filename === openedFromFilename;

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

  onMount(async () => {
    // §42 precedent: focus the occurrence that belongs to wherever the
    // drawer was opened from, instead of always starting at whichever end
    // of the (chronological) strip happens to render first.
    // `openMeetingHistory()` may still be filling `historyOccurrences` in
    // when this mounts (§62) — wait one tick, which is enough for the
    // synchronous part of that to have run; if the disk read is still
    // genuinely in flight, this just falls back to index 0 once it
    // resolves, same as before §42 existed.
    await tick();
    const idx = occurrences.findIndex((o) => o.filename === openedFromFilename);
    if (idx !== -1) selectedIndex = idx;
    bodyContainerEl?.focus();
    scrollOccIntoView();
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
  });

  onDestroy(() => {
    window.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("keydown", onKeydown);
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
      // tab") — always the *first* destination `$historyDestinations`
      // offers, which is always the nearest one (the note History was
      // opened from, or "Today" when browsing from further in the past).
      // A no-op with nothing selected or on the drawer's own opened-from
      // occurrence, same as the button itself being absent then.
      e.preventDefault();
      if (lineSelection && !isOwnOccurrence && $historyDestinations[0]) {
        takeOver($historyDestinations[0]);
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
    <div class="history-occ-strip" role="tablist" aria-label="Occurrences" bind:this={stripEl}>
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
          {#if lineSelection && !isOwnOccurrence}
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
              {#each $historyDestinations as dest}
                <button type="button" class="icon-btn btn-primary" on:click={() => takeOver(dest)}>{dest.label}</button>
              {/each}
              <span class="history-takeover-hint">
                Moves the selected line(s) to the end of that section — marked forwarded (») in this
                occurrence, not deleted.
              </span>
            </div>
          {:else if isOwnOccurrence}
            <div class="hp-note">This is the note you opened History from — nothing to carry it over to.</div>
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
        {#if lineSelection && !isOwnOccurrence && $historyDestinations[0]}
          · <kbd>Shift+Enter</kbd> {$historyDestinations[0].label}
        {/if}
      </div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
