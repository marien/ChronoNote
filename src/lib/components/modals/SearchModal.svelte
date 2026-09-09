<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { searchResultsStore } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import type { SearchResultItem } from "../../types";
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

  let query = "";
  let selectedIndex = 0;
  let scope: "open" | "all" = "open";
  let inputEl: HTMLInputElement;
  let searching = false;

  onMount(() => inputEl?.focus());

  async function setScope(next: "open" | "all") {
    if (scope === next) return;
    if (next === "all") await controller.refreshAllNotesCache();
    scope = next; // triggers the reactive search below
    // Clicking the toggle button moves focus to the button — bring it
    // straight back to the input, with the current query selected, so
    // typing immediately starts a fresh search instead of needing an
    // extra click back into the field first.
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  // "All Files" scans every line of every cached file — re-running that on
  // every keystroke (which a plain `$: controller.runSearch(...)` would do)
  // is what caused the multi-second near-freeze found during large-dataset
  // stress testing (§38): typing a few characters fired a full rescan of
  // tens of thousands of lines several times in a row. Debouncing "all"
  // fixes that; "open tabs" stays instant since its cost is already small
  // (bounded by how many tabs are open, not total notes). An empty query
  // always runs immediately too — there's nothing to scan, and waiting
  // out the debounce just to clear the list would feel laggy.
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });
  $: {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (scope === "all" && query.trim()) {
      searching = true;
      searchDebounceTimer = setTimeout(() => {
        // One extra frame so the "searching" indicator actually paints
        // before the (synchronous, potentially not-instant) scan blocks
        // the thread — otherwise setting `searching = true` and running
        // the scan in the same tick means the spinner never gets drawn.
        requestAnimationFrame(() => {
          controller.runSearch(query, scope);
          searching = false;
        });
      }, 200);
    } else {
      searching = false;
      controller.runSearch(query, scope);
    }
  }
  // Carrying each item's position as data (assigned once, here) rather
  // than looking it up per rendered row via flatList.indexOf(item) in the
  // template — at large result counts that indexOf call made the render
  // itself O(N^2) in match count (confirmed during large-dataset stress
  // testing, §38).
  type IndexedItem = SearchResultItem & { __flatIndex: number };
  $: flatList = $searchResultsStore.map((it, i): IndexedItem => ({ ...it, __flatIndex: i }));
  $: groups = ((): [string, { filename: string; items: IndexedItem[] }][] => {
    const map = new Map<string, { filename: string; items: IndexedItem[] }>();
    for (const it of flatList) {
      const key = it.tabId ?? it.tabFilename;
      if (!map.has(key)) map.set(key, { filename: it.tabFilename, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.entries());
  })();
  $: selectedIndex = clampIndex(selectedIndex, flatList.length);

  // --- Virtualized rendering (§38) --- a common query at the large tier
  // can match tens of thousands of lines; only the rows scrolled into
  // view (plus overscan) are ever mounted, everything past the fold is
  // just a total height + per-row offset. The window math is shared with
  // History / Action Drawer via `./virtualList`; this component owns the
  // row model and the DOM refs.
  type RawRow =
    | { type: "header"; key: string; filename: string; count: number; height: number; isFirst: boolean }
    | { type: "item"; key: string; item: IndexedItem; height: number };
  type Row = RawRow & PlacedRow;

  $: rows = withTops<RawRow>(
    ((): RawRow[] => {
      const out: RawRow[] = [];
      let isFirst = true;
      for (const [key, group] of groups) {
        out.push({
          type: "header",
          key: `h-${key}`,
          filename: group.filename,
          count: group.items.length,
          height: MODAL_HEADER_ROW_HEIGHT,
          isFirst,
        });
        isFirst = false;
        for (const item of group.items) {
          out.push({
            type: "item",
            key: item.tabFilename + ":" + item.lineIdx,
            item,
            height: MODAL_ITEM_ROW_HEIGHT,
          });
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

  /** Keeps the selected row on screen when keyboard nav moves it outside
   * the rendered window. Called right after ArrowUp/ArrowDown (not
   * reactively on every scroll) so it can't fight a deliberate manual
   * scroll that pushes the selected row out of view. */
  function scrollSelectedIntoView() {
    if (!listEl) return;
    const row = rows.find((r) => r.type === "item" && r.item.__flatIndex === selectedIndex);
    if (!row) return;
    const next = scrollToShow(row, listEl.scrollTop, viewportHeight);
    if (next !== null) listEl.scrollTop = next;
    scrollTop = listEl.scrollTop;
  }

  function highlightParts(line: string, q: string): { text: string; hit: boolean }[] {
    if (!q) return [{ text: line, hit: false }];
    const idx = line.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return [{ text: line, hit: false }];
    return [
      { text: line.slice(0, idx), hit: false },
      { text: line.slice(idx, idx + q.length), hit: true },
      { text: line.slice(idx + q.length), hit: false },
    ];
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, flatList.length, 1);
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, flatList.length, -1);
      scrollSelectedIntoView();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.jumpToFileLine({ tabId: it.tabId, filename: it.tabFilename, lineIdx: it.lineIdx });
    } else if (e.key === "Escape") {
      controller.closeAllModals();
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Cross-tab search">
    <div class="modal-input-wrap">
      <span>🔎</span>
      <input
        class="modal-input"
        placeholder="Search..."
        bind:value={query}
        bind:this={inputEl}
        on:keydown={onKeydown}
        autocomplete="off"
      />
      {#if searching}
        <span class="modal-spinner" aria-label="Searching">⟳</span>
      {:else}
        <span class="modal-counter">{flatList.length} match(es)</span>
      {/if}
    </div>
    <div class="modal-input-wrap">
      <div class="settings-toggle-row">
        <button class="icon-btn {scope === 'open' ? 'active' : ''}" on:click={() => setScope("open")}
          >Open Tabs</button
        >
        <button class="icon-btn {scope === 'all' ? 'active' : ''}" on:click={() => setScope("all")}>All Files</button>
      </div>
    </div>
    <div
      class="modal-list"
      role="listbox"
      bind:this={listEl}
      bind:clientHeight={viewportHeight}
      on:scroll={onScroll}
      style="position: relative; overflow-y: auto;"
    >
      <div style="position: relative; height: {totalHeight}px;">
        {#each visibleRows as row (row.key)}
          {#if row.type === "header"}
            <div
              class="modal-group-header"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px; border-top: {row.isFirst
                ? 'none'
                : '1px solid var(--border)'};"
            >
              {row.filename} ({row.count} matches)
            </div>
          {:else}
            {@const item = row.item}
            {@const idx = item.__flatIndex}
            <div
              class="modal-item {idx === selectedIndex ? 'selected' : ''}"
              role="option"
              aria-selected={idx === selectedIndex}
              tabindex="0"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              on:click={() => controller.jumpToFileLine({ tabId: item.tabId, filename: item.tabFilename, lineIdx: item.lineIdx })}
              on:mouseenter={() => (selectedIndex = idx)}
              on:keydown={(e) =>
                e.key === "Enter" &&
                controller.jumpToFileLine({ tabId: item.tabId, filename: item.tabFilename, lineIdx: item.lineIdx })}
            >
              <div class="modal-item-main">
                <span>
                  {#each highlightParts(item.line, query) as part}
                    {#if part.hit}<mark style="background:var(--highlight); color:inherit;">{part.text}</mark
                      >{:else}{part.text}{/if}
                  {/each}
                </span>
              </div>
              <div class="item-tag">Ln {item.lineIdx + 1}</div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
    <div class="modal-footer">
      <div><kbd>Enter</kbd> Jump to match</div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
