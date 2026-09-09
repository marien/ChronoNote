<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import type { PaletteItem } from "../../commandPalette";
  import { focusTrap } from "../../actions/focusTrap";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";

  let query = "";
  let items: PaletteItem[] = [];
  let selected = 0;
  let inputEl: HTMLInputElement;
  let listEl: HTMLDivElement;
  let seq = 0;

  onMount(() => {
    inputEl?.focus();
  });

  async function refresh() {
    const mine = ++seq;
    const next = await controller.buildPaletteResults(query);
    if (mine !== seq) return; // a newer keystroke already superseded this
    items = next;
    selected = 0;
  }

  $: query, refresh();

  // Group headers are derived so the list stays a flat keyboard target.
  $: rows = (() => {
    const out: Array<{ header: string } | { item: PaletteItem; idx: number }> = [];
    let lastGroup = "";
    items.forEach((item, idx) => {
      if (item.group !== lastGroup) {
        out.push({ header: item.group });
        lastGroup = item.group;
      }
      out.push({ item, idx });
    });
    return out;
  })();

  async function commit(idx: number) {
    const item = items[idx];
    if (!item) return;
    controller.closeAllModals();
    await tick();
    await item.run();
  }

  function move(delta: number) {
    if (items.length === 0) return;
    selected = (selected + delta + items.length) % items.length;
    scrollSelectedIntoView();
  }

  async function scrollSelectedIntoView() {
    await tick();
    listEl?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(selected);
    }
  }

  const PLACEHOLDER =
    "Type a command… or  >  settings   !  actions   @  dates   ?  shortcuts";
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Command palette" style="width: 560px;">
    <div class="modal-input-wrap">
      <span>⌘</span>
      <input
        class="modal-input"
        placeholder={PLACEHOLDER}
        bind:value={query}
        bind:this={inputEl}
        on:keydown={onKeydown}
        autocomplete="off"
        aria-label="Command palette query"
      />
    </div>
    <div class="modal-list" bind:this={listEl} role="listbox" aria-label="Results">
      {#each rows as row (("header" in row ? "h:" + row.header : "i:" + row.item.id))}
        {#if "header" in row}
          <div class="modal-group-header">{row.header}</div>
        {:else}
          <div
            class="modal-item {row.idx === selected ? 'selected' : ''}"
            role="option"
            aria-selected={row.idx === selected}
            data-idx={row.idx}
            tabindex="0"
            on:click={() => commit(row.idx)}
            on:mouseenter={() => (selected = row.idx)}
            on:keydown={(e) => e.key === "Enter" && commit(row.idx)}
          >
            <div class="modal-item-main"><span>{row.item.label}</span></div>
            {#if row.item.hint}<div class="item-tag">{row.item.hint}</div>{/if}
          </div>
        {/if}
      {/each}
      {#if items.length === 0}
        <div class="modal-item" style="cursor: default; color: var(--muted);">
          <div class="modal-item-main"><span>No matches</span></div>
        </div>
      {/if}
    </div>
    <div class="modal-footer">
      <div><kbd>↑</kbd><kbd>↓</kbd> Navigate · <kbd>Enter</kbd> Run</div>
      <div><kbd>Esc</kbd> Close</div>
    </div>
  </div>
</div>
