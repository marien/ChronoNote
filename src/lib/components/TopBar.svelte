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
  // #61: carries the `allowUpgrade` argument (see `settleLayout`) forward
  // into the loop's *next* iteration when a call arrives mid-settle —
  // ORed together so one genuine widen among several coalesced calls still
  // gets its upgrade attempt, the same "don't drop it, fold it in" idea
  // `settlePending` already applies to re-running at all.
  let settlePendingAllowUpgrade = false;
  let scrollIntoViewToken = 0;
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";
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
    mobileTabDrawerOpen,
    notesDir,
    oneDriveAccount,
    oneDriveFolder,
    saveState,
    showToast,
    tabs,
  } from "../controller";

  import type { NoteTab } from "../types";
  import Icon from "../icons/Icon.svelte";
  import AppIcon from "./AppIcon.svelte";
  import { formatCombo, formatShortcut, shortcutById } from "../shortcuts";
  import { countActions } from "../tokens";
  import { t } from "../i18n";

  let contextMenuVisible = $state(false);
  let contextTab = $state<NoteTab | null>(null);
  let contextPos = $state({ x: 0, y: 0 });
  let contextMenuEl = $state<HTMLDivElement>();

  let renamingTabId = $state<string | null>(null);
  let renameInputVal = $state("");
  let renameInputEl = $state<HTMLInputElement>();

  function isLastDisplayTab(tab: NoteTab | null): boolean {
    if (!tab) return true;
    const last = displayTabs[displayTabs.length - 1];
    return !last || last.id === tab.id;
  }

  function openTabContextMenu(e: MouseEvent, tab: NoteTab) {
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

  function closeContextMenu() {
    contextMenuVisible = false;
    contextTab = null;
  }

  function startRenaming(tab: NoteTab) {
    closeContextMenu();
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

  /** Dated tabs show just the date; scratchpads keep their given name. */
  const tabLabel = (t: NoteTab) => (t.isScratchpad ? t.filename : t.filename.replace(/\.txt$/, ""));

  /** #68/#72: a daily tab's date relative to today — past/today/future get
   * a distinct look (§68's own CSS) so today's tab, the one most work
   * happens in, stands out from yesterday's leftovers and next week's
   * placeholders without having to read every label. A scratchpad has no
   * date of its own, so it's excluded (`""`, no extra class). Takes
   * `today` as a parameter rather than reading `todayISO()` itself —
   * called from the template on every render, so it needs `$currentDateISO`
   * (a real reactive dependency, kept live by `boot.ts`'s
   * `wireDateRollover`) to actually refresh at midnight, rather than a
   * plain function call that only happens to re-run when something else
   * Svelte is already watching triggers a re-render. */
  const tabDateClass = (t: NoteTab, today: string): string => {
    if (t.isScratchpad) return "";
    const date = t.filename.slice(0, 10);
    return date < today ? "past" : date > today ? "future" : "today";
  };

  let topBarEl: HTMLDivElement;
  let tabBarEl = $state<HTMLDivElement>();
  let showActionLabels = $state(false);
  // #56: once even icon-only action buttons leave the tab strip too
  // little room, collapse the secondary ones (Actions/History/Search/
  // Sync calendar/Promote/Settings) into a single
  // "More" button —
  // `MoreActionsModal`. New Scratchpad and Open Date Note stay pinned
  // regardless; see `settleLayout` for how this is decided. About moved
  // to the status bar (#58) — it's always reachable there regardless of
  // window width, so it no longer needs a place in this collapse group.
  let buttonsCollapsed = $state(false);
  // §52: whether the tab bar is overflowing at all — drives whether the
  // scroll arrows show. Deliberately *not* derived from scroll position
  // (the way `canScrollLeft`/`canScrollRight` used to work) — that made
  // an arrow disappear once you'd scrolled all the way in that direction,
  // which is the opposite of what's wanted now: both arrows stay visible
  // the whole time the bar is overflowing, and clicking one at an edge
  // wraps to the other end instead of the arrow just vanishing.
  let isOverflowing = $state(false);
  let resizeObserver: ResizeObserver | null = null;

  // #61 follow-up: refs into the off-screen measurement clones below —
  // see the big comment on that markup, and on `predictLabelsWouldFit`/
  // `predictUncollapseWouldFit`, for why these exist at all.
  let labelDateEl: HTMLElement;
  let labelActionsEl: HTMLElement;
  let labelHistoryEl: HTMLElement;
  let labelSearchEl: HTMLElement;
  let labelCalendarSyncEl: HTMLElement;
  let labelPromoteEl: HTMLElement;
  let labelSettingsEl: HTMLElement;
  let cloneActionsEl: HTMLElement;
  let cloneHistoryEl: HTMLElement;
  let cloneSearchEl: HTMLElement;
  let cloneCalendarSyncEl = $state<HTMLElement>();
  let clonePromoteEl = $state<HTMLElement>();
  let cloneSettingsEl: HTMLElement;
  let moreBtnEl = $state<HTMLElement>();

  // The horizontal tab strip is replaced by the tabs-drawer button on
  // touch-first devices only — NOT by window width: a narrow desktop/web
  // window keeps the strip (#56's collapse-into-More logic measures it).
  const showHorizontalTabs = $derived(!$isMobile);
  // Touch-first only: desktop scrolls its strip with the §52 arrows instead.
  const showOpenTabsBtn = $derived(!showHorizontalTabs);
  const mobileActiveTab = $derived($tabs.find((t) => t.id === $activeTabId) ?? null);
  // On a phone the top bar carries the drawer button and the active tab's date, so
  // there's no room for the whole button row: the secondary buttons live in "More".
  $effect.pre(() => {
    if (!showHorizontalTabs) buttonsCollapsed = true;
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
  const hasTabsWithoutOpenActions = $derived($tabs.some((t) => countActions(t.content).open === 0));

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

  /** Priority order when space is tight: (1) everything fits → show
   * action-button labels; (2) doesn't fit with labels shown → drop back
   * to icon-only first, reclaiming the space the labels used; (3) still
   * doesn't fit icon-only → collapse the secondary action buttons into
   * "More" (#56), reclaiming *their* space for the tab strip; (4) still
   * doesn't fit even then (many, many tabs) → that's when the scroll
   * arrows are for. Re-run whenever the window resizes or the tab list
   * changes (in a way that can actually affect this — see
   * `layoutSignature` below).
   *
   * #57: labels used to also require the window be maximized/fullscreen
   * (`chromeExpanded`) — a leftover from §26's original spec, before
   * `docs/spec.md` was rewritten to describe this as purely width-driven.
   * A normal restored window could never show labels at all, however
   * wide, which read as a bug once the merged title bar (§154) made
   * window-state changes something users trigger constantly. Dropped
   * entirely — a resize from maximizing/restoring still re-triggers this
   * via the `ResizeObserver` below (maximizing genuinely changes
   * `#top-bar`'s width), so nothing here needs `chromeExpanded` at all
   * any more; it's still read elsewhere for the maximize/restore icon.
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
    if (!tabBarEl) return 0;
    let w = 0;
    for (const child of tabBarEl.children) w += (child as HTMLElement).offsetWidth;
    return w;
  }

  const FIT_MARGIN = 8;
  // §merged-titlebar follow-up: how much of a neighboring tab to leave
  // peeking in when scrolling the active tab into view at an edge.
  const TAB_EDGE_PEEK = 24;

  // #61 follow-up: matches `.icon-btn`'s own CSS `gap: 6px` — that gap
  // only manifests once a label span exists as a second flex child inside
  // the button, so a button's real width-with-label is its current
  // (icon-only) width plus exactly (label width + this gap). Duplicated
  // here rather than read from computed style since it's cheap, stable,
  // and already how `FIT_MARGIN` itself is handled in this file.
  const ICON_LABEL_GAP = 6;

  function rectWidth(el: HTMLElement | undefined): number {
    return el ? el.getBoundingClientRect().width : 0;
  }

  /** #61 follow-up: `settleLayout`'s upgrade attempts used to unconditionally
   * flip `showActionLabels`/`buttonsCollapsed` to measure a tier that isn't
   * currently rendered, then revert if it turned out not to fit — the
   * `allowUpgrade` gate above cut how *often* that ran, but every attempt
   * that still fired painted one real frame of the wider tier before
   * reverting (Svelte's DOM patch for the trial value lands via a
   * microtask, which always resolves *before* the next `requestAnimationFrame`
   * this function awaits — so the browser paints the trial state at least
   * once, guaranteed, whenever a revert happens). Predicting the outcome
   * first — using off-screen clones that are never part of the visible
   * layout at all — means the live state only ever gets set to values
   * already known to fit, so the flip-and-measure-and-maybe-revert code
   * below stays as a safety net (kept, in case a prediction is ever off by
   * a pixel) rather than the routine path. This function answers "if
   * labels turned on right now, would the tab strip still fit?" without
   * ever touching `showActionLabels`. */
  function predictLabelsWouldFit(): boolean {
    if (!tabBarEl) return false;
    let delta = rectWidth(labelDateEl) + ICON_LABEL_GAP;
    if (!buttonsCollapsed) {
      delta +=
        rectWidth(labelActionsEl) +
        rectWidth(labelHistoryEl) +
        rectWidth(labelSearchEl) +
        rectWidth(labelSettingsEl) +
        3 * ICON_LABEL_GAP;
      if (calendarSyncVisible) delta += rectWidth(labelCalendarSyncEl) + ICON_LABEL_GAP;
      if (activeTab?.isScratchpad) delta += rectWidth(labelPromoteEl) + ICON_LABEL_GAP;
    }
    return tabsContentWidth() <= tabBarEl.clientWidth - delta - FIT_MARGIN;
  }

  /** #61 follow-up: same idea as `predictLabelsWouldFit`, for the "More"
   * button expanding back into the full secondary-action row (#56). Only
   * meaningful (and only ever called) while `buttonsCollapsed` is true,
   * since that's the only state where the real row doesn't exist in the
   * DOM to measure directly — `cloneActionsEl` etc. are off-screen clones
   * of that row. They mirror the *current* `showActionLabels` value (like
   * the live row would), so `labelsOn` here is a hypothetical, not
   * necessarily what's currently showing — each clone's label width
   * (already known from the Block-A spans above) is added or subtracted
   * from its measured width to get the width under the state actually
   * being asked about. This mirrors the live fallback below it: uncollapsing
   * is tried with labels in their current state first, and only with labels
   * forced off if that alone doesn't fit — a real, previously-untested case
   * (turning both buttonsCollapsed and showActionLabels off in the very
   * same widen) needs both predicted, or the gate wrongly refuses an
   * uncollapse that the live fallback would actually have found room for. */
  function predictUncollapseWouldFit(labelsOn: boolean): boolean {
    if (!tabBarEl || !moreBtnEl) return false;
    const rows: [HTMLElement | undefined, HTMLElement][] = [
      [cloneActionsEl, labelActionsEl],
      [cloneHistoryEl, labelHistoryEl],
      [cloneSearchEl, labelSearchEl],
      [cloneSettingsEl, labelSettingsEl],
    ];
    if (calendarSyncVisible) rows.push([cloneCalendarSyncEl, labelCalendarSyncEl]);
    if (activeTab?.isScratchpad) rows.push([clonePromoteEl, labelPromoteEl]);
    let uncollapsedWidth = 0;
    for (const [clone, label] of rows) {
      const cloneWidth = rectWidth(clone);
      const iconOnlyWidth = showActionLabels ? cloneWidth - rectWidth(label) - ICON_LABEL_GAP : cloneWidth;
      uncollapsedWidth += labelsOn ? iconOnlyWidth + rectWidth(label) + ICON_LABEL_GAP : iconOnlyWidth;
    }
    const delta = uncollapsedWidth - rectWidth(moreBtnEl);
    return tabsContentWidth() <= tabBarEl.clientWidth - delta - FIT_MARGIN;
  }
  /** #61: an upgrade attempt (icon-only → labels, collapsed → uncollapsed)
   * unconditionally flips the state to test it, which is the only way to
   * measure a tier that isn't currently rendered — but doing that on
   * *every* call, including ones triggered by the window getting
   * *narrower*, flashes the wider tier on screen for a frame before
   * reverting it, every single time, for the entire duration of a drag
   * that's only ever making things tighter. `allowUpgrade` gates those
   * attempts on there being an actual reason to think a wider tier might
   * fit now — the `ResizeObserver` below passes `true` only when
   * `#top-bar` just got *wider* than the last time it measured; the
   * `tabs.subscribe` path (closing/renaming a tab can free room without
   * `#top-bar` itself resizing at all) always passes `true`, since that
   * path fires far less often than a continuous drag ever could. The
   * *downgrade* checks (already-showing labels/buttons found to no longer
   * fit) are never gated — shrinking must always be able to react. */
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
        if (showActionLabels) {
          // Labels are currently showing — only hide them if clearly too
          // tight, not just a hair over the line. Overflow (unlike "does
          // it comfortably fit") is exactly what `scrollWidth` answers
          // correctly, margin included.
          if (tabBarEl.scrollWidth > tabBarEl.clientWidth + FIT_MARGIN) {
            showActionLabels = false;
            await nextFrame();
          }
        } else if (allowUpgrade && predictLabelsWouldFit()) {
          // Icon-only currently — try labels, but only keep them if
          // there's clearly enough spare room once they're shown, not
          // just barely. `predictLabelsWouldFit()` already checked this
          // off-screen, so this flip is expected to stick — the
          // measure-and-revert below is a safety net, not the routine
          // path (see its own comment for why that matters for flicker).
          showActionLabels = true;
          await nextFrame();
          if (tabsContentWidth() > tabBarEl.clientWidth - FIT_MARGIN) {
            showActionLabels = false;
            await nextFrame();
          }
        }

        // #56: same decide-from-current-state + margin discipline as
        // the labels decision above, one rung further down the priority
        // order — collapsing/uncollapsing the secondary action buttons
        // changes `tabBarEl`'s own width the same way toggling labels
        // does, so this has to run *after* the labels decision above has
        // settled, not before.
        //
        // #57: labels must never be the reason buttons end up collapsed
        // — the priority order above says labels are dropped *first*,
        // buttons collapse only as a last resort. But by the time this
        // runs, the labels decision above may have *just* turned labels
        // on this same pass (they were off going in, e.g. a window
        // widened from a narrow, collapsed state) — measuring "does it
        // fit" here then means "does it fit with labels," understating
        // how much room buttons actually have and collapsing them
        // needlessly. If a fit check below fails while labels are on,
        // retry it once with labels forced off before concluding buttons
        // really do need to collapse — skipped entirely when labels are
        // already off (the common case), so this adds no extra
        // measurement/flicker there.
        if (!buttonsCollapsed) {
          if (tabBarEl.scrollWidth > tabBarEl.clientWidth + FIT_MARGIN) {
            if (showActionLabels) {
              showActionLabels = false;
              await nextFrame();
            }
            if (tabBarEl.scrollWidth > tabBarEl.clientWidth + FIT_MARGIN) {
              buttonsCollapsed = true;
              await nextFrame();
            }
          }
        } else if (allowUpgrade) {
          // Collapsed currently — only bring the buttons back if there's
          // clearly enough spare room once they're shown, not just
          // barely (the same `tabsContentWidth` reasoning as the labels
          // branch: `scrollWidth` can't tell "how much room to spare"
          // once content already fits, only "is it overflowing"). Predict
          // both the "uncollapse with labels as they are" and "uncollapse
          // with labels forced off" outcomes off-screen first — the same
          // two configurations the live fallback below would otherwise
          // try one at a time — so labels only get turned off *before*
          // the flip when that's actually the combination that works,
          // instead of live-flashing "uncollapsed + still overflowing"
          // for a frame first.
          const fitsAsIs = predictUncollapseWouldFit(showActionLabels);
          const fitsLabelsOff = !fitsAsIs && showActionLabels && predictUncollapseWouldFit(false);
          if (fitsAsIs || fitsLabelsOff) {
            if (fitsLabelsOff) {
              showActionLabels = false;
              await nextFrame();
            }
            buttonsCollapsed = false;
            await nextFrame();
            // Safety net in case a prediction was ever off by a pixel —
            // not the routine path, see `predictUncollapseWouldFit`.
            if (tabsContentWidth() > tabBarEl.clientWidth - FIT_MARGIN) {
              if (showActionLabels) {
                showActionLabels = false;
                await nextFrame();
              }
              if (tabsContentWidth() > tabBarEl.clientWidth - FIT_MARGIN) {
                buttonsCollapsed = true;
                await nextFrame();
              }
            }
          }
        }

        const nowOverflowing = tabBarEl.scrollWidth > tabBarEl.clientWidth;
        if (nowOverflowing !== isOverflowing) isOverflowing = nowOverflowing;
        // If another call came in while the above was awaiting a frame,
        // loop once more on the now-current state instead of returning
        // with it unevaluated — using whatever `allowUpgrade` that (or any
        // other) pending call arrived with, not necessarily this one's.
        allowUpgrade = settlePendingAllowUpgrade;
        settlePendingAllowUpgrade = false;
      } while (settlePending);
    } finally {
      settling = false;
    }
  }

  /** §52: once overflowing, scrolling past an edge wraps to the other end
   * — the same cyclic behavior `Ctrl/Cmd+Tab`/`Ctrl/Cmd+Shift+Tab` already has for
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
    // §merged-titlebar follow-up: `settleLayout` can take several frames
    // to converge (it decides labels, then buttons-collapsed, then
    // overflow, each gated behind its own `await nextFrame()`) — a single
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
  // back to. Using `tabs.subscribe`/`activeTabId.subscribe` directly here,
  // instead of `$:` blocks that call these same functions, removes the
  // retrigger channel entirely rather than papering over wherever it was
  // last observed.
  //
  // #57: `tabs.subscribe` on its own over-fires, though — every keystroke
  // calls `updateActiveTabContent()`, which is a `tabs.set()` on every
  // single content change, not just a tab being added/removed/renamed.
  // `settleLayout()`'s "try a better tier" branches unconditionally flip
  // state and measure again even when nothing about the available width
  // could possibly have changed, so a plain `tabs.subscribe(() =>
  // settleLayout())` visibly flashed labels/buttons on and off on every
  // keystroke while typing — the exact bug reported. `layoutSignature`
  // below reduces a tab list to just the fields that can actually change
  // rendered width (identity, scratchpad-ness, filename, and the
  // scratchpad "unsaved" dot's on/off state) — a keystroke changes a
  // tab's `content` but never any of those, so the signature comes out
  // identical and `settleLayout()` is never even called.
  function layoutSignature(list: NoteTab[]): string {
    return list
      .map(
        (t) =>
          `${t.id}:${t.isScratchpad ? "s" : "d"}:${t.filename}:${t.isScratchpad && t.content.trim() !== "" ? 1 : 0}`,
      )
      .join("|");
  }
  let lastTabsLayoutSignature: string | null = null;

  onMount(() => {
    // Observe the outer row, not `tabBarEl` itself: `settleLayout()` (which
    // this observer calls) toggles the action-button labels, the scroll
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

    return () => {
      resizeObserver?.disconnect();
      unsubTabs();
      unsubActive();
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
  {#if !showHorizontalTabs}
    {#if showOpenTabsBtn}
      <button
        class="icon-btn mobile-tab-drawer-btn"
        title={$t("topBar.openTabsList.title")}
        aria-label={$t("topBar.openTabsList.ariaLabel", { count: $tabs.length })}
        onclick={() => mobileTabDrawerOpen.set(true)}
      >
        <Icon name="tabs" size={16} />
        <span class="mobile-tab-count">{$tabs.length}</span>
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
  {:else}
    {#if isOverflowing}
      <button class="icon-btn tab-scroll-btn" aria-label={$t("topBar.scrollTabsLeft")} onclick={() => scrollTabBar(-1)}>
        <Icon name="chevron-left" size={14} />
      </button>
    {/if}
    <div
      id="tab-bar"
      bind:this={tabBarEl}
      data-tauri-drag-region={isMergedTitlebar ? true : undefined}
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
          aria-selected={tab.id === $activeTabId}
          onclick={() => controller.switchTab(tab.id)}
          ondblclick={() => tab.isScratchpad && startRenaming(tab)}
          oncontextmenu={(e) => openTabContextMenu(e, tab)}
          onmousedown={(e) => {
            // Middle-click closes the tab (and suppress the autoscroll cursor).
            if (e.button === 1) {
              e.preventDefault();
              controller.requestTabClose(tab.id);
            }
          }}
          onkeydown={(e) => e.key === "Enter" && controller.switchTab(tab.id)}
        >
          <span class="tab-icon" aria-hidden="true">
            <Icon name={tab.isScratchpad ? "tab-scratch" : "tab-daily"} size={13} />
          </span>
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
            <span class="tab-label">{tabLabel(tab)}</span>
          {/if}
          {#if tab.isScratchpad && tab.content.trim() !== ""}
            <span class="tab-status-dot mem" title={$t("topBar.tabStatus.memoryOnly")}></span>
          {:else if tab.id === $activeTabId && $saveState === "error"}
            <span class="tab-status-dot err" title={$t("topBar.tabStatus.saveFailed")}></span>
          {/if}
          <span
            class="tab-close"
            role="button"
            tabindex="0"
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
      <button class="icon-btn tab-scroll-btn" aria-label={$t("topBar.scrollTabsRight")} onclick={() => scrollTabBar(1)}>
        <Icon name="chevron-right" size={14} />
      </button>
    {/if}
  {/if}
  {#if isMergedTitlebar}
    <!-- §merged-titlebar: a fixed drag territory that's always present
         regardless of tab count — #tab-bar's own empty trailing space
         (also draggable, above) shrinks to nothing once tabs overflow,
         so the window still needs somewhere to grab. Sits between the
         tab strip and the button cluster (not between the buttons and
         the window controls) so New Scratchpad/Open Date/the toolbar/
         window controls all read as one clustered group at the trailing
         edge, the same way the app icon reads as one thing with the
         tabs at the leading edge. -->
    <div
      class="titlebar-drag-gutter"
      data-tauri-drag-region
      aria-hidden="true"
    ></div>
  {/if}
  <!-- §53: always visible regardless of tab-bar scroll position — a
       sibling of the scrollable #tab-bar rather than a child of it. -->
  <button
    class="icon-btn tab-bar-new-btn"

    title={$t("topBar.newScratchpad.title", { combo: formatCombo(shortcutById('newScratchpad').combos[0]) })}
    onclick={controller.createScratchpad}
  >
    <Icon name="new-scratchpad" />
  </button>
  <button
    class="icon-btn"
    title={$t("topBar.openDateNote.title", { combo: formatShortcut('openDateNote') })}
    data-datepicker-trigger
    onclick={controller.openDatePicker}
  >
    <Icon name="date-note" />{#if showActionLabels}<span class="icon-label">{$t("topBar.label.date")}</span>{/if}
  </button>
  {#if buttonsCollapsed}
    <!-- #56: everything below this button collapses into it once the
         window is too narrow — MoreActionsModal, anchored to
         data-more-trigger the same way DatePickerModal anchors to
         data-datepicker-trigger. -->
    <button class="icon-btn has-pip" title={$t("topBar.moreActions.title")} data-more-trigger onclick={controller.openMoreActions} bind:this={moreBtnEl}>
      <Icon name="more" />
      {#if calendarSyncVisible && calendarSyncReady && $calendarSyncHasDiff}
        <span class="icon-btn-pip" aria-hidden="true"></span>
      {/if}
    </button>
  {:else}
    <button class="icon-btn" title={$t("topBar.actions.title", { combo: formatShortcut('openActions') })} onclick={controller.openActionDrawer}>
      <Icon name="actions" />{#if showActionLabels}<span class="icon-label">{$t("actionDrawer.modal.ariaLabel")}</span>{/if}
    </button>
    <button
      class="icon-btn"
      title={$t("topBar.history.title", { combo: formatShortcut('openHistory') })}
      onclick={controller.openMeetingHistory}
    >
      <Icon name="section-history" />{#if showActionLabels}<span class="icon-label">{$t("history.modal.ariaLabel")}</span>{/if}
    </button>
    <button
      class="icon-btn"
      title={$t("topBar.search.title", { combo: formatShortcut('crossTabSearch') })}
      onclick={controller.openCrossTabSearch}
    >
      <Icon name="search" />{#if showActionLabels}<span class="icon-label">{$t("topBar.label.search")}</span>{/if}
    </button>
    {#if calendarSyncVisible}
      <button
        class="icon-btn has-pip"
        title={calendarSyncReady
          ? $t("topBar.calendarSync.titleReady", { combo: formatShortcut('syncCalendar') })
          : !$agendaFileExists
            ? $t("topBar.calendarSync.titleNoAgendaFile")
            : $t("topBar.calendarSync.titleNotAvailable")}
        disabled={!calendarSyncReady}
        onclick={controller.syncCalendarFromFile}
      >
        <Icon name="calendar-import" />{#if showActionLabels}<span class="icon-label">{$t("topBar.label.calendarSync")}</span>{/if}
        {#if calendarSyncReady && $calendarSyncHasDiff}
          <span class="icon-btn-pip" aria-hidden="true"></span>
        {/if}
      </button>
    {/if}
    {#if activeTab?.isScratchpad}
      <button
        class="icon-btn"
        title={$t("topBar.promote.title")}
        onclick={() => controller.promoteScratchpad(activeTab.id)}
      >
        <Icon name="promote" />{#if showActionLabels}<span class="icon-label">{$t("topBar.label.promote")}</span>{/if}
      </button>
    {/if}
    <button class="icon-btn" title={$t("topBar.settings.title", { combo: formatShortcut('openSettings') })} onclick={controller.openSettings}>
      <Icon name="settings" />{#if showActionLabels}<span class="icon-label">{$t("settings.modal.title")}</span>{/if}
    </button>
  {/if}
  {#if isMergedTitlebar}
    <div class="window-controls">
      <button class="win-btn" aria-label={$t("topBar.window.minimize")} onclick={() => controller.minimizeWindow()}>
        <Icon name="minimize" size={12} />
      </button>
      <button
        class="win-btn"
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
  <!-- #61 follow-up: off-screen measurement clones for `predictLabelsWouldFit`/
       `predictUncollapseWouldFit` above — never painted (`.topbar-measure`
       is `position: fixed` + `visibility: hidden`, so it's fully out of
       `#top-bar`'s own layout and never reaches the screen), but still real
       DOM the browser lays out, so `getBoundingClientRect()` on them is
       accurate. `aria-hidden` + `inert` keep them out of the accessibility
       tree and unreachable by keyboard/click even though they're
       plain <button>/<span> markup. Deliberately NOT full copies of the
       live buttons: no `data-*-trigger` attributes (so DatePickerModal's/
       MoreActionsModal's anchor lookups can never match one of these
       instead of the real, visible trigger) and no click handlers. If a
       button's icon or label text changes, this has to change with it —
       the same "keep two things in sync" caveat as `mockBackend.ts`
       mirroring `storage.rs`.
       Two groups: the bare label spans measure just the marginal width a
       label would add to a button that's currently icon-only (used when
       `showActionLabels` is off); the button clones measure the full
       secondary-action row's width in the *current* labels state (used
       only while `buttonsCollapsed` is true, since that's the only state
       where the real row isn't in the DOM at all to measure directly). -->
  <div class="icon-btn topbar-measure" aria-hidden="true" inert>
    <span class="icon-label" bind:this={labelDateEl}>{$t("topBar.label.date")}</span>
    <span class="icon-label" bind:this={labelActionsEl}>{$t("actionDrawer.modal.ariaLabel")}</span>
    <span class="icon-label" bind:this={labelHistoryEl}>{$t("history.modal.ariaLabel")}</span>
    <span class="icon-label" bind:this={labelSearchEl}>{$t("topBar.label.search")}</span>
    <span class="icon-label" bind:this={labelCalendarSyncEl}>{$t("topBar.label.calendarSync")}</span>
    <span class="icon-label" bind:this={labelPromoteEl}>{$t("topBar.label.promote")}</span>
    <span class="icon-label" bind:this={labelSettingsEl}>{$t("settings.modal.title")}</span>
  </div>
  <div class="topbar-measure" aria-hidden="true" inert>
    <button class="icon-btn" bind:this={cloneActionsEl} tabindex="-1">
      <Icon name="actions" />{#if showActionLabels}<span class="icon-label">{$t("actionDrawer.modal.ariaLabel")}</span>{/if}
    </button>
    <button class="icon-btn" bind:this={cloneHistoryEl} tabindex="-1">
      <Icon name="section-history" />{#if showActionLabels}<span class="icon-label">{$t("history.modal.ariaLabel")}</span>{/if}
    </button>
    <button class="icon-btn" bind:this={cloneSearchEl} tabindex="-1">
      <Icon name="search" />{#if showActionLabels}<span class="icon-label">{$t("topBar.label.search")}</span>{/if}
    </button>
    {#if calendarSyncVisible}
      <button class="icon-btn" bind:this={cloneCalendarSyncEl} tabindex="-1">
        <Icon name="calendar-import" />{#if showActionLabels}<span class="icon-label">{$t("topBar.label.calendarSync")}</span>{/if}
      </button>
    {/if}
    {#if activeTab?.isScratchpad}
      <button class="icon-btn" bind:this={clonePromoteEl} tabindex="-1">
        <Icon name="promote" />{#if showActionLabels}<span class="icon-label">{$t("topBar.label.promote")}</span>{/if}
      </button>
    {/if}
    <button class="icon-btn" bind:this={cloneSettingsEl} tabindex="-1">
      <Icon name="settings" />{#if showActionLabels}<span class="icon-label">{$t("settings.modal.title")}</span>{/if}
    </button>
  </div>
</div>

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
          if (contextTab) startRenaming(contextTab);
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
    {/if}
  </div>
{/if}

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
  flex: 0 0 20px;
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
  width: 44px;
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
}

.win-btn:hover {
  background: var(--surface-raised);
  color: var(--text);
}

.win-btn.win-close:hover {
  background: var(--state-error);
  color: #ffffff;
}

#tab-bar {
  display: flex;
  flex: 1;
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
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  color: var(--muted);
  white-space: nowrap;
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

.tab-bar-new-btn {
  /* height comes from the shared `#top-bar .icon-btn` rule below (higher
     specificity than a bare class here would be anyway) — not restated. */
  flex-shrink: 0;
  margin-left: 4px;
}

