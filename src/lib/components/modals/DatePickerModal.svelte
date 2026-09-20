<script lang="ts">
  import { get } from "svelte/store";
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { activeTabId, allNotesCache, copyForwardPending, isMobile, tabs } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import {
    addDaysISO,
    addMonths,
    computeDayHeat,
    type DayHeatState,
    formatISO,
    monthGrid,
    MONTH_NAMES,
    parseDateQuery,
    parseISODateLocal,
    todayISO,
  } from "../../date";
  import { countActions } from "../../tokens";
  import Icon from "../../icons/Icon.svelte";

  const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const today = todayISO();

  let popEl: HTMLDivElement;
  let gridEl: HTMLDivElement;
  let inputEl: HTMLInputElement;
  let jumpQuery = "";
  let anchorStyle = "visibility:hidden"; // until measured against the trigger

  /** Opens on the active tab's own date (and highlights it, via
   * `focusedIso` below) rather than always today's — a scratchpad, or no
   * active tab, falls back to today since there's no date to prefer. */
  function activeTabIso(): string {
    const tab = get(tabs).find((t) => t.id === get(activeTabId));
    if (tab && !tab.isScratchpad) {
      const iso = tab.filename.replace(/\.txt$/, "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    }
    return today;
  }

  // Which month the grid is showing, and which day has keyboard focus.
  const initialIso = activeTabIso();
  const t0 = parseISODateLocal(initialIso);
  let year = t0.getFullYear();
  let month = t0.getMonth(); // 0-indexed
  let focusedIso = initialIso;
  // On a touch device the day the picker opened on isn't a selection - you pick by
  // tapping - so marking it (and re-marking it as you flip between months) only
  // confuses. The mark appears once the keyboard moves it: arrows/PageUp/PageDown in
  // the grid, or typing a date.
  let movedByKeyboard = false;
  $: showTarget = !$isMobile || movedByKeyboard;

  $: cells = monthGrid(year, month);

  /** #46/§129's lesson applies here too: never guess at note content when
   * an open tab already has the true, possibly-unsaved version in memory
   * — `prefetchNotesForDates` already respects that. This just decides
   * *when* to bother fetching: while the full background read (`onMount`
   * below) is still in flight, so a handful of small reads make the
   * visible month's dots/bold appear immediately instead of waiting on
   * however much note history exists. Stops re-firing once that full
   * read lands (`loadingAll` flips false) — nothing left to gain by
   * re-fetching days `allNotesCache` already has. */
  let loadingAll = true;
  $: if (loadingAll) void controller.prefetchNotesForDates(cells.map((c) => `${c.iso}.txt`));

  // Follow the query live: as you type a date (or a `YYYY-MM` prefix) the
  // grid jumps to it and marks the target — Enter then commits it.
  $: followQuery(jumpQuery);
  function followQuery(q: string) {
    if (q.trim() !== "") movedByKeyboard = true;
    const parsed = parseDateQuery(q);
    if (parsed) {
      focusedIso = parsed;
      showMonthOf(parsed);
      return;
    }
    const ym = q.trim().match(/^(\d{4})-(\d{1,2})$/);
    if (ym) {
      year = +ym[1];
      month = Math.min(11, Math.max(0, +ym[2] - 1));
      focusedIso = formatISO(new Date(year, month, 1));
    } else if (/^\d{4}$/.test(q.trim())) {
      year = +q.trim();
      focusedIso = formatISO(new Date(year, month, 1));
    }
  }

  /** One pass over the notes cache: `noteByIso` = every day whose dated
   * note actually has content (an empty file — e.g. a date note created
   * just by visiting it, then never typed into — doesn't count as
   * "wrote something that day"), `openByIso` = the subset with ≥1 open
   * action, `heatByIso` = 3-tier completion heatmap state ("done", "pending", "log"). */
  $: ({ noteByIso, openByIso, heatByIso } = (() => {
    const noteByIso = new Set<string>();
    const openByIso = new Set<string>();
    const heatByIso = new Map<string, DayHeatState>();
    for (const [fn, content] of Object.entries($allNotesCache)) {
      const d = fn.replace(/\.txt$/, "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (content.trim() === "") continue;
      noteByIso.add(d);
      const heat = computeDayHeat(content);
      if (heat) {
        heatByIso.set(d, heat);
        if (heat === "pending") openByIso.add(d);
      }
    }
    return { noteByIso, openByIso, heatByIso };
  })());

  onMount(async () => {
    positionUnderTrigger();
    await tick();
    inputEl?.focus(); // type-to-jump is the default, same as the other drawers
    await controller.refreshAllNotesCache();
    loadingAll = false;
  });

  function positionUnderTrigger() {
    const trigger = document.querySelector<HTMLElement>("[data-datepicker-trigger]");
    if (!trigger || !popEl) {
      anchorStyle = "";
      return;
    }
    const r = trigger.getBoundingClientRect();
    const w = popEl.offsetWidth || 248;
    // Right-align to the trigger, but never spill off the left edge.
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    anchorStyle = `top:${r.bottom + 6}px; left:${left}px`;
  }

  async function focusFocusedDay() {
    await tick();
    gridEl?.querySelector<HTMLButtonElement>(`[data-iso="${focusedIso}"]`)?.focus();
  }

  function showMonthOf(iso: string) {
    const d = parseISODateLocal(iso);
    year = d.getFullYear();
    month = d.getMonth();
  }

  function moveFocus(iso: string) {
    focusedIso = iso;
    showMonthOf(iso);
    focusFocusedDay();
  }

  function shiftMonth(delta: number) {
    ({ year, month } = addMonths(year, month, delta));
    // Keep the focused day inside the visible month.
    const dom = parseISODateLocal(focusedIso).getDate();
    const lastDom = new Date(year, month + 1, 0).getDate();
    focusedIso = formatISO(new Date(year, month, Math.min(dom, lastDom)));
    focusFocusedDay();
  }

  function goToday() {
    moveFocus(today);
  }

  function commit(iso: string) {
    // #66: "copy to next occurrence" reuses this same picker when its own
    // search finds nothing — resolve that instead of the picker's normal
    // "jump to this date" behavior when one is waiting.
    if (get(copyForwardPending)) {
      controller.resolveCopyForwardPending(iso);
    } else {
      controller.commitDatePick(iso);
    }
  }

  function onJumpKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      // `followQuery` has already moved `focusedIso` to the best reading
      // of what's typed (a full date, or the 1st of a typed month); Enter
      // just commits wherever that landed.
      commit(parseDateQuery(jumpQuery) ?? focusedIso);
    } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      focusFocusedDay();
    }
  }

  function onGridKeydown(e: KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step || e.key === "PageUp" || e.key === "PageDown") movedByKeyboard = true;
    if (e.key in step) {
      e.preventDefault();
      moveFocus(addDaysISO(focusedIso, step[e.key]));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      shiftMonth(-1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      shiftMonth(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      inputEl?.focus();
    }
  }

  function onOutsideMousedown(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    // Ignore clicks on the 📅 trigger — its own click handler toggles the
    // popover, and closing here would just let it immediately re-open.
    if (t?.closest("[data-datepicker-trigger]")) return;
    if (popEl && !popEl.contains(t)) controller.closeAllModals();
  }
</script>

<svelte:window on:mousedown={onOutsideMousedown} on:resize={positionUnderTrigger} />

<div
  class="datepicker-pop"
  bind:this={popEl}
  role="dialog"
  aria-label="Jump to date"
  use:focusTrap
  style={anchorStyle}
>
  <input
    class="datepicker-jump"
    bind:this={inputEl}
    placeholder="Jump to date — today, -2, 2026-09-05…"
    bind:value={jumpQuery}
    on:keydown={onJumpKeydown}
    autocomplete="off"
    aria-label="Jump to a date by typing"
  />

  <div class="cal-head">
    <button type="button" class="cal-nav" aria-label="Previous month" on:click={() => shiftMonth(-1)}>
      <Icon name="chevron-left" size={14} />
    </button>
    <span class="cal-title-wrap">
      <span class="cal-title" aria-live="polite">{MONTH_NAMES[month]} {year}</span>
      {#if loadingAll}
        <span class="modal-spinner" title="Loading older notes…" aria-label="Loading older notes">⟳</span>
      {/if}
    </span>
    <button type="button" class="cal-nav" aria-label="Next month" on:click={() => shiftMonth(1)}>
      <Icon name="chevron-right" size={14} />
    </button>
  </div>

  <div class="cal-weekdays" aria-hidden="true">
    {#each WEEKDAYS as w}<span>{w}</span>{/each}
  </div>

  <div class="cal-grid" role="grid" tabindex="-1" bind:this={gridEl} on:keydown={onGridKeydown}>
    {#each cells as cell (cell.iso)}
      <button
        type="button"
        class="cal-day"
        class:out={!cell.inMonth}
        class:today={cell.iso === today}
        class:target={showTarget && cell.iso === focusedIso}
        class:hasnote={noteByIso.has(cell.iso)}
        class:has={openByIso.has(cell.iso)}
        class:has-done={heatByIso.get(cell.iso) === "done"}
        class:has-pending={heatByIso.get(cell.iso) === "pending"}
        class:has-log={heatByIso.get(cell.iso) === "log"}
        data-iso={cell.iso}
        tabindex={cell.iso === focusedIso ? 0 : -1}
        aria-label={`${cell.iso}${
          heatByIso.get(cell.iso) === "done"
            ? ", all tasks completed"
            : heatByIso.get(cell.iso) === "pending"
              ? ", open actions pending"
              : heatByIso.get(cell.iso) === "log"
                ? ", note log with no tasks"
                : noteByIso.has(cell.iso)
                  ? ", has a note"
                  : ""
        }`}
        aria-current={cell.iso === today ? "date" : undefined}
        on:click={() => commit(cell.iso)}
      >
        {cell.day}
      </button>
    {/each}
  </div>

  <div class="cal-foot">
    <button type="button" class="cal-today-btn" on:click={goToday}>Today</button>
    <span class="cal-hint">Esc to close</span>
  </div>
</div>
