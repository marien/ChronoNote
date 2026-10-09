<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { safetyMessage } from "../../controller";
  import { t } from "../../i18n";

  let cancelBtn: HTMLButtonElement;
  onMount(() => cancelBtn?.focus());
</script>

<div class="overlay">
  <div class="modal-card modal-sm dialog-card" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("safetyModal.ariaLabel")}>
    <div class="dialog-body">
      <h2 class="dialog-title">{$t("safetyModal.title")}</h2>
      <div>{$safetyMessage}</div>
    </div>
    <div class="dialog-buttons">
      <button class="dialog-btn accent" bind:this={cancelBtn} onclick={controller.cancelSafetyClose}>
        {$t("common.cancel")}
      </button>
      <button class="dialog-btn" onclick={controller.confirmSafetyClose}>
        {$t("safetyModal.closeAnyway")}
      </button>
    </div>
  </div>
</div>
