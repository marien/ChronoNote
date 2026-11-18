<script lang="ts">
  import { tick } from "svelte";
  import * as controller from "../../controller";
  import {
    activeTabId,
    currentDateISO,
    mobileTabDrawerOpen,
    saveState,
    tabLabelStyle,
    tabs,
  } from "../../controller";
  import type { NoteTab } from "../../types";
  import Icon from "../../icons/Icon.svelte";
  import { formatCombo, shortcutById } from "../../shortcuts";
  import { locale, t } from "../../i18n";
  import { formatNoteDate } from "../../noteDateLabel";
  import type { TabLabelStyle } from "../../generated/tauri-types";
  import { DRAG_THRESHOLD, tabDateClass, tabLabel } from "./topbarHelpers";

  let {
    showHorizontalTabs,
    isMergedTitlebar,
    displayTabs,
    isOverflowing,
    tabBarEl = $bindable<HTMLDivElement | undefined>(),
    newSplitEl = $bindable<HTMLDivElement | undefined>(),
    newMenuOpen,
    onToggleNewMenu,
    onOpenContextMenu,
    onCloseContextMenu,
  }: {
    showHorizontalTabs: boolean;
    isMergedTitlebar: boolean;
    displayTabs: NoteTab[];
    isOverflowing: boolean;
    tabBarEl?: HTMLDivElement;
    newSplitEl?: HTMLDivElement;
    newMenuOpen: boolean;
    onToggleNewMenu: () => void;
    onOpenContextMenu: (e: MouseEvent, tab: NoteTab) => void;
    onCloseContextMenu?: () => void;
  } = $props();

  let renamingTabId = $state<string | null>(null);
  let renameInputVal = $state("");
  let renameInputEl = $state<HTMLInputElement>();

  export function startRenaming(tab: NoteTab) {
    onCloseContextMenu?.();
    if (!tab.isScratchpad) return;
    renamingTabId = tab.id;
    renameInputVal = tab.filename;
    tick().then(() => {
      renameInputEl?.focus();
      renameInputEl?.select();
    });
  }

  function commitRename() {
    if (renamingTabId) {
      if (renameInputVal.trim()) {
        controller.renameScratchpad(renamingTabId, renameInputVal.trim());
      }
      renamingTabId = null;
    }
  }

  function cancelRename() {
    renamingTabId = null;
  }

  // §B3: friendly labels ("Today", "do 9 okt"). `dayFormat` and `tabLabelWords` follow the language.
  const dayFormat = $derived(new Intl.DateTimeFormat($locale, { weekday: "short", day: "numeric", month: "short" }));
  const tabLabelWords = $derived({
    today: $t("phoneNav.today"),
    yesterday: $t("phoneNav.yesterday"),
    tomorrow: $t("phoneNav.tomorrow"),
  });
  /** The label on a tab in the desktop strip. Style and today come in as parameters, like
   * `tabDateClass` below, so the template re-renders when either changes. The tab's `title`
   * is always the plain ISO name (`tabLabel`). */
  const stripLabel = (t: NoteTab, style: TabLabelStyle, today: string): string =>
    formatNoteDate(t.filename, style, today, tabLabelWords, (d) => dayFormat.format(d));

  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  // Judged by whether the first / last tab is fully in view, not by the scroll position: the strip has side padding,
  // so "the last tab is visible" and "scrolled to the very end" differ by a few pixels.
  export function updateScrollEdges() {
    if (!tabBarEl) return;
    const tabEls = tabBarEl.querySelectorAll<HTMLElement>(".tab");
    if (tabEls.length === 0) return;
    const bar = tabBarEl.getBoundingClientRect();
    const left = tabEls[0].getBoundingClientRect().left < bar.left - 0.5;
    const right = tabEls[tabEls.length - 1].getBoundingClientRect().right > bar.right + 0.5;
    if (left !== canScrollLeft) canScrollLeft = left;
    if (right !== canScrollRight) canScrollRight = right;
  }

  // §392: dragging over the tabs scrolls the strip (mouse and pen; touch scrolls natively). A press that moves
  // less than DRAG_THRESHOLD stays a click. The strip's empty space is the window's drag region and is left alone.
  let tabDrag: { pointerId: number; startX: number; startScroll: number; moved: boolean } | null = null;
  let suppressTabClick = false;
  function onTabBarPointerDown(e: PointerEvent) {
    if (!tabBarEl || !isOverflowing || e.button !== 0 || e.pointerType === "touch") return;
    if (e.target === tabBarEl || (e.target as HTMLElement).closest(".tab-rename-input")) return;
    tabDrag = { pointerId: e.pointerId, startX: e.clientX, startScroll: tabBarEl.scrollLeft, moved: false };
  }
  function onTabBarPointerMove(e: PointerEvent) {
    if (!tabDrag || !tabBarEl || e.pointerId !== tabDrag.pointerId) return;
    const dx = e.clientX - tabDrag.startX;
    if (!tabDrag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      tabDrag.moved = true;
      tabBarEl.setPointerCapture(e.pointerId);
    }
    tabBarEl.scrollLeft = tabDrag.startScroll - dx;
  }
  function onTabBarPointerUp(e: PointerEvent) {
    if (!tabDrag || e.pointerId !== tabDrag.pointerId) return;
    if (tabDrag.moved) {
      // The release after a drag must not also switch to (or close) the tab under the pointer.
      suppressTabClick = true;
      setTimeout(() => (suppressTabClick = false), 0);
    }
    tabDrag = null;
  }
  function onTabBarClickCapture(e: MouseEvent) {
    if (!suppressTabClick) return;
    suppressTabClick = false;
    e.stopPropagation();
    e.preventDefault();
  }
  // Attached here rather than as attributes: the tablist itself is not focusable (its tabs are), and the a11y
  // check wants interactive handlers only on focusable elements.
  $effect(() => {
    const el = tabBarEl;
    if (!el) return;
    el.addEventListener("pointerdown", onTabBarPointerDown);
    el.addEventListener("pointermove", onTabBarPointerMove);
    el.addEventListener("pointerup", onTabBarPointerUp);
    el.addEventListener("pointercancel", onTabBarPointerUp);
    el.addEventListener("click", onTabBarClickCapture, true);
    return () => {
      el.removeEventListener("pointerdown", onTabBarPointerDown);
      el.removeEventListener("pointermove", onTabBarPointerMove);
      el.removeEventListener("pointerup", onTabBarPointerUp);
      el.removeEventListener("pointercancel", onTabBarPointerUp);
      el.removeEventListener("click", onTabBarClickCapture, true);
    };
  });

  // Touch-first only: desktop scrolls its strip with the §52 arrows instead.
  const showOpenTabsBtn = $derived(!showHorizontalTabs);
  const mobileActiveTab = $derived($tabs.find((t) => t.id === $activeTabId) ?? null);

  /** §52: the ‹ › arrows scroll the strip by about a tab. §392: they stop at the ends (the arrow is disabled
   * there) rather than wrapping to the other end. */
  function scrollTabBar(direction: 1 | -1) {
    if (!tabBarEl) return;
    tabBarEl.scrollBy({ left: direction * 160, behavior: "smooth" });
  }
