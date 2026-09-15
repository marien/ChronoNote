<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { actionDrawerShowOnlyOpen, actionSnapshot, activeTabId, tabs } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { innermostActionSymbol, stripLeadingToken } from "../../tokens";
  import { glyphForSymbol } from "../../editor/glyphLine";
  import { groupHeaderLabel } from "../../ui/listFormat";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import type { ActionSnapshotItem } from "../../types";
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

  let filter = "";
  let selectedIndex = 0;
  let scope: "open" | "all" = "open";
  let inputEl: HTMLInputElement;
  // #62: "All Files" shares the same one-time-per-session disk-read cost
  // as Section History's drawer — usually already warm (`boot.ts` kicks
  // it off in the background at startup), but switching to it can still
  // genuinely take a moment on a large notes folder, with nothing to show
  // that anything's happening otherwise (the toggle just sits there).
  let loadingAllFiles = false;

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
    if (scope === "all") loadingAllFiles = true;
    actionSnapshot.set(
      scope === "all" ? await controller.buildActionSnapshotAllFiles() : controller.buildActionSnapshotOpenTabs(),
    );
    loadingAllFiles = false;
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
    if ($actionDrawerShowOnlyOpen && innermostActionSymbol(item.line) !== "#") return false;
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
  $: selectedIndex = clampIndex(selectedIndex, flatList.length);

  // --- Virtualized rendering (§38) --- group-header-then-items list; the
  // window math is shared with Search / History via `./virtualList`. This
  // component owns the row model and the DOM refs.
  type RawRow =
    | { type: "header"; key: string; filename: string; count: number; height: number; isFirst: boolean }
    | { type: "item"; key: string; item: IndexedItem; height: number };
  type Row = RawRow & PlacedRow;

  $: rows = withTops<RawRow>(
    ((): RawRow[] => {
      const out: RawRow[] = [];
      let isFirst = true;
      for (const group of groups) {
        out.push({
          type: "header",
          key: `h-${group.key}`,
          filename: group.filename,
          count: group.items.length,
          height: MODAL_HEADER_ROW_HEIGHT,
          isFirst,
        });
        isFirst = false;
        for (const item of group.items) {
          out.push({ type: "item", key: item.id, item, height: MODAL_ITEM_ROW_HEIGHT });
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

  // §127 (finding B): shares `glyphForSymbol` with `glyphLine.ts` (the
  // Section History / read-only-viewer glyph map) instead of its own
  // private `--glyph-*` inline-style lookup, so the two agree through one
  // map. Uses the *innermost* symbol (§41) — a `=> #`/`=> v`/etc.
  // consequence-action shows the same state glyph a plain action line
  // would, since that's the info this column exists to convey; the
  // drawer's own icon column doesn't also draw the arrow the editor shows
  // for that form.
  function glyphFor(line: string): { char: string; cls?: string } {
    const sym = innermostActionSymbol(line);
    if (sym) {
      const g = glyphForSymbol(sym);
      return { char: g.text, cls: g.cls };
    }
    // No action-state symbol at all — a plain delegated-to-a-person line.
    // Not one of `glyphForSymbol`'s cases, and deliberately not styled as
    // a `.glyph-assignee` pill (that class's background/padding is meant
    // for a *name*, not a bare arrow) — kept as its own small inline style.
    return { char: "➔" };
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
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.forwardActionToTodayItem(it);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.jumpToFileLine(it);
    } else if (e.ctrlKey && e.shiftKey && e.code === "Space") {
      // §145: the reverse of the plain Ctrl+Space cycle below — checked
      // first since it would otherwise also match that broader condition.
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.toggleActionLineItem(it, -1);
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
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Actions">
    <div class="modal-input-wrap">
      <Icon name="actions" size={15} />
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
        <Segmented
          options={[
            { value: "open", label: "Open Tabs" },
            { value: "all", label: "All Files" },
          ]}
          value={scope}
          onChange={(v) => setScope(v as "open" | "all")}
        />
        {#if loadingAllFiles}
          <span class="modal-spinner" aria-label="Loading">⟳</span>
        {/if}
        <label class="toggle-switch">
          <input type="checkbox" bind:checked={$actionDrawerShowOnlyOpen} />
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
      {#if flatList.length === 0}
        <div class="modal-empty">
          {filter ? `No actions match “${filter}”.` : "Nothing here — every action is resolved."}
        </div>
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
              {groupHeaderLabel(row.filename, row.count)}
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
                <span class={g.cls ?? ""}>{g.char}</span>
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
        <kbd>Enter</kbd> Jump · <kbd>Shift+Enter</kbd> Forward to Today ·
        <kbd>Ctrl+Space</kbd> Cycle · <kbd>Ctrl+Shift+Space</kbd> Cycle back
      </div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
