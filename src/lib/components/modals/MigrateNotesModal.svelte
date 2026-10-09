<script lang="ts">
  import { onMount } from "svelte";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import { t } from "../../i18n";

  interface Props {
    noteCount: number;
    targetFolder: string;
    onMigrate: () => Promise<void> | void;
    onSkip: () => Promise<void> | void;
    onCancel: () => void;
  }

  let { noteCount, targetFolder, onMigrate, onSkip, onCancel }: Props = $props();

  let migrateBtn = $state<HTMLButtonElement>();
  onMount(() => migrateBtn?.focus());

  let migrating = $state(false);
  let skipping = $state(false);

  async function handleMigrate() {
    migrating = true;
    try {
      await onMigrate();
    } finally {
      migrating = false;
    }
  }

  async function handleSkip() {
    skipping = true;
    try {
      await onSkip();
    } finally {
      skipping = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !migrating && !skipping) {
      onCancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="overlay" role="presentation" use:closeOnOutsideClick={onCancel}>
  <div
    class="modal-card modal-sm dialog-card"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label={$t("migrateNotes.ariaLabel")}
  >
    <div class="dialog-body">
      <h2 class="dialog-title">{$t("migrateNotes.title")}</h2>
      <div style="margin-bottom: 12px;">
        {$t("migrateNotes.body.beforeCount")} <strong style="color: var(--text);">{$t("migrateNotes.noteCount", { count: noteCount })}</strong> {$t("migrateNotes.body.afterCount")}
        {$t("migrateNotes.body.beforeFolder")}<strong style="color: var(--text);">{targetFolder}</strong>{$t("migrateNotes.body.afterFolder")}
      </div>
      <div>
        {$t("migrateNotes.disclaimerHint")}
      </div>
    </div>

    <div class="dialog-buttons">
      <button
        class="dialog-btn accent"
        bind:this={migrateBtn}
        disabled={migrating || skipping}
        onclick={handleMigrate}
      >
        {#if migrating}
          <span class="modal-spinner">⟳</span> {$t("migrateNotes.moving")}
        {:else}
          {$t("migrateNotes.moveButton")}
        {/if}
      </button>

      <button
        class="dialog-btn"
        disabled={migrating || skipping}
        onclick={handleSkip}
      >
        {#if skipping}
          <span class="modal-spinner">⟳</span> {$t("migrateNotes.switchingFolder")}
        {:else}
          {$t("migrateNotes.keepSeparate")}
        {/if}
      </button>

      <button
        class="dialog-btn"
        disabled={migrating || skipping}
        onclick={onCancel}
      >
        {$t("common.cancel")}
      </button>
    </div>
  </div>
</div>
