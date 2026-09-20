<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { safetyMessage } from "../../controller";
  import Icon from "../../icons/Icon.svelte";

  let cancelBtn: HTMLButtonElement;
  onMount(() => cancelBtn?.focus());
</script>

<div class="overlay">
  <div class="modal-card modal-sm" role="dialog" aria-modal="true" use:focusTrap aria-label="Unresolved actions warning">
    <div class="modal-input-wrap modal-title">
      <Icon name="warning" size={15} />
      <span>Unresolved Actions Warning</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label="Close dialog"
        on:click={controller.cancelSafetyClose}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
    <div style="padding: 16px; font-size: 13px; line-height: 1.5;">{$safetyMessage}</div>
    <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
      <button class="icon-btn" bind:this={cancelBtn} on:click={controller.cancelSafetyClose}>Cancel</button>
      <button class="icon-btn btn-primary" on:click={controller.confirmSafetyClose}>Close Anyway</button>
    </div>
  </div>
</div>
