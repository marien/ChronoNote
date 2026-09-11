<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { scratchpadGateContext, unsavedScratchpadNames } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";

  let cancelBtn: HTMLButtonElement;
  onMount(() => cancelBtn?.focus());

  // The gate is shared by the notes-folder switch (§39) and the app-close
  // barrier (§93); only the wording and which resolve handlers run differ.
  $: isClose = $scratchpadGateContext === "close";
  $: lead = isClose
    ? "Quitting ChronoNote will discard these scratchpads — they were never promoted to a note and are not saved to disk:"
    : "Switching notes directories will close all open tabs. These scratchpads have content that was never promoted to a note and will be permanently lost:";
  $: confirmLabel = isClose ? "Discard & Quit" : "Discard & Switch";
  const cancel = () => (isClose ? controller.cancelAppClose() : controller.cancelDirectorySwitch());
  const confirm = () => (isClose ? controller.confirmDiscardAndClose() : controller.confirmDiscardAndSwitch());
</script>

<div class="overlay">
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Unsaved scratchpad content" style="width: 480px;">
    <div class="modal-input-wrap modal-title">
      <Icon name="warning" size={15} /> Unsaved Scratchpad Content
    </div>
    <div style="padding: 16px; font-size: 13px; line-height: 1.5;">
      {lead}
      <ul style="margin: 8px 0 0 20px;">
        {#each $unsavedScratchpadNames as name}
          <li>{name}</li>
        {/each}
      </ul>
    </div>
    <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
      <button class="icon-btn" bind:this={cancelBtn} on:click={cancel}>Cancel</button>
      <button class="icon-btn btn-primary" on:click={confirm}>
        {confirmLabel}
      </button>
    </div>
  </div>
</div>
