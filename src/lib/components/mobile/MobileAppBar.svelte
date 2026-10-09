<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import {
    activeTabId,
    allNotesCache,
    isZenMode,
    mobileTabDrawerOpen,
    statusCounts,
    tabs,
  } from "../../controller";
  import Icon from "../../icons/Icon.svelte";
  import { parseISODateLocal, todayISO } from "../../date";
  import { locale, t } from "../../i18n";
  import { adjacentNoteDate, relativeDay } from "../../phoneNav";

  let moreOpen = $state(false);
  let moreBtnEl = $state<HTMLElement>();
  let moreMenuEl = $state<HTMLElement>();
  let menuStyle = $state("visibility: hidden;");

  onMount(() => {
    void controller.refreshAllNotesCache();
  });

  const activeTab = $derived($tabs.find((t) => t.id === $activeTabId));

  const currentDate = $derived(
    activeTab && !activeTab.isScratchpad && /^\d{4}-\d{2}-\d{2}/.test(activeTab.filename)
      ? activeTab.filename.slice(0, 10)
      : todayISO()
  );

  const contentDates = $derived(
    Object.entries($allNotesCache)
      .filter(([filename, content]) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(filename) && content.trim().length > 0)
      .map(([filename]) => filename.slice(0, 10))
  );

  const prevDate = $derived(adjacentNoteDate(currentDate, contentDates, -1));
  const nextDate = $derived(adjacentNoteDate(currentDate, contentDates, 1));

  const rel = $derived(relativeDay(currentDate, todayISO()));

  function formatFormattedDate(iso: string, loc: string): string {
    try {
      const d = parseISODateLocal(iso);
      return new Intl.DateTimeFormat(loc, { weekday: "short", day: "numeric", month: "short" }).format(d);
    } catch {
      return iso;
    }
  }

  const formattedDate = $derived(formatFormattedDate(currentDate, $locale));

  const firstLine = $derived.by(() => {
    if (rel === "today") return $t("phoneNav.today");
    if (rel === "yesterday") return $t("phoneNav.yesterday");
    if (rel === "tomorrow") return $t("phoneNav.tomorrow");
    return formattedDate;
  });

  const secondLine = $derived.by(() => {
    const openCount = $statusCounts.open;
    const countText = openCount > 0 ? $t("phoneNav.openCount", { count: openCount }) : "";
    if (rel !== null) {
      return openCount > 0 ? `${formattedDate} · ${countText}` : formattedDate;
    }
    return openCount > 0 ? countText : "";
  });

  function positionMenu() {
    if (!moreBtnEl || !moreMenuEl) return;
    const r = moreBtnEl.getBoundingClientRect();
    const w = moreMenuEl.offsetWidth || 220;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    menuStyle = `top: ${r.bottom + 6}px; left: ${left}px;`;
  }

  function toggleMore() {
    moreOpen = !moreOpen;
    if (moreOpen) {
      tick().then(positionMenu);
    }
  }

  function closeMore() {
    moreOpen = false;
  }

  function onWindowPointerDown(e: MouseEvent | TouchEvent) {
    if (!moreOpen) return;
    const target = e.target as HTMLElement | null;
    if (moreBtnEl?.contains(target)) return;
    if (moreMenuEl && !moreMenuEl.contains(target)) {
      closeMore();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && moreOpen) {
      e.stopPropagation();
      closeMore();
    }
  }

  function handleNewScratchpad() {
    closeMore();
    controller.createScratchpad();
  }

  function handleToggleZen() {
    closeMore();
    isZenMode.update((v) => !v);
  }

  function handleShortcuts() {
    closeMore();
    controller.openShortcutsHelp();
  }

  function handleSettings() {
    closeMore();
    controller.openSettings();
  }
</script>

<svelte:window onmousedown={onWindowPointerDown} ontouchstart={onWindowPointerDown} onresize={positionMenu} onkeydown={onKeydown} />

