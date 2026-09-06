<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { activeTabId, historyItems, historyTargetHeader, tabs } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { innermostActionSymbol, stripLeadingToken } from "../../tokens";
  import type { HistoryItem } from "../../types";

  let selectedIndex = 0;
  let titleEl: HTMLInputElement;

  // §42: open focused on whatever entry belongs to the currently active
  // tab, instead of always starting at the top of the (most-recent-first)
  // list. Falls back to 0 if the active tab has no entries here at all.
  onMount(() => {
    const active = $tabs.find((t) => t.id === $activeTabId);
    if (active) {
      const idx = flatList.findIndex((it) => it.filename === active.filename);
      if (idx !== -1) selectedIndex = idx;
    }
    titleEl?.focus();
    scrollSelectedIntoView();
  });

  // Carrying each item's position as data (assigned once, here) rather
  // than looking it up per rendered row via flatList.indexOf(item) in the
  // template — at large result counts that indexOf call made the render
  // itself O(N^2) in match count (the same bug found and fixed in
  // SearchModal.svelte/ActionDrawerModal.svelte during §38 stress
  // testing; missed here initially since History wasn't the surface that
  // originally triggered that investigation).
  type IndexedItem = HistoryItem & { __flatIndex: number };
  $: flatList = $historyItems.map((it, i): IndexedItem => ({ ...it, __flatIndex: i }));
  $: groups = ((): [string, IndexedItem[]][] => {
    const map = new Map<string, IndexedItem[]>();
    for (const it of flatList) {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date)!.push(it);
    }
    return Array.from(map.entries());
  })();
  $: if (selectedIndex >= flatList.length) selectedIndex = Math.max(0, flatList.length - 1);

  // --- Virtualized rendering (§38) --- see SearchModal.svelte for the
  // full rationale; same approach as Search/Action Drawer, reused here
  // since this list has the identical group-header-then-items structure.
  const ITEM_ROW_HEIGHT = 36;
  const HEADER_ROW_HEIGHT = 29;
  const OVERSCAN_PX = 200;

  type Row =
    | { type: "header"; key: string; date: string; count: number; top: number; height: number; isFirst: boolean }
    | { type: "item"; key: string; item: IndexedItem; top: number; height: number };

  $: rows = ((): Row[] => {
    const out: Row[] = [];
    let top = 0;
    let isFirst = true;
    for (const [date, items] of groups) {
      out.push({ type: "header", key: `h-${date}`, date, count: items.length, top, height: HEADER_ROW_HEIGHT, isFirst });
      top += HEADER_ROW_HEIGHT;
      isFirst = false;
      for (const it of items) {
        out.push({ type: "item", key: it.filename + ":" + it.lineIdx, item: it, top, height: ITEM_ROW_HEIGHT });
        top += ITEM_ROW_HEIGHT;
      }
    }
    return out;
  })();
  $: totalHeight = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : 0;

  let listEl: HTMLDivElement;
  let scrollTop = 0;
  let viewportHeight = 380;

  function rowAt(rowList: Row[], y: number): number {
    let lo = 0;
    let hi = rowList.length - 1;
    let result = rowList.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rowList[mid].top + rowList[mid].height <= y) {
        lo = mid + 1;
      } else {
        result = mid;
        hi = mid - 1;
      }
    }
    return result;
  }

  $: windowStart = rowAt(rows, Math.max(0, scrollTop - OVERSCAN_PX));
  $: windowEnd = rowAt(rows, scrollTop + viewportHeight + OVERSCAN_PX);
  $: visibleRows = rows.slice(windowStart, windowEnd);

  function onScroll() {
    if (listEl) scrollTop = listEl.scrollTop;
  }

  function scrollSelectedIntoView() {
    if (!listEl) return;
    const row = rows.find((r) => r.type === "item" && r.item.__flatIndex === selectedIndex);
    if (!row) return;
    if (row.top < listEl.scrollTop) {
      listEl.scrollTop = row.top;
    } else if (row.top + row.height > listEl.scrollTop + viewportHeight) {
      listEl.scrollTop = row.top + row.height - viewportHeight;
    }
    scrollTop = listEl.scrollTop;
  }

  // References the same CSS custom properties the main editor's .glyph-*
  // classes use, so this list follows the color/grayscale toggle for free.
  // Uses the *innermost* symbol (§41) for a `=> <symbol>` consequence-
  // action, same as the Action Drawer — falls through to the plain
  // follow-up arrow only when there's no action-state symbol at all.
  function glyphFor(line: string) {
    const sym = innermostActionSymbol(line);
    if (sym === "v")
      return {
        char: "☑",
        style: "color:var(--glyph-done-color); font-weight:var(--glyph-done-weight); opacity:var(--glyph-done-opacity);",
      };
    if (sym === ">")
      return { char: "»", style: "color:var(--glyph-progress-color); font-weight:var(--glyph-progress-weight);" };
    if (sym === "x")
      return {
        char: "☒",
        style:
          "color:var(--glyph-cancelled-color); font-weight:var(--glyph-cancelled-weight); opacity:var(--glyph-cancelled-opacity);",
      };
    if (sym === "#") return { char: "☐", style: "color:var(--glyph-open-color); font-weight:var(--glyph-open-weight);" };
    return { char: "➔", style: "color:var(--glyph-followup-color); font-weight:var(--glyph-followup-weight);" };
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatList.length) selectedIndex = (selectedIndex + 1) % flatList.length;
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatList.length) selectedIndex = (selectedIndex - 1 + flatList.length) % flatList.length;
      scrollSelectedIntoView();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.importHistoricalItem(it.line);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.jumpToHistoryItem(it);
    } else if (e.key === "Escape") {
      controller.closeAllModals();
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Section history">
    <div class="modal-input-wrap">
      <span>🕒</span>
      <input
        class="modal-input"
        style="font-weight:bold; cursor: default;"
        readonly
        value={`Section History: "${$historyTargetHeader}"`}
        bind:this={titleEl}
        on:keydown={onKeydown}
      />
      <span class="modal-counter">{flatList.length} entries</span>
    </div>
    <div
      class="modal-list"
      role="listbox"
      bind:this={listEl}
      bind:clientHeight={viewportHeight}
      on:scroll={onScroll}
      style="position: relative; overflow-y: auto;"
    >
      {#if flatList.length === 0}
        <div style="padding: 16px; opacity: 0.6;">No prior occurrences found across open or closed notes.</div>
      {/if}
      <div style="position: relative; height: {totalHeight}px;">
        {#each visibleRows as row (row.key)}
          {#if row.type === "header"}
            <div
              class="modal-group-header"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px; border-top: {row.isFirst
                ? 'none'
                : '1px solid var(--border)'};"
            >
              📅 {row.date} ({row.count})
            </div>
          {:else}
            {@const it = row.item}
            {@const idx = it.__flatIndex}
            {@const g = glyphFor(it.line)}
            <div
              class="modal-item {idx === selectedIndex ? 'selected' : ''}"
              role="option"
              aria-selected={idx === selectedIndex}
              tabindex="0"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              on:click={() => controller.jumpToHistoryItem(it)}
              on:mouseenter={() => (selectedIndex = idx)}
              on:keydown={(e) => e.key === "Enter" && controller.jumpToHistoryItem(it)}
            >
              <div class="modal-item-main">
                <span style={g.style}>{g.char}</span>
                <span>{stripLeadingToken(it.line)}</span>
              </div>
              <div class="item-tag">Ln {it.lineIdx + 1}</div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
    <div class="modal-footer">
      <div><kbd>Enter</kbd> Jump to source file &nbsp;|&nbsp; <kbd>Shift+Enter</kbd> Import action into note</div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
