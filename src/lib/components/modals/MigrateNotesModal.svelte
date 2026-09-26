<script lang="ts">
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import { t } from "../../i18n";

  export let noteCount: number;
  export let targetFolder: string;
  export let onMigrate: () => Promise<void> | void;
  export let onSkip: () => Promise<void> | void;
  export let onCancel: () => void;

  let migrating = false;
  let skipping = false;

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

<svelte:window on:keydown={handleKeydown} />

<div class="overlay" role="presentation" use:closeOnOutsideClick={onCancel}>
  <div
    class="modal-card settings-modal-card modal-sm"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label={$t("migrateNotes.ariaLabel")}
  >
    <div class="modal-input-wrap modal-title" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <Icon name="cloud" size={16} />
        <span>{$t("migrateNotes.title")}</span>
      </div>
      <button type="button" class="icon-btn modal-close-btn" aria-label={$t("common.closeDialog")} on:click={onCancel} disabled={migrating || skipping}>
        <Icon name="close" size={14} />
      </button>
    </div>

    <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 14px;">
      {$t("migrateNotes.body.beforeCount")} <strong style="color: var(--text);">{$t("migrateNotes.noteCount", { count: noteCount })}</strong> {$t("migrateNotes.body.afterCount")}
      {$t("migrateNotes.body.beforeFolder")}<strong style="color: var(--text);">{targetFolder}</strong>{$t("migrateNotes.body.afterFolder")}
    </div>

    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.4;">
      {$t("migrateNotes.disclaimerHint")}
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <button
        class="icon-btn btn-primary"
        style="justify-content: center; padding: 10px 16px; font-weight: 500;"
        disabled={migrating || skipping}
        on:click={handleMigrate}
      >
        {#if migrating}
          <span class="modal-spinner">⟳</span> {$t("migrateNotes.moving")}
        {:else}
          {$t("migrateNotes.moveButton")}
        {/if}
      </button>

      <button
        class="icon-btn"
        style="justify-content: center; padding: 8px 16px;"
        disabled={migrating || skipping}
        on:click={handleSkip}
      >
        {#if skipping}
          <span class="modal-spinner">⟳</span> {$t("migrateNotes.switchingFolder")}
        {:else}
          {$t("migrateNotes.keepSeparate")}
        {/if}
      </button>

      <button
        class="icon-btn"
        style="justify-content: center; padding: 6px 16px; opacity: 0.8;"
        disabled={migrating || skipping}
        on:click={onCancel}
      >
        {$t("common.cancel")}
      </button>
    </div>
  </div>
</div>
