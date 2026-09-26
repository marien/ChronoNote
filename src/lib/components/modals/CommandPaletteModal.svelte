<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as controller from "../../controller";
  import type { PaletteItem } from "../../commandPalette";
  import { splitHighlighted, COMMAND_PALETTE_GROUP_KEYS } from "../../commandPalette";
  import { focusTrap } from "../../actions/focusTrap";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";

  let query = "";
  let items: PaletteItem[] = [];
  /** The query `items` were actually built for — `commit()` refuses to
   * run against a result set that's a keystroke or two stale (the `!`/`@`
   * modes resolve async). */
  let itemsQuery = "\0";
  let selected = 0;
  let inputEl: HTMLInputElement;
  let listEl: HTMLDivElement;
  let seq = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    inputEl?.focus();
    void runRefresh(query);
  });

  async function runRefresh(q: string) {
    const mine = ++seq;
    const next = await controller.buildPaletteResults(q);
    if (mine !== seq) return; // a newer keystroke already superseded this
    items = next;
    itemsQuery = q;
    selected = 0;
  }

  // The `!`/`#`/`@` prefixes scan the whole notes cache, so those are
  // debounced; plain command / tab filtering is cheap and runs at once.
  function scheduleRefresh(q: string) {
    clearTimeout(debounce);
    if (/^\s*[!#@]/.test(q)) {
      debounce = setTimeout(() => runRefresh(q), 120);
    } else {
      void runRefresh(q);
    }
  }
  $: scheduleRefresh(query);

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

  /** Enter from the input: if a debounced refresh is still pending (the
   * `!`/`@` modes resolve async), run it now and *don't* fire a stale
   * command — the user presses Enter again once results show. */
  async function commitFromInput() {
    if (query.trim() !== itemsQuery.trim()) {
      clearTimeout(debounce);
      await runRefresh(query);
      return;
    }
    commit(selected);
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
      commitFromInput();
    }
  }

  function setPrefix(p: string) {
    const trimmed = query.trim();
    if (trimmed.startsWith(p)) {
      query = trimmed.slice(p.length).trimStart();
    } else {
      const existing = [">", "!", "#", "@", "?"].find((x) => trimmed.startsWith(x));
      const rest = existing ? trimmed.slice(existing.length).trimStart() : trimmed;
      query = rest ? `${p} ${rest}` : p;
    }
    inputEl?.focus();
  }

</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card modal-md" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("commandPalette.modal.ariaLabel")}>
    <div class="modal-input-wrap">
      <Icon name="command" size={15} />
      <input
        class="modal-input"
        placeholder={$t("commandPalette.modal.placeholder")}
        bind:value={query}
        bind:this={inputEl}
        on:keydown={onKeydown}
        autocomplete="off"
        aria-label={$t("commandPalette.modal.queryAriaLabel")}
      />
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
    <!-- §127 (finding J): the prefix legend used to live only in the
         placeholder, which vanishes on the first keystroke — kept visible
         here instead. §194: interactive tap-chips for mobile & touch. -->
    <div class="palette-legend">
      <button
        type="button"
        class="palette-chip"
        class:active={query.trim().startsWith(">")}
        on:click={() => setPrefix(">")}
      ><kbd>&gt;</kbd> {$t("commandPalette.legend.commands")}</button>
      <button
        type="button"
        class="palette-chip"
        class:active={query.trim().startsWith("!") || query.trim().startsWith("#")}
        on:click={() => setPrefix("!")}
      ><kbd>!</kbd> {$t("commandPalette.legend.actions")}</button>
      <button
        type="button"
        class="palette-chip"
        class:active={query.trim().startsWith("@")}
        on:click={() => setPrefix("@")}
      ><kbd>@</kbd> {$t("commandPalette.legend.dates")}</button>
      <button
        type="button"
        class="palette-chip"
        class:active={query.trim().startsWith("?")}
        on:click={() => setPrefix("?")}
      ><kbd>?</kbd> {$t("commandPalette.legend.shortcuts")}</button>
    </div>
    <div class="modal-list" bind:this={listEl} role="listbox" aria-label={$t("commandPalette.modal.resultsAriaLabel")}>
      {#each rows as row (("header" in row ? "h:" + row.header : "i:" + row.item.id))}
        {#if "header" in row}
          {@const groupKey = COMMAND_PALETTE_GROUP_KEYS[row.header]}
          <div class="modal-group-header">{groupKey ? $t(groupKey) : row.header}</div>
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
            <div class="modal-item-main">
              {#if row.item.matchedIndices && row.item.matchedIndices.length > 0}
                <span class="modal-item-text">
                  {#each splitHighlighted(row.item.label, row.item.matchedIndices) as segment}
                    {#if segment.highlight}
                      <span class="palette-match">{segment.text}</span>
                    {:else}
                      {segment.text}
                    {/if}
                  {/each}
                </span>
              {:else}
                <span>{row.item.label}</span>
              {/if}
            </div>
            {#if row.item.hint}<div class="item-tag" class:is-shortcut={row.item.group === "Commands" || row.item.group === "Current line" || row.item.group === "Help"}>{row.item.hint}</div>{/if}
          </div>
        {/if}
      {/each}
      {#if items.length === 0}
        <div class="modal-empty">{$t("commandPalette.noMatches")}</div>
      {/if}
    </div>
    <div class="modal-footer">
      <div><kbd>↑</kbd><kbd>↓</kbd> {$t("commandPalette.footer.navigate")} · <kbd>Enter</kbd> {$t("commandPalette.footer.run")}</div>
      <div><kbd>Esc</kbd> {$t("common.close")}</div>
    </div>
  </div>
</div>
