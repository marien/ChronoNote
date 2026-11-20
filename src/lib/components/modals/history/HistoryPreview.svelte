<script lang="ts">
  import { tick, untrack } from "svelte";
  import { currentDateISO, historyLoading } from "../../../controller";
  import { parseGlyphLine } from "../../../editor/glyphLine";
  import { isTitleLine, isTitleUnderline } from "../../../grammar/tokenize";
  import { treeConnectors } from "../../../editor/actionTreeLines";
  import { actionTree } from "../../../actionGroups";
  import { getLineWrapIndent } from "../../../editor/wrapIndent";
  import Segmented from "../../Segmented.svelte";
  import EmptyState from "../../EmptyState.svelte";
  import { t } from "../../../i18n";
  import type { HistoryDestination, SectionOccurrence } from "../../../types";
  import { lineSegments } from "./historyHelpers";

  interface Props {
    selectedOcc: SectionOccurrence | undefined;
    occurrencesLength: number;
    focusLineIdx: number | null;
    lineSelection: { from: number; to: number } | null;
    usableDestinations: HistoryDestination[];
    takeOverOptions: { value: string; label: string; title?: string }[];
    takeOverMode: "whole" | "action-only" | "agenda";
    onStartLineSelection: (abs: number, shiftKey: boolean) => void;
    onDragOverLine: (abs: number) => void;
    onTakeOverModeChange: (mode: "whole" | "action-only" | "agenda") => void;
    onTakeOver: (dest: HistoryDestination) => void;
  }
  let {
    selectedOcc,
    occurrencesLength,
    focusLineIdx,
    lineSelection,
    usableDestinations,
    takeOverOptions,
    takeOverMode,
    onStartLineSelection,
    onDragOverLine,
    onTakeOverModeChange,
    onTakeOver,
  }: Props = $props();

  let bodyContainerEl: HTMLDivElement;
  let bodyEl: HTMLDivElement | undefined = $state();

  const connectors = $derived(selectedOcc ? treeConnectors(actionTree(selectedOcc.lines)) : []);
  const groupLineIndices = $derived.by(() => {
    const set = new Set<number>();
    for (const c of connectors) {
      set.add(c.parentLineIdx);
      for (const child of c.children) {
        set.add(child.lineIdx);
      }
    }
    return set;
  });

  export function focusBody() {
    bodyContainerEl?.focus();
  }

  export function scrollLineIntoView(abs: number) {
    bodyEl?.querySelector<HTMLElement>(`[data-line-idx="${abs}"]`)?.scrollIntoView({ block: "nearest" });
  }

  // Back to the top whenever the browsed occurrence changes (after the DOM has updated).
  $effect(() => {
    void selectedOcc;
    untrack(() => void scrollBodyToTop());
  });
  async function scrollBodyToTop() {
    await tick();
    if (bodyEl) bodyEl.scrollTop = 0;
  }
