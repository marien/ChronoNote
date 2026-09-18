<script lang="ts">
  import { editorApi, openCommandPalette } from "../../controller";
  import Icon from "../../icons/Icon.svelte";

  function apply(token: "#" | "v" | ">" | "x" | "-" | "=>" | "!") {
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

<div class="mobile-accessory-bar" role="toolbar" aria-label="Editor quick actions">
  <div class="accessory-scroll">
    <!-- Tokens -->
    <button type="button" class="accessory-btn token-btn" on:click={() => apply("#")} aria-label="Open task (box)" title="Task ☐">
      <span class="token-glyph glyph-open">☐</span>
    </button>
    <button type="button" class="accessory-btn token-btn" on:click={() => apply("v")} aria-label="Completed task (check)" title="Completed ☑">
      <span class="token-glyph glyph-done">☑</span>
    </button>
    <button type="button" class="accessory-btn token-btn" on:click={() => apply(">")} aria-label="Deferred task (arrow)" title="Deferred »">
      <span class="token-glyph glyph-progress">»</span>
    </button>
    <button type="button" class="accessory-btn token-btn" on:click={() => apply("-")} aria-label="Bullet list" title="Bullet •">
      <span class="token-glyph glyph-bullet">•</span>
    </button>
    <button type="button" class="accessory-btn token-btn" on:click={() => apply("=>")} aria-label="Follow-up arrow" title="Follow-up ➔">
      <span class="token-glyph glyph-arrow">➔</span>
    </button>
    <button type="button" class="accessory-btn token-btn" on:click={() => apply("!")} aria-label="Emphasis" title="Emphasis !">
      <span class="token-glyph glyph-emphasis">!</span>
    </button>

    <div class="accessory-separator" aria-hidden="true"></div>

    <!-- Formatting & Indent -->
    <button type="button" class="accessory-btn icon-btn" on:click={() => handleIndent(false)} aria-label="Indent (2 spaces)" title="Indent">
      <Icon name="indent" size={16} />
    </button>
    <button type="button" class="accessory-btn icon-btn" on:click={() => handleIndent(true)} aria-label="Dedent (2 spaces)" title="Dedent">
      <Icon name="dedent" size={16} />
    </button>

    <div class="accessory-separator" aria-hidden="true"></div>

    <!-- History / Undo -->
    <button type="button" class="accessory-btn icon-btn" on:click={handleUndo} aria-label="Undo" title="Undo">
      <Icon name="undo" size={15} />
    </button>
    <button type="button" class="accessory-btn icon-btn" on:click={handleRedo} aria-label="Redo" title="Redo">
      <Icon name="redo" size={15} />
    </button>

    <div class="accessory-separator" aria-hidden="true"></div>

    <!-- Palette -->
    <button type="button" class="accessory-btn icon-btn" on:click={handleCommandPalette} aria-label="Command palette" title="Command palette">
      <Icon name="command" size={15} />
    </button>
  </div>
</div>