</script>

{#if !showHorizontalTabs}
  {#if showOpenTabsBtn}
    <button
      class="icon-btn mobile-tab-drawer-btn"
      title={$t("topBar.openTabsList.title")}
      aria-label={$t("topBar.openTabsList.ariaLabel", { count: $tabs.length })}
      onclick={() => mobileTabDrawerOpen.set(true)}
    >
      <Icon name="tabs" size={16} />
      <span class="mobile-tab-count" data-count={$tabs.length} aria-hidden="true"></span>
    </button>
    {#if mobileActiveTab}
      <button
        class="tab active mobile-active-tab {mobileActiveTab.isScratchpad ? 'scratch' : 'daily'} {tabDateClass(mobileActiveTab, $currentDateISO)}"
        aria-label={$t("topBar.activeTabAriaLabel", { label: tabLabel(mobileActiveTab) })}
        onclick={() => mobileTabDrawerOpen.set(true)}
      >
        <span class="tab-icon" aria-hidden="true">
          <Icon name={mobileActiveTab.isScratchpad ? "tab-scratch" : "tab-daily"} size={13} />
        </span>
        <span class="tab-label">{tabLabel(mobileActiveTab)}</span>
      </button>
    {/if}
  {/if}
  <div class="tab-bar-spacer"></div>
  <button
    class="icon-btn"
    title={$t("topBar.newScratchpad.title", { combo: formatCombo(shortcutById('newScratchpad').combos[0]) })}
    onclick={controller.createScratchpad}
  >
    <Icon name="new-scratchpad" />
  </button>
{:else}
  {#if isOverflowing}
    <button
      class="icon-btn tab-scroll-btn"
      aria-label={$t("topBar.scrollTabsLeft")}
      disabled={!canScrollLeft}
      onclick={() => scrollTabBar(-1)}
    >
      <Icon name="chevron-left" size={14} />
    </button>
  {/if}
  <div
    id="tab-bar"
    role="tablist"
    aria-label={$t("topBar.openTabsList.ariaLabel", { count: displayTabs.length })}
    bind:this={tabBarEl}
    data-tauri-drag-region={isMergedTitlebar ? true : undefined}
    onscroll={updateScrollEdges}
  >
    {#each displayTabs as tab, i (tab.id)}
      {#if i > 0 && tab.isScratchpad && !displayTabs[i - 1].isScratchpad}
        <!-- §103: hairline between the daily-note group and the scratchpad group -->
        <div class="tab-group-divider" aria-hidden="true"></div>
      {/if}
      <div
        class="tab {tab.id === $activeTabId ? 'active' : ''} {tab.isScratchpad
          ? 'scratch'
          : 'daily'} {tabDateClass(tab, $currentDateISO)}"
        role="tab"
        tabindex="0"
        data-tab-id={tab.id}
        title={tab.isScratchpad ? undefined : tabLabel(tab)}
        aria-selected={tab.id === $activeTabId}
        onclick={() => controller.switchTab(tab.id)}
        ondblclick={() => tab.isScratchpad && startRenaming(tab)}
        oncontextmenu={(e) => onOpenContextMenu(e, tab)}
        onmousedown={(e) => {
          // Middle-click closes the tab (and suppress the autoscroll cursor).
          if (e.button === 1) {
            e.preventDefault();
            controller.requestTabClose(tab.id);
          }
        }}
        onkeydown={(e) => e.key === "Enter" && controller.switchTab(tab.id)}
      >
        {#if tab.isScratchpad}
          <span class="tab-icon" aria-hidden="true"><Icon name="tab-scratch" size={13} /></span>
        {:else}
          <!-- §B3: the past/today/future cue is this dot's colour -->
          <span class="tab-dot" aria-hidden="true"></span>
        {/if}
        {#if renamingTabId === tab.id}
          <input
            type="text"
            class="tab-rename-input"
            bind:this={renameInputEl}
            bind:value={renameInputVal}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                commitRename();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                cancelRename();
              }
            }}
            onblur={commitRename}
            onclick={(e) => e.stopPropagation()}
          />
        {:else}
          <span class="tab-label" class:friendly={!tab.isScratchpad && $tabLabelStyle === "friendly"}>{stripLabel(tab, $tabLabelStyle, $currentDateISO)}</span>
        {/if}
        {#if tab.isScratchpad && tab.content.trim() !== ""}
          <span class="tab-status-dot mem" title={$t("topBar.tabStatus.memoryOnly")}></span>
        {:else if tab.id === $activeTabId && $saveState === "error"}
          <span class="tab-status-dot err" title={$t("topBar.tabStatus.saveFailed")}></span>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="tab-close"
          aria-label={$t("topBar.closeTab")}
          onclick={(e) => {
            e.stopPropagation();
            controller.requestTabClose(tab.id);
          }}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") controller.requestTabClose(tab.id);
          }}
        >
          <Icon name="close" size={11} />
        </span>
      </div>
    {/each}
  </div>
  {#if isOverflowing}
    <button
      class="icon-btn tab-scroll-btn"
      aria-label={$t("topBar.scrollTabsRight")}
      disabled={!canScrollRight}
      onclick={() => scrollTabBar(1)}
    >
      <Icon name="chevron-right" size={14} />
    </button>
  {/if}
  <!-- §B2: the split + button sits right after the tabs, as a sibling of the scrollable
       #tab-bar rather than a child of it (§53), so it stays visible whatever the scroll
       position. + creates a scratchpad; the chevron opens the small "new" menu. -->
  <div class="tab-bar-split" bind:this={newSplitEl}>
    <button
      class="icon-btn tab-new-btn"
      data-keytip="N"
      title={$t("topBar.newScratchpad.title", { combo: formatCombo(shortcutById('newScratchpad').combos[0]) })}
      aria-label={$t("shortcuts.newScratchpad.label")}
      onclick={controller.createScratchpad}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
        <path d="M7 2.5v9M2.5 7h9" />
      </svg>
    </button>
    <button
      class="icon-btn tab-new-menu-btn"
      data-keytip="W"
      title={$t("topBar.newTabMenu")}
      aria-label={$t("topBar.newTabMenu")}
      aria-haspopup="menu"
      aria-expanded={newMenuOpen}
      onclick={onToggleNewMenu}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 3.5 5 6.5 8 3.5" />
      </svg>
    </button>
  </div>
{/if}

<style>
/* §B1: a window in the background dims its title bar, as Windows 11 does. */
:global(body.window-inactive #top-bar) .tab-label,
:global(body.window-inactive #top-bar) .icon-btn {
  color: var(--text-tertiary);
}

#tab-bar {
  display: flex;
  /* §B2: only as wide as its tabs (the + button then sits right after the last one);
     the drag gutter takes the rest. The side padding keeps the active tab's outward
     curves (§B3) from being clipped by the scroll container. */
  flex: 0 1 auto;
  min-width: 0;
  padding: 0 8px;
  height: 100%;
  /* Tabs sit on the floor of the bar so the active one meets the editor
     canvas below — the scrollbar is hidden and tabs scroll smoothly. */
  align-items: flex-end;
  overflow-x: auto;
  scrollbar-width: none;
}

#tab-bar::-webkit-scrollbar {
  height: 0;
}

.tab-bar-spacer {
  flex: 1;
}

.tab {
  flex-shrink: 0;
  padding: 0 10px 0 12px;
  /* #49: matches `#top-bar .icon-btn`'s height exactly. Both are
     bottom-anchored (`#tab-bar`'s and `#top-bar`'s `align-items:
     flex-end`), so equal heights are what makes their icons land on the
     same row — the two need to move together if either ever changes. */
  height: 32px;
  margin: 0 1px;
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--type-caption);
  cursor: pointer;
  background: transparent;
  color: var(--muted);
  white-space: nowrap;
}

.tab.daily .tab-label {
  font-family: var(--font-mono);
}

.tab:hover {
  background: var(--surface-raised);
  color: var(--text);
}

.tab-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0.7;
}

.tab.active .tab-icon {
  opacity: 1;
  color: var(--tab-active-border);
}

.tab.scratch .tab-label {
  font-style: italic;
}

.tab-group-divider {
  width: 1.5px;
  height: 20px;
  background: var(--edge-strong);
  flex-shrink: 0;
  /* #49: #tab-bar bottom-anchors its children (`align-items: flex-end`),
     same as the 32px tabs — this fixed-height (20px) sibling inherits
     that anchor too, so the extra 6px bottom margin (half of 32 - 20)
     centres it on the shared tab/icon-button row instead of sitting
     lower, flush with the very bottom. */
  margin: 0 7px 6px;
}

.tab-scroll-btn {
  flex-shrink: 0;
  padding: 0 6px;
}

.tab.active {
  background: var(--surface-canvas);
  color: var(--text);
  font-weight: 600;
  /* Bridge the 1px chrome border so the active tab reads as one surface
     with the editor below it. */
  position: relative;
  z-index: 1;
  margin-bottom: -1px;
}

.tab-close {
  opacity: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 5px;
  margin-left: 2px;
  border-radius: var(--radius-control);
  line-height: 1;
}

.tab:hover .tab-close,
.tab.active .tab-close,
.tab-close:focus-visible {
  opacity: 0.55;
}

.tab-close:hover,
.tab-close:focus-visible {
  opacity: 1 !important;
  background: var(--surface-raised);
}

.tab-rename-input {
  background: var(--surface-input, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--accent);
  border-radius: var(--radius-control);
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  padding: 1px 4px;
  margin: 0 -4px;
  outline: none;
  width: 110px;
  max-width: 140px;
}

/* The active tab, shown next to the drawer button so the date being edited is always visible. */

.tab.mobile-active-tab {
  flex: 0 1 auto;
  min-width: 0;
  border: none;
  font: inherit;
  font-size: var(--type-caption);
  margin: 0 0 0 4px;
}

.tab.mobile-active-tab .tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* #68: past/today/future get a distinct look, independent of which tab
   is active — so today's tab (the one most work happens in) is easy to
   spot among a restored session's leftover past tabs and any
   pre-created future ones, even while looking at a different tab.
   Deliberately just the icon's color/opacity, not the label — quiet
   enough not to fight the existing active/hover treatment. */

.tab:global(.past) .tab-icon {
  opacity: 0.45;
}

.tab:global(.today) .tab-icon {
  opacity: 1;
  color: var(--tab-active-border);
}

.tab:global(.future) .tab-icon {
  opacity: 1;
  color: var(--state-ok);
}

/* The desktop strip's active tab has no top accent line (§B3); the phone's chip keeps it. */

.tab.mobile-active-tab.active {
  box-shadow: inset 0 2px 0 var(--tab-active-border);
}

/* #96: `.tab.mobile-active-tab.active`'s top border (above) defaults to `--tab-active-border`,
   the same color `.tab.today .tab-icon` already uses — so a selected
   today-tab needs no override. A selected past/future tab's border is
   brought in line with its own icon's color above, instead of always
   showing the "today" accent regardless of which tab is actually active. */

.tab.mobile-active-tab.active:global(.past) {
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--muted) 45%, transparent);
}

