<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { historyDestinations, historyLoading, historyOccurrences, historyOpenedFromTabId, historyTargetHeader, tabs } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { parseGlyphLine } from "../../editor/glyphLine";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import type { HistoryDestination, SectionOccurrence } from "../../types";
  import {
    MODAL_ITEM_ROW_HEIGHT,
    clampIndex,
    scrollToShow,
    stackHeight,
    visibleWindow,
    withTops,
    wrapIndex,
    type PlacedRow,
  } from "./virtualList";

  let selectedIndex = 0;
  let mobileTab: "list" | "preview" = "list";

  // A contiguous line-range selection within the browsed occurrence, for
  // "take it over" (§4 of the design doc) — absolute file line indices
  // (`occ.startLineIdx`-relative), so they line up directly with
  // `carryHistorySelectionForward`'s own `fromLine`/`toLine`. `selAnchor`
  // is the line the selection started from, kept separate from the
  // resulting range so a second Shift+click extends from where the
  // selection *began*, not from wherever it currently ends.
  let selAnchor: number | null = null;
  let lineSelection: { from: number; to: number } | null = null;
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

  onMount(async () => {
    // §42 precedent: focus the occurrence that belongs to wherever the
    // drawer was opened from, instead of always starting at the top of
    // the (most-recent-first) list. `openMeetingHistory()` may still be
    // filling `historyOccurrences` in when this mounts (§62) — wait one
    // tick, which is enough for the synchronous part of that to have run;
    // if the disk read is still genuinely in flight, this just falls back
    // to the top of the list once it resolves, same as before §42 existed.
    await tick();
    const idx = occurrences.findIndex((o) => o.filename === openedFromFilename);
    if (idx !== -1) selectedIndex = idx;
    listEl?.focus();
    scrollSelectedIntoView();
  });

  // Reset the line selection whenever the browsed occurrence changes —
  // it's meaningless carried over to a different occurrence's lines.
  let lastSelectedFilename: string | undefined;
  $: if (selectedOcc?.filename !== lastSelectedFilename) {
    lastSelectedFilename = selectedOcc?.filename;
    selAnchor = null;
    lineSelection = null;
    takeOverMode = "whole";
  }

  $: singleLineActionOnly =
    selectedOcc && lineSelection && lineSelection.from === lineSelection.to
      ? controller.historyActionOnlyText(selectedOcc.lines[lineSelection.from - selectedOcc.startLineIdx])
      : null;
  $: if (!singleLineActionOnly && takeOverMode === "action-only") takeOverMode = "whole";

  function clickLine(abs: number, shiftKey: boolean) {
    if (shiftKey && selAnchor !== null) {
      lineSelection = { from: Math.min(selAnchor, abs), to: Math.max(selAnchor, abs) };
    } else {
      selAnchor = abs;
      lineSelection = { from: abs, to: abs };
    }
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
    lineSelection = null;
    await controller.refreshHistoryOccurrences();
  }

  // --- Virtualized rendering (§38) — the left list is now one row per
  // occurrence (no more per-action sub-rows), so the shared row model from
  // `./virtualList` is simpler here than Action Drawer/Search's own use of
  // it, but kept for consistency in case a long-running daily section ever
  // makes the occurrence count itself worth virtualizing.
  type RawRow = { key: string; occ: SectionOccurrence; index: number; height: number };
  type Row = RawRow & PlacedRow;
  $: rows = withTops<RawRow>(
    occurrences.map((occ, index) => ({ key: occ.filename, occ, index, height: MODAL_ITEM_ROW_HEIGHT })),
  ) as Row[];
  $: totalHeight = stackHeight(rows);

  let listEl: HTMLDivElement;
  let scrollTop = 0;
  let viewportHeight = 380;

  $: ({ start: windowStart, end: windowEnd } = visibleWindow(rows, scrollTop, viewportHeight));
  $: visibleRows = rows.slice(windowStart, windowEnd);

  function onScroll() {
    if (listEl) scrollTop = listEl.scrollTop;
  }

  function scrollSelectedIntoView() {
    if (!listEl) return;
    const row = rows.find((r) => r.index === selectedIndex);
    if (!row) return;
    const next = scrollToShow(row, listEl.scrollTop, viewportHeight);
    if (next !== null) listEl.scrollTop = next;
    scrollTop = listEl.scrollTop;
  }

  let bodyEl: HTMLDivElement;
  $: scrollBodyToTop(selectedOcc);
  async function scrollBodyToTop(_occ: SectionOccurrence | undefined) {
    await tick();
    if (bodyEl) bodyEl.scrollTop = 0;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, occurrences.length, 1);
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, occurrences.length, -1);
      scrollSelectedIntoView();
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

    <!-- §194: Mobile tab switcher for viewports <= 680px -->
    <div class="history-mobile-tabs">
      <button type="button" class="history-tab-btn" class:active={mobileTab === "list"} on:click={() => (mobileTab = "list")}>
        Occurrences ({occurrences.length})
      </button>
      <button type="button" class="history-tab-btn" class:active={mobileTab === "preview"} on:click={() => (mobileTab = "preview")}>
        Preview
      </button>
    </div>

    <div class="history-body" class:show-list={mobileTab === "list"} class:show-preview={mobileTab === "preview"}>
      <div class="history-main">
        <div
          class="modal-list"
          role="listbox"
          tabindex="0"
          bind:this={listEl}
          bind:clientHeight={viewportHeight}
          on:scroll={onScroll}
          on:keydown={onKeydown}
          style="position: relative; overflow-y: auto; flex: 1; outline: none;"
        >
          {#if $historyLoading}
            <div class="modal-empty"><span class="modal-spinner" aria-label="Loading">⟳</span> Loading history…</div>
          {:else if occurrences.length === 0}
            <div class="modal-empty">No prior occurrences found across open or closed notes.</div>
          {/if}
          <div style="position: relative; height: {totalHeight}px;">
            {#each visibleRows as row (row.key)}
              <div
                class="modal-group-header selectable {row.index === selectedIndex ? 'selected' : ''}"
                role="option"
                aria-selected={row.index === selectedIndex}
                tabindex="0"
                style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
                on:click={() => {
                  selectedIndex = row.index;
                  mobileTab = "preview";
                }}
                on:mouseenter={() => (selectedIndex = row.index)}
                on:keydown={(e) => e.key === "Enter" && controller.jumpToHistoryLine(row.occ)}
              >
                <span>{row.occ.date}</span>
                {#if row.occ.lines.filter((l) => l.trim() !== "").length === 0}
                  <span class="history-occ-empty">no content yet</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="history-detail">
        {#if selectedOcc}
          <div class="history-detail-head">
            <span class="hp-label">{selectedOcc.filename}</span>
            <button class="po-jump" on:click={() => controller.jumpToHistoryLine(selectedOcc, lineSelection?.from)}>Open file</button>
          </div>
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
                  tabindex="0"
                  on:click={(e) => clickLine(abs, e.shiftKey)}
                  on:keydown={(e) => e.key === "Enter" && clickLine(abs, e.shiftKey)}
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
      <div><kbd>Enter</kbd> Jump to source file · Click a line, or Shift+click to extend, then pick a destination</div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
