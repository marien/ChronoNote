<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { unsavedScratchpadNames } from "../../controller";

  let cancelBtn: HTMLButtonElement;
  onMount(() => cancelBtn?.focus());
</script>

<div class="overlay">
  <div class="modal-card" style="width: 480px;">
    <div class="modal-input-wrap" style="font-weight: bold;">
      <span style="filter: grayscale(1);">⚠</span> Unsaved Scratchpad Content
    </div>
    <div style="padding: 16px; font-size: 13px; line-height: 1.5;">
      Switching notes directories will close all open tabs. These scratchpads have content that was never promoted to
      a note and will be permanently lost:
      <ul style="margin: 8px 0 0 20px;">
        {#each $unsavedScratchpadNames as name}
          <li>{name}</li>
        {/each}
      </ul>
    </div>
    <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
      <button class="icon-btn" bind:this={cancelBtn} on:click={controller.cancelDirectorySwitch}>Cancel</button>
      <button
        class="icon-btn"
        style="background: var(--text); color: var(--bg);"
        on:click={controller.confirmDiscardAndSwitch}
      >
        Discard &amp; Switch
      </button>
    </div>
  </div>
</div>
