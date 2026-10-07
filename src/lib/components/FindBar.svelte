<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { editorApi, findMatch, findOpen } from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { t } from "../i18n";

  let query = $state("");
  let inputEl: HTMLInputElement;

  onMount(async () => {
    await tick();
    inputEl?.focus();
    inputEl?.select();
  });

  // Re-run the search on every keystroke — the editor stays fully live
  // underneath, this is not a modal.
  $effect(() => {
    const q = query;
    untrack(() => {
      editorApi?.find.setQuery(q);
    });
  });

  function close() {
    editorApi?.find.clear();
    findOpen.set(false);
    document.querySelector<HTMLElement>(".cm-content")?.focus();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) editorApi?.find.prev();
      else editorApi?.find.next();
    }
  }

  const countLabel = $derived(
    $findMatch.total
      ? $t("findBar.countOf", { current: String($findMatch.current || "–"), total: $findMatch.total })
      : query
        ? $t("findBar.noResults")
        : "",
  );
</script>

<div class="find-bar" role="search">
  <input
    class="find-input"
    bind:this={inputEl}
    bind:value={query}
    onkeydown={onKeydown}
    placeholder={$t("findBar.placeholder")}
    aria-label={$t("findBar.ariaLabel")}
    autocomplete="off"
  />
  <span class="find-count" aria-live="polite">{countLabel}</span>
  <button type="button" class="find-btn" onclick={() => editorApi?.find.prev()} aria-label={$t("findBar.previousMatch")} title={$t("findBar.previousTitle")}>
    <Icon name="chevron-left" size={13} />
  </button>
  <button type="button" class="find-btn" onclick={() => editorApi?.find.next()} aria-label={$t("findBar.nextMatch")} title={$t("findBar.nextTitle")}>
    <Icon name="chevron-right" size={13} />
  </button>
  <button type="button" class="find-btn" onclick={close} aria-label={$t("findBar.closeFind")} title={$t("findBar.closeTitle")}>
    <Icon name="close" size={12} />
  </button>
</div>
