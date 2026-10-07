<script lang="ts">
  import { editorApi, openCommandPalette } from "../../controller";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";

  function apply(token: "#" | "v" | ">" | "x" | "-" | "=>" | "!" | "o" | "." | ",") {
    editorApi?.applyToken?.(token);
    editorApi?.focus();
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

  function handleCommandPalette() {
    openCommandPalette();
  }
</script>

<div class="mobile-accessory-bar" role="toolbar" aria-label={$t("mobileAccessory.ariaLabel")}>
  <div class="accessory-scroll">
    <!-- Tokens -->
    <button type="button" class="accessory-btn token-btn" onclick={() => apply("#")} aria-label={$t("mobileAccessory.openTask.ariaLabel")} title="{$t('mobileAccessory.openTask.titleWord')} ☐">
      <span class="token-glyph glyph-open">☐</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply("v")} aria-label={$t("mobileAccessory.completedTask.ariaLabel")} title="{$t('mobileAccessory.completedTask.titleWord')} ☑">
      <span class="token-glyph glyph-done">☑</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply(">")} aria-label={$t("mobileAccessory.deferredTask.ariaLabel")} title="{$t('mobileAccessory.deferredTask.titleWord')} ☐">
      <span class="token-glyph glyph-progress">☐</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply("x")} aria-label={$t("mobileAccessory.wontDoTask.ariaLabel")} title="{$t('mobileAccessory.wontDoTask.titleWord')} ☒">
      <span class="token-glyph glyph-cancelled">☒</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply("o")} aria-label={$t("mobileAccessory.topicToDiscuss.ariaLabel")} title="{$t('mobileAccessory.topicToDiscuss.titleWord')} ○">
      <span class="token-glyph glyph-topic-open">○</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply(".")} aria-label={$t("mobileAccessory.topicDiscussed.ariaLabel")} title="{$t('mobileAccessory.topicDiscussed.titleWord')} ◉">
      <span class="token-glyph glyph-topic-done">◉</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply(",")} aria-label={$t("mobileAccessory.topicNotDiscussed.ariaLabel")} title="{$t('mobileAccessory.topicNotDiscussed.titleWord')} ◌">
      <span class="token-glyph glyph-topic-skipped">◌</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply("-")} aria-label={$t("mobileAccessory.bulletList.ariaLabel")} title="{$t('mobileAccessory.bulletList.titleWord')} •">
      <span class="token-glyph glyph-bullet">•</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply("=>")} aria-label={$t("mobileAccessory.followUp.ariaLabel")} title="{$t('mobileAccessory.followUp.titleWord')} ➔">
      <span class="token-glyph glyph-arrow glyph-followup">➔</span>
    </button>
    <button type="button" class="accessory-btn token-btn" onclick={() => apply("!")} aria-label={$t("mobileAccessory.emphasis")} title="{$t('mobileAccessory.emphasis')} !">
      <span class="token-glyph glyph-emphasis">!</span>
    </button>

    <div class="accessory-separator" aria-hidden="true"></div>

    <!-- Formatting & Indent -->
    <button type="button" class="accessory-btn icon-btn" onclick={() => handleIndent(false)} aria-label={$t("mobileAccessory.indent.ariaLabel")} title={$t("mobileAccessory.indentWord")}>
      <Icon name="indent" size={16} />
    </button>
    <button type="button" class="accessory-btn icon-btn" onclick={() => handleIndent(true)} aria-label={$t("mobileAccessory.dedent.ariaLabel")} title={$t("mobileAccessory.dedentWord")}>
      <Icon name="dedent" size={16} />
    </button>

    <div class="accessory-separator" aria-hidden="true"></div>

    <!-- History / Undo -->
    <button type="button" class="accessory-btn icon-btn" onclick={handleUndo} aria-label={$t("mobileAccessory.undo")} title={$t("mobileAccessory.undo")}>
      <Icon name="undo" size={15} />
    </button>
    <button type="button" class="accessory-btn icon-btn" onclick={handleRedo} aria-label={$t("mobileAccessory.redo")} title={$t("mobileAccessory.redo")}>
      <Icon name="redo" size={15} />
    </button>

    <div class="accessory-separator" aria-hidden="true"></div>

    <!-- Palette -->
    <button type="button" class="accessory-btn icon-btn" onclick={handleCommandPalette} aria-label={$t("commandPalette.modal.ariaLabel")} title={$t("commandPalette.modal.ariaLabel")}>
      <Icon name="command" size={15} />
    </button>
  </div>
</div>
