<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { conflictInfo } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";

  let keepDiskBtn: HTMLButtonElement;
  onMount(() => keepDiskBtn?.focus());

  $: info = $conflictInfo;
</script>

{#if info}
  <div class="overlay">
    <div class="modal-card modal-md" role="dialog" aria-modal="true" use:focusTrap aria-label={$t("conflictModal.ariaLabel")}>
      <div class="modal-input-wrap modal-title">
        <Icon name="warning" size={15} /> <span>{$t("conflictModal.title", { filename: info.filename })}</span>
      </div>
      <div style="padding: 16px; font-size: 13px; line-height: 1.5;">
        {$t("conflictModal.explanation.part1")}<em>{$t("conflictModal.explanation.keepDiskRef")}</em>{$t(
          "conflictModal.explanation.part2",
        )}<em>{$t("conflictModal.explanation.keepMineRef")}</em>{$t("conflictModal.explanation.part3")}
      </div>
      <div class="modal-footer" style="justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
        <button class="icon-btn" bind:this={keepDiskBtn} on:click={controller.resolveConflictKeepDisk}>
          {$t("conflictModal.keepDiskVersion")}
        </button>
        <button class="icon-btn" on:click={controller.resolveConflictSaveCopy}>{$t("conflictModal.saveMineAsCopy")}</button>
        <button class="icon-btn btn-primary" on:click={controller.resolveConflictKeepMine}>
          {$t("conflictModal.keepMyVersion")}
        </button>
      </div>
    </div>
  </div>
{/if}
