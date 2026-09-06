<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { searchResultsStore } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import type { SearchResultItem } from "../../types";

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
  $: if (selectedIndex >= flatList.length) selectedIndex = Math.max(0, flatList.length - 1);

  // --- Virtualized rendering (§38) ---
  // A common query at the large tier can match tens of thousands of
  // lines; rendering one real DOM node per match (as this used to do) was
  // the actual remaining cost after the scan itself was measured at a few
  // milliseconds — the scan was never the bottleneck. Only the rows
  // currently scrolled into view (plus a small overscan buffer) are ever
  // mounted; everything else is represented purely as numbers (a total
  // height + each row's offset), which is what makes the scrollbar's size
  // and position come out right without actually rendering the rest.
  // Heights are fixed/dictated (not measured) — both row kinds render a
  // single non-wrapping line, so their height is a known constant from
  // the CSS padding + font-size, not something that varies per row.
  const ITEM_ROW_HEIGHT = 36;
  const HEADER_ROW_HEIGHT = 29;
  const OVERSCAN_PX = 200;

  type Row =
    | { type: "header"; key: string; filename: string; count: number; top: number; height: number; isFirst: boolean }
    | { type: "item"; key: string; item: IndexedItem; top: number; height: number };

  $: rows = ((): Row[] => {
    const out: Row[] = [];
    let top = 0;
    let isFirst = true;
    for (const [key, group] of groups) {
      out.push({
        type: "header",
        key: `h-${key}`,
        filename: group.filename,
        count: group.items.length,
        top,
        height: HEADER_ROW_HEIGHT,
        isFirst,
      });
      top += HEADER_ROW_HEIGHT;
      isFirst = false;
      for (const item of group.items) {
        out.push({
          type: "item",
          key: item.tabFilename + ":" + item.lineIdx,
          item,
          top,
          height: ITEM_ROW_HEIGHT,
        });
        top += ITEM_ROW_HEIGHT;
      }
    }
    return out;
  })();
  $: totalHeight = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : 0;

  let listEl: HTMLDivElement;
  let scrollTop = 0;
  let viewportHeight = 380;

  /** First row whose bottom edge is past `y` — rows are laid out in
   * strictly increasing `top` order, so this is a binary search rather
   * than scanning every row on every scroll/resize tick. */
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

  /** Keyboard nav can move `selectedIndex` to a row outside the currently
   * rendered window — without this it would still change the *item*, but
   * there'd be nothing on screen to show it happened until the user
   * scrolled manually. Called only right after ArrowUp/ArrowDown change
   * `selectedIndex` (not reactively on every `scrollTop` change) — a
   * reactive version would fight a manual scroll that moves the selected
   * row out of view on purpose. */
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
      if (flatList.length) selectedIndex = (selectedIndex + 1) % flatList.length;
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatList.length) selectedIndex = (selectedIndex - 1 + flatList.length) % flatList.length;
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
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Cross-tab search">
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
