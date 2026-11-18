<script module lang="ts">
  import { writable } from "svelte/store";

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
  // #61: carries the `allowUpgrade` argument (see `settleLayout`) forward
  // into the loop's *next* iteration when a call arrives mid-settle —
  // ORed together so one genuine widen among several coalesced calls still
  // gets its upgrade attempt, the same "don't drop it, fold it in" idea
  // `settlePending` already applies to re-running at all.
  let settlePendingAllowUpgrade = false;
  let scrollIntoViewToken = 0;
  let unmounted = false;
  let maxBtnEl = $state<HTMLButtonElement>();
  /** Whether the command buttons are folded into More right now (§B2) — `MoreActionsModal`
   * lists them above Settings and the rest while this is true. Written only by `TopBar`. */
  export const commandsCollapsed = writable(false);
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { wireSnapOverlay } from "../snapOverlay";
  import * as controller from "../controller";
  import {
    activeTabId,
    agendaFileExists,
    backendKind,
    calendarSyncEnabled,
    calendarSyncHasDiff,
    chromeExpanded,
    currentDateISO,
    isMobile,
    oneDriveAccount,
    oneDriveFolder,
    tabLabelStyle,
    tabs,
  } from "../controller";

  import { devBuild } from "../stores";
  import Icon from "../icons/Icon.svelte";
  import AppIcon from "./AppIcon.svelte";
  import { formatShortcut } from "../shortcuts";
  import { t } from "../i18n";
  import TabStrip from "./topbar/TabStrip.svelte";
  import NewMenu from "./topbar/NewMenu.svelte";
  import TabContextMenu from "./topbar/TabContextMenu.svelte";
  import {
    COMMAND_GAP,
    FIT_MARGIN,
    GUTTER_MIN,
    TAB_BAR_PADDING,
    TAB_EDGE_PEEK,
    layoutSignature,
    nextFrame,
    rectWidth,
  } from "./topbar/topbarHelpers";

  // §merged-titlebar: the app icon, drag regions, and window-control
  // buttons only make sense when this frontend is actually running inside
  // a real (decorationless) Tauri window — the demo and web app have no
  // OS window at all (an iframe / a browser tab), so they keep the plain
  // top bar. `backendKind === "desktop"` also covers the `?mock` dev/test
  // harness, which *does* run against a real (decorated) browser tab, not
  // a Tauri window — but rendering this chrome there is harmless (the
  // buttons just call mocked Tauri APIs, same as every other
  // `getCurrentWindow()` call already exercised under the mock) and lets
  // the whole thing be covered by the existing Playwright suite.
  const isMergedTitlebar = $derived($backendKind === "desktop");

  let topBarEl: HTMLDivElement;
  let tabBarEl = $state<HTMLDivElement>();
  // #56: once the tab strip has too little room, the secondary command
  // buttons (Actions/History/Search/Sync calendar/Promote) collapse into the
  // always-present "More" button — `MoreActionsModal`, which lists them above
  // Settings and the rest while this is set. Date and the + button stay pinned
  // regardless; see `settleLayout` for how this is decided. About moved to the
  // status bar (#58) and is now also in More.
  let buttonsCollapsed = $state(false);
  // §52: whether the tab bar is overflowing at all — drives whether the
  // scroll arrows show. Both arrows stay visible the whole time the bar is
  // overflowing; §392: an arrow is disabled (greyed) once the first or last
  // tab is fully in view, instead of wrapping to the other end.
  let isOverflowing = $state(false);
  let resizeObserver: ResizeObserver | null = null;

  // #61 follow-up: refs into the off-screen measurement clones below —
  // see the big comment on that markup, and on `predictUncollapseWouldFit`,
  // for why these exist at all.
  let cloneActionsEl: HTMLElement;
  let cloneHistoryEl: HTMLElement;
  let cloneSearchEl: HTMLElement;
  let cloneCalendarSyncEl = $state<HTMLElement>();
  let clonePromoteEl = $state<HTMLElement>();
  // The flexible drag gutter after the + button: whatever it has beyond its minimum is spare room.
  let gutterEl = $state<HTMLElement>();
  let newSplitEl = $state<HTMLDivElement>();
  let newMenuOpen = $state(false);
  let tabStripRef = $state<TabStrip>();
  let newMenuRef = $state<NewMenu>();
  let contextMenuRef = $state<TabContextMenu>();

  // The horizontal tab strip is replaced by the tabs-drawer button on
  // touch-first devices only — NOT by window width: a narrow desktop/web
  // window keeps the strip (#56's collapse-into-More logic measures it).
  const showHorizontalTabs = $derived(!$isMobile);
  // On a phone the top bar carries the drawer button and the active tab's date, so
  // there's no room for the whole button row: the secondary buttons live in "More".
  $effect.pre(() => {
    if (!showHorizontalTabs) buttonsCollapsed = true;
  });
  $effect.pre(() => {
    commandsCollapsed.set(buttonsCollapsed);
  });

  const activeTab = $derived($tabs.find((t) => t.id === $activeTabId));
  // The button itself only ever appears once turned on in Settings — an
  // opt-in feature that reads an external file, not something to dangle
  // in front of everyone by default. `.agenda.json` is a file in the
  // desktop notes folder — the web app has no such folder (IndexedDB-
  // backed, no filesystem) to read one from, so it's excluded regardless
  // of the setting.
  const calendarSyncVisible = $derived(
    $calendarSyncEnabled && ($backendKind !== "web" || (!!$oneDriveAccount && !!$oneDriveFolder)),
  );
  // Grayed out (not hidden) rather than gated on visibility: today-or-
  // later, same restriction every dated action shares, and the agenda
  // file has to actually exist to be worth trying.
  const calendarSyncReady = $derived(
    !!activeTab && !activeTab.isScratchpad && activeTab.filename.slice(0, 10) >= $currentDateISO && $agendaFileExists,
  );
  const displayTabs = $derived(controller.sortedTabsForDisplay($tabs));

  /** Priority order when space is tight: (1) everything fits → nothing to do;
   * (2) the tab strip overflows → collapse the secondary command buttons into
   * "More" (#56), reclaiming their space for the tabs; (3) still overflowing
   * (many, many tabs) → that's when the scroll arrows are for. Re-run whenever
   * the window resizes or the tab list changes (in a way that can actually
   * affect this — see `layoutSignature` below).
   *
   * §B2 dropped the button labels (and with them the first tier): every command
   * is icon-only and its tooltip carries the name and shortcut.
   *
   * §56 fixed one cause of the layout flickering on/off forever (Svelte
   * re-rendering on every assignment even when reassigning the exact same
   * value) by skipping writes that don't actually change anything — but it
   * reappeared on a display where the fit boundary sits close enough to a whole
   * pixel that `scrollWidth`/`clientWidth` (both figures Chromium rounds to a
   * device pixel under non-100% display scaling) can land on either side of it
   * from one measurement to the next, even with nothing meaningfully different
   * about the layout. Deciding from the *current* state, and requiring the
   * measurement to clear a small margin (`FIT_MARGIN`) before flipping either
   * direction, means a measurement wobbling by a pixel or two can no longer flip
   * the decision on its own; it takes a real, clearly-more-than-noise change in
   * available width to do that.
   *
   * The "was collapsed, does it fit uncollapsed now?" branch can't use
   * `scrollWidth` for that check, though — `scrollWidth` is defined as never
   * less than `clientWidth` (an element with room to spare reports them as
   * *equal*, not the content's actual, smaller width), so "how much spare room is
   * there" isn't something `scrollWidth`/`clientWidth` can answer at all once
   * content fits; only "is it overflowing, and by how much" is.
   * `tabsContentWidth()` sums the tabs' own rendered widths instead, which isn't
   * floored the same way and actually shrinks when there's less content,
   * however comfortably it fits. */
  function tabsContentWidth(): number {
    if (!tabBarEl) return 0;
    let w = TAB_BAR_PADDING;
    for (const child of tabBarEl.children) w += (child as HTMLElement).offsetWidth;
    return w;
  }

  /** `#tab-bar` is only as wide as its tabs (the drag gutter takes the rest), so its own
   * `clientWidth` is no longer "all the room the tabs could have". The room is its width plus
   * whatever the gutter has beyond its minimum. */
  function tabAreaWidth(): number {
    if (!tabBarEl) return 0;
    return tabBarEl.clientWidth + Math.max(0, rectWidth(gutterEl) - GUTTER_MIN);
  }

  /** #61 follow-up: `settleLayout`'s upgrade attempt used to unconditionally flip
   * `buttonsCollapsed` to measure a tier that isn't currently rendered, then revert if it
   * turned out not to fit — the `allowUpgrade` gate below cut how *often* that ran, but every
   * attempt that still fired painted one real frame of the wider tier before reverting
   * (Svelte's DOM patch for the trial value lands via a microtask, which always resolves
   * *before* the next `requestAnimationFrame` this function awaits — so the browser paints the
   * trial state at least once, guaranteed, whenever a revert happens). Predicting the outcome
   * first — using off-screen clones that are never part of the visible layout at all — means
   * the live state only ever gets set to values already known to fit, so the
   * flip-and-measure-and-maybe-revert code below stays as a safety net (kept, in case a
   * prediction is ever off by a pixel) rather than the routine path. This answers "if the
   * collapsed buttons came back right now, would the tab strip still fit?" and is only
   * meaningful (and only ever called) while `buttonsCollapsed` is true, since that's the only
   * state where the real buttons don't exist in the DOM to measure directly. "More" stays in
   * the row either way, so only the clones' widths are added. */
  function predictUncollapseWouldFit(): boolean {
    if (!tabBarEl) return false;
    const clones: (HTMLElement | undefined)[] = [cloneActionsEl, cloneHistoryEl, cloneSearchEl];
    if (calendarSyncVisible) clones.push(cloneCalendarSyncEl);
    if (activeTab?.isScratchpad) clones.push(clonePromoteEl);
    let delta = 0;
    for (const clone of clones) delta += rectWidth(clone) + COMMAND_GAP;
    return tabsContentWidth() <= tabAreaWidth() - delta - FIT_MARGIN;
  }
  /** #61: an upgrade attempt (collapsed → uncollapsed) unconditionally flips the state to test
   * it, which is the only way to measure a tier that isn't currently rendered — but doing that
   * on *every* call, including ones triggered by the window getting *narrower*, flashes the
   * wider tier on screen for a frame before reverting it, every single time, for the entire
   * duration of a drag that's only ever making things tighter. `allowUpgrade` gates those
   * attempts on there being an actual reason to think a wider tier might fit now — the
   * `ResizeObserver` below passes `true` only when `#top-bar` just got *wider* than the last
   * time it measured; the `tabs.subscribe` path (closing/renaming a tab can free room without
   * `#top-bar` itself resizing at all) always passes `true`, since that path fires far less
   * often than a continuous drag ever could. The *downgrade* check (already-showing buttons
   * found to no longer fit) is never gated — shrinking must always be able to react. */
  async function settleLayout(allowUpgrade = true) {
    if (!tabBarEl) return;
    if (settling) {
      settlePending = true;
      settlePendingAllowUpgrade ||= allowUpgrade;
      return;
    }
    settling = true;
    try {
      // `tabs.subscribe` fires synchronously on `.set()` — Svelte's own DOM
      // patch for whatever just changed (a new tab's `{#each}` entry, say)
      // lands on a separate scheduled pass, not necessarily before this
      // callback runs. Measuring immediately here read stale layout (the
      // *previous* tab count's width) often enough to matter: nothing else
      // re-triggers a settle afterward (the `ResizeObserver` below
      // deliberately watches `#top-bar`, not `#tab-bar`, so a tab being
      // added — which doesn't change `#top-bar`'s own width — never fires
      // it), so a stale first read stayed stale until the next real window
      // resize. One frame is enough for Svelte's patch to land, the same
      // wait already used everywhere else in this function for the same
      // "let the DOM catch up" reason.
      await nextFrame();
      do {
        settlePending = false;
        // #56: decide from the current state, with the margin discipline described above.
        if (!buttonsCollapsed) {
          if (tabBarEl.scrollWidth > tabBarEl.clientWidth + FIT_MARGIN) {
            buttonsCollapsed = true;
            await nextFrame();
          }
        } else if (allowUpgrade && predictUncollapseWouldFit()) {
          buttonsCollapsed = false;
          await nextFrame();
          // Safety net in case a prediction was ever off by a pixel — not the
          // routine path, see `predictUncollapseWouldFit`.
          if (tabBarEl.scrollWidth > tabBarEl.clientWidth + FIT_MARGIN) {
            buttonsCollapsed = true;
            await nextFrame();
          }
        }

        const nowOverflowing = tabBarEl.scrollWidth > tabBarEl.clientWidth;
        if (nowOverflowing !== isOverflowing) isOverflowing = nowOverflowing;
        tabStripRef?.updateScrollEdges();
        // If another call came in while the above was awaiting a frame,
        // loop once more on the now-current state instead of returning
        // with it unevaluated — using whatever `allowUpgrade` that (or any
        // other) pending call arrived with, not necessarily this one's.
        allowUpgrade = settlePendingAllowUpgrade;
        settlePendingAllowUpgrade = false;
      } while (settlePending);
    } catch (e) {
      // The bar can go away between two awaited frames (on a phone the app
      // swaps it for MobileAppBar, §D2); measuring a removed element is not
      // an error worth surfacing then.
      if (!unmounted) throw e;
    } finally {
      settling = false;
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
    // §merged-titlebar follow-up: `settleLayout` can take several frames
    // to converge (it decides buttons-collapsed, then overflow,
    // each gated behind its own `await nextFrame()`) — a single
    // frame here isn't necessarily enough to know `tabBarEl.clientWidth`
    // has reached its *final* value, not a mid-sequence intermediate one.
    // Confirmed as a real, reproducible wrong-scroll-position bug (not
    // just theoretical) while testing the maximize/restore fix above:
    // measuring against an intermediate width before overflow/collapse
    // had finished settling left the newly-scrolled-to tab only partly
    // visible. Waiting out `settling` — already set for the exact
    // duration `settleLayout` is mid-convergence — means this always
    // measures the settled state, whether or not this particular call
    // happened to coincide with one.
    while (settling) await nextFrame();
    // Bail if another call started (or the active tab changed again) while
    // this one was waiting — holding Ctrl/Cmd+Tab fires this on every repeat
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
    // §merged-titlebar follow-up: don't scroll the active tab exactly
    // flush with the edge — if there's a neighbor on that side, leave a
    // sliver of it peeking in too, so the active tab never looks like the
    // first/last one in the strip when it isn't. No peek on a side with
    // no neighbor (the active tab genuinely is the first/last tab) —
    // there's nothing there to reveal, and reserving dead space for it
    // would just under-use the strip.
    const idx = displayTabs.findIndex((t) => t.id === targetTabId);
    const hasPrev = idx > 0;
    const hasNext = idx !== -1 && idx < displayTabs.length - 1;
    if (elLeft < tabBarEl.scrollLeft) {
      tabBarEl.scrollLeft = elLeft - (hasPrev ? TAB_EDGE_PEEK : 0);
    } else if (elRight > tabBarEl.scrollLeft + tabBarEl.clientWidth) {
      tabBarEl.scrollLeft = elRight - tabBarEl.clientWidth + (hasNext ? TAB_EDGE_PEEK : 0);
    }
  }

  // Written before the runes migration (§312), so it says `$:` blocks; the
  // same holds for `$effect`: keep these two as plain store subscriptions.
  //
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
  // Store subscriptions are not reactive blocks (`$:` or `$effect`) at
  // all — Svelte 3/4's older, plain callback-based pub/sub, predating and
  // unrelated to the signals engine — so a write inside a subscription
  // callback (or inside something it awaits) has no reactive statement to
  // ever be attributed back to. Using `tabs.subscribe`/
  // `activeTabId.subscribe` directly here, instead of reactive blocks that
  // call these same functions, removes the retrigger channel entirely
  // rather than papering over wherever it was last observed.
  let lastTabsLayoutSignature: string | null = null;

  onMount(() => {
    // Observe the outer row, not `tabBarEl` itself: `settleLayout()` (which
    // this observer calls) collapses the command buttons, toggles the scroll
    // arrows, and the Promote button — all siblings of `#tab-bar` that live
    // inside `#top-bar`. Toggling them changes how much room is left for
    // `#tab-bar`, which would change `tabBarEl`'s own size too — observing
    // `#top-bar` instead avoids retriggering this observer as a side effect
    // of its own layout decisions. `#top-bar`'s width is driven only by the
    // window, never by its own children's reflow.
    // §merged-titlebar follow-up: a resize (most visibly maximize/restore,
    // now that those are one click away in the same window) can leave the
    // active tab scrolled out of view without its own id ever changing —
    // `settleLayout` alone only decides label/collapse state, it never
    // re-checks scroll position, so the active tab stayed exactly where
    // it happened to be until something else (Ctrl+Tab, clicking a
    // visible tab) touched `activeTabId` and triggered the *other*
    // subscription below.
    // A `ResizeObserver` delivers once immediately upon `.observe()`, even
    // though nothing has actually resized yet — that initial delivery
    // raced against `activeTabId.subscribe()`'s own immediate fire below
    // (both un-awaited, both landing at mount), and whichever happened to
    // finish last won, sometimes with a scroll computed against
    // `settleLayout`'s still-mid-adjustment DOM rather than its settled
    // one (confirmed as a real, reproducible wrong-scroll-position bug
    // while testing this fix, not just a theoretical race). Skipping the
    // observer's first delivery for the scroll (not for `settleLayout`,
    // which already tolerates being called twice at mount via its own
    // `settling`/`settlePending` guard) leaves exactly one source of
    // truth for the *initial* position — the `activeTabId` subscription —
    // and the observer only ever fires the scroll for a genuine
    // *subsequent* resize, which is the only case this follow-up is for.
    let resizeObserverPrimed = false;
    // #61: only a resize that made `#top-bar` *wider* than last time can
    // plausibly mean a worse tier now fits — see `settleLayout`'s own
    // comment on `allowUpgrade`. Gating on "wider than the *immediately
    // preceding* sample" alone still flickers while continuously widening,
    // though: dragging across many small steps means most of them are each
    // individually wider than the last but still short of actually fitting,
    // so each one still gets its own flash-and-revert — just as constant
    // as the narrowing case was, only in the other direction. Gating
    // instead on "wider than the last width an upgrade was actually
    // *attempted* at, by a real margin" throttles retries to roughly "try
    // again once something button-sized more might fit," so a slow widen
    // gets one attempt per meaningful increment instead of one per tick.
    // `0` as the starting point makes the very first delivery (mount)
    // attempt, matching `tabs.subscribe`'s own always-full-evaluation first
    // fire below. 100px isn't an exact fit-boundary margin (that's
    // `FIT_MARGIN`, deliberately tiny) — it's a coarser "don't bother
    // retrying yet" throttle, sized around a single action button's width
    // so a genuine widen still gets noticed reasonably promptly without
    // re-attempting on every few-pixel tick. Confirmed empirically (a
    // simulated continuous drag, 20px steps): eliminates flicker entirely
    // while narrowing, and cuts it from one flash per tick to a small
    // handful across an entire 700px->2200px widen — the residual few are
    // inherent to needing to actually render a wider tier to find out
    // whether it fits, not something a retry margin alone can fully solve.
    const UPGRADE_RETRY_MARGIN = 100;
    let lastTopBarWidth = 0;
    let lastUpgradeAttemptWidth = 0;
    resizeObserver = new ResizeObserver(() => {
      const width = topBarEl.getBoundingClientRect().width;
      const grew = width > lastTopBarWidth;
      lastTopBarWidth = width;
      // Shrinking moves the "since when" baseline down with it, so growth
      // is always measured from wherever the *most recent* shrink bottomed
      // out — otherwise a big shrink followed by a small regrowth could
      // stay stuck comparing against a stale, much-higher-up high-water
      // mark from before the shrink and never clear the margin at all.
      if (!grew) lastUpgradeAttemptWidth = width;
      const allowUpgrade = grew && width - lastUpgradeAttemptWidth >= UPGRADE_RETRY_MARGIN;
      if (allowUpgrade) lastUpgradeAttemptWidth = width;
      settleLayout(allowUpgrade);
      if (resizeObserverPrimed) scrollActiveTabIntoView();
      resizeObserverPrimed = true;
    });
    resizeObserver.observe(topBarEl);

    // `.subscribe()` fires immediately with the current value, so this
    // also covers the very first settle/scroll — no separate initial call
    // needed (the initial `null` sentinel never equals a real signature,
    // even an empty tab list's `""`). `tabs` covers `displayTabs` (derived
    // from it) too; nothing here needs its own subscription just for that.
    // Always allowed to try upgrading a tier (unlike the resize observer
    // above): a tab closing/renaming can free up room without `#top-bar`
    // itself resizing at all, and this path fires far less often than a
    // continuous drag ever could, so it was never the source of #61's
    // flicker — only ever the source of a single, legitimate settle.
    const unsubTabs = tabs.subscribe((list) => {
      const sig = layoutSignature(list);
      if (sig === lastTabsLayoutSignature) return;
      lastTabsLayoutSignature = sig;
      settleLayout();
    });
    const unsubActive = activeTabId.subscribe(() => scrollActiveTabIntoView());
    // §B3: friendly names can be shorter or longer than the ISO date, which can change what fits.
    const unsubLabelStyle = tabLabelStyle.subscribe(() => settleLayout());

    // §B1: Windows 11 Snap Layouts on the maximize button (a native overlay, see snap_overlay.rs).
    const stopSnap = isMergedTitlebar && maxBtnEl ? wireSnapOverlay(maxBtnEl) : () => {};

    return () => {
      stopSnap();
      unmounted = true;
      resizeObserver?.disconnect();
      unsubTabs();
      unsubActive();
      unsubLabelStyle();
    };
  });
</script>


<div
  id="top-bar"
  bind:this={topBarEl}
  data-tauri-drag-region={isMergedTitlebar ? true : undefined}
>
  {#if isMergedTitlebar}
    <span class="app-icon" aria-hidden="true"><AppIcon size={16} /></span>
  {/if}
  {#if $devBuild}
    <!-- §458: a debug build says so (the window title and icon do too, set in Rust). -->
    <span class="dev-badge" data-testid="dev-badge" data-tauri-drag-region title="Debug build">DEV</span>
  {/if}
  <TabStrip
    bind:this={tabStripRef}
    {showHorizontalTabs}
    {isMergedTitlebar}
    {displayTabs}
    {isOverflowing}
    bind:tabBarEl
    bind:newSplitEl
    {newMenuOpen}
    onToggleNewMenu={() => newMenuRef?.toggleNewMenu()}
    onOpenContextMenu={(e, tab) => contextMenuRef?.openTabContextMenu(e, tab)}
    onCloseContextMenu={() => contextMenuRef?.closeContextMenu()}
  />
  {#if showHorizontalTabs}
    <!-- §merged-titlebar: the drag territory, and now also the bar's free space — #tab-bar
         only takes as much as its tabs need, so everything left over is this gutter and the
         empty bar stays a window drag area. Its minimum keeps something to grab even once the
         tabs overflow. Present in the web app too (without the drag attribute) so the
         commands still sit at the trailing edge there. -->
    <div
      class="titlebar-drag-gutter"
      bind:this={gutterEl}
      data-tauri-drag-region={isMergedTitlebar ? true : undefined}
      aria-hidden="true"
    ></div>
  {/if}
  <div class="titlebar-commands">
    <button
      class="icon-btn"
      data-keytip="D"
      title={$t("topBar.openDateNote.title", { combo: formatShortcut('openDateNote') })}
      data-datepicker-trigger
      onclick={controller.openDatePicker}
    >
      <Icon name="date-note" />
    </button>
    {#if !buttonsCollapsed}
      <button class="icon-btn" data-keytip="A" title={$t("topBar.actions.title", { combo: formatShortcut('openActions') })} onclick={controller.openActionDrawer}>
        <Icon name="actions" />
      </button>
      <button
        class="icon-btn"
        data-keytip="H"
        title={$t("topBar.history.title", { combo: formatShortcut('openHistory') })}
        onclick={controller.openMeetingHistory}
      >
        <Icon name="section-history" />
      </button>
      <button
        class="icon-btn"
        data-keytip="S"
        title={$t("topBar.search.title", { combo: formatShortcut('crossTabSearch') })}
        onclick={() => controller.openCrossTabSearch()}
      >
        <Icon name="search" />
      </button>
      {#if calendarSyncVisible}
        <button
          class="icon-btn has-pip"
          data-keytip="C"
          title={calendarSyncReady
            ? $t("topBar.calendarSync.titleReady", { combo: formatShortcut('syncCalendar') })
            : !$agendaFileExists
              ? $t("topBar.calendarSync.titleNoAgendaFile")
              : $t("topBar.calendarSync.titleNotAvailable")}
          disabled={!calendarSyncReady}
          onclick={controller.syncCalendarFromFile}
        >
          <Icon name="calendar-import" />
          {#if calendarSyncReady && $calendarSyncHasDiff}
            <span class="icon-btn-pip" aria-hidden="true"></span>
          {/if}
        </button>
      {/if}
      {#if activeTab?.isScratchpad}
        <button
          class="icon-btn"
          data-keytip="P"
          title={$t("topBar.promote.title")}
          onclick={() => controller.promoteScratchpad(activeTab.id)}
        >
          <Icon name="promote" />
        </button>
      {/if}
    {/if}
    <!-- §B2: always present. MoreActionsModal, anchored to data-more-trigger the same way
         DatePickerModal anchors to data-datepicker-trigger, lists Settings, Shortcuts, Zen,
         Peek and About — and, above those, the commands that collapsed (#56). The pip
         only shows here while the sync button itself is collapsed into this menu. -->
    <button class="icon-btn has-pip" data-keytip="M" title={$t("topBar.moreActions.title")} data-more-trigger onclick={controller.openMoreActions}>
      <Icon name="more" />
      {#if buttonsCollapsed && calendarSyncVisible && calendarSyncReady && $calendarSyncHasDiff}
        <span class="icon-btn-pip" aria-hidden="true"></span>
      {/if}
    </button>
  </div>
  {#if isMergedTitlebar}
    <div class="window-controls">
      <button class="win-btn" aria-label={$t("topBar.window.minimize")} onclick={() => controller.minimizeWindow()}>
        <Icon name="minimize" size={12} />
      </button>
      <button
        class="win-btn win-max"
        bind:this={maxBtnEl}
        aria-label={$chromeExpanded ? $t("topBar.window.restore") : $t("topBar.window.maximize")}
        onclick={() => controller.toggleMaximizeWindow()}
      >
        <Icon name={$chromeExpanded ? "restore" : "maximize"} size={12} />
      </button>
      <button class="win-btn win-close" aria-label={$t("topBar.window.close")} onclick={() => controller.closeWindow()}>
        <Icon name="close" size={12} />
      </button>
    </div>
  {/if}
  <!-- #61 follow-up: off-screen measurement clones of the collapsible command buttons, for
       `predictUncollapseWouldFit` above — never painted (`.topbar-measure` is `position:
       fixed` + `visibility: hidden`, so it's fully out of `#top-bar`'s own layout and never
       reaches the screen), but still real DOM the browser lays out, so
       `getBoundingClientRect()` on them is accurate. `aria-hidden` + `inert` keep them out of
       the accessibility tree and unreachable by keyboard/click even though they're plain
       <button> markup. Deliberately NOT full copies of the live buttons: no `data-*-trigger`
       attributes (so DatePickerModal's/MoreActionsModal's anchor lookups can never match one
       of these instead of the real, visible trigger) and no click handlers. If a button's icon
       changes, this has to change with it — the same "keep two things in sync" caveat as
       `mockBackend.ts` mirroring `storage.rs`. They carry `.titlebar-commands` so they get
       the live buttons' exact width. -->
  <div class="titlebar-commands topbar-measure" aria-hidden="true" inert>
    <button class="icon-btn" bind:this={cloneActionsEl} tabindex="-1">
      <Icon name="actions" />
    </button>
    <button class="icon-btn" bind:this={cloneHistoryEl} tabindex="-1">
      <Icon name="section-history" />
    </button>
    <button class="icon-btn" bind:this={cloneSearchEl} tabindex="-1">
      <Icon name="search" />
    </button>
    {#if calendarSyncVisible}
      <button class="icon-btn" bind:this={cloneCalendarSyncEl} tabindex="-1">
        <Icon name="calendar-import" />
      </button>
    {/if}
    {#if activeTab?.isScratchpad}
      <button class="icon-btn" bind:this={clonePromoteEl} tabindex="-1">
        <Icon name="promote" />
      </button>
    {/if}
  </div>
</div>

<NewMenu bind:this={newMenuRef} {newSplitEl} bind:newMenuOpen />

<TabContextMenu bind:this={contextMenuRef} {displayTabs} onStartRenaming={(tab) => tabStripRef?.startRenaming(tab)} />

<style>
/* Top Chrome / Tabs (§103: bar, daily vs scratchpad archetypes) */

#top-bar {
  display: flex;
  background: var(--surface-chrome);
  border-bottom: 1px solid var(--edge-soft);
  height: 40px;
  /* #49 (second pass): both the tabs and the toolbar buttons bottom-anchor
     and share one height (see `.tab` and `#top-bar .icon-btn` below) — a
     first attempt at fixing their icon misalignment stretched `.tab` to
     the bar's full height and left `.icon-btn` centred, which fixed the
     alignment but made tabs look unnaturally tall with the buttons then
     reading as floating, with empty space above *and* below them. Matching
     heights (not stretching one side to meet the other's position) is what
     actually reads as one coherent row. */
  align-items: flex-end;
  padding-right: 8px;
}

/* §D7: the web app installed on a PC with the title bar hidden (window controls overlay). The
   browser draws minimize/maximize/close over the page's top right; the env() values give the
   free area, so the bar keeps its content out from under them. Lives here, not in
   13-pwa.css, because this scoped rule outranks a global `#top-bar` one. */
@media (display-mode: window-controls-overlay) {
  #top-bar {
    height: env(titlebar-area-height, 40px);
    padding-left: env(titlebar-area-x, 0px);
    padding-right: max(8px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)));
  }
}

/* §merged-titlebar: the app icon at the bar's leading edge, replacing the
   native OS title bar's own icon. Same "32px box, bottom-anchored"
   treatment as `.tab`/`.icon-btn` (§49) rather than its own vertical
   alignment — an earlier `align-self: center` centred the icon in the
   full 40px bar, which reads visibly higher than the tabs/buttons next
   to it: those bottom-anchor a 32px box (an 8px gap only at the *top*),
   so their own icons' visual centre sits lower than a plain
   full-height centre would. Matching the same box height and letting it
   inherit `#top-bar`'s `align-items: flex-end` puts the icon on the
   same row the rest of the bar's icons sit on. */

.dev-badge {
  /* On the row the app icon, tabs and buttons share: a 16px pill centred in the bar's bottom-anchored 32px (see
     `.app-icon`); centring it in the full 40px put it 4px too high. */
  flex-shrink: 0;
  box-sizing: border-box;
  height: 16px;
  margin: 0 8px 8px 0;
  padding: 0 4px;
  border: 1px solid currentColor;
  border-radius: 4px;
  color: #e06400;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  letter-spacing: 0.04em;
  cursor: default;
}
.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  flex-shrink: 0;
  /* §merged-titlebar follow-up: the vertical centring above already gives
     the icon ~16px of breathing room above it (8px from the bar's own
     bottom-anchor gap, 8px from centring the 16px icon in its 32px box)
     — the left margin was still the old, smaller value from before that
     box existed, so the icon read closer to the bar's left edge than to
     its top. Matched to the same ~16px so the icon sits with roughly
     equal room on both its free sides, confirmed via
     `getBoundingClientRect()` (15.3px top vs. 10px left before this). */
  margin: 0 8px 0 16px;
}

/* §merged-titlebar: a fixed, always-present drag territory between the
   toolbar cluster and the window controls — #tab-bar's own empty
   trailing space (also `data-tauri-drag-region`, see #tab-bar below) can
   shrink to nothing once tabs overflow, so the window still needs
   somewhere guaranteed to grab regardless of tab count. Stretches to the
   bar's full height like the window controls next to it, not bottom-
   anchored like tabs/buttons. */

.titlebar-drag-gutter {
  /* §B2: takes whatever the tabs and commands leave over; the minimum (mirrored as
     `GUTTER_MIN` in the script) keeps something to grab once the tabs overflow. */
  /* 48px, about one caption button, like Notepad: always enough to grab and move the window
     (Marien, 2026-10-10: 20px was too small to find). */
  flex: 1 1 48px;
  min-width: 48px;
  align-self: stretch;
}

/* §merged-titlebar: minimize/maximize/close — Windows/Linux convention:
   square-ish, wider than tall, right-aligned, filling the bar's full
   height edge-to-edge (a real title bar's buttons never float with a gap
   above/below them the way the bottom-anchored tabs/toolbar buttons do,
   hence `align-self: stretch` overriding `#top-bar`'s own
   `align-items: flex-end`). */

.window-controls {
  display: flex;
  align-self: stretch;
  flex-shrink: 0;
  margin-left: auto;
}

.win-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
}

/* `.snap-hover`: the maximize button's hover look while the native Snap Layouts overlay
   (§B1) has the pointer; the page itself no longer sees it there. */
.win-btn:hover,
.win-btn.win-max:global(.snap-hover) {
  background: var(--surface-raised);
  color: var(--text);
}

/* Windows 11's own close-button red. */
.win-btn.win-close:hover {
  background: #c42b1c;
  color: #ffffff;
}

/* §B1: a window in the background dims its title bar, as Windows 11 does. */
:global(body.window-inactive) #top-bar .app-icon,
:global(body.window-inactive) #top-bar .icon-btn,
:global(body.window-inactive) #top-bar .win-btn {
  color: var(--text-tertiary);
}

.icon-btn-pip {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--state-warn);
  box-shadow: 0 0 0 1.5px var(--surface-chrome);
  pointer-events: none;
}

/* #61 follow-up: off-screen measurement clones (see TopBar.svelte) —
   `position: fixed` removes them from #top-bar's own flex flow entirely,
   `visibility: hidden` keeps them off the screen even though the browser
   still lays them out (the whole point: `getBoundingClientRect()` needs
   real layout to measure against). */

.topbar-measure {
  position: fixed;
  top: -9999px;
  left: -9999px;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}
</style>
