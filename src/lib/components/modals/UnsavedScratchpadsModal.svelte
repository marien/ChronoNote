<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { scratchpadGateContext, unsavedScratchpadNames } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { t } from "../../i18n";

  let cancelBtn: HTMLButtonElement;
  onMount(() => cancelBtn?.focus());

  // The gate is shared by the notes-folder switch (§39) and the app-close
  // barrier (§93); only the wording and which resolve handlers run differ.
  const isClose = $derived($scratchpadGateContext === "close");
  const lead = $derived(isClose ? $t("unsavedScratchpads.leadClose") : $t("unsavedScratchpads.leadSwitch"));
  const confirmLabel = $derived(isClose ? $t("unsavedScratchpads.confirmDiscardQuit") : $t("unsavedScratchpads.confirmDiscardSwitch"));
  const cancel = () => (isClose ? controller.cancelAppClose() : controller.cancelDirectorySwitch());
  const confirm = () => (isClose ? controller.confirmDiscardAndClose() : controller.confirmDiscardAndSwitch());
</script>

<div class="overlay">
  <div class="modal-card modal-sm dialog-card" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("unsavedScratchpads.ariaLabel")}>
    <div class="dialog-body">
      <h2 class="dialog-title">{$t("unsavedScratchpads.title")}</h2>
      <div>
        {lead}
        <ul class="dialog-list">
          {#each $unsavedScratchpadNames as name}
            <li>{name}</li>
          {/each}
        </ul>
      </div>
    </div>
    <div class="dialog-buttons">
      <button class="dialog-btn accent" bind:this={cancelBtn} onclick={cancel}>
        {$t("common.cancel")}
      </button>
      <button class="dialog-btn" onclick={confirm}>
        {confirmLabel}
      </button>
    </div>
  </div>
</div>
