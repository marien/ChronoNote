<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { safetyMessage } from "../../controller";

  let cancelBtn: HTMLButtonElement;
  onMount(() => cancelBtn?.focus());
</script>

<div class="overlay">
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Unresolved actions warning" style="width: 480px;">
    <div class="modal-input-wrap" style="font-weight: bold;">
      <span style="filter: grayscale(1);">⚠</span> Unresolved Actions Warning
    </div>
    <div style="padding: 16px; font-size: 13px; line-height: 1.5;">{$safetyMessage}</div>
    <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
      <button class="icon-btn" bind:this={cancelBtn} on:click={controller.cancelSafetyClose}>Cancel</button>
      <button
        class="icon-btn"
        style="background: var(--text); color: var(--bg);"
        on:click={controller.confirmSafetyClose}
        >Close Anyway</button
      >
    </div>
  </div>
</div>
