<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import {
    historyDestinations,
    historyLoading,
    historyOccurrences,
    historyOpenedFromTabId,
    historyTargetHeader,
    tabs,
  } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";
  import type { HistoryDestination, SectionOccurrence } from "../../types";
  import { clampIndex, wrapIndex } from "./virtualList";
  import { isMobile, editorApi } from "../../stores";
  import { destinationFilename } from "./history/historyHelpers";
  import HistoryOccurrenceStrip from "./history/HistoryOccurrenceStrip.svelte";
  import HistoryPreview from "./history/HistoryPreview.svelte";

  interface Props {
    docked?: boolean;
  }
  let { docked = false }: Props = $props();

  let rootEl: HTMLElement | undefined = $state();
  let stripComp: HistoryOccurrenceStrip | undefined;
  let previewComp: HistoryPreview | undefined;
  let selectedIndex = $state(0);

  // Anchor/focus line-selection model (2026-09-25 redesign, from chat
  // feedback on the browse-and-carry-forward redesign): `selAnchor` is the
  // line the selection started from, `focusLineIdx` is the end the
  // keyboard/mouse is currently moving — the same anchor+focus pair a text
  // editor uses, so Shift+Arrow can grow *or shrink* a range instead of
  // only ever extending from a fixed starting click the way a plain
  // Shift+click model does. `lineSelection` (the `{from, to}` actually
  // used for rendering/take-over) is always derived from the two, never
  // set directly.
  let selAnchor = $state<number | null>(null);
  let focusLineIdx = $state<number | null>(null);
  let lineSelection = $state<{ from: number; to: number } | null>(null);
  let isDraggingLines = false;
  // "agenda": copy the lines as they are with only the agenda topics reopened, leaving this note untouched.
  let takeOverMode: "whole" | "action-only" | "agenda" = $state("agenda");

  const occurrences = $derived($historyOccurrences);
  // Re-clamps the stored index when the list shrinks; writes only when the value actually changes.
  // `.pre` so the body below never renders from an out-of-range index.
  $effect.pre(() => {
    const clamped = clampIndex(selectedIndex, occurrences.length);
    if (clamped !== selectedIndex) selectedIndex = clamped;
  });
  const selectedOcc = $derived(occurrences[selectedIndex] as SectionOccurrence | undefined);
  const openedFromFilename = $derived($tabs.find((t) => t.id === $historyOpenedFromTabId)?.filename);

  // 2026-09-26: replaces a blanket "no take-over at all when browsing the
  // note History was opened from" rule with a per-destination check — that
  // rule was both too broad and, in one shape, silently wrong. Too broad:
  // opened from a *past* note, its own occurrence is a perfectly good
  // source to forward from — "Today"/"Next occurrence" are different files
  // entirely, so there's something real to carry it to. Wrong the other
  // way: browsing *today's own* occurrence while "Today" is offered as a
  // destination is exactly as self-referential as the case the old rule
  // caught, but the old rule only compared against the opened-from
  // filename, not each destination's own target — so it let that one
  // through, and writing a take-over's source and target to the very same
  // file raced two separate read-modify-write passes against each other,
  // silently dropping the insertion and keeping only the source's own
  // deferred-line edit (a real, reported bug, not just a UX rough edge).
  const usableDestinations = $derived(
    selectedOcc ? $historyDestinations.filter((d) => destinationFilename(d, openedFromFilename) !== selectedOcc.filename) : [],
  );

  onMount(() => {
    previewComp?.focusBody();
    // A drag started with the mouse still down when it leaves the line
    // list (over the takeover bar, or right off the modal) must still
    // stop on mouseup — listen on the window, not just the list itself.
    window.addEventListener("mouseup", stopDrag);
    // On `document`, not a template `on:keydown` on some div — a plain
    // `<div>` holding a keydown listener has no ARIA role that makes it
    // "interactive," which `svelte-check` rightly flags; the real fix is
    // the same one `focusTrap` already uses for Tab (see that file's own
    // comment): listen where the keys land regardless of which specific
    // element inside the modal currently has focus, rather than routing
    // everything through one div's own focus state. `onDestroy` below
    // removes it, so it's scoped to exactly this modal's lifetime.
    document.addEventListener("keydown", onKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("mouseup", stopDrag);
    document.removeEventListener("keydown", onKeydown);
  });

  function stopDrag() {
    isDraggingLines = false;
  }

  // Reset the line selection whenever the browsed occurrence changes —
  // it's meaningless carried over to a different occurrence's lines.
  let lastSelectedFilename: string | undefined;
  $effect.pre(() => {
    const filename = selectedOcc?.filename;
    if (filename !== lastSelectedFilename) {
      lastSelectedFilename = filename;
      selAnchor = null;
      focusLineIdx = null;
      lineSelection = null;
      takeOverMode = "agenda";
    }
  });

  const singleLineActionOnly = $derived(
    selectedOcc && lineSelection && lineSelection.from === lineSelection.to
      ? controller.historyActionOnlyText(selectedOcc.lines[lineSelection.from - selectedOcc.startLineIdx])
      : null,
  );
  $effect.pre(() => {
    if (!singleLineActionOnly && takeOverMode === "action-only") takeOverMode = "agenda";
  });
  const takeOverOptions = $derived([
    { value: "whole", label: $t("history.takeover.wholeLine") },
    ...(singleLineActionOnly ? [{ value: "action-only", label: $t("history.takeover.actionOnly") }] : []),
    { value: "agenda", label: $t("history.takeover.asAgenda"), title: $t("history.takeover.asAgendaTitle") },
  ]);

  function recomputeSelection() {
    lineSelection =
      selAnchor !== null && focusLineIdx !== null
        ? { from: Math.min(selAnchor, focusLineIdx), to: Math.max(selAnchor, focusLineIdx) }
        : null;
  }

  /** Mouse: a plain click selects exactly the clicked line (anchor and
   * focus both land there); a Shift+click extends the existing anchor to
   * the clicked line, same as before this redesign. Also arms
   * `isDraggingLines`, so a click that turns into a drag (see
   * `dragOverLine`) grows the very same selection instead of starting a
   * fresh one. */
  function startLineSelection(abs: number, shiftKey: boolean) {
    if (shiftKey && selAnchor !== null) {
      focusLineIdx = abs;
    } else {
      selAnchor = abs;
      focusLineIdx = abs;
    }
    isDraggingLines = true;
    recomputeSelection();
  }

  /** Click-and-move-the-mouse multi-line selection: each line the pointer
   * enters while the button is still down becomes the new focus end,
   * exactly like dragging a text selection. */
  function dragOverLine(abs: number) {
    if (!isDraggingLines) return;
    focusLineIdx = abs;
    recomputeSelection();
  }

  /** Up/Down: move the line selection within the browsed occurrence.
   * Plain arrow moves a single-line selection; Shift+arrow grows or
   * shrinks the range from wherever the anchor already is (a real
   * anchor+focus model, not just "extend from the last click"). Clamped
   * at the occurrence's own first/last line — vertical movement doesn't
   * wrap the way occurrence switching does. */
  function moveLineCursor(delta: -1 | 1, extend: boolean) {
    if (!selectedOcc || selectedOcc.lines.length === 0) return;
    const first = selectedOcc.startLineIdx;
    const last = selectedOcc.startLineIdx + selectedOcc.lines.length - 1;
    const base = focusLineIdx ?? (delta > 0 ? first - 1 : last + 1);
    const next = Math.min(last, Math.max(first, base + delta));
    if (extend) {
      if (selAnchor === null) selAnchor = focusLineIdx ?? next;
    } else {
      selAnchor = next;
    }
    focusLineIdx = next;
    recomputeSelection();
    previewComp?.scrollLineIntoView(next);
  }

  /** Left/Right: cycle between occurrence dates, wrapping at either end —
   * the same wrap-around `Ctrl/Cmd+Tab` already uses for the main tab
   * strip this drawer's own strip is modeled on. */
  function moveOccurrence(delta: -1 | 1) {
    if (occurrences.length === 0) return;
    const next = wrapIndex(selectedIndex, occurrences.length, delta);
    selectedIndex = next;
    stripComp?.scrollOccIntoView(next);
  }

  async function takeOver(dest: HistoryDestination) {
    if (!selectedOcc || !lineSelection) return;
    const sourceLines = selectedOcc.lines.slice(
      lineSelection.from - selectedOcc.startLineIdx,
      lineSelection.to - selectedOcc.startLineIdx + 1,
    );
    const insertLines = controller.historyTakeOverLines(sourceLines, takeOverMode);
    const destArg =
      dest.kind === "here"
        ? ({ kind: "here", tabId: dest.tabId } as const)
        : ({ kind: dest.kind, date: dest.date, headerText: dest.headerText } as const);
    await controller.carryHistorySelectionForward(
      selectedOcc.filename,
      lineSelection.from,
      lineSelection.to,
      $historyTargetHeader,
      destArg,
      insertLines,
    );
    selAnchor = null;
    focusLineIdx = null;
    lineSelection = null;
    await controller.refreshHistoryOccurrences();
  }

  /** Ctrl/Cmd+A: select every line of the browsed occurrence (to copy a whole agenda at once). */
  function selectAllLines() {
    if (!selectedOcc || selectedOcc.lines.length === 0) return;
    selAnchor = selectedOcc.startLineIdx;
    focusLineIdx = selectedOcc.startLineIdx + selectedOcc.lines.length - 1;
    recomputeSelection();
  }

  /** Keys while the focus is on one of the take-over bar's controls (reached with Tab from the selected lines): the
   * buttons get their own keys (Enter / Space press them, Left / Right move between Whole line / As agenda), and
   * Shift+Tab from the first control goes back to the lines. Returns whether the key was handled here. */
  function onTakeOverBarKeydown(e: KeyboardEvent, bar: HTMLElement): boolean {
    const controls = [...bar.querySelectorAll<HTMLButtonElement>("button")];
    const target = e.target as HTMLElement;
    if (e.key === "Tab" && e.shiftKey && target === controls[0]) {
      e.preventDefault();
      e.stopPropagation(); // not the modal's focus trap: it would wrap to the last control
      previewComp?.focusBody();
      return true;
    }
    if (e.key === "Enter" || e.key === " ") return true; // the browser presses the focused button
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && target.classList.contains("segmented-option")) {
      e.preventDefault();
      const options = [...bar.querySelectorAll<HTMLButtonElement>(".segmented-option")];
      const next = options[options.indexOf(target as HTMLButtonElement) + (e.key === "ArrowLeft" ? -1 : 1)];
      next?.focus();
      next?.click();
      return true;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleClose() {
    controller.closeAllModals();
    if (docked) {
      editorApi?.focus();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (docked && !rootEl?.contains(e.target as Node)) {
      return;
    }
    const bar = (e.target as HTMLElement | null)?.closest?.(".history-takeover-bar") as HTMLElement | null;
    if (bar && onTakeOverBarKeydown(e, bar)) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAllLines();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveLineCursor(1, e.shiftKey);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveLineCursor(-1, e.shiftKey);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveOccurrence(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveOccurrence(-1);
    } else if (e.key === "Enter" && e.shiftKey) {
      // The keyboard equivalent of clicking the primary take-over button
      // (chat feedback: "move to a line with the arrows, select multiple
      // lines if needed, press shortcut to insert into section on main
      // tab") — always the *first* of `usableDestinations`, which is
      // always the nearest one (the note History was opened from, or
      // "Today" when browsing from further in the past). A no-op with
      // nothing selected or no usable destination for this occurrence,
      // same as the button itself being absent then.
      e.preventDefault();
      if (lineSelection && usableDestinations[0]) {
        takeOver(usableDestinations[0]);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedOcc) {
        controller.jumpToHistoryLine(selectedOcc, lineSelection ? lineSelection.from : undefined);
      }
    } else if (e.key === "Escape") {
      handleClose();
    }
  }
</script>

{#snippet modalContent()}
  <div class="modal-input-wrap modal-title">
    <Icon name="section-history" size={15} />
    <div class="modal-input">{$t("history.modal.titlePrefix", { header: $historyTargetHeader })}</div>
    {#if $historyLoading}
      <span class="modal-counter"><span class="modal-spinner" aria-label={$t("common.loading")}>⟳</span> {$t("history.modal.loadingCounter")}</span>
    {:else}
      <span class="modal-counter">{$t("history.modal.dateCount", { count: occurrences.length })}</span>
    {/if}
    <button
      type="button"
      class="icon-btn modal-close-btn"
      aria-label={$t("common.closeDialog")}
      onclick={handleClose}
    >
      <Icon name="close" size={14} />
    </button>
  </div>

  <HistoryOccurrenceStrip
    bind:this={stripComp}
    {occurrences}
    bind:selectedIndex
    {openedFromFilename}
    onFocusBody={() => previewComp?.focusBody()}
  />

  <HistoryPreview
    bind:this={previewComp}
    {selectedOcc}
    occurrencesLength={occurrences.length}
    {focusLineIdx}
    {lineSelection}
    {usableDestinations}
    {takeOverOptions}
    {takeOverMode}
    onStartLineSelection={startLineSelection}
    onDragOverLine={dragOverLine}
    onTakeOverModeChange={(mode) => (takeOverMode = mode)}
    onTakeOver={takeOver}
  />

  {#if !$isMobile}
    <div class="modal-footer">
      <div class="modal-footer-hints">
        {#if lineSelection && usableDestinations[0]}
          <kbd>Shift+Enter</kbd> {usableDestinations[0].label} · <kbd>Tab</kbd> {$t("history.footer.choices")} · <kbd>←/→</kbd> {$t("history.footer.switchDate")}
        {:else if lineSelection}
          <kbd>Tab</kbd> {$t("history.footer.choices")} · <kbd>←/→</kbd> {$t("history.footer.switchDate")} · <kbd>Enter</kbd> {$t("history.footer.openNote")}
        {:else}
          <kbd>↑/↓</kbd> {$t("history.footer.selectLine")} · <kbd>←/→</kbd> {$t("history.footer.switchDate")} · <kbd>Enter</kbd> {$t("history.footer.openNote")}
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

{#if docked}
  <div class="history-pane-card" bind:this={rootEl}>
    {@render modalContent()}
  </div>
{:else}
  <div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
    <div
      class="modal-card history-modal-card modal-xl"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      use:sheetSwipe
      aria-label={$t("history.modal.ariaLabel")}
      bind:this={rootEl}
    >
      {@render modalContent()}
    </div>
  </div>
{/if}

<style>
/* §154 bug: nothing capped the modal's overall height, so a long "From"
 * occurrence (`.hp-context`, itself already scrollable) just grew the
 * whole card past the viewport instead of scrolling internally — its
 * `flex: 1 1 auto` sizing only kicks in once an ancestor actually has a
 * bounded height to divide up. Capping the card here gives `.history-body`
 * (now `flex: 1`) a real budget, which `.hp-context` shares via its own
 * `overflow-y: auto`.
 *
 * 2026-09-25 follow-up: a `max-height` let the card shrink to fit a short
 * occurrence and grow for a long one, which meant the whole modal visibly
 * resized every time Left/Right switched to a differently-sized date —
 * chat feedback asked for a constant ~80% of the window instead. A plain
 * `height` (not `max-height`) fixes it at that size regardless of content;
 * a short occurrence just leaves empty space in `.hp-context` rather than
 * shrinking the card down to meet it. */

.history-modal-card {
  height: 80vh;
}
</style>
