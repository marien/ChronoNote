<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { allNotesCache } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { parseDateQuery } from "../../date";
  import { countActions } from "../../tokens";

  interface Candidate {
    date: string;
    label: string;
    exists: boolean;
    openCount: number;
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
      });
    }
    controller.sortFilenamesByRecency(Object.keys(cache)).forEach((fn) => {
      const d = fn.replace(/\.txt$/, "");
      if (!list.some((c) => c.date === d) && (!q || d.includes(q))) {
        list.push({ date: d, label: d, exists: true, openCount: countActions(cache[fn]).open });
      }
    });
    return list;
  }

  $: candidates = buildCandidates(query, $allNotesCache);
  $: if (selectedIndex >= candidates.length) selectedIndex = Math.max(0, candidates.length - 1);

  // --- Virtualized rendering (§38) --- see SearchModal.svelte for the
  // full rationale. Simpler here than Search/Action Drawer: no group
  // headers, so every row is the same fixed height and a position can be
  // computed directly (index * height) instead of needing a binary search
  // over precomputed offsets.
  const ITEM_ROW_HEIGHT = 36;
  const OVERSCAN_PX = 200;

  let listEl: HTMLDivElement;
  let scrollTop = 0;
  let viewportHeight = 380;

  $: totalHeight = candidates.length * ITEM_ROW_HEIGHT;
  $: windowStart = Math.max(0, Math.floor((scrollTop - OVERSCAN_PX) / ITEM_ROW_HEIGHT));
  $: windowEnd = Math.min(candidates.length, Math.ceil((scrollTop + viewportHeight + OVERSCAN_PX) / ITEM_ROW_HEIGHT));
  $: visibleCandidates = candidates.slice(windowStart, windowEnd).map((c, i) => ({ ...c, idx: windowStart + i }));

  function onScroll() {
    if (listEl) scrollTop = listEl.scrollTop;
  }

  function scrollSelectedIntoView() {
    if (!listEl) return;
    const top = selectedIndex * ITEM_ROW_HEIGHT;
    if (top < listEl.scrollTop) {
      listEl.scrollTop = top;
    } else if (top + ITEM_ROW_HEIGHT > listEl.scrollTop + viewportHeight) {
      listEl.scrollTop = top + ITEM_ROW_HEIGHT - viewportHeight;
    }
    scrollTop = listEl.scrollTop;
  }

  function commit(idx: number) {
    const c = candidates[idx];
    if (c) controller.commitDatePick(c.date);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (candidates.length) selectedIndex = (selectedIndex + 1) % candidates.length;
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (candidates.length) selectedIndex = (selectedIndex - 1 + candidates.length) % candidates.length;
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
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Jump to date">
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
            style="position: absolute; top: {c.idx * ITEM_ROW_HEIGHT}px; left: 0; right: 0; height: {ITEM_ROW_HEIGHT}px;"
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
