<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { actionSnapshot, tabs } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import type { ActionSnapshotItem } from "../../types";

  let filter = "";
  let selectedIndex = 0;
  let scope: "open" | "all" = "open";
  let inputEl: HTMLInputElement;

  onMount(() => inputEl?.focus());

  async function setScope(next: "open" | "all") {
    if (scope === next) return;
    scope = next;
    actionSnapshot.set(
      scope === "all" ? await controller.buildActionSnapshotAllFiles() : controller.buildActionSnapshotOpenTabs(),
    );
  }

  $: showDelegated = filter.includes("@");

  $: liveSnapshot = $actionSnapshot.map((item) => {
    const tab = $tabs.find((t) => t.id === item.tabId || t.filename === item.filename);
    const line = tab ? (tab.content.split("\n")[item.lineIdx] ?? item.line) : item.line;
    return { ...item, line, tabId: tab?.id ?? item.tabId };
  });

  $: filtered = liveSnapshot.filter((item) => {
    const isDelegated = item.line.includes("=> @");
    if (isDelegated && !showDelegated) return false;
    if (!filter) return true;
    return item.line.toLowerCase().includes(filter.toLowerCase());
  });

  interface Group {
    key: string;
    filename: string;
    items: ActionSnapshotItem[];
  }

  $: groups = ((): Group[] => {
    const map = new Map<string, Group>();
    for (const item of filtered) {
      const key = item.tabId ?? item.filename;
      if (!map.has(key)) map.set(key, { key, filename: item.filename, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values());
  })();

  $: flatList = groups.flatMap((g) => g.items);
  $: uncompletedCount = flatList.filter((i) => !i.line.startsWith("v ")).length;
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
    if (line.includes("=> @")) return { char: "➔", style: "color:var(--glyph-assignee-color); font-weight:600;" };
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
      </div>
    </div>
    <div class="modal-list" role="listbox">
      {#each groups as group (group.key)}
        <div class="modal-group-header">{group.filename} ({group.items.length})</div>
        {#each group.items as item (item.id)}
          {@const idx = flatList.indexOf(item)}
          {@const g = glyphFor(item.line)}
          <div
            class="modal-item {idx === selectedIndex ? 'selected' : ''}"
            role="option"
            aria-selected={idx === selectedIndex}
            tabindex="0"
            on:click={() => controller.jumpToFileLine(item)}
            on:mouseenter={() => (selectedIndex = idx)}
            on:keydown={(e) => e.key === "Enter" && controller.jumpToFileLine(item)}
          >
            <div class="modal-item-main">
              <span style={g.style}>{g.char}</span>
              <span class={item.line.startsWith("v ") ? "item-completed" : ""}>{item.line}</span>
            </div>
            {#if item.header}<span class="item-breadcrumb">· {item.header}</span>{/if}
            <div class="item-tag">Ln {item.lineIdx + 1}</div>
          </div>
        {/each}
      {/each}
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
