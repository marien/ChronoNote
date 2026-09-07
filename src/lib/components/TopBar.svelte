<script module lang="ts">
  // Re-entrance guards for `settleLayout`/`scrollActiveTabIntoView` live
  // here, in the module scope, rather than as ordinary component `let`s —
  // see the long comment on `settling` below for why. There's only ever
  // one `TopBar` instance, so module-level (shared across instances, in
  // principle) is fine in practice.
  let settling = false;
  // Set when `settleLayout` is asked to run again while already mid-flight
  // (awaiting a frame) — rather than dropping that request, the in-flight
  // call loops once more before releasing `settling`, so the tab list's
  // *final* state always gets evaluated instead of whatever it was
  // partway through a burst of changes (e.g. closing several tabs in
  // quick succession: each closes triggers its own `tabs` store update,
  // and without this, only the geometry at the moment of the first one to
  // actually run would ever get measured — every later one arriving
  // before that finishes was simply discarded, no matter how much the
  // list changed after). Confirmed as the cause of a real regression:
  // closing tabs down to way more room than needed still never brought
  // the labels back, because the one settle that actually ran had done so
  // before all the closes had landed, and nothing was left to ask again.
  let settlePending = false;
  let scrollIntoViewToken = 0;
</script>

<script lang="ts">
  import { onMount } from "svelte";
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
   * for. Re-run whenever the window resizes or the tab list changes.
   *
   * §56 fixed one cause of the labels flickering on/off forever (Svelte
   * re-rendering on every assignment even when reassigning the exact same
   * value) by skipping writes that don't actually change anything — but
   * it reappeared on a display where the fit boundary sits close enough
   * to a whole pixel that `scrollWidth`/`clientWidth` (both figures
   * Chromium rounds to a device pixel under non-100% display scaling) can
   * land on either side of it from one measurement to the next, even with
   * nothing meaningfully different about the layout. §56's guard only
   * helps when the *decision* comes out identical; it does nothing when
   * the measurement itself is genuinely noisy right at the line — every
   * call would still flip the actual value back and forth forever.
   *
   * Starting fresh from "try labels on" on every call (the old approach)
   * is what makes that noise visible: right at the boundary, one call's
   * rounding says "fits" and turns labels on, the next says "doesn't" and
   * turns them off, disagreeing with itself every time it's asked from
   * scratch. Deciding from the *current* state instead, and requiring the
   * measurement to clear a small margin — not just barely cross the exact
   * line — before flipping either direction, means a measurement
   * wobbling by a pixel or two can no longer flip the decision on its
   * own; it takes a real, clearly-more-than-noise change in available
   * width to do that.
   *
   * The "was off, does it now fit with labels?" branch can't use
   * `scrollWidth` for that check, though, even with a margin —
   * `scrollWidth` is defined as never less than `clientWidth` (an
   * element with room to spare reports them as *equal*, not the
   * content's actual, smaller width), so "how much spare room is there"
   * isn't something `scrollWidth`/`clientWidth` can answer at all once
   * content fits; only "is it overflowing, and by how much" is. Using it
   * anyway made `scrollWidth > clientWidth - FIT_MARGIN` true essentially
   * always whenever content fit (`clientWidth > clientWidth - 8` doesn't
   * depend on the content), reverting labels the instant they were
   * tried — a real regression (labels stopped appearing at all, even
   * closing tabs down to one with plenty of room left) traced to exactly
   * this. `tabsContentWidth()` sums the tabs' own rendered widths
   * instead, which isn't floored the same way and actually shrinks when
   * there's less content, however comfortably it fits. */
  function tabsContentWidth(): number {
    let w = 0;
    for (const child of tabBarEl.children) w += (child as HTMLElement).offsetWidth;
    return w;
  }

  const FIT_MARGIN = 8;
  async function settleLayout() {
    if (!tabBarEl) return;
    if (settling) {
      settlePending = true;
      return;
    }
    settling = true;
    try {
      do {
        settlePending = false;
        if (!$chromeExpanded) {
          if (showActionLabels) showActionLabels = false;
        } else if (showActionLabels) {
          // Labels are currently showing — only hide them if clearly too
          // tight, not just a hair over the line. Overflow (unlike "does
          // it comfortably fit") is exactly what `scrollWidth` answers
          // correctly, margin included.
          if (tabBarEl.scrollWidth > tabBarEl.clientWidth + FIT_MARGIN) {
            showActionLabels = false;
            await nextFrame();
          }
        } else {
          // Icon-only currently — try labels, but only keep them if
          // there's clearly enough spare room once they're shown, not
          // just barely.
          showActionLabels = true;
          await nextFrame();
          if (tabsContentWidth() > tabBarEl.clientWidth - FIT_MARGIN) {
            showActionLabels = false;
            await nextFrame();
          }
        }
        const nowOverflowing = tabBarEl.scrollWidth > tabBarEl.clientWidth;
        if (nowOverflowing !== isOverflowing) isOverflowing = nowOverflowing;
        // If another call came in while the above was awaiting a frame,
        // loop once more on the now-current state instead of returning
        // with it unevaluated.
      } while (settlePending);
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
    // `el.offsetLeft` is relative to its nearest *positioned* ancestor, not
    // necessarily to `tabBarEl` — nothing here sets `position`, so that
    // ancestor ends up being further out than `tabBarEl` and its offset
    // includes the left scroll-arrow button's width whenever the arrows
    // are showing. That threw this off by exactly the arrow's width,
    // leaving the leftmost tab still partly hidden behind it after
    // scrolling "all the way left". `getBoundingClientRect()` differences
    // aren't affected by any of that — they give the element's position
    // relative to `tabBarEl`'s own scrollable content directly.
    const tabBarRect = tabBarEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elLeft = elRect.left - tabBarRect.left + tabBarEl.scrollLeft;
    const elRight = elRect.right - tabBarRect.left + tabBarEl.scrollLeft;
    if (elLeft < tabBarEl.scrollLeft) {
      tabBarEl.scrollLeft = elLeft;
    } else if (elRight > tabBarEl.scrollLeft + tabBarEl.clientWidth) {
      tabBarEl.scrollLeft = elRight - tabBarEl.clientWidth;
    }
  }

  // §55/§56/§60/§61 each fixed a real cause of the same underlying bug
  // (the top bar's labels flickering on/off, sometimes forever) and each
  // time it came back — most recently reported still happening on *middle*
  // tabs too, not just tabs near either end, pointing squarely at
  // `scrollActiveTabIntoView` (the code that scrolls the tab strip itself
  // to follow the active tab) rather than only `settleLayout`. Every
  // attempt so far treated the symptom where it showed up (a retrigger via
  // `tick()`, then via any reactive write, then via calling the function
  // directly from a `$:` block at all — `queueMicrotask` was supposed to
  // fully sever that) without eliminating the actual channel: both
  // functions are `async`, awaiting a frame partway through, and were
  // being *invoked from* `$:` reactive statements — Svelte 5's fine-
  // grained, signal-based reactivity, unlike Svelte 4's static dependency
  // analysis, tracks a `$:` block's dependencies by what it *actually
  // touches* while running, and apparently that tracking can still
  // misattribute a write in an awaited continuation back to the
  // originating block even when the call itself was deferred to a
  // microtask — a subtlety of Svelte 5's implementation, not something
  // confirmed from its source, but consistent with every partial fix
  // simply moving the boundary rather than removing it.
  //
  // Store subscriptions are not `$:` blocks at all — Svelte 3/4's older,
  // plain callback-based pub/sub, predating and unrelated to the signals
  // engine — so a write inside a subscription callback (or inside
  // something it awaits) has no reactive statement to ever be attributed
  // back to. Using `tabs.subscribe`/`chromeExpanded.subscribe`/
  // `activeTabId.subscribe` directly here, instead of `$:` blocks that
  // call these same functions, removes the retrigger channel entirely
  // rather than papering over wherever it was last observed.
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

    // `.subscribe()` fires immediately with the current value, so this
    // also covers the very first settle/scroll — no separate initial call
    // needed. `tabs` covers `displayTabs` (derived from it) too; nothing
    // here needs its own subscription just for that.
    const unsubTabs = tabs.subscribe(() => settleLayout());
    const unsubChrome = chromeExpanded.subscribe(() => settleLayout());
    const unsubActive = activeTabId.subscribe(() => scrollActiveTabIntoView());

    return () => {
      resizeObserver?.disconnect();
      unsubTabs();
      unsubChrome();
      unsubActive();
    };
  });
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
    <span class="icon-glyph">📅</span>{#if showActionLabels}<span class="icon-label"> Date</span>{/if}
  </button>
  <button class="icon-btn" title="Action Drawer (Ctrl+Shift+A)" on:click={controller.openActionDrawer}>
    <span class="icon-glyph">📋</span>{#if showActionLabels}<span class="icon-label"> My Actions</span>{/if}
  </button>
  <button class="icon-btn" title="Section History (Ctrl+Shift+H)" on:click={controller.openMeetingHistory}>
    <span class="icon-glyph">🕒</span>{#if showActionLabels}<span class="icon-label"> Section History</span>{/if}
  </button>
  <button class="icon-btn" title="Cross-Tab Search (Ctrl+Shift+F)" on:click={controller.openCrossTabSearch}>
    <span class="icon-glyph">🔎</span>{#if showActionLabels}<span class="icon-label"> Search</span>{/if}
  </button>
  <button class="icon-btn" title="Import Sections (Ctrl+Shift+I)" on:click={controller.openSectionImport}>
    <span class="icon-glyph">📥</span>{#if showActionLabels}<span class="icon-label"> Import</span>{/if}
  </button>
  {#if activeTab?.isScratchpad}
    <button
      class="icon-btn"
      title="Promote scratchpad into today's note"
      on:click={() => controller.promoteScratchpad(activeTab.id)}
    >
      <span class="icon-glyph">⬆</span>{#if showActionLabels}<span class="icon-label"> Promote</span>{/if}
    </button>
  {/if}
  <button class="icon-btn" title="Settings (Ctrl+,)" on:click={controller.openSettings}>
    <span class="icon-glyph">⚙</span>{#if showActionLabels}<span class="icon-label"> Settings</span>{/if}
  </button>
  <button class="icon-btn" title="About ChronoNote (Ctrl+Shift+,)" on:click={controller.openAbout}>
    <span class="icon-glyph">ℹ️</span>{#if showActionLabels}<span class="icon-label"> About</span>{/if}
  </button>
</div>
