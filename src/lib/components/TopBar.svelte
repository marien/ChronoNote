<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import * as controller from "../controller";
  import { activeTabId, chromeExpanded, tabs } from "../controller";

  let tabBarEl: HTMLDivElement;
  let showActionLabels = false;
  let canScrollLeft = false;
  let canScrollRight = false;
  let settling = false;
  let resizeObserver: ResizeObserver | null = null;

  $: activeTab = $tabs.find((t) => t.id === $activeTabId);
  $: displayTabs = controller.sortedTabsForDisplay($tabs);

  function updateScrollState() {
    if (!tabBarEl) return;
    canScrollLeft = tabBarEl.scrollLeft > 0;
    canScrollRight = tabBarEl.scrollLeft + tabBarEl.clientWidth < tabBarEl.scrollWidth - 1;
  }

  /** Priority order when space is tight: (1) full screen + everything fits
   * → show action-button labels; (2) doesn't fit with labels shown → drop
   * back to icon-only first, reclaiming the space the labels used; (3)
   * still doesn't fit even icon-only → that's when the scroll arrows are
   * for. Re-run whenever the window resizes or the tab list changes. */
  async function settleLayout() {
    if (!tabBarEl || settling) return;
    settling = true;
    try {
      showActionLabels = $chromeExpanded;
      await tick();
      if (showActionLabels && tabBarEl.scrollWidth > tabBarEl.clientWidth) {
        showActionLabels = false;
        await tick();
      }
      updateScrollState();
    } finally {
      settling = false;
    }
  }

  function scrollTabBar(direction: 1 | -1) {
    tabBarEl?.scrollBy({ left: direction * 160, behavior: "smooth" });
  }

  onMount(() => {
    resizeObserver = new ResizeObserver(() => settleLayout());
    resizeObserver.observe(tabBarEl);
    tabBarEl.addEventListener("scroll", updateScrollState);
    settleLayout();
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    tabBarEl?.removeEventListener("scroll", updateScrollState);
  });

  $: {
    void $chromeExpanded;
    void displayTabs;
    if (tabBarEl) settleLayout();
  }
</script>

<div id="top-bar">
  {#if canScrollLeft}
    <button class="icon-btn tab-scroll-btn" aria-label="Scroll tabs left" on:click={() => scrollTabBar(-1)}
      >‹</button
    >
  {/if}
  <div id="tab-bar" bind:this={tabBarEl}>
    {#each displayTabs as tab (tab.id)}
      <div
        class="tab {tab.id === $activeTabId ? 'active' : ''}"
        role="tab"
        tabindex="0"
        aria-selected={tab.id === $activeTabId}
        on:click={() => controller.switchTab(tab.id)}
        on:keydown={(e) => e.key === "Enter" && controller.switchTab(tab.id)}
      >
        <span>{tab.filename}{tab.isScratchpad ? " *" : ""}</span>
        <span
          class="tab-close"
          role="button"
          tabindex="0"
          aria-label="Close tab"
          on:click|stopPropagation={() => controller.requestTabClose(tab.id)}
          on:keydown|stopPropagation={(e) => e.key === "Enter" && controller.requestTabClose(tab.id)}
          >✕</span
        >
      </div>
    {/each}
    <button class="icon-btn tab-bar-new-btn" title="New Scratchpad (Ctrl+N)" on:click={controller.createScratchpad}>
      ＋
    </button>
  </div>
  {#if canScrollRight}
    <button class="icon-btn tab-scroll-btn" aria-label="Scroll tabs right" on:click={() => scrollTabBar(1)}
      >›</button
    >
  {/if}
  <button class="icon-btn" title="Open Date Note (Ctrl+O)" on:click={controller.openDatePicker}>
    📅{#if showActionLabels}<span class="icon-label"> Date</span>{/if}
  </button>
  <button class="icon-btn" title="Action Drawer (Ctrl+Shift+A)" on:click={controller.openActionDrawer}>
    📋{#if showActionLabels}<span class="icon-label"> My Actions</span>{/if}
  </button>
  <button class="icon-btn" title="Section History (Ctrl+Shift+H)" on:click={controller.openMeetingHistory}>
    🕒{#if showActionLabels}<span class="icon-label"> Section History</span>{/if}
  </button>
  <button class="icon-btn" title="Cross-Tab Search (Ctrl+Shift+F)" on:click={controller.openCrossTabSearch}>
    🔎{#if showActionLabels}<span class="icon-label"> Search</span>{/if}
  </button>
  <button class="icon-btn" title="Import Sections (Ctrl+Shift+I)" on:click={controller.openSectionImport}>
    📥{#if showActionLabels}<span class="icon-label"> Import</span>{/if}
  </button>
  {#if activeTab?.isScratchpad}
    <button
      class="icon-btn"
      title="Promote scratchpad into today's note"
      on:click={() => controller.promoteScratchpad(activeTab.id)}
    >
      ⬆{#if showActionLabels}<span class="icon-label"> Promote</span>{/if}
    </button>
  {/if}
  <button class="icon-btn" title="Settings (Ctrl+,)" on:click={controller.openSettings}>
    ⚙{#if showActionLabels}<span class="icon-label"> Settings</span>{/if}
  </button>
</div>
