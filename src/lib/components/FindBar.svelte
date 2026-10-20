<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { editorApi, findMatch, findOpen, findReplaceOpen, showToast } from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { t } from "../i18n";

  let query = $state("");
  let replaceText = $state("");
  let caseSensitive = $state(false);
  let wholeWord = $state(false);
  let inputEl = $state<HTMLInputElement>();
  let replaceInputEl = $state<HTMLInputElement>();

  onMount(async () => {
    await tick();
    if ($findReplaceOpen && query) {
      replaceInputEl?.focus();
      replaceInputEl?.select();
    } else {
      inputEl?.focus();
      inputEl?.select();
    }
  });

  // Re-run the search on every keystroke — the editor stays fully live
  // underneath, this is not a modal.
  $effect(() => {
    const q = query;
    untrack(() => {
      editorApi?.find.setQuery(q);
    });
  });

  $effect(() => {
    const r = replaceText;
    untrack(() => {
      editorApi?.find.setReplace?.(r);
    });
  });

  $effect(() => {
    const cs = caseSensitive;
    const ww = wholeWord;
    untrack(() => {
      editorApi?.find.setOptions?.({ caseSensitive: cs, wholeWord: ww });
    });
  });

  function close() {
    editorApi?.find.clear();
    findOpen.set(false);
    document.querySelector<HTMLElement>(".cm-content")?.focus();
  }

  function doReplace() {
    editorApi?.find.replace?.();
  }

  function doReplaceAll() {
    const count = editorApi?.find.replaceAll?.() ?? 0;
    showToast($t("toast.findBar.replaced", { count }));
  }

  function toggleReplace() {
    findReplaceOpen.update((v) => !v);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.ctrlKey && e.altKey) {
        doReplaceAll();
      } else if (e.shiftKey) {
        editorApi?.find.prev();
      } else {
        editorApi?.find.next();
      }
    }
  }

  function onReplaceKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.ctrlKey && e.altKey) {
        doReplaceAll();
      } else {
        doReplace();
      }
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
  <div class="find-row">
    <button
      type="button"
      class="find-btn find-toggle-btn"
      class:rotated={$findReplaceOpen}
      onclick={toggleReplace}
      aria-label={$t("findBar.toggleReplace")}
      aria-expanded={$findReplaceOpen}
      title={$t("findBar.toggleReplace")}
    >
      <Icon name="chevron-right" size={13} />
    </button>
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
    <button
      type="button"
      class="find-btn find-opt-btn"
      class:active={caseSensitive}
      aria-pressed={caseSensitive}
      onclick={() => (caseSensitive = !caseSensitive)}
      title={$t("findBar.matchCase")}
      aria-label={$t("findBar.matchCase")}
    >
      <!-- The symbol pictures the option and is drawn by CSS (03-editor.css), so the button's only text is its name:
           axe 4.14 counts any visible text, even aria-hidden, against the name (WCAG 2.5.3, label in name; §401). -->
      <span class="find-opt-glyph" data-glyph="Aa" aria-hidden="true"></span>
    </button>
    <button
      type="button"
      class="find-btn find-opt-btn"
      class:active={wholeWord}
      aria-pressed={wholeWord}
      onclick={() => (wholeWord = !wholeWord)}
      title={$t("findBar.wholeWord")}
      aria-label={$t("findBar.wholeWord")}
    >
      <span class="find-opt-glyph" data-glyph="ab|" aria-hidden="true"></span>
    </button>
    <button
      type="button"
      class="find-btn"
      onclick={() => editorApi?.find.prev()}
      aria-label={$t("findBar.previousMatch")}
      title={$t("findBar.previousTitle")}
    >
      <Icon name="chevron-left" size={13} />
    </button>
    <button
      type="button"
      class="find-btn"
      onclick={() => editorApi?.find.next()}
      aria-label={$t("findBar.nextMatch")}
      title={$t("findBar.nextTitle")}
    >
      <Icon name="chevron-right" size={13} />
    </button>
    <button
      type="button"
      class="find-btn"
      onclick={close}
      aria-label={$t("findBar.closeFind")}
      title={$t("findBar.closeTitle")}
    >
      <Icon name="close" size={12} />
    </button>
  </div>
  {#if $findReplaceOpen}
    <div class="find-row find-replace-row">
      <div class="find-toggle-spacer"></div>
      <input
        class="find-input find-replace-input"
        bind:this={replaceInputEl}
        bind:value={replaceText}
        onkeydown={onReplaceKeydown}
        placeholder={$t("findBar.replacePlaceholder")}
        aria-label={$t("findBar.replacePlaceholder")}
        autocomplete="off"
      />
      <button
        type="button"
        class="find-action-btn"
        onclick={doReplace}
      >
        {$t("findBar.replace")}
      </button>
      <button
        type="button"
        class="find-action-btn"
        onclick={doReplaceAll}
      >
        {$t("findBar.replaceAll")}
      </button>
    </div>
  {/if}
</div>
