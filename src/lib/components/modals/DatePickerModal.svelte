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
    Object.keys(cache).forEach((fn) => {
      const d = fn.replace(/\.txt$/, "");
      if (!list.some((c) => c.date === d) && (!q || d.includes(q))) {
        list.push({ date: d, label: d, exists: true, openCount: countActions(cache[fn]).open });
      }
    });
    return list;
  }

  $: candidates = buildCandidates(query, $allNotesCache);
  $: if (selectedIndex >= candidates.length) selectedIndex = Math.max(0, candidates.length - 1);

  function commit(idx: number) {
    const c = candidates[idx];
    if (c) controller.commitDatePick(c.date);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (candidates.length) selectedIndex = (selectedIndex + 1) % candidates.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (candidates.length) selectedIndex = (selectedIndex - 1 + candidates.length) % candidates.length;
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
    <div class="modal-list" role="listbox">
      {#each candidates as c, i}
        <div
          class="modal-item {i === selectedIndex ? 'selected' : ''}"
          role="option"
          aria-selected={i === selectedIndex}
          tabindex="0"
          on:click={() => commit(i)}
          on:mouseenter={() => (selectedIndex = i)}
          on:keydown={(e) => e.key === "Enter" && commit(i)}
        >
          <div class="modal-item-main">
            <span>📅</span>
            <span>{c.label}</span>
          </div>
          <div class="item-tag">{c.exists ? `${c.openCount} open action(s)` : "[New Daily Note]"}</div>
        </div>
      {/each}
    </div>
    <div class="modal-footer">
      <div><kbd>Enter</kbd> Open / Create Daily Note</div>
      <div><kbd>Esc</kbd> Cancel</div>
    </div>
  </div>
</div>