<header id="top-bar" class="mobile-app-bar">
  <button
    type="button"
    class="mobile-bar-btn mobile-tab-drawer-btn"
    title={$t("topBar.openTabsList.title")}
    aria-label={$t("topBar.openTabsList.ariaLabel", { count: $tabs.length })}
    onclick={() => mobileTabDrawerOpen.set(true)}
  >
    <Icon name="tabs" size={20} />
    <span class="mobile-tab-count mobile-tab-badge">{$tabs.length}</span>
  </button>

  <button
    type="button"
    class="mobile-bar-btn mobile-prev-btn"
    title={$t("phoneNav.previous")}
    aria-label={$t("phoneNav.previous")}
    disabled={!prevDate}
    onclick={() => prevDate && void controller.commitDatePick(prevDate)}
  >
    <Icon name="chevron-left" size={20} />
  </button>

  <button
    type="button"
    class="mobile-title-btn mobile-active-tab"
    data-datepicker-trigger
    title={$t("topBar.label.date")}
    onclick={controller.openDatePicker}
  >
    {#if activeTab?.isScratchpad}
      <span class="mobile-title-line1 tab-label">{activeTab.filename}</span>
    {:else}
      <span class="mobile-title-line1 tab-label">{firstLine}</span>
      {#if secondLine}
        <span class="mobile-title-line2">{secondLine}</span>
      {/if}
    {/if}
  </button>

  <button
    type="button"
    class="mobile-bar-btn mobile-next-btn"
    title={$t("phoneNav.next")}
    aria-label={$t("phoneNav.next")}
    disabled={!nextDate}
    onclick={() => nextDate && void controller.commitDatePick(nextDate)}
  >
    <Icon name="chevron-right" size={20} />
  </button>

  <button
    type="button"
    class="mobile-bar-btn mobile-more-btn"
    title={$t("topBar.moreActions.title")}
    aria-label={$t("topBar.moreActions.title")}
    aria-expanded={moreOpen}
    aria-haspopup="menu"
    bind:this={moreBtnEl}
    onclick={toggleMore}
  >
    <Icon name="more" size={20} />
  </button>

  {#if moreOpen}
    <div
      class="more-actions-pop"
      bind:this={moreMenuEl}
      role="menu"
      aria-label={$t("topBar.moreActions.title")}
      style={menuStyle}
    >
      <button type="button" class="more-actions-item" role="menuitem" onclick={handleNewScratchpad}>
        <Icon name="new-scratchpad" size={14} />
        <span>{$t("shortcuts.newScratchpad.label")}</span>
      </button>
      <button type="button" class="more-actions-item" role="menuitem" onclick={handleToggleZen}>
        <Icon name="edit" size={14} />
        <span>{$t("shortcuts.toggleZenMode.label")}</span>
      </button>
      <button type="button" class="more-actions-item" role="menuitem" onclick={handleShortcuts}>
        <Icon name="keyboard" size={14} />
        <span>{$t("shortcuts.modal.title")}</span>
      </button>
      <div class="more-actions-sep" role="separator"></div>
      <button type="button" class="more-actions-item" role="menuitem" onclick={handleSettings}>
        <Icon name="settings" size={14} />
        <span>{$t("settings.modal.title")}</span>
      </button>
    </div>
  {/if}
</header>

<style>
  .mobile-app-bar {
    height: 56px;
    background: var(--surface-chrome);
    border-bottom: 1px solid var(--edge-soft);
    display: flex;
    align-items: center;
    padding: 0 4px;
    gap: 2px;
    box-sizing: border-box;
    flex-shrink: 0;
    position: relative;
    z-index: 50;
    width: 100%;
  }

  .mobile-bar-btn {
    min-width: 44px;
    min-height: 44px;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-control);
    color: var(--text);
    cursor: pointer;
    padding: 0;
    position: relative;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-bar-btn:active:not(:disabled) {
    background: var(--surface-hover);
  }

  .mobile-bar-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .mobile-tab-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--surface-raised);
    border: 1px solid var(--edge-strong);
    font-size: 10px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    pointer-events: none;
  }

  .mobile-title-btn {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    height: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text);
    cursor: pointer;
    padding: 0 4px;
    border-radius: var(--radius-control);
    text-align: center;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-title-btn:active {
    background: var(--surface-hover);
  }

  .mobile-title-line1 {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .mobile-title-line2 {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
</style>
