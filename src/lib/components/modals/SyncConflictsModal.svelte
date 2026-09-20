<script lang="ts">
  import * as controller from "../../controller";
  import { syncConflicts } from "../../controller";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import Icon from "../../icons/Icon.svelte";
  import type { SyncConflictResolution } from "../../tauriCommands";
  import { diffLines } from "../../lineDiff";

  // The note being shown; falls back to the first when the selected one has
  // just been resolved and dropped out of the list.
  let selectedName = "";
  $: current = $syncConflicts.find((c) => c.name === selectedName) ?? $syncConflicts[0];

  $: diff = current ? diffLines(current.local, current.remote) : { left: [], right: [] };
  $: changedCount = diff.left.filter((r) => r.changed).length + diff.right.filter((r) => r.changed).length;

  let busy = false;
  let viewMode: "both" | "mine" | "theirs" = "both";
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
  <div class="modal-card modal-md" role="dialog" aria-modal="true" use:focusTrap aria-label="Sync conflicts">
    <div class="modal-input-wrap modal-title">
      <Icon name="cloud" size={15} />
      <span>Sync conflicts</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label="Close dialog"
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
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

      <!-- §194: Responsive view switcher for viewports <= 520px -->
      <div class="conflict-view-tabs">
        <button
          type="button"
          class="conflict-view-btn"
          class:active={viewMode === "both"}
          on:click={() => (viewMode = "both")}
        >
          Side-by-Side
        </button>
        <button
          type="button"
          class="conflict-view-btn"
          class:active={viewMode === "mine"}
          on:click={() => (viewMode = "mine")}
        >
          This Device
        </button>
        <button
          type="button"
          class="conflict-view-btn"
          class:active={viewMode === "theirs"}
          on:click={() => (viewMode = "theirs")}
        >
          OneDrive
        </button>
      </div>

      <div class="conflict-versions" class:show-both={viewMode === "both"} class:show-mine={viewMode === "mine"} class:show-theirs={viewMode === "theirs"}>
        <div class="conflict-version">
          <div class="conflict-version-label"><span class="conflict-badge">This device</span></div>
          <div class="conflict-text" data-testid="conflict-local">{#each diff.left as row}<div class="conflict-line" class:changed={row.changed}>{row.text}</div>{/each}</div>
        </div>
        <div class="conflict-version">
          <div class="conflict-version-label"><span class="conflict-badge">OneDrive</span></div>
          <div class="conflict-text" data-testid="conflict-remote">{#each diff.right as row}<div class="conflict-line" class:changed={row.changed}>{row.text}</div>{/each}</div>
        </div>
      </div>
      {#if changedCount > 0}
        <div class="settings-hint" style="padding: 6px 12px 0; margin: 0;">Highlighted lines are the ones that differ.</div>
      {/if}

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
