<script lang="ts">
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";

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
    class="modal-card settings-modal-card"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label="Move Notes to OneDrive"
    style="max-width: 440px;"
  >
    <div class="modal-input-wrap modal-title" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <Icon name="cloud" size={16} />
        <span>Move Notes to OneDrive?</span>
      </div>
      <button class="icon-btn" aria-label="Close" on:click={onCancel} style="padding: 2px;" disabled={migrating || skipping}>
        <Icon name="close" size={14} />
      </button>
    </div>

    <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 14px;">
      You have <strong style="color: var(--text);">{noteCount} {noteCount === 1 ? 'note' : 'notes'}</strong> in Browser storage.
      Would you like to move them into your OneDrive folder (<strong style="color: var(--text);">{targetFolder}</strong>)?
    </div>

    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.4;">
      If a note with the same name already exists in OneDrive and the text differs, both versions are kept and you choose which to keep - nothing is overwritten. A safety backup of your browser notes will be saved.
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <button
        class="icon-btn btn-primary"
        style="justify-content: center; padding: 10px 16px; font-weight: 500;"
        disabled={migrating || skipping}
        on:click={handleMigrate}
      >
        {#if migrating}
          <span class="modal-spinner">⟳</span> Moving notes…
        {:else}
          Move notes to OneDrive
        {/if}
      </button>

      <button
        class="icon-btn"
        style="justify-content: center; padding: 8px 16px;"
        disabled={migrating || skipping}
        on:click={handleSkip}
      >
        {#if skipping}
          <span class="modal-spinner">⟳</span> Switching folder…
        {:else}
          Keep Browser storage separate
        {/if}
      </button>

      <button
        class="icon-btn"
        style="justify-content: center; padding: 6px 16px; opacity: 0.8;"
        disabled={migrating || skipping}
        on:click={onCancel}
      >
        Cancel
      </button>
    </div>
  </div>
</div>
