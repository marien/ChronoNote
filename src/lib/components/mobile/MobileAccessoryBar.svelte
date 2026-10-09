<script lang="ts">
  import { currentLineKind, editorApi, editorFocused, openCommandPalette } from "../../controller";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";

  type Token = "#" | "v" | ">" | "x" | "o" | "." | "," | "-" | "=>" | "!";

  const ALL_TOKENS: Token[] = ["#", "v", ">", "x", "o", ".", ",", "-", "=>", "!"];

  let moreOpen = $state(false);

  $effect(() => {
    if (!$editorFocused) {
      moreOpen = false;
    }
  });

  function getBarTokens(kind: string): Token[] {
    if (kind === "action") return ["#", "v", ">", "x"];
    if (kind === "topic") return ["o", ".", ",", "#"];
    return ["#", "o", "-", "=>"];
  }

  let barTokens = $derived(getBarTokens($currentLineKind));
  let panelTokens = $derived(ALL_TOKENS.filter((tok) => !barTokens.includes(tok)));

  function apply(token: Token) {
    editorApi?.applyToken?.(token);
    editorApi?.focus();
  }

  function applyFromPanel(token: Token) {
    apply(token);
    moreOpen = false;
  }

  function handleIndent(dedent = false) {
    editorApi?.indent?.(dedent);
    editorApi?.focus();
  }

  function handleUndo() {
    editorApi?.undo?.();
    editorApi?.focus();
  }

  function handleRedo() {
    editorApi?.redo?.();
    editorApi?.focus();
  }

  function handleRedoFromPanel() {
    handleRedo();
    moreOpen = false;
  }

  function handleCommandPalette() {
    openCommandPalette();
    moreOpen = false;
  }

  function toggleMore() {
    moreOpen = !moreOpen;
  }

  function tokenAriaLabel(token: Token): string {
    switch (token) {
      case "#": return $t("mobileAccessory.openTask.ariaLabel");
      case "v": return $t("mobileAccessory.completedTask.ariaLabel");
      case ">": return $t("mobileAccessory.deferredTask.ariaLabel");
      case "x": return $t("mobileAccessory.wontDoTask.ariaLabel");
      case "o": return $t("mobileAccessory.topicToDiscuss.ariaLabel");
      case ".": return $t("mobileAccessory.topicDiscussed.ariaLabel");
      case ",": return $t("mobileAccessory.topicNotDiscussed.ariaLabel");
      case "-": return $t("mobileAccessory.bulletList.ariaLabel");
      case "=>": return $t("mobileAccessory.followUp.ariaLabel");
      case "!": return $t("mobileAccessory.emphasis");
    }
  }

  function tokenTitle(token: Token): string {
    switch (token) {
      case "#": return `${$t("mobileAccessory.openTask.titleWord")} ☐`;
      case "v": return `${$t("mobileAccessory.completedTask.titleWord")} ☑`;
      case ">": return `${$t("mobileAccessory.deferredTask.titleWord")} ☐`;
      case "x": return `${$t("mobileAccessory.wontDoTask.titleWord")} ☒`;
      case "o": return `${$t("mobileAccessory.topicToDiscuss.titleWord")} ○`;
      case ".": return `${$t("mobileAccessory.topicDiscussed.titleWord")} ◉`;
      case ",": return `${$t("mobileAccessory.topicNotDiscussed.titleWord")} ◌`;
      case "-": return `${$t("mobileAccessory.bulletList.titleWord")} •`;
      case "=>": return `${$t("mobileAccessory.followUp.titleWord")} ➔`;
      case "!": return `${$t("mobileAccessory.emphasis")} !`;
    }
  }
</script>

{#snippet tokenButton(token: Token, inPanel: boolean)}
  <button
    type="button"
    class="accessory-btn token-btn"
    onpointerdown={(e) => e.preventDefault()}
    onclick={() => (inPanel ? applyFromPanel(token) : apply(token))}
    aria-label={tokenAriaLabel(token)}
    title={tokenTitle(token)}
  >
    {#if token === "#"}
      <span class="token-glyph glyph-open">☐</span>
    {:else if token === "v"}
      <span class="token-glyph glyph-done">☑</span>
    {:else if token === ">"}
      <span class="token-glyph glyph-progress">☐</span>
    {:else if token === "x"}
      <span class="token-glyph glyph-cancelled">☒</span>
    {:else if token === "o"}
      <span class="token-glyph glyph-topic-open">○</span>
    {:else if token === "."}
      <span class="token-glyph glyph-topic-done">◉</span>
    {:else if token === ","}
      <span class="token-glyph glyph-topic-skipped">◌</span>
    {:else if token === "-"}
      <span class="token-glyph glyph-bullet">•</span>
    {:else if token === "=>"}
      <span class="token-glyph glyph-arrow glyph-followup">➔</span>
    {:else if token === "!"}
      <span class="token-glyph glyph-emphasis">!</span>
    {/if}
  </button>
{/snippet}

<div class="mobile-accessory-bar" role="toolbar" aria-label={$t("mobileAccessory.ariaLabel")}>
  {#if moreOpen}
    <div class="accessory-more-panel" role="toolbar" aria-label={$t("mobileAccessory.more")}>
      {#each panelTokens as token (token)}
        {@render tokenButton(token, true)}
      {/each}
      <button
        type="button"
        class="accessory-btn icon-btn"
        onpointerdown={(e) => e.preventDefault()}
        onclick={handleRedoFromPanel}
        aria-label={$t("mobileAccessory.redo")}
        title={$t("mobileAccessory.redo")}
      >
        <Icon name="redo" size={15} />
      </button>
      <button
        type="button"
        class="accessory-btn icon-btn"
        onpointerdown={(e) => e.preventDefault()}
        onclick={handleCommandPalette}
        aria-label={$t("commandPalette.modal.ariaLabel")}
        title={$t("commandPalette.modal.ariaLabel")}
      >
        <Icon name="command" size={15} />
      </button>
    </div>
  {/if}

  <!-- 4 Line-dependent tokens -->
  {#each barTokens as token (token)}
    {@render tokenButton(token, false)}
  {/each}

  <!-- Formatting & Indent -->
  <button
    type="button"
    class="accessory-btn icon-btn"
    onpointerdown={(e) => e.preventDefault()}
    onclick={() => handleIndent(true)}
    aria-label={$t("mobileAccessory.dedent.ariaLabel")}
    title={$t("mobileAccessory.dedentWord")}
  >
    <Icon name="dedent" size={16} />
  </button>
  <button
    type="button"
    class="accessory-btn icon-btn"
    onpointerdown={(e) => e.preventDefault()}
    onclick={() => handleIndent(false)}
    aria-label={$t("mobileAccessory.indent.ariaLabel")}
    title={$t("mobileAccessory.indentWord")}
  >
    <Icon name="indent" size={16} />
  </button>

  <!-- History / Undo -->
  <button
    type="button"
    class="accessory-btn icon-btn"
    onpointerdown={(e) => e.preventDefault()}
    onclick={handleUndo}
    aria-label={$t("mobileAccessory.undo")}
    title={$t("mobileAccessory.undo")}
  >
    <Icon name="undo" size={15} />
  </button>

  <!-- More overflow button -->
  <button
    type="button"
    class="accessory-btn icon-btn"
    onpointerdown={(e) => e.preventDefault()}
    onclick={toggleMore}
    aria-label={$t("mobileAccessory.more")}
    title={$t("mobileAccessory.more")}
    aria-expanded={moreOpen}
  >
    <Icon name="more" size={16} />
  </button>
</div>
