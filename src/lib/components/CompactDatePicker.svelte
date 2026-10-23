<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { focusTrap } from "../actions/focusTrap";
  import {
    addDaysISO,
    addMonths,
    dueWordExtra,
    formatISO,
    isoWeek,
    longDate,
    monthGrid,
    monthName,
    parseDateQuery,
    parseDueWord,
    parseISODateLocal,
    todayISO,
    weekdayAbbrev,
    type CalCell,
  } from "../date";
  import Icon from "../icons/Icon.svelte";
  import { isMobile } from "../stores";
  import { t, locale } from "../i18n";

  interface Props {
    anchor: { left: number; top: number; bottom: number };
    value: string | null;
    range?: { from: string; to: string } | null;
    noneLabel?: string;
    /** Due dates: read the typed word as a due word first (`wk44` = that week's Friday, `fri` = the next Friday),
     * as `by:` does in the note. Otherwise (Export, calendar sync) the date picker's own words come first
     * (`wk44` = that week's Monday). */
    dueWords?: boolean;
    onPick: (iso: string | null) => void;
    onClose: () => void;
  }

  let {
    anchor,
    value,
    range = null,
    noneLabel,
    dueWords = false,
    onPick,
    onClose,
  }: Props = $props();

  const today = todayISO();
  const initialIso = untrack(() => value ?? today);
  const t0 = parseISODateLocal(initialIso);

  let year = $state(t0.getFullYear());
  let month = $state(t0.getMonth()); // 0-indexed
  let focusedIso = $state(initialIso);
  let jumpQuery = $state("");
  let anchorStyle = $state("visibility: hidden;");

  let popEl = $state<HTMLDivElement>();
  let gridEl = $state<HTMLDivElement>();
  let inputEl = $state<HTMLInputElement>();

  function reposition() {
    if (!popEl) return;
    const height = popEl.offsetHeight;
    const width = popEl.offsetWidth;
    let top = anchor.bottom + 4;
    if (top + height > window.innerHeight) {
      top = anchor.top - height - 4;
    }
    top = Math.max(8, top);
    let left = anchor.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    anchorStyle = `top: ${top}px; left: ${left}px;`;
  }

  $effect(() => {
    const _ = anchor;
    untrack(() => {
      reposition();
    });
  });

  onMount(async () => {
    reposition();
    await tick();
    if (!$isMobile) {
      inputEl?.focus();
    } else {
      focusFocusedDay();
    }
  });

  function onOutsideMousedown(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (popEl && !popEl.contains(target)) {
      onClose();
    }
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
    const dom = parseISODateLocal(focusedIso).getDate();
    const lastDom = new Date(year, month + 1, 0).getDate();
    focusedIso = formatISO(new Date(year, month, Math.min(dom, lastDom)));
    focusFocusedDay();
  }

  function getDueWordExtra() {
    return dueWordExtra(
      $t("dueDate.words.today", undefined) ?? "",
      $t("dueDate.words.tomorrow", undefined) ?? "",
    );
  }

  function parseQuery(q: string): string | null {
    const asDue = () => parseDueWord(q, today, $locale, getDueWordExtra());
    const parsed = dueWords ? (asDue() ?? parseDateQuery(q)) : (parseDateQuery(q) ?? asDue());
    if (parsed) return parsed;
    const ym = q.trim().match(/^(\d{4})-(\d{1,2})$/);
    if (ym) {
      const y = +ym[1];
      const m = Math.min(11, Math.max(0, +ym[2] - 1));
      return formatISO(new Date(y, m, 1));
    }
    if (/^\d{4}$/.test(q.trim())) {
      const y = +q.trim();
      return formatISO(new Date(y, 0, 1));
    }
    return null;
  }

  $effect(() => {
    const q = jumpQuery;
    untrack(() => {
      if (q.trim() === "") return;
      const parsed = parseQuery(q);
      if (parsed) {
        focusedIso = parsed;
        showMonthOf(parsed);
      }
    });
  });

  function onInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const parsed = parseQuery(jumpQuery);
      onPick(parsed ?? focusedIso);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusFocusedDay();
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
      moveFocus(addDaysISO(focusedIso, step[e.key]));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      shiftMonth(-1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      shiftMonth(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      const d = parseISODateLocal(focusedIso);
      const day = d.getDay();
      const diffToMon = (day + 6) % 7;
      moveFocus(addDaysISO(focusedIso, -diffToMon));
    } else if (e.key === "End") {
      e.preventDefault();
      const d = parseISODateLocal(focusedIso);
      const day = d.getDay();
      const diffToMon = (day + 6) % 7;
      moveFocus(addDaysISO(focusedIso, 6 - diffToMon));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(focusedIso);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  function onPopoverKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  const WEEKDAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
  const cells = $derived(monthGrid(year, month));

  const weeks = $derived.by(() => {
    const result: { weekNum: number; days: CalCell[] }[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const days = cells.slice(i, i + 7);
      result.push({
        weekNum: isoWeek(days[0].iso),
        days,
      });
    }
    return result;
  });

  function isInRange(iso: string): boolean {
    if (!range || !range.from || !range.to) return false;
    const min = range.from < range.to ? range.from : range.to;
    const max = range.from < range.to ? range.to : range.from;
    return iso >= min && iso <= max;
  }
</script>

<svelte:window onmousedown={onOutsideMousedown} onresize={reposition} />

<div
  class="compact-picker"
  bind:this={popEl}
  role="dialog"
  aria-label={$t("compactPicker.ariaLabel")}
  tabindex="-1"
  use:focusTrap
  style={anchorStyle}
  onkeydown={onPopoverKeydown}
>
  <input
    class="cp-input"
    bind:this={inputEl}
    placeholder={$t("compactPicker.placeholder")}
    bind:value={jumpQuery}
    onkeydown={onInputKeydown}
    autocomplete="off"
    aria-label={$t("compactPicker.ariaLabel")}
  />

  <div class="cp-head">
    <button
      type="button"
      class="cp-nav"
      aria-label={$t("datePicker.previousMonth")}
      onclick={() => shiftMonth(-1)}
    >
      <Icon name="chevron-left" size={13} />
    </button>
    <span class="cp-title" aria-live="polite">
      {monthName($locale, month)} {year}
    </span>
    <button
      type="button"
      class="cp-nav"
      aria-label={$t("datePicker.nextMonth")}
      onclick={() => shiftMonth(1)}
    >
      <Icon name="chevron-right" size={13} />
    </button>
  </div>

  <div class="cp-weekdays" aria-hidden="true">
    <span class="cp-week-col-head">{$t("datePicker.weekColumn")}</span>
    {#each WEEKDAY_INDICES as i}
      <span>{weekdayAbbrev($locale, i)}</span>
    {/each}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="cp-grid"
    role="group"
    aria-label={$t("compactPicker.ariaLabel")}
    tabindex="-1"
    bind:this={gridEl}
    onkeydown={onGridKeydown}
  >
    {#each weeks as week (week.days[0].iso)}
      <span class="cp-week-num" aria-hidden="true">{week.weekNum}</span>
      {#each week.days as cell (cell.iso)}
        <button
          type="button"
          class="cp-day"
          class:out={!cell.inMonth}
          class:today={cell.iso === today}
          class:selected={cell.iso === value}
          class:in-range={isInRange(cell.iso)}
          data-iso={cell.iso}
          tabindex={cell.iso === focusedIso ? 0 : -1}
          aria-label={longDate($locale, cell.iso)}
          aria-current={cell.iso === today ? "date" : undefined}
          aria-pressed={cell.iso === value ? "true" : undefined}
          onclick={() => onPick(cell.iso)}
        >
          {cell.day}
        </button>
      {/each}
    {/each}
  </div>

  <div class="cp-foot">
    <button type="button" class="cp-today" onclick={() => onPick(today)}>
      {$t("datePicker.today")}
    </button>
    {#if noneLabel}
      <button type="button" class="cp-none" onclick={() => onPick(null)}>
        {noneLabel}
      </button>
    {/if}
  </div>
</div>

<style>
  .compact-picker {
    position: fixed;
    z-index: 260;
    background: var(--surface-overlay);
    background: color-mix(in srgb, var(--surface-overlay) 92%, transparent);
    backdrop-filter: blur(20px) saturate(125%);
    border: 1px solid var(--edge-strong);
    border-radius: 8px;
    box-shadow: var(--shadow-flyout);
    font-size: var(--editor-font-size, 13px);
    padding: 0.45em;
    color: var(--text);
    user-select: none;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .cp-input {
    width: 100%;
    height: 1.85em;
    box-sizing: border-box;
    background: var(--surface-raised);
    border: 1px solid var(--edge-soft);
    border-radius: var(--radius-control);
    padding: 0 0.5em;
    font-size: 1em;
    color: var(--text);
    outline: none;
    margin-bottom: 0.35em;
  }

  .cp-input:focus-visible {
    border-color: var(--tab-active-border);
  }

  .cp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.25em;
  }

  .cp-title {
    font-size: 1em;
    font-weight: 500;
    text-align: center;
    flex: 1;
  }

  .cp-nav {
    background: transparent;
    border: none;
    color: var(--muted);
    cursor: pointer;
    width: 1.55em;
    height: 1.55em;
    border-radius: var(--radius-control);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-family: inherit;
  }

  .cp-nav:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .cp-nav:focus-visible {
    outline: 2px solid var(--tab-active-border);
  }

  .cp-weekdays,
  .cp-grid {
    display: grid;
    grid-template-columns: 1.4em repeat(7, 1.85em);
    gap: 1px;
    justify-content: center;
  }

  .cp-weekdays {
    margin-bottom: 2px;
  }

  .cp-weekdays span {
    text-align: center;
    color: var(--muted);
    font-size: 0.8em;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cp-weekdays span.cp-week-col-head {
    color: var(--text-tertiary);
    font-size: 0.8em;
    font-weight: 600;
  }

  .cp-week-num {
    color: var(--text-tertiary);
    font-size: 0.8em;
    display: flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .cp-day {
    position: relative;
    width: 1.85em;
    height: 1.7em;
    background: transparent;
    border: none;
    border-radius: 0.38em;
    color: var(--text);
    font-family: var(--font-ui);
    font-size: 1em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
    box-sizing: border-box;
    padding: 0;
    transition: background var(--motion-fast) ease, color var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
  }

  .cp-day:hover:not(.selected) {
    background: color-mix(in srgb, var(--text) 10%, transparent);
  }

  .cp-day:focus-visible {
    outline: 2px solid var(--tab-active-border);
    outline-offset: 1px;
  }

  .cp-day.out {
    color: var(--text-tertiary);
  }

  .cp-day.today {
    box-shadow: inset 0 0 0 1px var(--muted);
  }

  .cp-day.today.selected {
    box-shadow: inset 0 0 0 1px var(--selected-fg);
  }

  .cp-day.in-range:not(.selected) {
    background: color-mix(in srgb, var(--selected-bg) 14%, transparent);
  }

  .cp-day.selected {
    background: var(--selected-bg);
    color: var(--selected-fg);
    font-weight: 500;
  }

  .cp-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.4em;
    padding-top: 0.35em;
    border-top: 1px solid var(--edge-soft);
    font-size: 0.92em;
  }

  .cp-today,
  .cp-none {
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    padding: 2px 4px;
    border-radius: var(--radius-control);
  }

  .cp-today {
    color: var(--tab-active-border);
    font-weight: 500;
  }

  .cp-today:hover {
    background: var(--surface-raised);
  }

  .cp-none {
    color: var(--muted);
    font-weight: 500;
  }

  .cp-none:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .cp-today:focus-visible,
  .cp-none:focus-visible {
    outline: 2px solid var(--tab-active-border);
  }
</style>
