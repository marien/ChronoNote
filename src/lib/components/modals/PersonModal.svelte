<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { get } from "svelte/store";
  import { nodeTextRange } from "../../actionDrawerRows";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import * as controller from "../../controller";
  import { currentDateISO } from "../../controller";
  import { glyphForSymbol, parseGlyphLine } from "../../editor/glyphLine";
  import { t } from "../../i18n";
  import Icon from "../../icons/Icon.svelte";
  import { noteDateLabel } from "../../noteDateLabel";
  import { ensureLoaded, notesIndex } from "../../notesIndex";
  import {
    buildPersonView,
    preferredPersonSpelling,
    type PersonActionRow,
    type PersonViewModel,
  } from "../../personView";
  import { editorApi, isMobile, personViewName } from "../../stores";

  interface Props {
    docked?: boolean;
  }
  let { docked = false }: Props = $props();

  let rootEl: HTMLElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();
  let mounted = false;
  let selectedIndex = $state(0);
  let showOlder = $state(false);
  let snapshot = $state<PersonViewModel | null>(null);
  let displayName = $state("");
  let lastLoadedName: string | null = null;

  function buildSnapshot(rawName: string, older: boolean) {
    const entries = get(notesIndex).entries;
    const resolved = preferredPersonSpelling(rawName, entries);
    displayName = resolved;
    snapshot = buildPersonView(resolved, entries, get(currentDateISO), older);
  }

  $effect(() => {
    const rawName = $personViewName;
    if (!rawName) return;
    if (rawName !== lastLoadedName) {
      lastLoadedName = rawName;
      showOlder = false;
      selectedIndex = 0;
      untrack(() => buildSnapshot(rawName, false));
    }
  });

  onMount(() => {
    mounted = true;
    if (!get(notesIndex).loaded) {
      void ensureLoaded().then(() => {
        const rawName = get(personViewName);
        if (rawName && rawName === lastLoadedName) {
          buildSnapshot(rawName, showOlder);
        }
      });
    }
    if (!$isMobile) {
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

  function handleShowOlder() {
    const rawName = get(personViewName);
    if (!rawName) return;
    showOlder = true;
    buildSnapshot(rawName, true);
    if (!$isMobile) {
      listEl?.focus();
    }
  }

  function glyphFor(row: PersonActionRow): { char: string; cls?: string } {
    if (row.state) {
      const g = glyphForSymbol(row.state);
      return { char: g.text, cls: g.cls };
    }
    return { char: "➔" };
  }

  function textRangeFor(row: PersonActionRow): { from: number; to: number } {
    return nodeTextRange({
      id: "",
      filename: row.filename,
      lineIdx: row.lineIdx,
      line: row.line,
      header: row.section,
      partFrom: row.partFrom,
      partTo: row.partTo,
      whole: row.whole,
      kind: "line",
      delegated: row.delegated,
      depth: 0,
    });
  }

  function jumpToRow(filename: string, lineIdx: number, idx: number) {
    selectedIndex = idx;
    void controller.jumpToFileLine(
      { filename, lineIdx },
      docked ? { keepModal: true } : undefined,
    );
  }

  const flatRows = $derived.by(() => {
    if (!snapshot) return [] as Array<{ filename: string; lineIdx: number }>;
    return [
      ...snapshot.openActions.map((r) => ({ filename: r.filename, lineIdx: r.lineIdx })),
      ...snapshot.delegated.map((r) => ({ filename: r.filename, lineIdx: r.lineIdx })),
      ...snapshot.mentions.map((r) => ({ filename: r.filename, lineIdx: r.lineIdx })),
    ];
  });

  $effect.pre(() => {
    if (flatRows.length === 0) {
      if (selectedIndex !== 0) selectedIndex = 0;
    } else if (selectedIndex >= flatRows.length) {
      selectedIndex = flatRows.length - 1;
    }
  });

  function scrollSelectedIntoView() {
    void tick().then(() => {
      listEl
        ?.querySelector<HTMLElement>(`[data-idx="${selectedIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (docked && !rootEl?.contains(e.target as Node)) {
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatRows.length > 0) {
        selectedIndex = (selectedIndex - 1 + flatRows.length) % flatRows.length;
        scrollSelectedIntoView();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatRows.length > 0) {
        selectedIndex = (selectedIndex + 1) % flatRows.length;
        scrollSelectedIntoView();
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      if ((e.target as HTMLElement | null)?.closest?.(".person-show-older-btn")) {
        return;
      }
      e.preventDefault();
      const row = flatRows[selectedIndex];
      if (row) {
        void controller.jumpToFileLine(
          { filename: row.filename, lineIdx: row.lineIdx },
          docked ? { keepModal: true } : undefined,
        );
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  }
</script>

{#snippet actionRowList(items: PersonActionRow[], offset: number)}
  {#if items.length === 0}
    <div class="person-empty">{$t("personView.none")}</div>
  {:else}
    {#each items as row, i (`${row.filename}-${row.lineIdx}-${row.partFrom}-${i}`)}
      {@const idx = offset + i}
      {@const g = glyphFor(row)}
      {@const dateKey = row.dateISO ?? row.filename}
      {@const dateLabel = $noteDateLabel(dateKey)}
      {@const tail = row.section ? ` · ${dateLabel} · ${row.section}` : ` · ${dateLabel}`}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="modal-item action-row person-row {idx === selectedIndex ? 'selected' : ''}"
        role="option"
        aria-selected={idx === selectedIndex}
        data-idx={idx}
        tabindex="0"
        onclick={() => jumpToRow(row.filename, row.lineIdx, idx)}
        onmouseenter={() => (selectedIndex = idx)}
      >
        <div class="modal-item-main">
          <span class="{g.cls ?? ''} item-glyph">{g.char}</span>
          <span class="item-text" title={`${row.text}${tail}`}>
            {#each parseGlyphLine(row.line, { today: $currentDateISO, ...textRangeFor(row) }) as part}
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
            <span class="person-row-tail" title={row.dateISO ?? row.filename}>{tail}</span>
          </span>
        </div>
      </div>
    {/each}
  {/if}
{/snippet}

{#snippet modalContent()}
  {@const headerLabel = displayName ? `@${displayName}` : ""}
  <div class="modal-title person-header">
    <div class="person-title-group">
      <Icon name="person" size={16} />
      <span class="person-title" title={headerLabel}>{headerLabel}</span>
    </div>
    <button
      type="button"
      class="icon-btn modal-close-btn"
      aria-label={$t("common.closeDialog")}
      onclick={handleClose}
    >
      <Icon name="close" size={14} />
    </button>
  </div>

  <div
    class="modal-list person-list"
    role="listbox"
    tabindex="0"
    aria-label={$t("personView.ariaLabel", { name: displayName })}
    bind:this={listEl}
  >
    {#if snapshot}
      {@const openOffset = 0}
      {@const delegatedOffset = snapshot.openActions.length}
      {@const mentionsOffset = delegatedOffset + snapshot.delegated.length}

      <div class="band modal-group-header person-band">
        <span class="band-title">{$t("personView.openActions", { name: displayName })} · {snapshot.openActions.length}</span>
      </div>
      {@render actionRowList(snapshot.openActions, openOffset)}

      <div class="band modal-group-header person-band">
        <span class="band-title">{$t("personView.delegated", { name: displayName })} · {snapshot.delegated.length}</span>
      </div>
      {@render actionRowList(snapshot.delegated, delegatedOffset)}

      <div class="band modal-group-header person-band">
        <span class="band-title">{$t("personView.mentions")}</span>
      </div>
      {#if snapshot.mentions.length === 0}
        <div class="person-empty">{$t("personView.none")}</div>
      {:else}
        {#each snapshot.mentions as row, i (`${row.filename}-${row.lineIdx}-${i}`)}
          {@const idx = mentionsOffset + i}
          {@const dateLabel = $noteDateLabel(row.dateISO)}
          {@const mainText = row.title ? `${dateLabel} · ${row.title}` : dateLabel}
          {@const countTail = ` · ${$t("personView.lines", { count: row.count })}`}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="modal-item action-row person-row person-mention-row {idx === selectedIndex ? 'selected' : ''}"
            role="option"
            aria-selected={idx === selectedIndex}
            data-idx={idx}
            tabindex="0"
            onclick={() => jumpToRow(row.filename, row.lineIdx, idx)}
            onmouseenter={() => (selectedIndex = idx)}
          >
            <div class="modal-item-main">
              <span class="item-text person-mention-text" title={`${mainText}${countTail}`}>
                {mainText}<span class="person-row-tail">{countTail}</span>
              </span>
            </div>
          </div>
        {/each}
      {/if}

      {#if snapshot.hasOlder}
        <div class="person-older-wrap">
          <button type="button" class="person-show-older-btn" onclick={handleShowOlder}>
            {$t("personView.showOlder")}
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

{#if docked}
  <div class="person-pane-card" bind:this={rootEl} onfocusin={handleFocusIn}>
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
      aria-label={$t("personView.ariaLabel", { name: displayName })}
      bind:this={rootEl}
    >
      {@render modalContent()}
    </div>
  </div>
{/if}

<style>
.person-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--edge-soft);
  background: var(--surface-raised);
  gap: 8px;
}
.person-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}
.person-title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-ui);
}
.person-header :global(.modal-close-btn) {
  margin-left: 0;
}
.person-list:focus {
  outline: none;
}
.person-band {
  margin-top: 2px;
}
.person-band:first-child {
  margin-top: 0;
}
.person-row {
  margin: 0 6px;
  padding-left: 14px;
}
.person-mention-row {
  padding-left: 16px;
}
.item-glyph {
  flex: none;
}
.item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  padding: 1px 0.4ch 1px 1px;
}
.person-row-tail {
  color: var(--muted);
  font-weight: 400;
}
.person-empty {
  padding: 5px 16px 8px;
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-ui);
}
.person-older-wrap {
  padding: 8px 14px 12px;
}
.person-show-older-btn {
  padding: 4px 10px;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  cursor: pointer;
}
.person-show-older-btn:hover {
  background: var(--surface-hover);
}
</style>
