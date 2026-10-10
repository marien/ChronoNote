<script lang="ts">
  import { get } from "svelte/store";
  import { onMount, tick, untrack } from "svelte";
  import * as controller from "../../controller";
  import { activeTabId, allNotesCache, copyForwardPending, isMobile, tabs } from "../../controller";
  import * as api from "../../tauriApi";
  import { agendaFileExists, calendarSyncEnabled } from "../../stores";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import {
    addDaysISO,
    addMonths,
    computeDayHeat,
    type CalCell,
    type DayHeatState,
    formatISO,
    isoWeek,
    monthGrid,
    monthName,
    weekdayAbbrev,
    parseDateQuery,
    parseISODateLocal,
    todayISO,
  } from "../../date";
  import { countActions } from "../../tokens";
  import Icon from "../../icons/Icon.svelte";
  import { t, locale } from "../../i18n";

  const WEEKDAY_INDICES = [0, 1, 2, 3, 4, 5, 6];
  const today = todayISO();

  let popEl: HTMLDivElement;
  let gridEl: HTMLDivElement;
  let inputEl: HTMLInputElement;
  let jumpQuery = $state("");
  let anchorStyle = $state("visibility:hidden"); // until measured against the trigger

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
  let year = $state(t0.getFullYear());
  let month = $state(t0.getMonth()); // 0-indexed
  let focusedIso = $state(initialIso);
  // On a touch device the day the picker opened on isn't a selection - you pick by
  // tapping - so marking it (and re-marking it as you flip between months) only
  // confuses. The mark appears once the keyboard moves it: arrows/PageUp/PageDown in
  // the grid, or typing a date.
  let movedByKeyboard = $state(false);
  const showTarget = $derived(!$isMobile || movedByKeyboard);

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

  /** #46/§129's lesson applies here too: never guess at note content when
   * an open tab already has the true, possibly-unsaved version in memory
   * — `prefetchNotesForDates` already respects that. This just decides
   * *when* to bother fetching: while the full background read (`onMount`
   * below) is still in flight, so a handful of small reads make the
   * visible month's dots/bold appear immediately instead of waiting on
   * however much note history exists. Stops re-firing once that full
   * read lands (`loadingAll` flips false) — nothing left to gain by
   * re-fetching days `allNotesCache` already has. */
  let loadingAll = $state(true);
  $effect(() => {
    if (loadingAll) {
      const filenames = cells.map((c) => `${c.iso}.txt`);
      untrack(() => {
        void controller.prefetchNotesForDates(filenames);
      });
    }
  });

  // Follow the query live: as you type a date (or a `YYYY-MM` prefix) the
  // grid jumps to it and marks the target — Enter then commits it.
  $effect(() => {
    const q = jumpQuery;
    untrack(() => {
      followQuery(q);
    });
  });
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
  const notesHeatmap = $derived.by(() => {
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
  });
  const noteByIso = $derived(notesHeatmap.noteByIso);
  const openByIso = $derived(notesHeatmap.openByIso);
  const heatByIso = $derived(notesHeatmap.heatByIso);

  let agendaDates = $state(new Set<string>());

  onMount(async () => {
    positionUnderTrigger();
    await tick();
    // Type-to-jump is the default, same as the other drawers; not on a phone, where it raises the keyboard.
    if (!get(isMobile)) inputEl?.focus();
    if (get(calendarSyncEnabled) && get(agendaFileExists)) {
      try {
        const dates = await api.readAgendaDates();
        agendaDates = new Set(dates);
      } catch {
        agendaDates = new Set();
      }
    }
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
    const w = popEl.offsetWidth || 284;
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

<svelte:window onmousedown={onOutsideMousedown} onresize={positionUnderTrigger} />

<div
  class="datepicker-pop"
  bind:this={popEl}
  role="dialog"
  aria-label={$t("datePicker.ariaLabel")}
  use:focusTrap
  use:sheetSwipe
  style={anchorStyle}
>
  <input
    class="datepicker-jump"
    bind:this={inputEl}
    placeholder={$t("datePicker.jumpPlaceholder")}
    bind:value={jumpQuery}
    onkeydown={onJumpKeydown}
    autocomplete="off"
    aria-label={$t("datePicker.jumpAriaLabel")}
  />

  <div class="cal-head">
    <button type="button" class="cal-nav" aria-label={$t("datePicker.previousMonth")} onclick={() => shiftMonth(-1)}>
      <Icon name="chevron-left" size={14} />
    </button>
    <span class="cal-title-wrap">
      <span class="cal-title" aria-live="polite">{monthName($locale, month)} {year}</span>
      {#if loadingAll}
        <span class="modal-spinner" title="{$t('datePicker.loadingOlderNotes')}…" aria-label={$t("datePicker.loadingOlderNotes")}>⟳</span>
      {/if}
    </span>
    <button type="button" class="cal-nav" aria-label={$t("datePicker.nextMonth")} onclick={() => shiftMonth(1)}>
      <Icon name="chevron-right" size={14} />
    </button>
  </div>

  <div class="cal-weekdays" aria-hidden="true">
    <span class="cal-week-col-head">{$t("datePicker.weekColumn")}</span>
    {#each WEEKDAY_INDICES as i}<span>{weekdayAbbrev($locale, i)}</span>{/each}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="cal-grid" role="group" aria-label={$t("datePicker.ariaLabel")} tabindex="-1" bind:this={gridEl} onkeydown={onGridKeydown}>
    {#each weeks as week (week.days[0].iso)}
      <span class="cal-week-num" aria-hidden="true">{week.weekNum}</span>
      {#each week.days as cell (cell.iso)}
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
          class:has-agenda={!noteByIso.has(cell.iso) && agendaDates.has(cell.iso)}
          data-iso={cell.iso}
          tabindex={cell.iso === focusedIso ? 0 : -1}
          aria-label={`${cell.iso}${
            heatByIso.get(cell.iso) === "pending"
              ? $t("datePicker.day.pending")
              : heatByIso.get(cell.iso) === "done"
                ? $t("datePicker.day.allDone")
                : heatByIso.get(cell.iso) === "log"
                  ? $t("datePicker.day.log")
                  : noteByIso.has(cell.iso)
                    ? $t("datePicker.day.hasNote")
                    : agendaDates.has(cell.iso)
                      ? $t("datePicker.day.agendaOnly")
                      : ""
          }`}
          aria-current={cell.iso === today ? "date" : undefined}
          onclick={() => commit(cell.iso)}
        >
          {cell.day}
        </button>
      {/each}
    {/each}
  </div>

  <div class="cal-foot">
    <button type="button" class="cal-today-btn" onclick={goToday}>{$t("datePicker.today")}</button>
    {#if !$isMobile}<span class="cal-hint">{$t("datePicker.escToClose")}</span>{/if}
  </div>
</div>

<style>
/* §104: anchored mini calendar popover (the date picker). Not an
   overlay — it's positioned under the top-bar 📅 trigger and closed by
   Esc / an outside click. */

.datepicker-pop {
  position: fixed;
  z-index: 250;
  width: 284px;
  background: var(--surface-overlay);
  background: color-mix(in srgb, var(--surface-overlay) 88%, transparent);
  backdrop-filter: blur(20px) saturate(125%);
  border: 1px solid var(--edge-strong);
  border-radius: var(--radius-overlay);
  box-shadow: var(--shadow-flyout);
  padding: 10px;
  font-size: 13px;
  color: var(--text);
  user-select: none;
  box-sizing: border-box;
}

.datepicker-jump {
  width: 100%;
  box-sizing: border-box;
  background: var(--surface-raised);
  border: 1px solid var(--edge-soft);
  border-radius: var(--radius-control);
  padding: 6px 8px;
  font-size: 13px;
  color: var(--text);
  outline: none;
  margin-bottom: 8px;
}

.datepicker-jump:focus-visible {
  border-color: var(--tab-active-border);
}

.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 6px;
}

.cal-title-wrap {
  /* One flex item for .cal-head's `space-between` (prev / this / next),
     so the optional loading spinner next to the title doesn't throw off
     the nav buttons' spacing. */
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cal-title {
  font-size: 15px;
  font-weight: 600;
}

.cal-title-wrap .modal-spinner {
  font-size: 11px;
}

.cal-nav {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-control);
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cal-nav:hover {
  background: var(--surface-raised);
  color: var(--text);
}

.cal-weekdays,
.cal-grid {
  display: grid;
  grid-template-columns: 26px repeat(7, 32px);
  gap: 2px;
  justify-content: center;
}

.cal-weekdays {
  margin-bottom: 2px;
}

.cal-weekdays span {
  text-align: center;
  color: var(--muted);
  font-size: var(--type-caption);
  padding: 3px 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cal-weekdays span.cal-week-col-head {
  color: var(--text-tertiary);
  font-size: 10.5px;
  font-weight: 600;
}

.cal-week-num {
  color: var(--text-tertiary);
  font-size: 10.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.cal-day {
  position: relative;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 50%;
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 12.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  transition: background var(--motion-fast) ease, border-color var(--motion-fast) ease, opacity var(--motion-fast) ease, color var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
  box-sizing: border-box;
  padding: 0;
}

.cal-day:hover {
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

.cal-day:focus-visible {
  outline: 2px solid var(--tab-active-border);
  outline-offset: 2px;
}

.cal-day.out {
  color: var(--text-tertiary);
  opacity: 0.6;
}

/* State C (Agenda Only): Dashed bounding ring placeholder */
.cal-day.has-agenda {
  color: var(--muted);
  border: 1px dashed var(--edge-strong);
  font-weight: 500;
}

.cal-day.has-agenda:hover {
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

/* State A (Notes Recorded / Settled): Bold text on a faint fill */
.cal-day.hasnote {
  color: var(--text);
  font-weight: 700;
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.cal-day.hasnote:hover {
  background: color-mix(in srgb, var(--text) 14%, transparent);
}

/* State B (Open Actions Pending): 1.5px warning ring */
.cal-day.has-pending {
  box-shadow: inset 0 0 0 1.5px var(--state-warn);
}

/* Grayscale mode: State B distinguished by solid 1.5px text-colored ring */
:global([data-color-mode="grayscale"]) .cal-day.has-pending {
  box-shadow: inset 0 0 0 1.5px var(--text);
  font-weight: 800;
}

/* Today: filled --selected-bg circle with --selected-fg text */
.cal-day.today {
  background: var(--selected-bg);
  color: var(--selected-fg);
  font-weight: 600;
}

/* Target/selected: 2px --selected-bg ring */
.cal-day.target {
  box-shadow: inset 0 0 0 2px var(--selected-bg);
}

/* Both today and selected: fill plus an inner --selected-fg 1px ring */
.cal-day.today.target {
  background: var(--selected-bg);
  color: var(--selected-fg);
  box-shadow: inset 0 0 0 1px var(--selected-fg);
}

.cal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid var(--edge-soft);
}

.cal-today-btn {
  background: transparent;
  border: none;
  color: var(--tab-active-border);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--type-caption);
  font-weight: 600;
  padding: 2px 4px;
  border-radius: var(--radius-control);
}

.cal-today-btn:hover {
  background: var(--surface-raised);
}

.cal-hint {
  color: var(--muted);
  font-size: var(--type-caption);
}
</style>
