<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { historyItems, historyTargetHeader } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import type { HistoryItem } from "../../types";

  let selectedIndex = 0;
  let titleEl: HTMLInputElement;

  onMount(() => titleEl?.focus());

  $: flatList = $historyItems;
  $: groups = ((): [string, HistoryItem[]][] => {
    const map = new Map<string, HistoryItem[]>();
    for (const it of flatList) {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date)!.push(it);
    }
    return Array.from(map.entries());
  })();
  $: if (selectedIndex >= flatList.length) selectedIndex = Math.max(0, flatList.length - 1);

  // References the same CSS custom properties the main editor's .glyph-*
  // classes use, so this list follows the color/grayscale toggle for free.
  function glyphFor(line: string) {
    if (line.startsWith("v "))
      return {
        char: "☑",
        style: "color:var(--glyph-done-color); font-weight:var(--glyph-done-weight); opacity:var(--glyph-done-opacity);",
      };
    if (line.startsWith("> "))
      return { char: "»", style: "color:var(--glyph-progress-color); font-weight:var(--glyph-progress-weight);" };
    if (line.startsWith("=> "))
      return { char: "➔", style: "color:var(--glyph-followup-color); font-weight:var(--glyph-followup-weight);" };
    return { char: "☐", style: "color:var(--glyph-open-color); font-weight:var(--glyph-open-weight);" };
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatList.length) selectedIndex = (selectedIndex + 1) % flatList.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatList.length) selectedIndex = (selectedIndex - 1 + flatList.length) % flatList.length;
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
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Section history">
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
    <div class="modal-list" role="listbox">
      {#if flatList.length === 0}
        <div style="padding: 16px; opacity: 0.6;">No prior occurrences found across open or closed notes.</div>
      {/if}
      {#each groups as [date, items] (date)}
        <div class="modal-group-header">📅 {date} ({items.length})</div>
        {#each items as it (it.filename + ":" + it.lineIdx)}
          {@const idx = flatList.indexOf(it)}
          {@const g = glyphFor(it.line)}
          <div
            class="modal-item {idx === selectedIndex ? 'selected' : ''}"
            role="option"
            aria-selected={idx === selectedIndex}
            tabindex="0"
            on:click={() => controller.jumpToHistoryItem(it)}
            on:mouseenter={() => (selectedIndex = idx)}
            on:keydown={(e) => e.key === "Enter" && controller.jumpToHistoryItem(it)}
          >
            <div class="modal-item-main">
              <span style={g.style}>{g.char}</span>
              <span>{it.line}</span>
            </div>
            <div class="item-tag">Ln {it.lineIdx + 1}</div>
          </div>
        {/each}
      {/each}
    </div>
    <div class="modal-footer">
      <div><kbd>Enter</kbd> Jump to source file &nbsp;|&nbsp; <kbd>Shift+Enter</kbd> Import action into note</div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
