<script lang="ts">
  import { get } from "svelte/store";
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { activeTabId, agendaFileExists, backendKind, calendarSyncEnabled, tabs } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { formatShortcut } from "../../shortcuts";
  import { todayISO } from "../../date";

  /** #56: the top bar collapses its secondary action buttons into this
   * popover once the window is too narrow for all of them (see
   * `TopBar.svelte`'s `settleLayout`) — New Scratchpad and Open Date Note
   * stay pinned outside it, being the two "start something" actions most
   * central to daily use. Same anchored-non-modal-card shape as
   * `DatePickerModal` (down to the outside-click/trigger-attribute
   * pattern), not a centred `.overlay` card — this is a toolbar overflow
   * menu, not a dialog. */

  let popEl: HTMLDivElement;
  let anchorStyle = "visibility:hidden"; // until measured against the trigger

  $: activeTab = $tabs.find((t) => t.id === $activeTabId);
  $: calendarSyncVisible = $calendarSyncEnabled && $backendKind !== "web";
  $: calendarSyncReady =
    !!activeTab && !activeTab.isScratchpad && activeTab.filename.slice(0, 10) >= todayISO() && $agendaFileExists;

  function positionUnderTrigger() {
    const trigger = document.querySelector<HTMLElement>("[data-more-trigger]");
    if (!trigger || !popEl) {
      anchorStyle = "";
      return;
    }
    const r = trigger.getBoundingClientRect();
    const w = popEl.offsetWidth || 220;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    anchorStyle = `top:${r.bottom + 6}px; left:${left}px`;
  }

  onMount(positionUnderTrigger);

  function onOutsideMousedown(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    // Ignore clicks on the trigger itself — its own click handler is what
    // opened this, and closing here would just let it immediately re-open.
    if (t?.closest("[data-more-trigger]")) return;
    if (popEl && !popEl.contains(t)) controller.closeAllModals();
  }

  function promote() {
    const tab = get(activeTabId);
    void controller.promoteScratchpad(tab);
    // Unlike the other rows below, `promoteScratchpad` doesn't itself
    // change `modal` — close explicitly.
    controller.closeAllModals();
  }
</script>

<svelte:window on:mousedown={onOutsideMousedown} on:resize={positionUnderTrigger} />

<div class="more-actions-pop" bind:this={popEl} role="menu" aria-label="More actions" use:focusTrap style={anchorStyle}>
  <button type="button" class="more-actions-item" role="menuitem" on:click={controller.openActionDrawer}>
    <Icon name="actions" size={14} /><span>Actions</span>
    <kbd>{formatShortcut("openActions")}</kbd>
  </button>
  <button type="button" class="more-actions-item" role="menuitem" on:click={controller.openMeetingHistory}>
    <Icon name="section-history" size={14} /><span>Section history</span>
    <kbd>{formatShortcut("openHistory")}</kbd>
  </button>
  <button type="button" class="more-actions-item" role="menuitem" on:click={controller.openCrossTabSearch}>
    <Icon name="search" size={14} /><span>Cross-tab search</span>
    <kbd>{formatShortcut("crossTabSearch")}</kbd>
  </button>
  {#if calendarSyncVisible}
    <button
      type="button"
      class="more-actions-item"
      role="menuitem"
      disabled={!calendarSyncReady}
      title={calendarSyncReady
        ? ""
        : !$agendaFileExists
          ? "No .agenda.json file found in your notes folder"
          : "Only available for a note dated today or later"}
      on:click={controller.syncCalendarFromFile}
    >
      <Icon name="calendar-import" size={14} /><span>Sync calendar for this day</span>
      <kbd>{formatShortcut("syncCalendar")}</kbd>
    </button>
  {/if}
  {#if activeTab?.isScratchpad}
    <button type="button" class="more-actions-item" role="menuitem" on:click={promote}>
      <Icon name="promote" size={14} /><span>Promote into today's note</span>
    </button>
  {/if}
  <div class="more-actions-sep" role="separator"></div>
  <button type="button" class="more-actions-item" role="menuitem" on:click={controller.openSettings}>
    <Icon name="settings" size={14} /><span>Settings</span>
    <kbd>{formatShortcut("openSettings")}</kbd>
  </button>
</div>
