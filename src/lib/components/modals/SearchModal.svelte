<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { searchResultsStore } from "../../controller";
  import type { SearchResultItem } from "../../types";

  let query = "";
  let selectedIndex = 0;
  let scope: "open" | "all" = "open";
  let inputEl: HTMLInputElement;

  onMount(() => inputEl?.focus());

  async function setScope(next: "open" | "all") {
    if (scope === next) return;
    scope = next;
    if (scope === "all") await controller.refreshAllNotesCache();
    controller.runSearch(query, scope);
  }

  $: controller.runSearch(query, scope);
  $: flatList = $searchResultsStore;
  $: groups = ((): [string, { filename: string; items: SearchResultItem[] }][] => {
    const map = new Map<string, { filename: string; items: SearchResultItem[] }>();
    for (const it of flatList) {
      const key = it.tabId ?? it.tabFilename;
      if (!map.has(key)) map.set(key, { filename: it.tabFilename, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.entries());
  })();
  $: if (selectedIndex >= flatList.length) selectedIndex = Math.max(0, flatList.length - 1);

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
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatList.length) selectedIndex = (selectedIndex - 1 + flatList.length) % flatList.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) controller.jumpToFileLine({ tabId: it.tabId, filename: it.tabFilename, lineIdx: it.lineIdx });
    } else if (e.key === "Escape") {
      controller.closeAllModals();
    }
  }
</script>

<div class="overlay" role="presentation" on:click|self={controller.closeAllModals}>
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
      <span class="modal-counter">{flatList.length} match(es)</span>
    </div>
    <div class="modal-input-wrap">
      <div class="settings-toggle-row">
        <button class="icon-btn {scope === 'open' ? 'active' : ''}" on:click={() => setScope("open")}
          >Open Tabs</button
        >
        <button class="icon-btn {scope === 'all' ? 'active' : ''}" on:click={() => setScope("all")}>All Files</button>
      </div>
    </div>
    <div class="modal-list" role="listbox">
      {#each groups as [key, group] (key)}
        <div class="modal-group-header">{group.filename} ({group.items.length} matches)</div>
        {#each group.items as item (item.tabFilename + ":" + item.lineIdx)}
          {@const idx = flatList.indexOf(item)}
          <div
            class="modal-item {idx === selectedIndex ? 'selected' : ''}"
            role="option"
            aria-selected={idx === selectedIndex}
            tabindex="0"
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
        {/each}
      {/each}
    </div>
    <div class="modal-footer">
      <div><kbd>Enter</kbd> Jump to match</div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
