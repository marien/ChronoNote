<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { get } from "svelte/store";
  import * as controller from "../../controller";
  import { currentDateISO, tabs } from "../../controller";
  import {
    allNotesCache,
    isMobile,
    editorApi,
    weekReviewYear,
    weekReviewWeek,
    weekReviewShowDone,
  } from "../../stores";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import {
    buildWeekReview,
    formatWeekRange,
    isoYearAndWeek,
    type WeekReviewItem,
  } from "../../weekReview";
  import { noteDateLabel } from "../../noteDateLabel";
  import { addDaysISO, isoWeekToMonday, todayISO, parseISODateLocal } from "../../date";
  import { toggleOpenClosed } from "../../tokens";
  import { writeTabContent, refreshAllNotesCache } from "../../persistence";
  import { drawerTreeGuides, type TreeGuide, nodeTextRange } from "../../actionDrawerRows";
  import { glyphForSymbol, parseGlyphLine } from "../../editor/glyphLine";
  import {
    clampIndex,
    scrollToShow,
    stackHeight,
    visibleWindow,
    withTops,
    type PlacedRow,
    MODAL_ITEM_ROW_HEIGHT,
    MODAL_HEADER_ROW_HEIGHT,
    ACTION_ITEM_ROW_HEIGHT,
    ACTION_ITEM_ROW_HEIGHT_MOBILE,
  } from "./virtualList";
  import { t, locale } from "../../i18n";
  import Icon from "../../icons/Icon.svelte";
  import EmptyState from "../EmptyState.svelte";

  interface Props {
    docked?: boolean;
  }
  let { docked = false }: Props = $props();

  const ROW_INSET = 18;
  const TREE_INDENT = 24;
  const GLYPH_CENTER = 5;

  let rootEl: HTMLElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();
  let mounted = false;
  let selectedIndex = $state(0);
  let scrollTop = $state(0);
  let viewportHeight = $state(420);

  onMount(() => {
    void refreshAllNotesCache();
    mounted = true;
    if (!$isMobile) {
      // After the list has rendered, and after the keystroke that opened the view (the editor's own Ctrl+Shift+K)
      // is done: focusing at once left the caret in the note, so Left/Right moved it instead of changing the week.
      requestAnimationFrame(() => listEl?.focus());
    }
    document.addEventListener("keydown", onKeydown);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", onKeydown);
  });

  function handleClose() {
    controller.closeAllModals();
    if (docked) {
      editorApi?.focus();
    }
  }

  function handleFocusIn(e: FocusEvent) {
    if (!docked || !mounted) return;
    const fromOutside =
      !e.relatedTarget ||
      (e.relatedTarget instanceof Node && !rootEl?.contains(e.relatedTarget));
    if (fromOutside) {
      listEl?.focus();
    }
  }

  // Precedence: open tabs override disk cache
  const noteList = $derived.by(() => {
    const tabMap = new Map($tabs.map((t) => [t.filename, t.content]));
    const result: { filename: string; content: string }[] = [];
    for (const [filename, content] of Object.entries($allNotesCache)) {
      result.push({
        filename,
        content: tabMap.has(filename) ? tabMap.get(filename)! : content,
      });
    }
    for (const t of $tabs) {
      if (!Object.prototype.hasOwnProperty.call($allNotesCache, t.filename)) {
        result.push({ filename: t.filename, content: t.content });
      }
    }
    return result;
  });

  const reviewModel = $derived(
    buildWeekReview(noteList, $weekReviewYear, $weekReviewWeek, $currentDateISO),
  );

  const sundayBeforeShownWeek = $derived(
    addDaysISO(isoWeekToMonday($weekReviewYear, $weekReviewWeek), -1),
  );

  const prevWeekNumber = $derived.by(() => {
    const mon = isoWeekToMonday($weekReviewYear, $weekReviewWeek);
    return isoYearAndWeek(addDaysISO(mon, -7)).week;
  });

  const nextWeekNumber = $derived.by(() => {
    const mon = isoWeekToMonday($weekReviewYear, $weekReviewWeek);
    return isoYearAndWeek(addDaysISO(mon, 7)).week;
  });

  function shiftWeek(delta: number) {
    const currentMon = isoWeekToMonday($weekReviewYear, $weekReviewWeek);
    const targetMonday = addDaysISO(currentMon, delta * 7);
    const target = isoYearAndWeek(targetMonday);
    weekReviewYear.set(target.year);
    weekReviewWeek.set(target.week);
    selectedIndex = 0;
  }

  function goToThisWeek() {
    const target = isoYearAndWeek(todayISO());
    weekReviewYear.set(target.year);
    weekReviewWeek.set(target.week);
    selectedIndex = 0;
  }


  function glyphFor(item: WeekReviewItem): { char: string; cls?: string } {
    if (item.itemKind === "decision") {
      return { char: "➔", cls: "glyph-arrow" };
    }
    const sym = item.state ?? (item.itemKind === "topic" ? "o" : "#");
    const g = glyphForSymbol(sym);
    return { char: g.text, cls: g.cls };
  }

  function textRangeFor(item: WeekReviewItem): { from: number; to: number } {
    if (item.itemKind === "action" || item.itemKind === "step") {
      return nodeTextRange(item as any);
    }
    if (item.itemKind === "topic") {
      const lead = item.line.match(/^(\s*[o.,]\s*)/)?.[0].length ?? 0;
      return { from: lead, to: item.line.length };
    }
    if (item.itemKind === "decision") {
      const lead = item.line.match(/^(\s*=>\s*)/)?.[0].length ?? 0;
      return { from: lead, to: item.line.length };
    }
    return { from: 0, to: item.line.length };
  }

  async function ensureTabOpen(filename: string): Promise<string> {
    const existing = get(tabs).find((t) => t.filename === filename);
    if (existing) return existing.id;
    await controller.openOrCreateDatedFile(filename.replace(/\.txt$/, ""));
    const opened = get(tabs).find((t) => t.filename === filename);
    return opened!.id;
  }

  async function toggleItem(item: WeekReviewItem, dir: 1 | -1 = 1) {
    if (item.itemKind === "action" || item.itemKind === "step") {
      await controller.toggleActionLineItem(item, dir);
    } else if (item.itemKind === "topic") {
      const tabId = await ensureTabOpen(item.filename);
      const list = get(tabs);
      const tab = list.find((t) => t.id === tabId);
      if (!tab) return;
      const lines = tab.content.split("\n");
      const updated = toggleOpenClosed(lines[item.lineIdx]);
      if (updated) {
        lines[item.lineIdx] = updated;
        tabs.set(writeTabContent(tabId, lines.join("\n"), list));
      }
    }
  }

  type RawRow =
    | {
        type: "dayHeader";
        key: string;
        label: string;
        date: string;
        filename: string;
        openCount: number;
        overdueCount: number;
        height: number;
      }
    | {
        type: "sectionHeader";
        key: string;
        label: string;
        filename: string;
        lineIdx: number;
        quiet: boolean;
        showAllDone: boolean;
        height: number;
      }
    | {
        type: "item";
        key: string;
        item: WeekReviewItem;
        flatIndex: number;
        depth: number;
        guides: TreeGuide[];
        stub: boolean;
        height: number;
      };

  type Row = RawRow & PlacedRow;

  const itemHeight = $derived($isMobile ? ACTION_ITEM_ROW_HEIGHT_MOBILE : ACTION_ITEM_ROW_HEIGHT);

  const builtRows = $derived.by(() => {
    const rawOut: RawRow[] = [];
    const flatOut: WeekReviewItem[] = [];

    for (const day of reviewModel.days) {
      rawOut.push({
        type: "dayHeader",
        key: `day-${day.date}`,
        label: day.date,
        date: day.date,
        filename: day.filename,
        openCount: day.counts.openActions + day.counts.openTopics,
        overdueCount: day.counts.overdue,
        height: MODAL_HEADER_ROW_HEIGHT,
      });

      for (let secIdx = 0; secIdx < day.sections.length; secIdx++) {
        const sec = day.sections[secIdx];
        const itemsInSection = $weekReviewShowDone
          ? (() => {
              const doneIds = new Set(sec.doneItems.map((i) => i.id));
              const combined = [
                ...sec.openItems.filter((i) => !i.contextOnly || !doneIds.has(i.id)),
                ...sec.doneItems,
              ];
              combined.sort(
                (a, b) => a.lineIdx - b.lineIdx || (a.stepIndex ?? 0) - (b.stepIndex ?? 0),
              );
              return combined;
            })()
          : sec.openItems;

        const isAllDone = sec.openItems.length === 0;

        if (sec.title) {
          rawOut.push({
            type: "sectionHeader",
            key: `sec-${day.date}-${secIdx}`,
            label: sec.title,
            filename: day.filename,
            lineIdx: sec.lineRange.from,
            quiet: isAllDone,
            showAllDone: isAllDone && (!$weekReviewShowDone || itemsInSection.length === 0),
            height: MODAL_HEADER_ROW_HEIGHT,
          });
        }

        const tree = drawerTreeGuides(itemsInSection);
        for (let i = 0; i < itemsInSection.length; i++) {
          const it = itemsInSection[i];
          const flatIdx = flatOut.length;
          flatOut.push(it);
          rawOut.push({
            type: "item",
            key: `item-${it.id}`,
            item: it,
            flatIndex: flatIdx,
            depth: it.depth,
            guides: tree[i].guides,
            stub: tree[i].stub,
            height: itemHeight,
          });
        }
      }
    }

    return {
      rows: withTops(rawOut) as Row[],
      flatList: flatOut,
    };
  });

  const rows = $derived(builtRows.rows);
  const flatList = $derived(builtRows.flatList);
  const totalHeight = $derived(stackHeight(rows));

  $effect.pre(() => {
    const clamped = clampIndex(selectedIndex, flatList.length);
    if (clamped !== selectedIndex) selectedIndex = clamped;
  });

  type DayHeaderRow = Row & { type: "dayHeader" };
  const dayHeaderRows = $derived(builtRows.rows.filter((r): r is DayHeaderRow => r.type === "dayHeader"));
  const stickyDayHeader = $derived.by((): DayHeaderRow | null => {
    let current: DayHeaderRow | null = null;
    for (const h of dayHeaderRows) {
      if (h.top <= scrollTop) current = h;
      else break;
    }
    return current;
  });

  const visibleRows = $derived.by(() => {
    const { start, end } = visibleWindow(rows, scrollTop, viewportHeight);
    return rows.slice(start, end);
  });

  function onScroll() {
    if (listEl) {
      scrollTop = listEl.scrollTop;
      viewportHeight = listEl.clientHeight || 420;
    }
  }

  function scrollSelectedIntoView() {
    if (!listEl) return;
    const targetRow = rows.find(
      (r) => r.type === "item" && r.flatIndex === selectedIndex,
    );
    if (!targetRow) return;
    const next = scrollToShow(targetRow, listEl.scrollTop, viewportHeight);
    if (next !== null) listEl.scrollTop = next;
  }

  function onKeydown(e: KeyboardEvent) {
    if (docked && !rootEl?.contains(e.target as Node)) {
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatList.length > 0) {
        selectedIndex = (selectedIndex - 1 + flatList.length) % flatList.length;
        scrollSelectedIntoView();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatList.length > 0) {
        selectedIndex = (selectedIndex + 1) % flatList.length;
        scrollSelectedIntoView();
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      shiftWeek(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      shiftWeek(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      goToThisWeek();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) {
        void controller.jumpToFileLine(
          { filename: it.filename, lineIdx: it.lineIdx },
          docked ? { keepModal: true } : undefined,
        );
      }
    } else if (e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) {
        void controller.forwardActionToTodayItem(it);
      }
    } else if (e.ctrlKey && e.shiftKey && e.code === "Space") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) {
        void toggleItem(it, -1);
      }
    } else if (e.ctrlKey && e.code === "Space") {
      e.preventDefault();
      const it = flatList[selectedIndex];
      if (it) {
        void toggleItem(it, 1);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  }
</script>

{#snippet modalContent()}
  <div class="modal-title week-review-header">
    <div class="week-review-title-group">
      <Icon name="actions" size={16} />
      <span class="week-title">
        {$t("weekReview.header.weekTitle", {
          week: $weekReviewWeek,
          range: formatWeekRange($locale, reviewModel.mondayISO, reviewModel.sundayISO),
        })}
      </span>
    </div>
    <div class="week-nav-actions">
      <!-- Arrows only: in a narrow docked pane the labels pushed the week number out of the title. -->
      <button
        type="button"
        class="week-nav-btn"
        aria-label={$t("weekReview.prevWeekLabel", { week: prevWeekNumber })}
        title={$t("weekReview.prevWeekLabel", { week: prevWeekNumber })}
        onclick={() => shiftWeek(-1)}
      >
        <Icon name="chevron-left" size={12} />
      </button>
      <button
        type="button"
        class="week-nav-btn"
        aria-label={$t("weekReview.nextWeekLabel", { week: nextWeekNumber })}
        title={$t("weekReview.nextWeekLabel", { week: nextWeekNumber })}
        onclick={() => shiftWeek(1)}
      >
        <Icon name="chevron-right" size={12} />
      </button>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        onclick={handleClose}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  </div>

  <div class="week-review-summary-bar">
    <div class="week-review-counts">
      <span class="count-pill">
        {reviewModel.counts.openActions === 1
          ? $t("weekReview.count.openAction", { count: 1 })
          : $t("weekReview.count.openActions", { count: reviewModel.counts.openActions })}
      </span>
      <span class="count-sep">·</span>
      <span class="count-pill">
        {reviewModel.counts.openTopics === 1
          ? $t("weekReview.count.openTopic", { count: 1 })
          : $t("weekReview.count.openTopics", { count: reviewModel.counts.openTopics })}
      </span>
      {#if reviewModel.counts.overdue > 0}
        <span class="count-sep">·</span>
        <span class="count-pill count-overdue">
          {$t("weekReview.count.overdue", { count: reviewModel.counts.overdue })}
        </span>
      {/if}
    </div>
    <div class="week-review-toggles">
      <label class="toggle-switch" title={$t("weekReview.showDone.title")}>
        <input type="checkbox" bind:checked={$weekReviewShowDone} />
        <span class="toggle-switch-track"></span>
        {$t("weekReview.showDone.label")}
      </label>
    </div>
  </div>

  {#if reviewModel.earlierWeeksOpenActions > 0}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="earlier earlier-weeks-bar"
      role="presentation"
      onclick={(e) => {
        if ((e.target as HTMLElement)?.closest('.earlier-overdue-btn')) return;
        controller.openActionDrawerEarlierWeeks(sundayBeforeShownWeek);
      }}
    >
      <button
        type="button"
        class="earlier-link earlier-weeks earlier-weeks-btn"
        onclick={() => controller.openActionDrawerEarlierWeeks(sundayBeforeShownWeek)}
        title={`${$t("actionDrawer.modal.ariaLabel")}, ${$t("actionDrawer.scope.allFiles.label")}: before:${sundayBeforeShownWeek} is:open`}
      >
        <u>{reviewModel.earlierWeeksOpenActions === 1
          ? $t("weekReview.earlierWeeksSingle", { count: 1 })
          : $t("weekReview.earlierWeeks", { count: reviewModel.earlierWeeksOpenActions })}</u>
      </button>{#if reviewModel.earlierWeeksOverdue > 0}{", "}<button
          type="button"
          class="earlier-link earlier-overdue-btn"
          onclick={() => controller.openActionDrawerEarlierOverdue(sundayBeforeShownWeek)}
          title={`${$t("actionDrawer.modal.ariaLabel")}, ${$t("actionDrawer.dueView.label")}: before:${sundayBeforeShownWeek} is:open`}
        >
          <u class="overtxt">{$t("weekReview.count.overdue", { count: reviewModel.earlierWeeksOverdue })}</u>
        </button>
      {/if}
    </div>
  {/if}

  <div
    class="modal-list week-review-list"
    role="listbox"
    tabindex="0"
    bind:this={listEl}
    onscroll={onScroll}
  >
    {#if reviewModel.days.length === 0}
      <EmptyState
        icon="actions"
        title={$t("weekReview.empty.title")}
        subtitle={$t("weekReview.empty.subtitle")}
      />
    {:else}
      <div
        class="modal-list-virtual-pad"
        style="height: {totalHeight}px; position: relative;"
      >
        {#each visibleRows as row (row.key)}
          {#if row.type === "dayHeader"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="band modal-group-header day-header"
              role="presentation"
              title={row.date}
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              onclick={() =>
                controller.jumpToFileLine(
                  { filename: row.filename, lineIdx: 0 },
                  docked ? { keepModal: true } : undefined,
                )}
            >
              <span class="band-title d" title={row.date}>{$noteDateLabel(row.date)}</span>
              <small>
                {row.openCount} open
                {#if row.overdueCount > 0}
                  {" · "}
                  <span class="over">{$t("weekReview.count.overdue", { count: row.overdueCount })}</span>
                {/if}
              </small>
            </div>
          {:else if row.type === "sectionHeader"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="sec {row.quiet ? 'quiet' : ''}"
              data-all-done={row.quiet ? "true" : undefined}
              role="presentation"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              onclick={() =>
                controller.jumpToFileLine(
                  { filename: row.filename, lineIdx: row.lineIdx },
                  docked ? { keepModal: true } : undefined,
                )}
            >
              <span class="t sec-title">{row.label}</span>
              {#if row.showAllDone}
                <span class="alldone">{$t("weekReview.allDone")}</span>
              {/if}
            </div>
          {:else if row.type === "item"}
            {@const it = row.item}
            {@const idx = row.flatIndex}
            {@const g = glyphFor(it)}
            {@const isCompleted =
              it.state === "v" || it.state === "x" || it.state === "."}
            {@const d = Math.min(row.depth, $isMobile ? 2 : Infinity)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="modal-item action-row {idx === selectedIndex ? 'selected' : ''} {it.contextOnly
                ? 'context-row'
                : ''}"
              role="option"
              aria-selected={idx === selectedIndex}
              tabindex="0"
              style="position: absolute; top: {row.top}px; left: 6px; right: 6px; height: {row.height}px; padding-left: {ROW_INSET +
                d * TREE_INDENT}px;"
              onclick={() => {
                selectedIndex = idx;
                void controller.jumpToFileLine(
                  { filename: it.filename, lineIdx: it.lineIdx },
                  docked ? { keepModal: true } : undefined,
                );
              }}
              onmouseenter={() => (selectedIndex = idx)}
            >
              {#each row.guides as guide (guide.level)}
                <span
                  class="tree-guide is-{guide.kind}"
                  aria-hidden="true"
                  style="left: {ROW_INSET + guide.level * TREE_INDENT + GLYPH_CENTER}px;"
                ></span>
              {/each}
              {#if row.stub}
                <span
                  class="tree-guide is-stub"
                  aria-hidden="true"
                  style="left: {ROW_INSET + d * TREE_INDENT + GLYPH_CENTER}px;"
                ></span>
              {/if}
              <div class="modal-item-main">
                <span class="{g.cls ?? ''} item-glyph">{g.char}</span>
                <span
                  class="item-text {isCompleted ? 'item-completed' : ''}"
                  title={it.line}
                >
                  {#if it.itemKind === "step" && it.stepIndex !== undefined}
                    <span class="step-number">{`${it.stepIndex}. `}</span>
                  {/if}
                  {#each parseGlyphLine(it.line, { today: $currentDateISO, ...textRangeFor(it) }) as part}
                    {#if part.parts}
                      <span class={part.cls ?? ""} title={part.title}>
                        {#each part.parts as subPart}
                          <span class={subPart.cls ?? ""} title={subPart.title}
                            >{subPart.text}</span
                          >
                        {/each}
                      </span>
                    {:else}
                      <span class={part.cls ?? ""} title={part.title}>{part.text}</span>
                    {/if}
                  {/each}
                </span>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  {#if !$isMobile}
    <div class="modal-footer">
      <div class="modal-footer-hints">
        <kbd>Enter</kbd> {$t("weekReview.footer.goToLine")} · <kbd>Shift+Enter</kbd> {$t("weekReview.footer.forwardToToday")} · <kbd>Ctrl+Space</kbd> {$t("weekReview.footer.changeState")} · <kbd>←</kbd>/<kbd>→</kbd> {$t("weekReview.footer.prevNextWeek")} · <kbd>Home</kbd> {$t("weekReview.footer.thisWeek")}
      </div>
    </div>
  {/if}
{/snippet}

{#if docked}
  <div class="week-review-pane-card" bind:this={rootEl} onfocusin={handleFocusIn}>
    {@render modalContent()}
  </div>
{:else}
  <div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
    <div
      class="modal-card modal-lg"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      use:sheetSwipe
      aria-label={$t("weekReview.modal.ariaLabel")}
      bind:this={rootEl}
    >
      {@render modalContent()}
    </div>
  </div>
{/if}

<style>
.week-review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.week-review-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.week-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-ui);
}
.week-nav-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}
.week-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 6px;
  border-radius: var(--radius-control);
  background: var(--surface-secondary, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border);
  color: var(--text-primary);
  cursor: pointer;
}
.week-nav-btn:hover {
  background: var(--surface-hover);
}
.week-review-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px 8px;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-tertiary, var(--muted));
  border-bottom: 1px solid var(--border);
}
.week-review-counts {
  display: flex;
  align-items: center;
  gap: 6px;
}
.count-pill {
  color: var(--text-primary);
}
.count-overdue {
  color: var(--warn, #d8a24a);
  font-weight: 600;
}
.count-sep {
  opacity: 0.5;
}
.week-review-toggles {
  display: flex;
  align-items: center;
  gap: 8px;
}
.modal-footer {
  padding: 6px 12px;
  font-size: 11.5px;
  color: var(--text-tertiary);
  border-top: 1px solid var(--border);
}
.modal-footer-hints kbd {
  font-family: var(--font-mono);
  font-size: 11px;
}
.item-glyph {
  flex: none;
}
.item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  /* Room for a pill's 1px outline (a box-shadow outside the text) at the end and edges of the text. */
  padding: 1px 0.4ch 1px 1px;
}
/* As Section History's body: the selected row shows where the keyboard is. */
.week-review-list:focus {
  outline: none;
}
.tree-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--muted);
  opacity: 0.6;
  pointer-events: none;
}
.tree-guide.is-end {
  bottom: 50%;
}
.tree-guide.is-stub {
  top: calc(50% + 8px);
}
.tree-guide.is-tee::after,
.tree-guide.is-end::after {
  content: "";
  position: absolute;
  left: 0;
  width: 17px;
  border-bottom: 1px solid var(--muted);
}
.tree-guide.is-tee::after {
  top: 50%;
}
.tree-guide.is-end::after {
  bottom: -1px;
}
.step-number {
  color: var(--text-tertiary, var(--muted));
  font-weight: 600;
}
</style>
