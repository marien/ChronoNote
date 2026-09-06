<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as controller from "../controller";
  import { activeTabId, chromeExpanded, tabs } from "../controller";

  let topBarEl: HTMLDivElement;
  let tabBarEl: HTMLDivElement;
  let showActionLabels = false;
  // §52: whether the tab bar is overflowing at all — drives whether the
  // scroll arrows show. Deliberately *not* derived from scroll position
  // (the way `canScrollLeft`/`canScrollRight` used to work) — that made
  // an arrow disappear once you'd scrolled all the way in that direction,
  // which is the opposite of what's wanted now: both arrows stay visible
  // the whole time the bar is overflowing, and clicking one at an edge
  // wraps to the other end instead of the arrow just vanishing.
  let isOverflowing = false;
  let settling = false;
  let resizeObserver: ResizeObserver | null = null;

  $: activeTab = $tabs.find((t) => t.id === $activeTabId);
  $: displayTabs = controller.sortedTabsForDisplay($tabs);

  /** Waits for the next paint frame — used instead of Svelte's own `tick()`
   * everywhere below. `tick()` resolves via Svelte's reactive scheduler,
   * and awaiting it inside a function invoked from a `$:` reactive
   * statement (as both `settleLayout` and `scrollActiveTabIntoView` are)
   * hands control back to that same scheduler on resume — which can decide
   * the originating statement is still "active" and re-run it, and if the
   * resumed code does anything that looks like more reactive work, this
   * repeats forever. That was the cause of a real hard freeze here: with
   * `scrollActiveTabIntoView` using `await tick()`, switching tabs could
   * lock up the whole window (unresponsive to clicks and shortcuts) —
   * confirmed by swapping this one call for `requestAnimationFrame`, which
   * sits outside Svelte's scheduler entirely and doesn't retrigger it.
   * Still gives a render pass to wait for (needed so a *newly created*
   * tab's element exists in the DOM before code below tries to measure or
   * scroll to it), just via the browser's own frame clock instead. */
  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
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
      await nextFrame();
      if (showActionLabels && tabBarEl.scrollWidth > tabBarEl.clientWidth) {
        showActionLabels = false;
        await nextFrame();
      }
      isOverflowing = tabBarEl.scrollWidth > tabBarEl.clientWidth;
    } finally {
      settling = false;
    }
  }

  /** §52: once overflowing, scrolling past an edge wraps to the other end
   * — the same cyclic behavior `Ctrl+Tab`/`Ctrl+Shift+Tab` already has for
   * switching tabs, just applied to scroll position. */
  function scrollTabBar(direction: 1 | -1) {
    if (!tabBarEl) return;
    const maxScroll = tabBarEl.scrollWidth - tabBarEl.clientWidth;
    const atLeftEdge = tabBarEl.scrollLeft <= 0;
    const atRightEdge = tabBarEl.scrollLeft >= maxScroll - 1;
    if (direction === -1 && atLeftEdge) {
      tabBarEl.scrollTo({ left: maxScroll, behavior: "smooth" });
    } else if (direction === 1 && atRightEdge) {
      tabBarEl.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      tabBarEl.scrollBy({ left: direction * 160, behavior: "smooth" });
    }
  }

  /** §48: switching tabs (keyboard, Date picker, Search, etc.) can move
   * the active tab off-screen with nothing but the (now-invisible)
   * highlight to show it happened — scroll it into view whenever it
   * changes. Waits a frame first since a *newly created* tab (a fresh
   * scratchpad, a just-opened dated file) needs a render pass before its
   * element exists in the DOM to scroll to. */
  let scrollIntoViewToken = 0;

  async function scrollActiveTabIntoView() {
    const token = ++scrollIntoViewToken;
    const targetTabId = $activeTabId;
    await nextFrame();
    // Bail if another call started (or the active tab changed again) while
    // this one was waiting — holding Ctrl+Tab fires this on every repeat
    // keystroke, and without this guard the stale calls still run to
    // completion afterwards and can yank the scroll position back.
    if (token !== scrollIntoViewToken || $activeTabId !== targetTabId) return;
    if (!tabBarEl) return;
    const el = tabBarEl.querySelector<HTMLElement>(`[data-tab-id="${targetTabId}"]`);
    if (!el) return;
    const elLeft = el.offsetLeft;
    const elRight = elLeft + el.offsetWidth;
    if (elLeft < tabBarEl.scrollLeft) {
      tabBarEl.scrollLeft = elLeft;
    } else if (elRight > tabBarEl.scrollLeft + tabBarEl.clientWidth) {
      tabBarEl.scrollLeft = elRight - tabBarEl.clientWidth;
    }
  }

  onMount(() => {
    // Observe the outer row, not `tabBarEl` itself: `settleLayout()` (which
    // this observer calls) toggles the action-button labels, the scroll
    // arrows, and the Promote button — all siblings of `#tab-bar` that live
    // inside `#top-bar`. Toggling them changes how much room is left for
    // `#tab-bar`, which would change `tabBarEl`'s own size too — observing
    // `#top-bar` instead avoids retriggering this observer as a side effect
    // of its own layout decisions. `#top-bar`'s width is driven only by the
    // window, never by its own children's reflow.
    resizeObserver = new ResizeObserver(() => settleLayout());
    resizeObserver.observe(topBarEl);
    settleLayout();
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });

  $: {
    void $chromeExpanded;
    void displayTabs;
    if (tabBarEl) settleLayout();
  }

  $: if (tabBarEl) {
    void $activeTabId;
    scrollActiveTabIntoView();
  }
</script>

<div id="top-bar" bind:this={topBarEl}>
  {#if isOverflowing}
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
        data-tab-id={tab.id}
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
  </div>
  {#if isOverflowing}
    <button class="icon-btn tab-scroll-btn" aria-label="Scroll tabs right" on:click={() => scrollTabBar(1)}
      >›</button
    >
  {/if}
  <!-- §53: always visible regardless of tab-bar scroll position — a
       sibling of the scrollable #tab-bar rather than a child of it (the
       same reason the scroll arrows themselves live out here). -->
  <button class="icon-btn tab-bar-new-btn" title="New Scratchpad (Ctrl+N)" on:click={controller.createScratchpad}>
    ＋
  </button>
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
