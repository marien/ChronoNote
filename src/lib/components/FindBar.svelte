<script lang="ts">
  import { onMount, tick } from "svelte";
  import { editorApi, findMatch, findOpen } from "../controller";
  import Icon from "../icons/Icon.svelte";

  let query = "";
  let inputEl: HTMLInputElement;

  onMount(async () => {
    await tick();
    inputEl?.focus();
    inputEl?.select();
  });

  // Re-run the search on every keystroke — the editor stays fully live
  // underneath, this is not a modal.
  $: query, editorApi?.find.setQuery(query);

  function close() {
    editorApi?.find.clear();
    findOpen.set(false);
    document.querySelector<HTMLElement>(".cm-content")?.focus();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) editorApi?.find.prev();
      else editorApi?.find.next();
    }
  }

  $: countLabel = $findMatch.total
    ? `${$findMatch.current || "–"} of ${$findMatch.total}`
    : query
      ? "No results"
      : "";
</script>

<div class="find-bar" role="search">
  <input
    class="find-input"
    bind:this={inputEl}
    bind:value={query}
    on:keydown={onKeydown}
    placeholder="Find in note…"
    aria-label="Find in note"
    autocomplete="off"
  />
  <span class="find-count" aria-live="polite">{countLabel}</span>
  <button type="button" class="find-btn" on:click={() => editorApi?.find.prev()} aria-label="Previous match" title="Previous (Shift+Enter)">
    <Icon name="chevron-left" size={13} />
  </button>
  <button type="button" class="find-btn" on:click={() => editorApi?.find.next()} aria-label="Next match" title="Next (Enter)">
    <Icon name="chevron-right" size={13} />
  </button>
  <button type="button" class="find-btn" on:click={close} aria-label="Close find" title="Close (Esc)">
    <Icon name="close" size={12} />
  </button>
</div>