.tab-scroll-btn {
  flex-shrink: 0;
  padding: 0 6px;
}

.tab.active {
  background: var(--surface-canvas);
  color: var(--text);
  box-shadow: inset 0 2px 0 var(--tab-active-border);
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
  border-radius: 4px;
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

/* Tab Context Menu */

.tab-context-menu {
  position: fixed;
  z-index: 300;
  min-width: 180px;
  width: max-content;
  max-width: 280px;
  background: var(--surface-overlay);
  border: 1px solid var(--edge-strong);
  border-radius: 8px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 16px 44px rgba(0, 0, 0, 0.5);
  padding: 4px;
  font-size: 12px;
  color: var(--text);
}

.tab-context-item {
  width: 100%;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: inherit;
  font-family: var(--font);
  font-size: 12px;
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
}

.tab-context-item:disabled:hover {
  background: transparent;
}

.tab-context-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--edge-soft);
}

.tab-rename-input {
  background: var(--surface-input, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--accent);
  border-radius: 3px;
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
  font-size: 12px;
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

/* #96: `.tab.active`'s top border (below) defaults to `--tab-active-border`,
   the same color `.tab.today .tab-icon` already uses — so a selected
   today-tab needs no override. A selected past/future tab's border is
   brought in line with its own icon's color above, instead of always
   showing the "today" accent regardless of which tab is actually active. */

.tab.active:global(.past) {
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--muted) 45%, transparent);
}

.tab.active:global(.future) {
  box-shadow: inset 0 2px 0 var(--state-ok);
}
</style>
