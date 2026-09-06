<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";

  let text = "";
  let textareaEl: HTMLTextAreaElement;

  onMount(() => textareaEl?.focus());

  function submit() {
    controller.importSectionsIntoActiveTab(text);
    controller.closeAllModals();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      controller.closeAllModals();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  }
</script>

<div class="overlay" role="presentation" on:click|self={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Import sections">
    <div class="modal-input-wrap" style="align-items: flex-start;">
      <span>📥</span>
      <textarea
        class="modal-input import-textarea"
        placeholder="Paste lines of text — each non-empty line becomes a new section header in the current note..."
        bind:value={text}
        bind:this={textareaEl}
        on:keydown={onKeydown}
      ></textarea>
    </div>
    <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Cancel</button>
      <button class="icon-btn" on:click={submit}>Import</button>
    </div>
  </div>
</div>
