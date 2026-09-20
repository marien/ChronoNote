<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../../controller";
  import { conflictInfo } from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";

  let keepDiskBtn: HTMLButtonElement;
  onMount(() => keepDiskBtn?.focus());

  $: info = $conflictInfo;
</script>

{#if info}
  <div class="overlay">
    <div class="modal-card modal-md" role="dialog" aria-modal="true" use:focusTrap aria-label="Note changed on disk">
      <div class="modal-input-wrap modal-title">
        <Icon name="warning" size={15} /> <span>"{info.filename}" changed on disk</span>
      </div>
      <div style="padding: 16px; font-size: 13px; line-height: 1.5;">
        This note was modified outside ChronoNote (another editor, or a sync client) while you had unsaved
        changes to it here. Choose which version to keep — the other one won't be lost unless you pick
        <em>Keep&nbsp;disk</em> or <em>Keep&nbsp;mine</em> without saving a copy.
      </div>
      <div class="modal-footer" style="justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
        <button class="icon-btn" bind:this={keepDiskBtn} on:click={controller.resolveConflictKeepDisk}>
          Keep disk version
        </button>
        <button class="icon-btn" on:click={controller.resolveConflictSaveCopy}>Save mine as a copy</button>
        <button class="icon-btn btn-primary" on:click={controller.resolveConflictKeepMine}>
          Keep my version
        </button>
      </div>
    </div>
  </div>
{/if}
