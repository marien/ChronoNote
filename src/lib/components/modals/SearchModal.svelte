<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import { searchResultsStore } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { renderResultLine } from "../../ui/resultRow";
  import { groupHeaderLabel } from "../../ui/listFormat";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import EmptyState from "../EmptyState.svelte";
  import type { SearchResultItem } from "../../types";
  import { parseSearchQuery, removeChipFromQuery, type SearchFilterChip } from "../../search";
  import { t } from "../../i18n";
  import {
    MODAL_HEADER_ROW_HEIGHT,
    SEARCH_ITEM_ROW_HEIGHT,
    clampIndex,
    scrollToShow,
    stackHeight,
    visibleWindow,
    withTops,
    wrapIndex,
    type PlacedRow,
  } from "./virtualList";
  import { isMobile } from "../../stores";
  import { formatCombo, shortcutById } from "../../shortcuts";

  const allKeysShortcut = formatCombo(shortcutById("openShortcutsHelp").combos[0]);

  let query = $state("");
  let selectedIndex = $state(0);
  let scope: "open" | "all" = $state("open");
  let inputEl: HTMLInputElement;
  let searching = $state(false);

  const parsed = $derived(parseSearchQuery(query));
  const chips = $derived(parsed.chips);
  const queryTerm = $derived(parsed.term);

  function removeChip(chip: SearchFilterChip) {
    query = removeChipFromQuery(query, chip);
    inputEl?.focus();
  }

  onMount(() => inputEl?.focus());

  async function setScope(next: "open" | "all") {
    if (scope === next) return;
    if (next === "all") {
      // #62: shares the same one-time-per-session disk-read cost as
      // Section History/Action Drawer's "All Files" — usually already
      // warm (`boot.ts`'s background prefetch), but reuse the existing
      // "searching" spinner for whenever it genuinely isn't.
      searching = true;
      await controller.refreshAllNotesCache();
      searching = false;
    }
    scope = next; // triggers the search effect below
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
  // The effect's cleanup clears the pending timer, both before each re-run
  // and on destroy. It reads only `query` and `scope`; the timer and the
  // rAF callback run outside tracking.
  $effect(() => {
    const q = query;
    const sc = scope;
    let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    if (sc === "all" && q.trim()) {
      searching = true;
      searchDebounceTimer = setTimeout(() => {
        // One extra frame so the "searching" indicator actually paints
        // before the (synchronous, potentially not-instant) scan blocks
        // the thread — otherwise setting `searching = true` and running
        // the scan in the same tick means the spinner never gets drawn.
        requestAnimationFrame(() => {
          controller.runSearch(q, sc);
          searching = false;
        });
      }, 200);
    } else {
      searching = false;
      controller.runSearch(q, sc);
    }
    return () => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    };
  });
  // Carrying each item's position as data (assigned once, here) rather
  // than looking it up per rendered row via flatList.indexOf(item) in the
  // template — at large result counts that indexOf call made the render
  // itself O(N^2) in match count (confirmed during large-dataset stress
  // testing, §38).
  type IndexedItem = SearchResultItem & { __flatIndex: number };
  const flatList = $derived($searchResultsStore.map((it, i): IndexedItem => ({ ...it, __flatIndex: i })));
  const groups = $derived.by((): [string, { filename: string; items: IndexedItem[] }][] => {
    const map = new Map<string, { filename: string; items: IndexedItem[] }>();
    for (const it of flatList) {
      const key = it.tabId ?? it.tabFilename;
      if (!map.has(key)) map.set(key, { filename: it.tabFilename, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.entries());
  });
  // Re-clamps the stored index (a shrunk list keeps it clamped persistently,
  // as before); writes only when the value actually changes.
  $effect.pre(() => {
    const clamped = clampIndex(selectedIndex, flatList.length);
    if (clamped !== selectedIndex) selectedIndex = clamped;
  });

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

  const rows = $derived(
    withTops<RawRow>(
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
            height: SEARCH_ITEM_ROW_HEIGHT,
          });
        }
      }
      return out;
    })(),
    ) as Row[],
  );
  const totalHeight = $derived(stackHeight(rows));

  let listEl: HTMLDivElement;
  let scrollTop = $state(0);
  let viewportHeight = $state(380);

  const visibleRows = $derived.by(() => {
    const { start, end } = visibleWindow(rows, scrollTop, viewportHeight);
    return rows.slice(start, end);
  });

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
  <div class="modal-card modal-lg" role="dialog" aria-modal="true" use:focusTrap use:sheetSwipe aria-label={$t("shortcuts.crossTabSearch.label")}>
    <div class="modal-input-wrap">
      <Icon name="search" size={15} />
      <input
        class="modal-input"
        placeholder={$t("searchModal.placeholder")}
        bind:value={query}
        bind:this={inputEl}
        onkeydown={onKeydown}
        autocomplete="off"
      />
      {#if searching}
        <span class="modal-spinner" aria-label={$t("searchModal.searchingAriaLabel")}>⟳</span>
      {:else}
        <span class="modal-counter">{$t("searchModal.matchCount", { count: flatList.length })}</span>
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
    {#if chips.length > 0}
      <div class="search-chips-row">
        {#each chips as chip, idx (chip.id ?? idx)}
          <span class="search-chip">
            <span class="chip-label">{chip.label}</span>
            <button
              type="button"
              class="chip-remove-btn"
              aria-label={$t("searchModal.removeFilterAriaLabel", { label: chip.label })}
              onclick={() => removeChip(chip)}
            >
              ✕
            </button>
          </span>
        {/each}
      </div>
    {/if}
    <div class="modal-input-wrap">
      <div class="settings-toggle-row">
        <Segmented
          options={[
            { value: "open", label: $t("actionDrawer.scope.openTabs.label") },
            { value: "all", label: $t("actionDrawer.scope.allFiles.label") },
          ]}
          value={scope}
          onChange={(v) => setScope(v as "open" | "all")}
        />
      </div>
    </div>
    <div
      class="modal-list"
      role="listbox"
      aria-label={$t("shortcuts.crossTabSearch.label")}
      bind:this={listEl}
      bind:clientHeight={viewportHeight}
      onscroll={onScroll}
      style="position: relative; overflow-y: auto;"
    >
      {#if flatList.length === 0 && query.trim() && !searching}
        <EmptyState
          icon="search"
          title={$t("searchModal.noMatches", { query })}
          subtitle={$t("searchModal.emptySubtitle")}
        />
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
            <div
              class="modal-item search-result-item {idx === selectedIndex ? 'selected' : ''}"
              role="option"
              aria-selected={idx === selectedIndex}
              tabindex="0"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              onclick={() => controller.jumpToFileLine({ tabId: item.tabId, filename: item.tabFilename, lineIdx: item.lineIdx })}
              onmouseenter={() => (selectedIndex = idx)}
              onkeydown={(e) =>
                e.key === "Enter" &&
                controller.jumpToFileLine({ tabId: item.tabId, filename: item.tabFilename, lineIdx: item.lineIdx })}
            >
              <div class="modal-item-main search-item-main">
                <div class="search-context-block">
                  {#if item.contextBefore !== undefined}
                    <div class="search-context-line dimmed">
                      {#if !item.contextBefore}
                        {"\u00A0"}
                      {:else}
                        {#each renderResultLine(item.contextBefore, queryTerm) as part}
                          {#if part.hit}<mark class={part.cls ?? ""} style="background:var(--highlight); color:inherit;"
                              >{part.text}</mark
                            >{:else}<span class={part.cls ?? ""}>{part.text}</span>{/if}
                        {/each}
                      {/if}
                    </div>
                  {/if}
                  <div class="search-match-line">
                    {#if !item.line}
                      {"\u00A0"}
                    {:else}
                      {#each renderResultLine(item.line, queryTerm) as part}
                        {#if part.hit}<mark class={part.cls ?? ""} style="background:var(--highlight); color:inherit;"
                            >{part.text}</mark
                          >{:else}<span class={part.cls ?? ""}>{part.text}</span>{/if}
                      {/each}
                    {/if}
                  </div>
                  {#if item.contextAfter !== undefined}
                    <div class="search-context-line dimmed">
                      {#if !item.contextAfter}
                        {"\u00A0"}
                      {:else}
                        {#each renderResultLine(item.contextAfter, queryTerm) as part}
                          {#if part.hit}<mark class={part.cls ?? ""} style="background:var(--highlight); color:inherit;"
                              >{part.text}</mark
                            >{:else}<span class={part.cls ?? ""}>{part.text}</span>{/if}
                        {/each}
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
              <div class="item-tag">{$t("actionDrawer.item.lineTag", { line: item.lineIdx + 1 })}</div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
    {#if !$isMobile}
      <div class="modal-footer">
        <div class="modal-footer-hints">
          <kbd>Enter</kbd> {$t("searchModal.footer.open")} · <kbd>↑/↓</kbd> {$t("searchModal.footer.select")}
        </div>
        <div class="modal-footer-all-keys">
          <kbd>{allKeysShortcut}</kbd> {$t("common.allKeys")}
        </div>
      </div>
    {/if}
  </div>
</div>
