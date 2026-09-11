<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";

  let text = controller.getImportDraftText();
  const hadDraft = text.length > 0;
  let textareaEl: HTMLTextAreaElement;

  onMount(() => {
    textareaEl?.focus();
    if (hadDraft) textareaEl?.select();
  });

  function closeDrawer() {
    controller.saveImportDraft(text);
    controller.closeAllModals();
  }

  function cancel() {
    controller.clearImportDraft();
    controller.closeAllModals();
  }

  function submit() {
    controller.importSectionsIntoActiveTab(text);
    controller.clearImportDraft();
    controller.closeAllModals();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      closeDrawer();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={closeDrawer}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Import sections">
    <div class="modal-input-wrap" style="align-items: flex-start;">
      <span style="padding-top: 2px;"><Icon name="import" size={15} /></span>
      <textarea
        class="modal-input import-textarea"
        placeholder="Paste lines of text — each non-empty line becomes a new section header in the current note..."
        bind:value={text}
        bind:this={textareaEl}
        on:keydown={onKeydown}
      ></textarea>
    </div>
    <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
      <button class="icon-btn" on:click={cancel}>Cancel</button>
      <button class="icon-btn" on:click={submit}>Import</button>
    </div>
  </div>
</div>
