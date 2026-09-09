<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import { allNotesCache } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { addMonths, formatISO, monthGrid, MONTH_NAMES, parseDateQuery, todayISO } from "../../date";
  import { countActions } from "../../tokens";

  const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const today = todayISO();

  let popEl: HTMLDivElement;
  let gridEl: HTMLDivElement;
  let jumpQuery = "";
  let anchorStyle = "visibility:hidden"; // until measured against the trigger

  // Which month the grid is showing, and which day has keyboard focus.
  const t0 = new Date();
  let year = t0.getFullYear();
  let month = t0.getMonth(); // 0-indexed
  let focusedIso = today;

  $: cells = monthGrid(year, month);

  /** `YYYY-MM-DD` → has ≥1 open action. Rebuilt whenever the notes cache
   * changes (it's refreshed once on mount). */
  $: openByIso = (() => {
    const set = new Set<string>();
    for (const [fn, content] of Object.entries($allNotesCache)) {
      const d = fn.replace(/\.txt$/, "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && countActions(content).open > 0) set.add(d);
    }
    return set;
  })();

  onMount(async () => {
    positionUnderTrigger();
    await controller.refreshAllNotesCache();
    await tick();
    focusFocusedDay();
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

  function shiftMonth(delta: number) {
    ({ year, month } = addMonths(year, month, delta));
    // Keep the focused day inside the visible month.
    const clamped = new Date(year, month, Math.min(new Date(focusedIso).getDate(), new Date(year, month + 1, 0).getDate()));
    focusedIso = formatISO(clamped);
    focusFocusedDay();
  }

  function goToday() {
    const d = new Date();
    year = d.getFullYear();
    month = d.getMonth();
    focusedIso = today;
    focusFocusedDay();
  }

  function commit(iso: string) {
    controller.commitDatePick(iso);
  }

  function onJumpKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const parsed = parseDateQuery(jumpQuery);
      if (parsed) commit(parsed);
    }
  }

  function onGridKeydown(e: KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in step) {
      e.preventDefault();
      const d = new Date(focusedIso);
      d.setDate(d.getDate() + step[e.key]);
      focusedIso = formatISO(d);
      if (d.getFullYear() !== year || d.getMonth() !== month) {
        year = d.getFullYear();
        month = d.getMonth();
      }
      focusFocusedDay();
    } else if (e.key === "PageUp") {
      e.preventDefault();
      shiftMonth(-1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      shiftMonth(1);
    }
  }

  function onOutsideMousedown(e: MouseEvent) {
    if (popEl && !popEl.contains(e.target as Node)) controller.closeAllModals();
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
    placeholder="Jump to date — today, -2, 2026-09-05…"
    bind:value={jumpQuery}
    on:keydown={onJumpKeydown}
    autocomplete="off"
    aria-label="Jump to a date by typing"
  />

  <div class="cal-head">
    <button type="button" class="cal-nav" aria-label="Previous month" on:click={() => shiftMonth(-1)}>‹</button>
    <span class="cal-title" aria-live="polite">{MONTH_NAMES[month]} {year}</span>
    <button type="button" class="cal-nav" aria-label="Next month" on:click={() => shiftMonth(1)}>›</button>
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
        class:has={openByIso.has(cell.iso)}
        data-iso={cell.iso}
        tabindex={cell.iso === focusedIso ? 0 : -1}
        aria-label="{cell.iso}{openByIso.has(cell.iso) ? ', has open actions' : ''}"
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
