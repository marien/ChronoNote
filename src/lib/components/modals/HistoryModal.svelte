<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { allNotesCache, activeTabId, editorApi, historyItems, historyTargetHeader, tabs } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { innermostActionSymbol, stripLeadingToken } from "../../tokens";
  import type { HistoryItem } from "../../types";
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
  $: selectedIndex = clampIndex(selectedIndex, flatList.length);

  // --- Virtualized rendering (§38) --- the group-header-then-items list
  // structure and its window math are shared with Search / Action Drawer
  // via `./virtualList`; this component owns the row *model* (what each
  // row is) and the scroll DOM refs.
  type RawRow =
    | { type: "header"; key: string; date: string; count: number; height: number; isFirst: boolean }
    | { type: "item"; key: string; item: IndexedItem; height: number };
  type Row = RawRow & PlacedRow;

  $: rows = withTops<RawRow>(
    ((): RawRow[] => {
      const out: RawRow[] = [];
      let isFirst = true;
      for (const [date, items] of groups) {
        out.push({
          type: "header",
          key: `h-${date}`,
          date,
          count: items.length,
          height: MODAL_HEADER_ROW_HEIGHT,
          isFirst,
        });
        isFirst = false;
        for (const it of items) {
          out.push({ type: "item", key: it.filename + ":" + it.lineIdx, item: it, height: MODAL_ITEM_ROW_HEIGHT });
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
    const row = rows.find((r) => r.type === "item" && r.item.__flatIndex === selectedIndex);
    if (!row) return;
    const next = scrollToShow(row, listEl.scrollTop, viewportHeight);
    if (next !== null) listEl.scrollTop = next;
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

  // §109: the right-hand preview for whatever entry is selected — the
  // source context it comes from, exactly what Shift+Enter will insert,
  // and where it lands in the active note.
  $: selectedItem = flatList[selectedIndex] as IndexedItem | undefined;
  $: activeTab = $tabs.find((t) => t.id === $activeTabId);
  $: insertText = selectedItem ? controller.historyInsertText(selectedItem.line) : "";
  $: insertRewritten = !!selectedItem && insertText !== selectedItem.line;
  $: preview = (() => {
    if (!selectedItem) return null;
    const src = $allNotesCache[selectedItem.filename];
    if (src === undefined) return { context: [] as { n: number; text: string; hit: boolean }[] };
    const lines = src.split("\n");
    const from = Math.max(0, selectedItem.lineIdx - 2);
    const to = Math.min(lines.length, selectedItem.lineIdx + 3);
    return {
      context: lines.slice(from, to).map((text, i) => ({
        n: from + i + 1,
        text,
        hit: from + i === selectedItem.lineIdx,
      })),
    };
  })();
  $: cursorLineNo = (editorApi?.getCursorLineIdx() ?? 0) + 1;

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, flatList.length, 1);
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, flatList.length, -1);
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
  <div
    class="modal-card"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label="Section history"
    style="width: 880px;"
  >
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
    <div class="history-body">
    <div
      class="modal-list"
      role="listbox"
      bind:this={listEl}
      bind:clientHeight={viewportHeight}
      on:scroll={onScroll}
      style="position: relative; overflow-y: auto; flex: 1;"
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

    <aside class="history-preview" aria-label="Preview">
      {#if selectedItem && preview}
        <div class="hp-section">
          <div class="hp-label">From {selectedItem.filename}</div>
          <pre class="hp-context">{#each preview.context as l}<span class:hp-hit={l.hit}>{String(l.n).padStart(3)}  {l.text || " "}
</span>{/each}</pre>
        </div>
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
      {:else}
        <div class="hp-empty">Select an entry to preview it.</div>
      {/if}
    </aside>
    </div>

    <div class="modal-footer">
      <div><kbd>Enter</kbd> Jump to source file &nbsp;|&nbsp; <kbd>Shift+Enter</kbd> Import action into note</div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
