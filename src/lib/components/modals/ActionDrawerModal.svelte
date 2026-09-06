<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { actionSnapshot, activeTabId, tabs } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { innermostActionSymbol, stripLeadingToken } from "../../tokens";
  import type { ActionSnapshotItem } from "../../types";

  let filter = "";
  let selectedIndex = 0;
  let scope: "open" | "all" = "open";
  let showOnlyOpen = false;
  let inputEl: HTMLInputElement;

  // §42: open focused on whatever entry belongs to the currently active
  // tab, instead of always starting at the top of the (most-recent-first)
  // list. Falls back to 0 if the active tab has no entries here at all.
  onMount(() => {
    const active = $tabs.find((t) => t.id === $activeTabId);
    if (active) {
      const idx = flatList.findIndex((it) => it.filename === active.filename);
      if (idx !== -1) selectedIndex = idx;
    }
    inputEl?.focus();
    scrollSelectedIntoView();
  });

  async function setScope(next: "open" | "all") {
    if (scope === next) return;
    scope = next;
    actionSnapshot.set(
      scope === "all" ? await controller.buildActionSnapshotAllFiles() : controller.buildActionSnapshotOpenTabs(),
    );
    // Clicking the toggle button moves focus to the button — bring it
    // straight back to the filter input, with its current text selected,
    // so typing immediately starts a fresh filter instead of needing an
    // extra click back into the field first.
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  $: showDelegated = filter.includes("@");

  $: liveSnapshot = $actionSnapshot.map((item) => {
    const tab = $tabs.find((t) => t.id === item.tabId || t.filename === item.filename);
    const line = tab ? (tab.content.split("\n")[item.lineIdx] ?? item.line) : item.line;
    return { ...item, line, tabId: tab?.id ?? item.tabId };
  });

  $: filtered = liveSnapshot.filter((item) => {
    // §44: toggle between today's behavior (open/deferred/delegated) and
    // strictly open only — an open `# ` line, or an open `=> #`
    // consequence-action (§41); resolved states are never "open."
    if (showOnlyOpen && innermostActionSymbol(item.line) !== "#") return false;
    const isDelegated = item.line.includes("=> @");
    if (isDelegated && !showDelegated) return false;
    if (!filter) return true;
    return item.line.toLowerCase().includes(filter.toLowerCase());
  });

  // Carrying each item's position as data (assigned once, here) rather
  // than looking it up per rendered row via flatList.indexOf(item) in the
  // template — at large result counts that indexOf call made the render
  // itself O(N^2) in match count (confirmed during large-dataset stress
  // testing, §38).
  type IndexedItem = ActionSnapshotItem & { __flatIndex: number };

  interface Group {
    key: string;
    filename: string;
    items: IndexedItem[];
  }

  $: flatList = filtered.map((item, i): IndexedItem => ({ ...item, __flatIndex: i }));

  $: groups = ((): Group[] => {
    const map = new Map<string, Group>();
    for (const item of flatList) {
      const key = item.tabId ?? item.filename;
      if (!map.has(key)) map.set(key, { key, filename: item.filename, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values());
  })();
  $: uncompletedCount = flatList.filter((i) => {
    const sym = innermostActionSymbol(i.line);
    return sym !== "v" && sym !== "x";
  }).length;
  $: if (selectedIndex >= flatList.length) selectedIndex = Math.max(0, flatList.length - 1);

  // --- Virtualized rendering (§38) --- see SearchModal.svelte for the
  // full rationale; same approach, reused here since this list has the
  // identical group-header-then-items structure.
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
    for (const group of groups) {
      out.push({
        type: "header",
        key: `h-${group.key}`,
        filename: group.filename,
        count: group.items.length,
        top,
        height: HEADER_ROW_HEIGHT,
        isFirst,
      });
      top += HEADER_ROW_HEIGHT;
      isFirst = false;
      for (const item of group.items) {
        out.push({ type: "item", key: item.id, item, top, height: ITEM_ROW_HEIGHT });
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
  // Uses the *innermost* symbol (§41) — a `=> #`/`=> v`/etc. consequence-
  // action shows the same state glyph a plain action line would, since
  // that's the info this column exists to convey; the drawer's own icon
  // column doesn't also draw the arrow the editor shows for that form.
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
    // No action-state symbol at all — a plain delegated-to-a-person line.
    return { char: "➔", style: "color:var(--glyph-assignee-color); font-weight:600;" };
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
      if (it) controller.forwardActionToTodayItem(it);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.jumpToFileLine(it);
    } else if (e.ctrlKey && e.code === "Space") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.toggleActionLineItem(it);
    } else if (e.key === "Escape") {
      controller.closeAllModals();
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Action drawer">
    <div class="modal-input-wrap">
      <span>📋</span>
      <input
        class="modal-input"
        placeholder="Filter my actions (type @ to include delegated)..."
        bind:value={filter}
        bind:this={inputEl}
        on:keydown={onKeydown}
        autocomplete="off"
      />
      <span class="modal-counter">{uncompletedCount} open / {flatList.length} listed</span>
    </div>
    <div class="modal-input-wrap">
      <div class="settings-toggle-row">
        <button class="icon-btn {scope === 'open' ? 'active' : ''}" on:click={() => setScope("open")}
          >Open Tabs</button
        >
        <button class="icon-btn {scope === 'all' ? 'active' : ''}" on:click={() => setScope("all")}>All Files</button>
        <label class="toggle-switch">
          <input type="checkbox" bind:checked={showOnlyOpen} />
          <span class="toggle-switch-track"></span>
          Only Open
        </label>
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
              {row.filename} ({row.count})
            </div>
          {:else}
            {@const item = row.item}
            {@const idx = item.__flatIndex}
            {@const g = glyphFor(item.line)}
            {@const sym = innermostActionSymbol(item.line)}
            <div
              class="modal-item {idx === selectedIndex ? 'selected' : ''}"
              role="option"
              aria-selected={idx === selectedIndex}
              tabindex="0"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              on:click={() => controller.jumpToFileLine(item)}
              on:mouseenter={() => (selectedIndex = idx)}
              on:keydown={(e) => e.key === "Enter" && controller.jumpToFileLine(item)}
            >
              <div class="modal-item-main">
                <span style={g.style}>{g.char}</span>
                <span class={sym === "v" || sym === "x" ? "item-completed" : ""}>{stripLeadingToken(item.line)}</span>
              </div>
              {#if item.header}<span class="item-breadcrumb">· {item.header}</span>{/if}
              <div class="item-tag">Ln {item.lineIdx + 1}</div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
    <div class="modal-footer">
      <div>
        <kbd>Enter</kbd> Jump &nbsp;|&nbsp; <kbd>Shift+Enter</kbd> Forward to Today &nbsp;|&nbsp;
        <kbd>Ctrl+Space</kbd> Cycle
      </div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
