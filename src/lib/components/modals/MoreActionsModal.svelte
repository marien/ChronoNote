<script lang="ts">
  import { get } from "svelte/store";
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import {
    activeTabId,
    agendaFileExists,
    backendKind,
    calendarSyncEnabled,
    calendarSyncHasDiff,
    isMobile,
    isZenMode,
    oneDriveAccount,
    oneDriveFolder,
    tabs,
  } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { commandsCollapsed } from "../TopBar.svelte";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import Icon from "../../icons/Icon.svelte";
  import { formatCombo, formatShortcut, shortcutById } from "../../shortcuts";
  import { todayISO } from "../../date";
  import { t } from "../../i18n";

  /** The top bar's "More" popover (§B2: the button is always there). It always lists
   * Settings, Shortcuts & symbols, Zen mode, Peek (desktop only) and About; #56: while the
   * top bar has collapsed its secondary command buttons (see `TopBar.svelte`'s
   * `settleLayout`) they are listed above those — Date and the + button stay pinned outside
   * it, being the "start something" actions most central to daily use. Same
   * anchored-non-modal-card shape as
   * `DatePickerModal` (down to the outside-click/trigger-attribute
   * pattern), not a centred `.overlay` card — this is a toolbar overflow
   * menu, not a dialog. */

  let popEl: HTMLDivElement;
  let anchorStyle = $state("visibility:hidden"); // until measured against the trigger

  const activeTab = $derived($tabs.find((t) => t.id === $activeTabId));
  const calendarSyncVisible = $derived(
    $calendarSyncEnabled && ($backendKind !== "web" || (!!$oneDriveAccount && !!$oneDriveFolder)),
  );
  const calendarSyncReady = $derived(
    !!activeTab && !activeTab.isScratchpad && activeTab.filename.slice(0, 10) >= todayISO() && $agendaFileExists,
  );

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

  // Collapsed commands are listed first; on a phone the bar always keeps them in here.
  const showCollapsed = $derived($commandsCollapsed || $isMobile);

  function promote() {
    const tab = get(activeTabId);
    void controller.promoteScratchpad(tab);
    // Unlike the other rows below, `promoteScratchpad` doesn't itself
    // change `modal` — close explicitly.
    controller.closeAllModals();
  }

  // Zen and Peek don't open a modal of their own, so close this popover explicitly first.
  function toggleZen() {
    controller.closeAllModals();
    isZenMode.update((v) => !v);
  }

  function peek() {
    controller.closeAllModals();
    controller.togglePeek();
  }
</script>

<svelte:window onmousedown={onOutsideMousedown} onresize={positionUnderTrigger} />

<div class="more-actions-pop" bind:this={popEl} role="menu" aria-label={$t("topBar.moreActions.title")} use:focusTrap use:sheetSwipe style={anchorStyle}>
  {#if showCollapsed}
    <button type="button" class="more-actions-item" role="menuitem" onclick={controller.openActionDrawer}>
      <Icon name="actions" size={14} /><span>{$t("actionDrawer.modal.ariaLabel")}</span>
      <kbd>{formatShortcut("openActions")}</kbd>
    </button>
    <button type="button" class="more-actions-item" role="menuitem" onclick={controller.openMeetingHistory}>
      <Icon name="section-history" size={14} /><span>{$t("history.modal.ariaLabel")}</span>
      <kbd>{formatShortcut("openHistory")}</kbd>
    </button>
    <button type="button" class="more-actions-item" role="menuitem" onclick={controller.openCrossTabSearch}>
      <Icon name="search" size={14} /><span>{$t("shortcuts.crossTabSearch.label")}</span>
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
            ? $t("topBar.calendarSync.titleNoAgendaFile")
            : $t("topBar.calendarSync.titleNotAvailable")}
        onclick={controller.syncCalendarFromFile}
      >
        <Icon name="calendar-import" size={14} /><span>{$t("shortcuts.syncCalendar.label")}{#if calendarSyncReady && $calendarSyncHasDiff}<span class="more-actions-pip" aria-hidden="true"></span>{/if}</span>
        <kbd>{formatShortcut("syncCalendar")}</kbd>
      </button>
    {/if}
    {#if activeTab?.isScratchpad}
      <button type="button" class="more-actions-item" role="menuitem" onclick={promote}>
        <Icon name="promote" size={14} /><span>{$t("moreActions.promote.label")}</span>
      </button>
    {/if}
    <div class="more-actions-sep" role="separator"></div>
  {/if}
  <button type="button" class="more-actions-item" role="menuitem" onclick={controller.openSettings}>
    <Icon name="settings" size={14} /><span>{$t("settings.modal.title")}</span>
    <kbd>{formatShortcut("openSettings")}</kbd>
  </button>
  <button type="button" class="more-actions-item" role="menuitem" onclick={controller.openShortcutsHelp}>
    <Icon name="keyboard" size={14} /><span>{$t("shortcuts.modal.title")}</span>
    <kbd>{formatCombo(shortcutById("openShortcutsHelp").combos[0])}</kbd>
  </button>
  <button type="button" class="more-actions-item" role="menuitem" onclick={toggleZen}>
    <Icon name="maximize" size={14} /><span>{$t("moreActions.zen")}</span>
    <kbd>{formatShortcut("toggleZenMode")}</kbd>
  </button>
  {#if $backendKind === "desktop"}
    <button type="button" class="more-actions-item" role="menuitem" onclick={peek}>
      <Icon name="peek" size={14} /><span>{$t("moreActions.peek")}</span>
      <kbd>{formatShortcut("togglePeekMode")}</kbd>
    </button>
  {/if}
  <button type="button" class="more-actions-item" role="menuitem" onclick={controller.openAbout}>
    <Icon name="about" size={14} /><span>{$t("shortcuts.openAbout.label")}</span>
    <kbd>{formatShortcut("openAbout")}</kbd>
  </button>
</div>

<style>
  .more-actions-pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--state-warn);
    /* Inline after the label: the row's `.more-actions-item span { flex: 1 }` must
       not reach it (it did as a flex sibling, stretching it into a wide ellipse). */
    display: inline-block;
    margin-left: 6px;
    vertical-align: middle;
  }
</style>