</script>

    <!-- Keyboard focus stays on this container (arrow keys move the line highlight); for a screen reader it names the
         lines and points at the current one. -->
    <div
      class="history-body"
      tabindex="-1"
      bind:this={bodyContainerEl}
      role="group"
      aria-label={$t("history.modal.ariaLabel")}
      aria-activedescendant={focusLineIdx !== null ? `history-line-${focusLineIdx}` : undefined}
    >
      <div class="history-detail">
        {#if selectedOcc}
          <div
            class="hp-context history-select-body"
            bind:this={bodyEl}
            role="listbox"
            aria-multiselectable="true"
            aria-label={$t("history.modal.ariaLabel")}
          >
            {#if selectedOcc.lines.length === 0}
              <div class="hp-line hp-muted">{$t("history.body.emptySection")}</div>
            {:else}
              {#each selectedOcc.lines as line, i}
                {@const abs = selectedOcc.startLineIdx + i}
                {@const inSel = !!lineSelection && abs >= lineSelection.from && abs <= lineSelection.to}
                {@const inGroup = groupLineIndices.has(i)}
                {@const titleLine = isTitleLine(line, selectedOcc.lines[i + 1])}
                {@const wrapIndent = inGroup && !titleLine && !isTitleUnderline(line) ? getLineWrapIndent(line) : 0}
                {@const segments = lineSegments(i, connectors)}
                <div
                  class="hp-line history-select-line {inSel ? 'history-line-selected' : ''} {wrapIndent > 0 ? 'has-wrap-indent' : ''}"
                  style={wrapIndent > 0 ? `--line-indent: ${wrapIndent}ch;` : undefined}
                  role="option"
                  id="history-line-{abs}"
                  aria-selected={inSel}
                  tabindex="-1"
                  data-line-idx={abs}
                  onmousedown={(e) => {
                    e.preventDefault();
                    onStartLineSelection(abs, e.shiftKey);
                  }}
                  onmouseenter={() => onDragOverLine(abs)}
                >{#each segments as seg}<span
                    class="cm-action-tree-line is-{seg.kind} {seg.resolved ? 'is-resolved' : ''}"
                    style={seg.style}
                    aria-hidden="true"
                  ></span>{/each}{#each parseGlyphLine(line, { today: $currentDateISO, title: titleLine }) as part}{#if part.parts}<span class={part.cls ?? ""} title={part.title}>{#each part.parts as subPart}<span class={subPart.cls ?? ""} title={subPart.title}>{subPart.text}</span>{/each}</span>{:else}<span class={part.cls ?? ""} title={part.title}>{part.text}</span>{/if}{/each}</div>
              {/each}
            {/if}
          </div>
          {#if lineSelection && usableDestinations.length > 0}
            <div class="history-takeover-bar">
              <Segmented
                options={takeOverOptions}
                value={takeOverMode}
                onChange={(v) => onTakeOverModeChange(v as "whole" | "action-only" | "agenda")}
              />
              {#each usableDestinations as dest}
                <button type="button" class="icon-btn btn-primary" onclick={() => onTakeOver(dest)}>{dest.label}</button>
              {/each}
              <span class="history-takeover-hint">
                {takeOverMode === "agenda" ? $t("history.takeover.agendaHint") : $t("history.takeover.hint")}
              </span>
            </div>
          {:else if usableDestinations.length === 0}
            <div class="hp-note">{$t("history.takeover.none")}</div>
          {/if}
        {:else if occurrencesLength === 0 && !$historyLoading}
          <EmptyState
            icon="section-history"
            title={$t("history.strip.emptyTitle")}
            subtitle={$t("history.strip.empty")}
          />
        {:else}
          <div class="hp-empty">{$t("history.body.selectPrompt")}</div>
        {/if}
      </div>
    </div>

<style>
/* The occurrence's full glyph-rendered body — the drawer's primary
 * content, since browsing it in context is the whole point of this
 * design (both the 2026-09-24 and 2026-09-25 redesigns). */

.history-detail {
  flex: 1;
  min-height: 0;
  background: var(--surface-canvas);
  padding: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hp-context {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
  background: var(--surface-raised);
  border-radius: var(--radius-control);
  padding: 7px 9px;
  flex: 0 1 auto;
  min-height: calc(4.5em + 14px);
  overflow-y: auto;
}

.hp-line {
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.5em;
  position: relative;
}

.hp-line.has-wrap-indent {
  padding-left: calc(4px + var(--line-indent, 0ch));
  text-indent: calc(-1 * var(--line-indent, 0ch));
}

.hp-line.has-wrap-indent > * {
  text-indent: 0;
}

.hp-line.hp-muted {
  color: var(--muted);
  font-style: italic;
}

/* Each line of the occurrence body is its own selectable row — a click
 * (or Shift+click to extend a range) picks what "take it over" carries
 * forward. Quiet by default, same treatment as any other selectable list
 * row in the app, so the body still reads primarily as text, not a form. */

.history-select-line {
  cursor: pointer;
  border-radius: var(--radius-control);
  margin: 0 -4px;
  padding: 0 4px;
}

.history-select-line:hover {
  background: var(--surface-hover, rgba(128, 128, 128, 0.1));
}

.history-select-line.history-line-selected {
  color: var(--text);
  font-weight: 600;
  background: rgba(128, 128, 128, 0.2);
}

.hp-note {
  font-size: var(--type-caption);
  color: var(--muted);
  flex-shrink: 0;
}

.hp-empty {
  color: var(--muted);
  font-size: 12px;
  margin: auto;
  text-align: center;
}

/* The destination button(s) for a live line selection — computed once
 * when the drawer opened (`historyDestinations`), never more than two. */

.history-takeover-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* Chat feedback: the destination button(s) alone didn't say what taking a
 * line over actually does — a short, always-present explanation next to
 * them instead of relying on the button label alone to carry it. */

.history-takeover-hint {
  font-size: var(--type-caption);
  color: var(--muted);
  flex-basis: 100%;
}

/* 2026-09-25 redesign (chat feedback on the browse-and-carry-forward
 * redesign): the occurrence list is now a compact horizontal strip above
 * the note body, not a vertical sidebar beside it — a recurring section's
 * handful of recent dates were the ones actually browsed, and a tall list
 * of one-row-per-date entries mostly just sat there empty next to a much
 * busier note pane. `.history-body` is a single column now (no more
 * side-by-side `.history-main` + `.history-detail`), so it's just the
 * remaining vertical space below the strip. */

.history-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  outline: none;
}
</style>
