<script lang="ts">
  import * as controller from "../../controller";
  import { syncConflicts } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import type { SyncConflictResolution } from "../../tauriCommands";

  // The note being shown; falls back to the first when the selected one has
  // just been resolved and dropped out of the list.
  let selectedName = "";
  $: current = $syncConflicts.find((c) => c.name === selectedName) ?? $syncConflicts[0];

  let busy = false;
  async function choose(resolution: SyncConflictResolution) {
    if (!current || busy) return;
    busy = true;
    try {
      await controller.resolveSyncConflict(current.name, resolution);
    } finally {
      busy = false;
    }
  }

  const label = (name: string) => name.replace(/\.txt$/, "");
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div class="modal-card" role="dialog" aria-modal="true" use:focusTrap aria-label="Sync conflicts" style="width: 560px;">
    <div class="modal-input-wrap modal-title">
      <Icon name="cloud" size={15} /> Sync conflicts
    </div>

    {#if current}
      <div class="settings-hint" style="padding: 12px 12px 8px; margin: 0;">
        <strong style="color: var(--text);">{label(current.name)}</strong> was changed on this device and in OneDrive,
        in the same place. Nothing has been overwritten — pick what to keep.
      </div>

      {#if $syncConflicts.length > 1}
        <div class="settings-toggle-row" style="padding: 0 12px 8px; gap: 6px; flex-wrap: wrap;">
          {#each $syncConflicts as c (c.name)}
            <button
              class="icon-btn"
              class:active={c.name === current.name}
              on:click={() => (selectedName = c.name)}>{label(c.name)}</button
            >
          {/each}
        </div>
      {/if}

      <div class="conflict-versions">
        <div class="conflict-version">
          <div class="conflict-version-label">This device</div>
          <pre class="conflict-text" data-testid="conflict-local">{current.local}</pre>
        </div>
        <div class="conflict-version">
          <div class="conflict-version-label">OneDrive</div>
          <pre class="conflict-text" data-testid="conflict-remote">{current.remote}</pre>
        </div>
      </div>

      <div class="conflict-actions">
        <button class="icon-btn btn-primary" disabled={busy} on:click={() => choose("mine")}>
          Keep this device's
        </button>
        <button class="icon-btn" disabled={busy} on:click={() => choose("theirs")}> Use OneDrive's </button>
        <button class="icon-btn" disabled={busy} on:click={() => choose("both")}> Keep both </button>
      </div>
      <div class="settings-hint" style="padding: 0 12px 12px; margin: 0;">
        "Keep both" puts the OneDrive text under a marker line at the end so you can tidy it up.
      </div>
    {:else}
      <div class="settings-hint" style="padding: 16px;">No sync conflicts.</div>
    {/if}

    <div class="modal-footer" style="padding: 8px 12px; display: flex; justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>
