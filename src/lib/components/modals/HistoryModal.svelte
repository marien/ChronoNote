<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import {
    activeTabId,
    editorApi,
    historyLoading,
    historyOccurrences,
    historyPreviousOccurrence,
    historyShowOnlyOpen,
    historyTargetHeader,
    tabs,
  } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { parseGlyphLine } from "../../editor/glyphLine";
  import { groupHeaderLabel } from "../../ui/listFormat";
  import Icon from "../../icons/Icon.svelte";
  import type { HistoryItem, SectionOccurrence } from "../../types";
  import {
    MODAL_HEADER_ROW_HEIGHT,
    MODAL_ITEM_ROW_HEIGHT,
    clampIndex,
    scrollToShow,
    stackHeight,
    visibleWindow,
    withTops,
    wrapIndex,
    type PlacedRow,
  } from "./virtualList";

  // §150: a "no actions here" placeholder row is shorter than a real item
  // row — just enough for one dimmed line, not a full action-row height.
  const EMPTY_ROW_HEIGHT = 24;

  let selectedIndex = 0;

  // #33: the "Previous occurrence" pane shows the first few lines by
  // default with a toggle for the rest, so a long section doesn't crowd
  // out the aggregate list below.
  const PREV_CAP = 5;
  let prevExpanded = false;

  // §150: one row per occurrence (a dated note that has the section at
  // all) *and* one row per action within it — a header is now just as
  // selectable as an action row, so browsing dates and reviewing specific
  // actions share the same up/down navigation. "Only Open" (unobtrusive
  // toggle, §150) filters both: an occurrence with zero remaining open
  // actions drops out of the list entirely rather than showing empty.
  $: filteredOccurrences = $historyOccurrences
    .map((occ) =>
      $historyShowOnlyOpen ? { ...occ, items: occ.items.filter((i) => controller.isOpenHistoryAction(i.action)) } : occ,
    )
    .filter((occ) => !$historyShowOnlyOpen || occ.items.length > 0);

  $: totalActionCount = filteredOccurrences.reduce((n, occ) => n + occ.items.length, 0);

  interface SelRow {
    occ: SectionOccurrence;
    item?: HistoryItem;
  }

  // The flat, keyboard-navigable selection order: a header stop for every
  // occurrence, then one stop per action inside it.
  $: selectableRows = ((): SelRow[] => {
    const out: SelRow[] = [];
    for (const occ of filteredOccurrences) {
      out.push({ occ });
      for (const item of occ.items) out.push({ occ, item });
    }
    return out;
  })();
  $: selectedIndex = clampIndex(selectedIndex, selectableRows.length);

  // §42: open focused on whatever entry belongs to the currently active
  // tab, instead of always starting at the top of the (most-recent-first)
  // list — prefers a specific action row from that tab's occurrence, and
  // falls back to the occurrence's own header when it has none (e.g.
  // today's note already has the section but nothing in it yet).
  //
  // §127: focus lands on the list itself (a real `role="listbox"`, so
  // it's a valid keyboard-nav target on its own) rather than on the title
  // bar — the title used to be a `readonly` <input> purely so it could
  // hold focus for arrow-key capture; now it's a plain heading (finding
  // F) and the listbox is the more natural place for that anyway.
  onMount(() => {
    const active = $tabs.find((t) => t.id === $activeTabId);
    if (active) {
      let idx = selectableRows.findIndex((s) => s.item && s.occ.filename === active.filename);
      if (idx === -1) idx = selectableRows.findIndex((s) => !s.item && s.occ.filename === active.filename);
      if (idx !== -1) selectedIndex = idx;
    }
    listEl?.focus();
    scrollSelectedIntoView();
  });

  // --- Virtualized rendering (§38) --- the row model this component owns
  // is richer than Search / Action Drawer's (a header can itself be
  // selected, and an actionless occurrence gets a placeholder row instead
  // of items); the window math is still the shared `./virtualList`.
  type RawRow =
    | { type: "header"; key: string; occ: SectionOccurrence; selIndex: number; height: number; isFirst: boolean }
    | { type: "item"; key: string; occ: SectionOccurrence; item: HistoryItem; selIndex: number; height: number }
    | { type: "empty"; key: string; height: number };
  type Row = RawRow & PlacedRow;

  $: rows = withTops<RawRow>(
    ((): RawRow[] => {
      const out: RawRow[] = [];
      let isFirst = true;
      let selIdx = 0;
      for (const occ of filteredOccurrences) {
        out.push({ type: "header", key: `h-${occ.filename}`, occ, selIndex: selIdx, height: MODAL_HEADER_ROW_HEIGHT, isFirst });
        selIdx++;
        isFirst = false;
        if (occ.items.length === 0) {
          out.push({ type: "empty", key: `e-${occ.filename}`, height: EMPTY_ROW_HEIGHT });
        } else {
          for (const item of occ.items) {
            out.push({
              type: "item",
              key: `i-${occ.filename}-${item.lineIdx}-${item.action}`,
              occ,
              item,
              selIndex: selIdx,
              height: MODAL_ITEM_ROW_HEIGHT,
            });
            selIdx++;
          }
        }
      }
      return out;
    })(),
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
    const row = rows.find((r) => (r.type === "header" || r.type === "item") && r.selIndex === selectedIndex);
    if (!row) return;
    const next = scrollToShow(row, listEl.scrollTop, viewportHeight);
    if (next !== null) listEl.scrollTop = next;
    scrollTop = listEl.scrollTop;
  }

  // §109/§150: the right-hand "From" preview for whatever's selected —
  // header or item both resolve to an occurrence, so the block always has
  // something to show; only an item selection also has a specific line to
  // focus and an action to offer for import.
  $: selected = selectableRows[selectedIndex] as SelRow | undefined;
  $: fromOcc = selected?.occ;
  $: fromItem = selected?.item;
  $: activeTab = $tabs.find((t) => t.id === $activeTabId);
  $: insertText = fromItem ? controller.historyInsertText(fromItem.action) : "";
  $: insertRewritten = !!fromItem && insertText !== fromItem.action;
  $: cursorLineNo = (editorApi?.getCursorLineIdx() ?? 0) + 1;

  // §150: the From block shows the *entire* occurrence body (glyph-
  // rendered, scrollable) rather than a fixed ±2-line window, so it keeps
  // its own focus-then-scroll step — jump straight to the selected
  // action's line when there is one, back to the top for a header-only
  // selection. `tick()` first since the lines for a newly selected
  // occurrence haven't painted yet when this reactive block runs.
  let fromBodyEl: HTMLDivElement;
  $: scrollFromBodyToHit(fromOcc, fromItem);
  async function scrollFromBodyToHit(occ: SectionOccurrence | undefined, item: HistoryItem | undefined) {
    await tick();
    if (!fromBodyEl) return;
    if (!item) {
      fromBodyEl.scrollTop = 0;
      return;
    }
    const el = fromBodyEl.querySelector(`[data-line-idx="${item.lineIdx}"]`);
    el?.scrollIntoView({ block: "center" });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, selectableRows.length, 1);
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, selectableRows.length, -1);
      scrollSelectedIntoView();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      const sel = selectableRows[selectedIndex];
      if (sel?.item) controller.importHistoricalItem(sel.item.action);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = selectableRows[selectedIndex];
      if (sel?.item) controller.jumpToHistoryItem(sel.item);
      else if (sel) controller.jumpToHistoryOccurrence(sel.occ);
    } else if (e.key === "Escape") {
      controller.closeAllModals();
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div
    class="modal-card history-modal-card"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label="Section history"
    style="width: 880px;"
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="section-history" size={15} />
      <!-- §127 (finding F): a plain heading, not a `readonly` <input>
           faking one — the listbox below is the keyboard-nav target now. -->
      <div class="modal-input">Section History: "{$historyTargetHeader}"</div>
      {#if $historyLoading}
        <span class="modal-counter"><span class="modal-spinner" aria-label="Loading">⟳</span> Loading…</span>
      {:else}
        <span class="modal-counter"
          >{totalActionCount} {totalActionCount === 1 ? "action" : "actions"} · {filteredOccurrences.length}
          {filteredOccurrences.length === 1 ? "date" : "dates"}</span
        >
      {/if}
    </div>
    {#if $historyPreviousOccurrence}
      {@const po = $historyPreviousOccurrence}
      {@const shown = prevExpanded ? po.lines : po.lines.slice(0, PREV_CAP)}
      <!-- §150: full modal width — this is the headline "what did we
           cover last time" snapshot, not part of either column below. -->
      <section class="history-prev" aria-label="Previous occurrence">
        <div class="po-head">
          <span class="po-title">Previous occurrence · {po.date}</span>
          <button class="po-jump" on:click={() => controller.jumpToPreviousOccurrence()}>Open file</button>
        </div>
        <div class="po-body">
          {#each shown as line}
            <div class="po-line">{#each parseGlyphLine(line) as part}<span class={part.cls ?? ""}>{part.text}</span>{/each}</div>
          {/each}
        </div>
        {#if po.lines.length > PREV_CAP}
          <button class="po-more" on:click={() => (prevExpanded = !prevExpanded)}>
            {prevExpanded ? "Show fewer" : `Show all ${po.lines.length} lines`}
          </button>
        {/if}
      </section>
    {/if}
    <div class="history-body">
      <div class="history-main">
        <div class="history-list-toolbar">
          <!-- §150: attached directly to the list it filters (not up in
               the drawer's title row) — a single small switch, off by
               default (this drawer is for browsing everything, unlike
               the Action Drawer's worklist). -->
          <label class="toggle-switch">
            <input type="checkbox" bind:checked={$historyShowOnlyOpen} />
            <span class="toggle-switch-track"></span>
            Only Open
          </label>
        </div>
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
          {:else if filteredOccurrences.length === 0}
            <div class="modal-empty">
              {$historyShowOnlyOpen
                ? "No open actions in any occurrence."
                : "No prior occurrences found across open or closed notes."}
            </div>
          {/if}
          <div style="position: relative; height: {totalHeight}px;">
            {#each visibleRows as row (row.key)}
              {#if row.type === "header"}
                <div
                  class="modal-group-header selectable {row.selIndex === selectedIndex ? 'selected' : ''}"
                  role="option"
                  aria-selected={row.selIndex === selectedIndex}
                  tabindex="0"
                  style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px; border-top: {row.isFirst
                    ? 'none'
                    : '1px solid var(--border)'};"
                  on:click={() => (selectedIndex = row.selIndex)}
                  on:mouseenter={() => (selectedIndex = row.selIndex)}
                  on:keydown={(e) => e.key === "Enter" && controller.jumpToHistoryOccurrence(row.occ)}
                >
                  {groupHeaderLabel(row.occ.date, row.occ.items.length)}
                </div>
              {:else if row.type === "item"}
                {@const it = row.item}
                <div
                  class="modal-item {row.selIndex === selectedIndex ? 'selected' : ''}"
                  role="option"
                  aria-selected={row.selIndex === selectedIndex}
                  tabindex="0"
                  style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
                  on:click={() => controller.jumpToHistoryItem(it)}
                  on:mouseenter={() => (selectedIndex = row.selIndex)}
                  on:keydown={(e) => e.key === "Enter" && controller.jumpToHistoryItem(it)}
                >
                  <div class="modal-item-main history-item-line">
                    {#each parseGlyphLine(it.action) as part}<span class={part.cls ?? ""}>{part.text}</span>{/each}
                  </div>
                  <div class="item-tag">Ln {it.lineIdx + 1}</div>
                </div>
              {:else}
                <div
                  class="modal-empty-inline"
                  style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
                >
                  No actions in this section
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>

      <aside class="history-preview" aria-label="Preview">
        {#if fromOcc}
          <div class="hp-section hp-section-grow">
            <div class="hp-label">From {fromOcc.filename}</div>
            <div class="hp-context" bind:this={fromBodyEl}>
              {#if fromOcc.lines.length === 0}
                <div class="hp-line hp-muted">(nothing in this section yet)</div>
              {:else}
                {#each fromOcc.lines as line, i}
                  {@const lineIdx = fromOcc.startLineIdx + i}
                  <div class="hp-line" class:hp-hit={fromItem?.lineIdx === lineIdx} data-line-idx={lineIdx}>
                    {#each parseGlyphLine(line) as part}<span class={part.cls ?? ""}>{part.text}</span>{/each}
                  </div>
                {/each}
              {/if}
            </div>
          </div>
          {#if fromItem}
            <div class="hp-section">
              <div class="hp-label">Shift+Enter inserts</div>
              <pre class="hp-insert">{insertText}</pre>
              {#if insertRewritten}
                <div class="hp-note">Deferred <kbd>&gt;</kbd> becomes a fresh open <kbd>#</kbd> in this note.</div>
              {/if}
            </div>
            <div class="hp-section">
              <div class="hp-label">Target</div>
              <div class="hp-target">
                → at your cursor in <strong>{activeTab?.filename ?? "the active note"}</strong> (line {cursorLineNo})
              </div>
            </div>
          {/if}
        {:else}
          <div class="hp-empty">Select an entry to preview it.</div>
        {/if}
      </aside>
    </div>

    <div class="modal-footer">
      <div><kbd>Enter</kbd> Jump to source file · <kbd>Shift+Enter</kbd> Import action into note</div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
