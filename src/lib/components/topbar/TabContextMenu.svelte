<script lang="ts">
  import * as controller from "../../controller";
  import { notesDir, showToast, tabs } from "../../controller";
  import type { NoteTab } from "../../types";
  import Icon from "../../icons/Icon.svelte";
  import { countActions } from "../../tokens";
  import { t } from "../../i18n";
  import { openExportModal, printNote, printTitle } from "../../exportNotes";
  import { openVersions } from "../../versions";

  let {
    displayTabs,
    onStartRenaming,
  }: {
    displayTabs: NoteTab[];
    onStartRenaming: (tab: NoteTab) => void;
  } = $props();

  let contextMenuVisible = $state(false);
  let contextTab = $state<NoteTab | null>(null);
  let contextPos = $state({ x: 0, y: 0 });
  let contextMenuEl = $state<HTMLDivElement>();

  const hasTabsWithoutOpenActions = $derived($tabs.some((t) => countActions(t.content).open === 0));

  function isLastDisplayTab(tab: NoteTab | null): boolean {
    if (!tab) return true;
    const last = displayTabs[displayTabs.length - 1];
    return !last || last.id === tab.id;
  }

  export function openTabContextMenu(e: MouseEvent, tab: NoteTab) {
    e.preventDefault();
    e.stopPropagation();
    contextTab = tab;
    contextMenuVisible = true;
    const menuWidth = 200;
    const menuHeight = 250;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
    contextPos = { x: Math.max(8, x), y: Math.max(8, y) };
  }

  export function closeContextMenu() {
    contextMenuVisible = false;
    contextTab = null;
  }

  async function copyDate(tab: NoteTab) {
    const dateStr = tab.filename.replace(/\.txt$/, "");
    await navigator.clipboard.writeText(dateStr);
    showToast($t("toast.tabs.copiedToClipboard", { text: dateStr }));
  }

  async function copyPath(tab: NoteTab) {
    const path = $notesDir ? `${$notesDir}/${tab.filename}` : tab.filename;
    await navigator.clipboard.writeText(path);
    showToast($t("toast.tabs.copiedToClipboard", { text: path }));
  }
</script>

<svelte:window
  onmousedown={(e) => {
    if (contextMenuVisible && contextMenuEl && !contextMenuEl.contains(e.target as Node)) {
      closeContextMenu();
    }
  }}
  onkeydown={(e) => {
    if (e.key === "Escape" && contextMenuVisible) {
      closeContextMenu();
    }
  }}
/>

