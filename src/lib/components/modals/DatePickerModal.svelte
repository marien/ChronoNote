<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { allNotesCache, datePickerOpenOnly } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { parseDateQuery } from "../../date";
  import { countActions } from "../../tokens";
  import {
    MODAL_ITEM_ROW_HEIGHT,
    clampIndex,
    scrollToShow,
    stackHeight,
    uniformRows,
    visibleWindow,
    wrapIndex,
  } from "./virtualList";

  interface Candidate {
    date: string;
    label: string;
    exists: boolean;
    openCount: number;
    // §43: the typed-date "direct match" is a pinned "jump here" result,
    // not a browsed one — it always shows regardless of the open-only
    // toggle below.
    isDirectMatch: boolean;
  }

  let query = "";
  let selectedIndex = 0;
  let inputEl: HTMLInputElement;

  onMount(async () => {
    await controller.refreshAllNotesCache();
    inputEl?.focus();
  });

  function buildCandidates(q: string, cache: Record<string, string>): Candidate[] {
    const parsed = parseDateQuery(q);
    const list: Candidate[] = [];
    if (parsed) {
      const content = cache[`${parsed}.txt`];
      list.push({
        date: parsed,
        label: `Direct match: ${parsed}`,
        exists: content !== undefined,
        openCount: countActions(content ?? "").open,
        isDirectMatch: true,
      });
    }
    controller.sortFilenamesByRecency(Object.keys(cache)).forEach((fn) => {
      const d = fn.replace(/\.txt$/, "");
      if (!list.some((c) => c.date === d) && (!q || d.includes(q))) {
        list.push({ date: d, label: d, exists: true, openCount: countActions(cache[fn]).open, isDirectMatch: false });
      }
    });
    return list;
  }

  $: allCandidates = buildCandidates(query, $allNotesCache);
  $: candidates = allCandidates.filter((c) => c.isDirectMatch || !$datePickerOpenOnly || c.openCount > 0);
  $: selectedIndex = clampIndex(selectedIndex, candidates.length);

  // --- Virtualized rendering (§38) --- the window math is shared with
  // Search / History / Action Drawer via `./virtualList`. Simpler here:
  // no group headers, so every row is `MODAL_ITEM_ROW_HEIGHT` tall
  // (`uniformRows`).
  let listEl: HTMLDivElement;
  let scrollTop = 0;
  let viewportHeight = 380;

  $: rows = uniformRows(candidates.length, MODAL_ITEM_ROW_HEIGHT);
  $: totalHeight = stackHeight(rows);
  $: ({ start: windowStart, end: windowEnd } = visibleWindow(rows, scrollTop, viewportHeight));
  $: visibleCandidates = candidates.slice(windowStart, windowEnd).map((c, i) => ({ ...c, idx: windowStart + i }));

  function onScroll() {
    if (listEl) scrollTop = listEl.scrollTop;
  }

  function scrollSelectedIntoView() {
    if (!listEl || !rows[selectedIndex]) return;
    const next = scrollToShow(rows[selectedIndex], listEl.scrollTop, viewportHeight);
    if (next !== null) listEl.scrollTop = next;
    scrollTop = listEl.scrollTop;
  }

  function commit(idx: number) {
    const c = candidates[idx];
    if (c) controller.commitDatePick(c.date);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, candidates.length, 1);
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, candidates.length, -1);
      scrollSelectedIntoView();
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(selectedIndex);
    } else if (e.key === "Escape") {
      controller.closeAllModals();
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Jump to date">
    <div class="modal-input-wrap">
      <span>📅</span>
      <input
        class="modal-input"
        placeholder="Jump to date (e.g. 2026-09-05, today, yesterday, -2)..."
        bind:value={query}
        bind:this={inputEl}
        on:keydown={onKeydown}
        autocomplete="off"
      />
    </div>
    <div class="modal-input-wrap">
      <div class="settings-toggle-row">
        <label class="toggle-switch">
          <input type="checkbox" bind:checked={$datePickerOpenOnly} />
          <span class="toggle-switch-track"></span>
          Open Only
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
        {#each visibleCandidates as c (c.date)}
          <div
            class="modal-item {c.idx === selectedIndex ? 'selected' : ''}"
            role="option"
            aria-selected={c.idx === selectedIndex}
            tabindex="0"
            style="position: absolute; top: {c.idx * MODAL_ITEM_ROW_HEIGHT}px; left: 0; right: 0; height: {MODAL_ITEM_ROW_HEIGHT}px;"
            on:click={() => commit(c.idx)}
            on:mouseenter={() => (selectedIndex = c.idx)}
            on:keydown={(e) => e.key === "Enter" && commit(c.idx)}
          >
            <div class="modal-item-main">
              <span>📅</span>
              <span>{c.label}</span>
            </div>
            <div class="item-tag">{c.exists ? `${c.openCount} open action(s)` : "[New Daily Note]"}</div>
          </div>
        {/each}
      </div>
    </div>
    <div class="modal-footer">
      <div><kbd>Enter</kbd> Open / Create Daily Note</div>
      <div><kbd>Esc</kbd> Cancel</div>
    </div>
  </div>
</div>
