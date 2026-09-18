<script lang="ts">
  import * as controller from "../../controller";
  import { activeTabId, mobileTabDrawerOpen, tabs } from "../../controller";
  import type { NoteTab } from "../../types";
  import Icon from "../../icons/Icon.svelte";
  import { todayISO } from "../../date";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";

  const tabLabel = (t: NoteTab) => (t.isScratchpad ? t.filename : t.filename.replace(/\.txt$/, ""));

  const tabDateClass = (t: NoteTab): string => {
    if (t.isScratchpad) return "";
    const date = t.filename.slice(0, 10);
    const today = todayISO();
    return date < today ? "past" : date > today ? "future" : "today";
  };

  function selectTab(id: string) {
    controller.switchTab(id);
    mobileTabDrawerOpen.set(false);
  }

  function closeTab(e: MouseEvent, id: string) {
    e.stopPropagation();
    controller.requestTabClose(id);
  }

  function handleNewScratchpad() {
    controller.createScratchpad();
    mobileTabDrawerOpen.set(false);
  }

  function handleOpenDate() {
    controller.openDatePicker();
    mobileTabDrawerOpen.set(false);
  }

  function closeDrawer() {
    mobileTabDrawerOpen.set(false);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDrawer();
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div
  class="overlay mobile-drawer-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Open tabs"
  use:closeOnOutsideClick={closeDrawer}
>
  <div class="modal-card mobile-drawer-card" use:focusTrap>
    <div class="drawer-header">
      <div class="drawer-title-group">
        <Icon name="tabs" size={18} />
        <span class="drawer-title">Open Tabs</span>
        <span class="drawer-count">{$tabs.length}</span>
      </div>
      <button type="button" class="drawer-close-btn" on:click={closeDrawer} aria-label="Close tab list">
        <Icon name="close" size={16} />
      </button>
    </div>

    <div class="drawer-tab-list" role="tablist">
      {#each $tabs as tab (tab.id)}
        <div
          class="drawer-tab-item {tabDateClass(tab)}"
          class:active={tab.id === $activeTabId}
          role="tab"
          tabindex="0"
          aria-selected={tab.id === $activeTabId}
          on:click={() => selectTab(tab.id)}
          on:keydown={(e) => e.key === 'Enter' && selectTab(tab.id)}
        >
          <div class="drawer-tab-icon">
            <Icon name={tab.isScratchpad ? "tab-scratch" : "tab-daily"} size={16} />
          </div>
          <span class="drawer-tab-name">{tabLabel(tab)}</span>
          {#if !tab.isScratchpad && tab.filename.slice(0, 10) === todayISO()}
            <span class="drawer-today-tag">Today</span>
          {/if}
          {#if tab.isScratchpad && tab.content.trim() !== ""}
            <span class="tab-status-dot mem" title="Kept in memory only"></span>
          {/if}
          <button
            type="button"
            class="drawer-tab-close"
            on:click={(e) => closeTab(e, tab.id)}
            aria-label="Close {tabLabel(tab)}"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      {/each}
    </div>

    <div class="drawer-actions">
      <button type="button" class="drawer-action-btn" on:click={handleNewScratchpad}>
        <Icon name="new-scratchpad" size={15} />
        <span>New Scratchpad</span>
      </button>
      <button type="button" class="drawer-action-btn" on:click={handleOpenDate}>
        <Icon name="date-note" size={15} />
        <span>Open Date Note</span>
      </button>
    </div>
  </div>
</div>