{#if contextMenuVisible && contextTab}
  <div
    class="tab-context-menu"
    bind:this={contextMenuEl}
    style="top: {contextPos.y}px; left: {contextPos.x}px;"
    role="menu"
    aria-label={$t("topBar.contextMenu.ariaLabel")}
  >
    <button
      type="button"
      class="tab-context-item"
      role="menuitem"
      onclick={() => {
        const id = contextTab?.id;
        closeContextMenu();
        if (id) controller.requestTabClose(id);
      }}
    >
      <Icon name="close" size={13} />
      <span>{$t("topBar.contextMenu.close")}</span>
    </button>
    <button
      type="button"
      class="tab-context-item"
      role="menuitem"
      disabled={$tabs.length <= 1}
      onclick={() => {
        const id = contextTab?.id;
        closeContextMenu();
        if (id) controller.closeOtherTabs(id);
      }}
    >
      <Icon name="close-others" size={13} />
      <span>{$t("topBar.contextMenu.closeOthers")}</span>
    </button>
    <button
      type="button"
      class="tab-context-item"
      role="menuitem"
      disabled={isLastDisplayTab(contextTab)}
      onclick={() => {
        const id = contextTab?.id;
        closeContextMenu();
        if (id) controller.closeTabsToTheRight(id);
      }}
    >
      <Icon name="close-right" size={13} />
      <span>{$t("topBar.contextMenu.closeToTheRight")}</span>
    </button>
    <button
      type="button"
      class="tab-context-item"
      role="menuitem"
      disabled={!hasTabsWithoutOpenActions}
      onclick={() => {
        closeContextMenu();
        controller.closeTabsWithNoOpenActions();
      }}
    >
      <Icon name="close-clean" size={13} />
      <span>{$t("topBar.contextMenu.closeTabsWithNoOpenActions")}</span>
    </button>

    <div class="tab-context-sep" role="separator"></div>

    {#if contextTab.isScratchpad}
      <button
        type="button"
        class="tab-context-item"
        role="menuitem"
        onclick={() => {
          if (contextTab) onStartRenaming(contextTab);
        }}
      >
        <Icon name="edit" size={13} />
        <span>{$t("topBar.contextMenu.renameScratchpad")}</span>
      </button>
      <button
        type="button"
        class="tab-context-item"
        role="menuitem"
        onclick={() => {
          const id = contextTab?.id;
          closeContextMenu();
          if (id) controller.duplicateTab(id);
        }}
      >
        <Icon name="new-scratchpad" size={13} />
        <span>{$t("topBar.contextMenu.duplicateScratchpad")}</span>
      </button>
    {:else}
      <button
        type="button"
        class="tab-context-item"
        role="menuitem"
        onclick={() => {
          const t = contextTab;
          closeContextMenu();
          if (t) copyDate(t);
        }}
      >
        <Icon name="date-note" size={13} />
        <span>{$t("topBar.contextMenu.copyDate")}</span>
      </button>
      <button
        type="button"
        class="tab-context-item"
        role="menuitem"
        onclick={() => {
          const t = contextTab;
          closeContextMenu();
          if (t) copyPath(t);
        }}
      >
        <Icon name="copy" size={13} />
        <span>{$t("topBar.contextMenu.copyPath")}</span>
      </button>
      <button
        type="button"
        class="tab-context-item"
        role="menuitem"
        onclick={() => {
          const t = contextTab;
          closeContextMenu();
          if (t) openVersions(t.filename);
        }}
      >
        <Icon name="section-history" size={13} />
        <span>{$t("versions.menuItem")}</span>
      </button>
    {/if}

    <div class="tab-context-sep" role="separator"></div>

    <button
      type="button"
      class="tab-context-item"
      role="menuitem"
      onclick={() => {
        const t = contextTab;
        closeContextMenu();
        if (t) openExportModal(t);
      }}
    >
      <Icon name="external" size={13} />
      <span>{$t("export.menuItem")}</span>
    </button>
    <button
      type="button"
      class="tab-context-item"
      role="menuitem"
      onclick={() => {
        const t = contextTab;
        closeContextMenu();
        if (t) printNote(t.content, printTitle(t.filename));
      }}
    >
      <Icon name="tab-scratch" size={13} />
      <span>{$t("print.menuItem")}</span>
    </button>
  </div>
{/if}

<style>
/* Tab Context Menu */

.tab-context-menu {
  position: fixed;
  z-index: 300;
  min-width: 180px;
  width: max-content;
  max-width: 280px;
  background: var(--surface-overlay);
  background: color-mix(in srgb, var(--surface-overlay) 88%, transparent);
  backdrop-filter: blur(20px) saturate(125%);
  border: 1px solid var(--edge-strong);
  border-radius: var(--radius-overlay);
  box-shadow: var(--shadow-flyout);
  padding: 4px;
  font-size: 13px;
  color: var(--text);
}

.tab-context-item {
  width: 100%;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  color: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab-context-item span {
  flex: 1;
}

.tab-context-item:hover {
  background: var(--surface-raised);
}

.tab-context-item:disabled {
  opacity: 0.4;
  cursor: default;
  color: var(--text-tertiary);
}

.tab-context-item:disabled:hover {
  background: transparent;
}

.tab-context-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--edge-soft);
}
</style>
