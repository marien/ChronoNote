<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { conflictInfo } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { t } from "../../i18n";

  let keepDiskBtn = $state<HTMLButtonElement>();
  onMount(() => keepDiskBtn?.focus());

  const info = $derived($conflictInfo);
</script>

{#if info}
  <div class="overlay">
    <div class="modal-card modal-md dialog-card" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("conflictModal.ariaLabel")}>
      <div class="dialog-body">
        <h2 class="dialog-title">{$t("conflictModal.title", { filename: info.filename })}</h2>
        <div>
          {$t("conflictModal.explanation.part1")}<em>{$t("conflictModal.explanation.keepDiskRef")}</em>{$t(
            "conflictModal.explanation.part2",
          )}<em>{$t("conflictModal.explanation.keepMineRef")}</em>{$t("conflictModal.explanation.part3")}
        </div>
      </div>
      <div class="dialog-buttons">
        <button class="dialog-btn accent" bind:this={keepDiskBtn} onclick={controller.resolveConflictKeepDisk}>
          {$t("conflictModal.keepDiskVersion")}
        </button>
        <button class="dialog-btn" onclick={controller.resolveConflictSaveCopy}>
          {$t("conflictModal.saveMineAsCopy")}
        </button>
        <button class="dialog-btn" onclick={controller.resolveConflictKeepMine}>
          {$t("conflictModal.keepMyVersion")}
        </button>
      </div>
    </div>
  </div>
{/if}