.tab.mobile-active-tab.active:global(.future) {
  box-shadow: inset 0 2px 0 var(--state-ok);
}

/* §B3: Notepad-style tabs in the desktop strip — 8px top corners, 108–200px wide, the label
   truncates. (The phone's `.mobile-active-tab` chip keeps its flatter look.) */

#tab-bar .tab {
  position: relative;
  min-width: 108px;
  max-width: 200px;
  margin: 0;
  padding: 0 8px 0 10px;
  border-radius: 8px 8px 0 0;
}

#tab-bar .tab .tab-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ISO dates stay monospace; friendly names use the UI font. */

.tab.daily .tab-label.friendly {
  font-family: inherit;
}

/* The active tab is outlined on top and both sides (Windows 11 style): the canvas colour it shares with the
   note is too close to the title bar's to find it by fill alone (Marien, after §335). */

#tab-bar .tab.active {
  border: 1px solid var(--edge-strong);
  border-bottom: none;
}

/* No outward curves at the active tab's base any more: with the outline (§339) and Mica's see-through title bar they
   showed as dark wedges beside the tab (Marien, 2026-10-10). The outlined tab sits square on the note. */

/* A hairline between two neighbouring inactive tabs, so a row of dates is easy to scan. */

#tab-bar .tab:not(.active) + .tab:not(.active)::before {
  content: "";
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 1px;
  background: var(--edge-strong);
}

/* The past/today/future cue: a 6px dot before the label (grey, accent, green) instead of an icon colour. */

.tab-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--text-tertiary);
}

.tab:global(.today) .tab-dot {
  background: var(--tab-active-border);
}

.tab:global(.future) .tab-dot {
  background: var(--state-ok);
}
</style>
