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

  function formatDayHeader(iso: string, loc: string): string {
    const d = parseISODateLocal(iso);
    return new Intl.DateTimeFormat(loc, {
      weekday: "long",
      day: "numeric",
      month: "short",
    }).format(d);
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
        filename: string;
        height: number;
      }
    | {
        type: "sectionHeader";
        key: string;
        label: string;
        filename: string;
        lineIdx: number;
        height: number;
      }
    | {
        type: "allDone";
        key: string;
        label: string;
        filename: string;
        lineIdx: number;
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

  const builtRows = $derived.by(() => {
    const rawOut: RawRow[] = [];
    const flatOut: WeekReviewItem[] = [];

    for (const day of reviewModel.days) {
      rawOut.push({
        type: "dayHeader",
        key: `day-${day.date}`,
        label: formatDayHeader(day.date, $locale),
        filename: day.filename,
        height: MODAL_ITEM_ROW_HEIGHT,
      });

      if (day.sections.length === 0) {
        rawOut.push({
          type: "allDone",
          key: `alldone-${day.date}`,
          label: $t("weekReview.allDone"),
          filename: day.filename,
          lineIdx: 0,
          height: MODAL_ITEM_ROW_HEIGHT,
        });
        continue;
      }

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

        if (itemsInSection.length === 0) {
          rawOut.push({
            type: "allDone",
            key: `alldone-${day.date}-${secIdx}`,
            label: sec.title
              ? $t("weekReview.sectionAllDone", { section: sec.title })
              : $t("weekReview.allDone"),
            filename: day.filename,
            lineIdx: sec.lineRange.from,
            height: MODAL_ITEM_ROW_HEIGHT,
          });
        } else {
          if (sec.title) {
            rawOut.push({
              type: "sectionHeader",
              key: `sec-${day.date}-${secIdx}`,
              label: sec.title,
              filename: day.filename,
              lineIdx: sec.lineRange.from,
              height: MODAL_ITEM_ROW_HEIGHT,
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
              height: MODAL_ITEM_ROW_HEIGHT,
            });
          }
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
    <div class="earlier-weeks-bar">
      <button
        type="button"
        class="earlier-weeks-btn"
        onclick={controller.openActionDrawerAllFiles}
        title={$t("weekReview.earlierWeeks", { count: reviewModel.earlierWeeksOpenActions })}
      >
        <Icon name="actions" size={12} />
        <span>
          {reviewModel.earlierWeeksOpenActions === 1
            ? $t("weekReview.earlierWeeksSingle", { count: 1 })
            : $t("weekReview.earlierWeeks", { count: reviewModel.earlierWeeksOpenActions })}
        </span>
      </button>
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
              class="modal-group-header day-header"
              role="presentation"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              onclick={() =>
                controller.jumpToFileLine(
                  { filename: row.filename, lineIdx: 0 },
                  docked ? { keepModal: true } : undefined,
                )}
            >
              <span class="day-header-title">{row.label}</span>
            </div>
          {:else if row.type === "sectionHeader"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="modal-group-header section-header"
              role="presentation"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              onclick={() =>
                controller.jumpToFileLine(
                  { filename: row.filename, lineIdx: row.lineIdx },
                  docked ? { keepModal: true } : undefined,
                )}
            >
              <span class="section-header-title">{row.label}</span>
            </div>
          {:else if row.type === "allDone"}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="all-done-row"
              role="presentation"
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
              onclick={() =>
                controller.jumpToFileLine(
                  { filename: row.filename, lineIdx: row.lineIdx },
                  docked ? { keepModal: true } : undefined,
                )}
            >
              <span class="all-done-text">{row.label}</span>
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
              style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px; padding-left: {ROW_INSET +
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
  padding: 10px 14px;
  border-bottom: 1px solid var(--edge-soft);
  gap: 12px;
  flex-shrink: 0;
}
.week-review-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-weight: 600;
  color: var(--text-primary);
}
.week-title {
  font-size: 14px;
  line-height: 1.3;
}
.week-nav-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.week-nav-btn {
  background: var(--surface-secondary, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  color: var(--text-primary);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  padding: 3px 5px;
  cursor: pointer;
}
.week-nav-btn:hover {
  background: var(--surface-hover);
}
.week-review-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: var(--surface-chrome, transparent);
  border-bottom: 1px solid var(--edge-soft);
  font-size: 12px;
  color: var(--muted);
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.week-review-counts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  min-width: 0;
}
.count-pill {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.count-overdue {
  color: var(--color-warning, #f59e0b);
  font-weight: 500;
}
.count-sep {
  opacity: 0.5;
}
.week-review-toggles {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.earlier-weeks-bar {
  padding: 4px 14px;
  background: var(--surface-muted, rgba(255, 255, 255, 0.02));
  border-bottom: 1px solid var(--edge-soft);
  flex-shrink: 0;
}
.earlier-weeks-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 2px 4px;
  color: var(--muted);
  font-size: 11.5px;
  cursor: pointer;
  border-radius: 4px;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.earlier-weeks-btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}
.modal-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  outline: none;
}
.modal-group-header {
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 12px;
  color: var(--text-tertiary, var(--muted));
  cursor: pointer;
  user-select: none;
  background: var(--surface-chrome, transparent);
}
.day-header {
  font-weight: 600;
  color: var(--text-primary);
  border-top: 1px solid var(--edge-soft);
  background: var(--surface-secondary, rgba(255, 255, 255, 0.02));
}
.day-header:first-child {
  border-top: none;
}
.section-header {
  font-weight: 500;
  padding-left: 20px;
  color: var(--text-secondary, var(--text-primary));
}
.all-done-row {
  display: flex;
  align-items: center;
  padding: 0 24px;
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  cursor: pointer;
  user-select: none;
}
.all-done-row:hover {
  color: var(--text-primary);
}
.modal-item {
  font-family: var(--font-mono);
  font-size: 12px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.action-row .modal-item-main {
  height: 100%;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}
.item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  margin-left: 4px;
}
.item-completed {
  opacity: 0.55;
  text-decoration: line-through;
}
.item-glyph {
  flex: none;
}
.step-number {
  color: var(--muted);
  margin-right: 2px;
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
.context-row {
  opacity: 0.6;
}
.context-row.selected {
  opacity: 1;
}
</style>
