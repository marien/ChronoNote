<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import {
    actionDrawerDueView,
    actionDrawerFilterRequest,
    actionDrawerScopeRequest,
    actionDrawerShowOnlyOpen,
    actionSnapshot,
    activeTabId,
    currentDateISO,
    tabs,
  } from "../../controller";
  import type { DueGroupKey } from "../../dueOverview";
  import { parseSearchQuery, removeChipFromQuery, type SearchFilterChip } from "../../search";
  import {
    buildDrawerRows,
    buildDueDrawerRows,
    drawerTreeGuides,
    type TreeGuide,
    collapseKey,
    nodeState,
    nodeText,
    nodeTextRange,
    type DrawerRow,
  } from "../../actionDrawerRows";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { glyphForSymbol, parseGlyphLine } from "../../editor/glyphLine";
  import { groupHeaderLabel } from "../../ui/listFormat";
  import { noteDateLabel, noteISODate } from "../../noteDateLabel";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import EmptyState from "../EmptyState.svelte";
  import { t } from "../../i18n";
  import type { ActionSnapshotItem } from "../../types";
  import {
    MODAL_HEADER_ROW_HEIGHT,
    MODAL_ITEM_ROW_HEIGHT,
    ACTION_ITEM_ROW_HEIGHT,
    ACTION_ITEM_ROW_HEIGHT_MOBILE,
    clampIndex,
    scrollToShow,
    stackHeight,
    visibleWindow,
    withTops,
    wrapIndex,
    type PlacedRow,
  } from "./virtualList";
  import { actionDrawerCollapsed, isMobile, editorApi } from "../../stores";

  interface Props {
    docked?: boolean;
  }
  let { docked = false }: Props = $props();


  let rootEl: HTMLElement | undefined = $state();
  let mounted = false;

  let filter = $state("");
  let selectedIndex = $state(0);
  let scope: "open" | "other" | "all" = $state("open");
  let inputEl: HTMLInputElement;
  // #62: "All Files"/"Other Notes" share the same one-time-per-session
  // disk-read cost as Section History's drawer — usually already warm
  // (`boot.ts` kicks it off in the background at startup), but switching to
  // either can still genuinely take a moment on a large notes folder, with
  // nothing to show that anything's happening otherwise (the toggle just
  // sits there).
  let loadingAllFiles = $state(false);

  // §42: open focused on whatever entry belongs to the currently active
  // tab, instead of always starting at the top of the (most-recent-first)
  // list. Falls back to 0 if the active tab has no entries here at all.
  onMount(() => {
    const active = $tabs.find((t) => t.id === $activeTabId);
    if (active) {
      const idx = flatList.findIndex((r) => r.item.filename === active.filename);
      if (idx !== -1) selectedIndex = idx;
    }
    // Not on a phone: focusing the filter raises the keyboard over the list.
    if (!$isMobile) inputEl?.focus();
    scrollSelectedIntoView();
    mounted = true;
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

  async function setScope(next: "open" | "other" | "all", force = false) {
    if (scope === next && !force) return;
    scope = next;
    if (scope !== "open") loadingAllFiles = true;
    actionSnapshot.set(
      scope === "all"
        ? await controller.buildActionSnapshotAllFiles()
        : scope === "other"
          ? await controller.buildActionSnapshotOtherNotes()
          : controller.buildActionSnapshotOpenTabs(),
    );
    loadingAllFiles = false;
    // Clicking the toggle button moves focus to the button — bring it
    // straight back to the filter input, with its current text selected,
    // so typing immediately starts a fresh filter instead of needing an
    // extra click back into the field first.
    await tick();
    if ($isMobile) return;
    inputEl?.focus();
    inputEl?.select();
  }

  $effect(() => {
    const req = $actionDrawerScopeRequest;
    if (req) {
      actionDrawerScopeRequest.set(null);
      void setScope(req, true);
    }
  });

  $effect(() => {
    const filterReq = $actionDrawerFilterRequest;
    if (filterReq !== null) {
      actionDrawerFilterRequest.set(null);
      filter = filterReq;
    }
  });

  async function refreshSnapshot() {
    const currentItem = flatList[selectedIndex]?.item;
    const prevId = currentItem?.id;
    const prevFilename = currentItem?.filename;
    const prevLine = currentItem?.line;

    if (scope !== "open") loadingAllFiles = true;
    const nextSnapshot =
      scope === "all"
        ? await controller.buildActionSnapshotAllFiles()
        : scope === "other"
          ? await controller.buildActionSnapshotOtherNotes()
          : controller.buildActionSnapshotOpenTabs();
    actionSnapshot.set(nextSnapshot);
    loadingAllFiles = false;
    await tick();

    // By content first (ids carry the line number, which an edit above the row shifts), the same part of that
    // line (a parent and its steps share one line), then by id when the text itself changed.
    const prevStep = currentItem?.stepIndex;
    let nextIdx =
      prevFilename && prevLine
        ? flatList.findIndex(
            (r) => r.item.filename === prevFilename && r.item.line === prevLine && r.item.stepIndex === prevStep,
          )
        : -1;
    if (nextIdx === -1 && prevId) nextIdx = flatList.findIndex((r) => r.item.id === prevId);
    if (nextIdx !== -1) {
      selectedIndex = nextIdx;
      scrollSelectedIntoView();
    }
  }

  function handleFocusIn(e: FocusEvent) {
    if (!docked || !mounted) return;
    const fromOutside =
      !e.relatedTarget ||
      !(e.relatedTarget instanceof Node && rootEl?.contains(e.relatedTarget));
    if (fromOutside) {
      void refreshSnapshot();
    }
  }

  const parsed = $derived(parseSearchQuery(filter));
  const chips = $derived(parsed.chips);
  const hasIsFilter = $derived(Boolean(parsed.operators.isOpen || parsed.operators.isDone));
  const showDelegated = $derived(filter.includes("@") || Boolean(parsed.operators.hasAssignee));

  function removeChip(chip: SearchFilterChip) {
    filter = removeChipFromQuery(filter, chip);
    inputEl?.focus();
  }

  const liveSnapshot = $derived.by(() => {
    // Split each note once, not once per item: a note now yields several items per line group.
    const linesByTab = new Map<string, string[]>();
    return $actionSnapshot.map((item) => {
      const tab = $tabs.find((t) => t.id === item.tabId || t.filename === item.filename);
      let line = item.line;
      if (tab) {
        let lines = linesByTab.get(tab.id);
        if (!lines) linesByTab.set(tab.id, (lines = tab.content.split("\n")));
        line = lines[item.lineIdx] ?? item.line;
      }
      return { ...item, line, tabId: tab?.id ?? item.tabId };
    });
  });

  // Carrying each row's position as data (assigned once, here) rather
  // than looking it up per rendered row via flatList.indexOf(row) in the
  // template — at large result counts that indexOf call made the render
  // itself O(N^2) in match count (confirmed during large-dataset stress
  // testing, §38).
  // Row geometry (px): a depth-0 glyph's left edge (the fold chevron sits in the gutter before it), the step per
  // depth, and the middle of the glyph box where its tree line runs, like `GLYPH_CENTER_CH` in the editor.
  const ROW_INSET = 18;
  const TREE_INDENT = 24;
  const GLYPH_CENTER = 5;

  type IndexedRow = DrawerRow<ActionSnapshotItem & { dueDate?: string }> & { __flatIndex: number };

  interface Group {
    key: string;
    label: string;
    rows: IndexedRow[];
  }

  const model = $derived.by(() => {
    const textFilter = { showDelegated, text: parsed.term, collapsed: $actionDrawerCollapsed, parsed };
    if ($actionDrawerDueView) {
      const dueGroups = buildDueDrawerRows(liveSnapshot, $currentDateISO, textFilter);
      const labels: Record<DueGroupKey, string> = {
        overdue: $t("actionDrawer.dueView.overdue"),
        today: $t("actionDrawer.dueView.today"),
        thisWeek: $t("actionDrawer.dueView.thisWeek"),
        later: $t("actionDrawer.dueView.later"),
      };
      let idx = 0;
      const groupsOut: Group[] = [];
      const flatOut: IndexedRow[] = [];
      for (const dg of dueGroups) {
        const groupRows: IndexedRow[] = [];
        for (const r of dg.rows) {
          const indexed: IndexedRow = { ...r, __flatIndex: idx++ };
          groupRows.push(indexed);
          flatOut.push(indexed);
        }
        groupsOut.push({
          key: dg.key,
          label: labels[dg.key],
          rows: groupRows,
        });
      }
      return { flatList: flatOut, groups: groupsOut };
    }

    const flatOut: IndexedRow[] = buildDrawerRows(liveSnapshot, { onlyOpen: $actionDrawerShowOnlyOpen, ...textFilter }).map(
      (r, i): IndexedRow => ({ ...r, __flatIndex: i }),
    );
    const map = new Map<string, Group>();
    for (const r of flatOut) {
      const key = r.item.tabId ?? r.item.filename;
      if (!map.has(key)) map.set(key, { key, label: r.item.filename, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return { flatList: flatOut, groups: Array.from(map.values()) };
  });

  const flatList = $derived(model.flatList);
  const groups = $derived(model.groups);
  const uncompletedCount = $derived(
    flatList.filter((r) => {
      const sym = nodeState(r.item);
      return sym !== "v" && sym !== "x";
    }).length,
  );
  // Re-clamps the stored index (a shrunk list keeps it clamped persistently,
  // as before); writes only when the value actually changes.
  $effect.pre(() => {
    const clamped = clampIndex(selectedIndex, flatList.length);
    if (clamped !== selectedIndex) selectedIndex = clamped;
  });

  // --- Virtualized rendering (§38) --- group-header-then-items list; the
  // window math is shared with Search / History via `./virtualList`. This
  // component owns the row model and the DOM refs.
  type RawRow =
    | { type: "header"; key: string; label: string; count: number; height: number; isFirst: boolean }
    | { type: "item"; key: string; drow: IndexedRow; depth: number; guides: TreeGuide[]; stub: boolean; height: number };
  type Row = RawRow & PlacedRow;

  const itemHeight = $derived($isMobile ? ACTION_ITEM_ROW_HEIGHT_MOBILE : ACTION_ITEM_ROW_HEIGHT);

  const rows = $derived(
    withTops<RawRow>(
    ((): RawRow[] => {
      const out: RawRow[] = [];
      let isFirst = true;
      for (const group of groups) {
        out.push({
          type: "header",
          key: `h-${group.key}`,
          label: group.label,
          count: group.rows.length,
          height: MODAL_HEADER_ROW_HEIGHT,
          isFirst,
        });
        isFirst = false;
        // The lines follow the real tree. The phone shows depth 2 and deeper at depth 2: those rows keep only the
        // lines that pass by them, and a depth-2 parent starts no line (its children sit at its own glyph's place).
        const cap = $isMobile ? 2 : Infinity;
        const tree = drawerTreeGuides(group.rows);
        group.rows.forEach((drow, i) => {
          const depth = Math.min(drow.depth, cap);
          out.push({
            type: "item",
            key: drow.item.id,
            drow,
            depth,
            guides: tree[i].guides.filter((g) => g.level < depth),
            stub: tree[i].stub && drow.depth < cap,
            height: itemHeight,
          });
        });
      }
      return out;
    })(),
    ) as Row[],
  );
  const totalHeight = $derived(stackHeight(rows));

  let listEl: HTMLDivElement;
  let scrollTop = $state(0);
  let viewportHeight = $state(380);

  const visibleRows = $derived.by(() => {
    const { start, end } = visibleWindow(rows, scrollTop, viewportHeight);
    return rows.slice(start, end);
  });

  function onScroll() {
    if (listEl) scrollTop = listEl.scrollTop;
  }

  // #77: keep the date of the actions in view on screen. Only the rows near
  // the viewport are mounted, so a group's own header is usually scrolled
  // away (and unmounted) long before you reach its last action — without
  // it there's nothing to say which day an action belongs to. This is the
  // header of the group at the top of the viewport, pinned over it once the
  // group's real header has scrolled past.
  type HeaderRow = Row & { type: "header" };
  const headerRows = $derived(rows.filter((r): r is HeaderRow => r.type === "header"));
  const stickyHeader = $derived.by((): HeaderRow | null => {
    let current: HeaderRow | null = null;
    for (const h of headerRows) {
      if (h.top < scrollTop) current = h;
      else break;
    }
    return current;
  });

  function scrollSelectedIntoView() {
    if (!listEl) return;
    const row = rows.find((r) => r.type === "item" && r.drow.__flatIndex === selectedIndex);
    if (!row) return;
    // The pinned heading covers the top `MODAL_HEADER_ROW_HEIGHT` px, so a
    // row scrolled to the very top would sit hidden underneath it.
    const next = scrollToShow(row, listEl.scrollTop, viewportHeight, MODAL_HEADER_ROW_HEIGHT);
    if (next !== null) listEl.scrollTop = next;
    scrollTop = listEl.scrollTop;
  }

  // §127 (finding B): shares `glyphForSymbol` with `glyphLine.ts` (the
  // Section History / read-only-viewer glyph map) instead of its own
  // private `--glyph-*` inline-style lookup, so the two agree through one
  // map. Uses the *innermost* symbol (§41) — a `=> #`/`=> v`/etc.
  // consequence-action shows the same state glyph a plain action line
  // would, since that's the info this column exists to convey; the
  // drawer's own icon column doesn't also draw the arrow the editor shows
  // for that form.
  function glyphFor(item: ActionSnapshotItem): { char: string; cls?: string } {
    const sym = nodeState(item);
    if (sym) {
      const g = glyphForSymbol(sym);
      return { char: g.text, cls: g.cls };
    }
    // No action-state symbol at all — a plain delegated-to-a-person line.
    // Not one of `glyphForSymbol`'s cases, and deliberately not styled as
    // a `.glyph-assignee` pill (that class's background/padding is meant
    // for a *name*, not a bare arrow) — kept as its own small inline style.
    return { char: "➔" };
  }

  // Collapses (or expands) the group of `item`, keeping the selection on the same row; when that row is gone
  // (it sat inside the collapsed group) the selection lands on the group's parent.
  async function setCollapsed(item: ActionSnapshotItem, collapse?: boolean) {
    const key = collapseKey(item);
    const has = $actionDrawerCollapsed.has(key);
    const want = collapse ?? !has;
    if (want === has) return;
    const keepId = flatList[selectedIndex]?.item.id;
    const next = new Set($actionDrawerCollapsed);
    if (want) next.add(key);
    else next.delete(key);
    actionDrawerCollapsed.set(next);
    await tick();
    let idx = flatList.findIndex((r) => r.item.id === keepId);
    if (idx === -1) idx = flatList.findIndex((r) => r.item.id === item.id);
    if (idx !== -1) selectedIndex = idx;
    scrollSelectedIntoView();
  }

  function onChevronClick(e: MouseEvent, item: ActionSnapshotItem) {
    // The row must not jump to the line, and the filter keeps the keyboard.
    e.stopPropagation();
    void setCollapsed(item);
    if (!$isMobile) inputEl?.focus();
  }

  // ArrowRight on a group: collapsed → expand; expanded → the next row (its first child).
  function groupRight(): boolean {
    const row = flatList[selectedIndex];
    if (!row?.hasChildren) return false;
    if (!row.expanded) {
      void setCollapsed(row.item, false);
    } else if (selectedIndex + 1 < flatList.length) {
      selectedIndex += 1;
      scrollSelectedIntoView();
    }
    return true;
  }

  // ArrowLeft: an expanded parent collapses; otherwise a nested row selects its parent row. With a text filter
  // collapse is ignored, so only the second applies.
  function groupLeft(): boolean {
    const row = flatList[selectedIndex];
    if (!row) return false;
    if (row.hasChildren && row.expanded && filter === "") {
      void setCollapsed(row.item, true);
      return true;
    }
    if (row.depth > 0 && row.item.parentId !== undefined) {
      const parentIdx = flatList.findIndex((r) => r.item.id === row.item.parentId);
      if (parentIdx !== -1) {
        selectedIndex = parentIdx;
        scrollSelectedIntoView();
        return true;
      }
    }
    return false;
  }

  function onKeydown(e: KeyboardEvent) {
    // Only keys pressed inside the drawer (a document listener sees the whole page).
    if (!rootEl?.contains(e.target as Node)) {
      return;
    }
    // List keys belong to the filter field and the list; a focused button or toggle keeps its own Enter/Space.
    const onControl = e.target instanceof HTMLButtonElement || (e.target instanceof HTMLInputElement && e.target !== inputEl);
    if (onControl && e.key !== "Escape") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, flatList.length, 1);
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = wrapIndex(selectedIndex, flatList.length, -1);
      scrollSelectedIntoView();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      const it = flatList[selectedIndex]?.item;
      // The forwarded copy goes on top of today's note, which moves its lines down: rebuild the rows so later
      // keys do not act on the line above.
      if (it) void controller.forwardActionToTodayItem(it).then(() => refreshSnapshot());
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flatList[selectedIndex]?.item;
      if (it) controller.jumpToFileLine(it, docked ? { keepModal: true } : undefined);
    } else if (e.ctrlKey && e.shiftKey && e.code === "Space") {
      // §145: the reverse of the plain Ctrl+Space cycle below — checked
      // first since it would otherwise also match that broader condition.
      e.preventDefault();
      const it = flatList[selectedIndex]?.item;
      if (it) controller.toggleActionLineItem(it, -1);
    } else if (e.ctrlKey && e.code === "Space") {
      e.preventDefault();
      const it = flatList[selectedIndex]?.item;
      if (it) controller.toggleActionLineItem(it);
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      // In the filter field the keys keep moving the text caret unless the field is empty.
      if (e.target === inputEl && filter !== "") return;
      if (e.key === "ArrowRight" ? groupRight() : groupLeft()) e.preventDefault();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  }
</script>

{#snippet modalContent()}
  <div class="modal-input-wrap">
    <Icon name="actions" size={15} />
    <input
      class="modal-input"
      aria-label={$t("actionDrawer.filter.ariaLabel")}
      aria-controls="action-drawer-list"
      aria-activedescendant={flatList.length > 0 ? `action-drawer-item-${selectedIndex}` : undefined}
      placeholder={$t("actionDrawer.filterPlaceholder")}
      bind:value={filter}
      bind:this={inputEl}
      autocomplete="off"
    />
    <span class="modal-counter">{$t("actionDrawer.counter", { open: uncompletedCount, listed: flatList.length })}</span>
    <button
      type="button"
      class="icon-btn modal-close-btn"
      aria-label={$t("common.closeDialog")}
      onclick={handleClose}
    >
      <Icon name="close" size={14} />
    </button>
  </div>
  {#if chips.length > 0}
    <div class="search-chips-row">
      {#each chips as chip, idx (chip.id ?? idx)}
        <span class="search-chip">
          <span class="chip-label">{chip.label}</span>
          <button
            type="button"
            class="chip-remove-btn"
            aria-label={$t("searchModal.removeFilterAriaLabel", { label: chip.label })}
            onclick={() => removeChip(chip)}
          >
            ✕
          </button>
        </span>
      {/each}
    </div>
  {/if}
  <div class="modal-input-wrap">
    <div class="settings-toggle-row">
      <Segmented
        options={[
          { value: "open", label: $t("actionDrawer.scope.openTabs.label"), title: $t("actionDrawer.scope.openTabs.title") },
          { value: "other", label: $t("actionDrawer.scope.otherNotes.label"), title: $t("actionDrawer.scope.otherNotes.title") },
          { value: "all", label: $t("actionDrawer.scope.allFiles.label"), title: $t("actionDrawer.scope.allFiles.title") },
        ]}
        value={scope}
        onChange={(v) => setScope(v as "open" | "other" | "all")}
      />
      {#if loadingAllFiles}
        <span class="modal-spinner" aria-label={$t("common.loading")}>⟳</span>
      {/if}
      <label
        class="toggle-switch"
        class:disabled={hasIsFilter}
        title={hasIsFilter ? $t("actionDrawer.onlyOpen.setByFilterTitle") : $t("actionDrawer.onlyOpen.title")}
      >
        <input type="checkbox" bind:checked={$actionDrawerShowOnlyOpen} disabled={hasIsFilter} />
        <span class="toggle-switch-track"></span>
        {$t("actionDrawer.onlyOpen.label")}
      </label>
      <label class="toggle-switch" title={$t("actionDrawer.dueView.title")}>
        <input type="checkbox" bind:checked={$actionDrawerDueView} />
        <span class="toggle-switch-track"></span>
        {$t("actionDrawer.dueView.label")}
      </label>
    </div>
  </div>
  <div
    class="modal-list"
    id="action-drawer-list"
    role="listbox"
    aria-label={$t("actionDrawer.modal.ariaLabel")}
    bind:this={listEl}
    bind:clientHeight={viewportHeight}
    onscroll={onScroll}
    style="position: relative; overflow-y: auto;"
  >
    {#if flatList.length === 0}
      {#if $actionDrawerDueView && !filter.trim()}
        <EmptyState
          icon="actions"
          title={$t("actionDrawer.dueView.empty")}
        />
      {:else if filter.trim()}
        <EmptyState
          icon="actions"
          title={$t("actionDrawer.empty.noMatch", { filter })}
          subtitle={$t("actionDrawer.empty.filterSubtitle")}
        />
      {:else}
        <EmptyState
          icon="actions"
          title={$t("actionDrawer.empty.allResolved")}
          subtitle={$t("actionDrawer.empty.allResolvedSubtitle")}
        />
      {/if}
    {/if}
    {#if stickyHeader}
      <!-- Zero net height (negative margin) so the scroll extent is unchanged. -->
      <div
        class="band modal-group-header modal-group-header-sticky {stickyHeader.key === 'overdue' || stickyHeader.key === 'h-overdue' ? 'overdue' : ''}"
        aria-hidden="true"
        data-testid="sticky-date-header"
        title={noteISODate(stickyHeader.label) ?? undefined}
        style="height: {MODAL_HEADER_ROW_HEIGHT}px; margin-bottom: -{MODAL_HEADER_ROW_HEIGHT}px;"
      >
        <span class="band-title band-date" title={noteISODate(stickyHeader.label) ?? undefined}>{$noteDateLabel(stickyHeader.label)}</span>
        <small>{stickyHeader.count}</small>
      </div>
    {/if}
    <div style="position: relative; height: {totalHeight}px;">
      {#each visibleRows as row (row.key)}
        {#if row.type === "header"}
          <div
            class="band modal-group-header {row.key === 'overdue' || row.key === 'h-overdue' ? 'overdue' : ''}"
            title={noteISODate(row.label) ?? undefined}
            style="position: absolute; top: {row.top}px; left: 0; right: 0; height: {row.height}px;"
          >
            <span class="band-title band-date" title={noteISODate(row.label) ?? undefined}>{$noteDateLabel(row.label)}</span>
            <small>{row.count}</small>
          </div>
        {:else}
          {@const r = row.drow}
          {@const item = r.item}
          {@const idx = r.__flatIndex}
          {@const g = glyphFor(item)}
          {@const sym = nodeState(item)}
          {@const text = nodeText(item)}
          {@const d = row.depth}
          <div
            class="modal-item action-row {idx === selectedIndex ? 'selected' : ''} {r.contextOnly ? 'context-row' : ''}"
            role="option"
            id="action-drawer-item-{idx}"
            aria-selected={idx === selectedIndex}
            tabindex="0"
            style="position: absolute; top: {row.top}px; left: 6px; right: 6px; height: {row.height}px; padding-left: {ROW_INSET + d * TREE_INDENT}px;"
            onclick={() => controller.jumpToFileLine(item, docked ? { keepModal: true } : undefined)}
            onmouseenter={() => (selectedIndex = idx)}
            onkeydown={(e) => e.key === "Enter" && controller.jumpToFileLine(item, docked ? { keepModal: true } : undefined)}
          >
            {#each row.guides as guide (guide.level)}
              <span
                class="tree-guide is-{guide.kind}"
                aria-hidden="true"
                style="left: {ROW_INSET + guide.level * TREE_INDENT + GLYPH_CENTER}px;"
              ></span>
            {/each}
            {#if row.stub && r.expanded}
              <span class="tree-guide is-stub" aria-hidden="true" style="left: {ROW_INSET + d * TREE_INDENT + GLYPH_CENTER}px;"></span>
            {/if}
            {#if r.hasChildren}
              <!-- In a fold gutter at the row's left edge, so the tree lines run from glyph to glyph as in the editor. -->
              <button
                type="button"
                class="group-chevron"
                aria-expanded={r.expanded}
                aria-label={r.expanded ? $t("actionDrawer.group.collapse") : $t("actionDrawer.group.expand")}
                tabindex="-1"
                onclick={(e) => onChevronClick(e, item)}
              >
                <Icon name="chevron-right" size={12} />
              </button>
            {/if}
            <div class="modal-item-main">
              <span class="{g.cls ?? ''} item-glyph">{g.char}</span>
              <span class="item-text {sym === 'v' || sym === 'x' ? 'item-completed' : ''}" title={[text, item.header].filter(Boolean).join(" · ")}>
                <!-- After the box, like `# 1. laptop` written as lines under the action (§427). -->
                {#if item.kind === "step"}<span class="step-number">{`${item.stepIndex}. `}</span>{/if}
                {#each parseGlyphLine(item.line, { today: $currentDateISO, ...nodeTextRange(item) }) as part}
                  {#if part.parts}
                    <span class={part.cls ?? ""} title={part.title}>
                      {#each part.parts as subPart}
                        <span class={subPart.cls ?? ""} title={subPart.title}>{subPart.text}</span>
                      {/each}
                    </span>
                  {:else}
                    <span class={part.cls ?? ""} title={part.title}>{part.text}</span>
                  {/if}
                {/each}
              </span>
              <!-- Inside the text's box: a long text then shortens itself instead of pushing the count off the row. -->
              {#if r.progress}
                <span
                  class="item-progress"
                  title={$t("actionDrawer.group.progressTitle", { resolved: r.progress.resolved, total: r.progress.total })}
                >{r.progress.resolved}/{r.progress.total}</span>
              {/if}
            </div>
            {#if $actionDrawerDueView}
              <span class="item-breadcrumb" title={noteISODate(item.filename) ?? undefined}>
                {$noteDateLabel(item.filename)}{item.header ? ` · ${item.header}` : ""}
              </span>
            {:else if item.header}
              <span class="item-breadcrumb">{item.header}</span>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>
  {#if !$isMobile}
    <div class="modal-footer">
      <div class="modal-footer-hints">
        <kbd>Enter</kbd> {$t("actionDrawer.footer.goToLine")} · <kbd>Shift+Enter</kbd> {$t("actionDrawer.footer.forwardToToday")} · <kbd>Ctrl+Space</kbd> {$t("actionDrawer.footer.changeState")}
      </div>
    </div>
  {/if}
{/snippet}

{#if docked}
  <div class="actions-pane-card" bind:this={rootEl} onfocusin={handleFocusIn}>
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
      aria-label={$t("actionDrawer.modal.ariaLabel")}
      bind:this={rootEl}
    >
      {@render modalContent()}
    </div>
  </div>
{/if}

<style>
.modal-item {
  font-family: var(--font-mono);
  font-size: 12px;
}
/* The row wraps on purpose (a source that does not fit goes to a hidden second line, 06-modals.css) and packs its
   lines to the top; the text's box fills the row's height so the glyph sits at 50%, where the tree lines meet it. */
.action-row .modal-item-main {
  height: 100%;
}
.item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
/* The glyph never gives up width to a long text (it is not the first child when a chevron used to precede it). */
.item-glyph {
  flex: none;
}
/* The fold chevron sits in the gutter at the row's left edge, at every depth. */
.group-chevron {
  position: absolute;
  left: 3px;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 16px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  transform: translateY(-50%);
}
.group-chevron[aria-expanded="true"] {
  transform: translateY(-50%) rotate(90deg);
}
/* Tree lines as in the editor: down from below the parent's glyph, an elbow to each line child's glyph, ending at
   the last child's middle. `left` is the parent glyph's middle; the elbow reaches to 2px before the child's glyph. */
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
.item-progress {
  flex: none;
  margin-left: auto;
  padding-left: 8px;
  font-size: var(--type-caption);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.modal-item.selected .item-progress {
  color: var(--selected-fg);
}
.context-row {
  opacity: 0.6;
}
.context-row.selected {
  opacity: 1;
}
</style>
