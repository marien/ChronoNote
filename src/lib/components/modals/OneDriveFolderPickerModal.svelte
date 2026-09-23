<script lang="ts">
  import { onMount } from "svelte";
  import * as api from "../../tauriApi";
  import * as controller from "../../controller";
  import { backendKind, oneDriveFolder, showToast } from "../../stores";
  import { syncOneDriveNow } from "../../oneDriveSync";
  import Icon from "../../icons/Icon.svelte";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import { focusTrap } from "../../actions/focusTrap";
  import MigrateNotesModal from "./MigrateNotesModal.svelte";

  export let onClose: () => void;

  interface Breadcrumb {
    id: string | null;
    name: string;
  }

  let breadcrumbs: Breadcrumb[] = [{ id: null, name: "OneDrive Root" }];
  let folders: Array<{ id: string; name: string }> = [];
  let loading = true;
  let error: string | null = null;

  let showNewFolderInput = false;
  let newFolderName = "";
  let creatingFolder = false;

  $: currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;
  $: currentFolderPath =
    breadcrumbs.length <= 1
      ? "/"
      : "/" + breadcrumbs.slice(1).map((b) => b.name).join("/");

  async function loadFolders(parentId: string | null) {
    loading = true;
    error = null;
    try {
      folders = await api.oneDriveListFolders(parentId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      folders = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadFolders(null);
  });

  function navigateTo(folder: { id: string; name: string }) {
    breadcrumbs = [...breadcrumbs, { id: folder.id, name: folder.name }];
    loadFolders(folder.id);
  }

  function navigateToBreadcrumb(index: number) {
    if (index === breadcrumbs.length - 1) return;
    breadcrumbs = breadcrumbs.slice(0, index + 1);
    loadFolders(breadcrumbs[breadcrumbs.length - 1].id);
  }

  function navigateUp() {
    if (breadcrumbs.length <= 1) return;
    breadcrumbs = breadcrumbs.slice(0, -1);
    loadFolders(breadcrumbs[breadcrumbs.length - 1].id);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    creatingFolder = true;
    try {
      const created = await api.oneDriveCreateFolder(name, currentFolderId);
      newFolderName = "";
      showNewFolderInput = false;
      await loadFolders(currentFolderId);
      navigateTo(created);
    } catch (e) {
      showToast(`Failed to create folder: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      creatingFolder = false;
    }
  }

  let pendingMigration: { folderId: string; folderPath: string; noteCount: number } | null = null;

  async function finalizeFolderSelection(folderId: string, folderPath: string) {
    try {
      await api.oneDriveSetFolder(folderId, folderPath);
      oneDriveFolder.set({ folderId, folderPath });
      showToast(`Notes folder set to OneDrive: ${folderPath}`);
      if ($backendKind === "web") {
        // Close the old notes and show a scratchpad while the first sync runs, then
        // open the folder's own notes - a tab opened before the sync would sit on a
        // stale copy of a note the sync is about to download.
        const folderName = folderPath.split("/").filter(Boolean).pop() ?? "your OneDrive";
        const pad = controller.beginFolderSwitch(folderName);
        onClose();
        await syncOneDriveNow({ notify: true });
        await controller.finishFolderSwitch(folderPath, pad);
      } else {
        // The first sync of a new folder can be a big download - start it
        // visibly (status-bar spinner) and report how it ended.
        void syncOneDriveNow({ notify: true });
        onClose();
      }
    } catch (e) {
      showToast(`Failed to set folder: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Web only. Choosing a different folder than the one the local notes belong to:
   * sync the old folder first, then clear them, so its notes don't end up in this
   * folder. Returns false (after saying why) when the switch must not go ahead.
   * Runs only once the user has committed - not while they can still cancel. */
  async function prepareFolderSwitchOrAbort(folderId: string): Promise<boolean> {
    if ($backendKind !== "web") return true;
    try {
      await controller.flushAllPendingSaves();
      const prep = await api.oneDrivePrepareFolderSwitch(folderId);
      if (!prep.ready) {
        showToast(prep.message ?? "Couldn't switch folders");
        return false;
      }
      if (prep.archivedCount > 0) {
        showToast(`${prep.archivedCount} note(s) from the previous folder couldn't be synced - a copy is kept on this device.`);
      }
      return true;
    } catch (e) {
      showToast(`Couldn't switch folders: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  async function handleSelectCurrentFolder() {
    const folderId = currentFolderId ?? "root";
    const folderPath = currentFolderPath;
    if ($backendKind === "web") {
      try {
        await controller.flushAllPendingSaves();
        const check = await api.webCheckBrowserNotes();
        if (check.count > 0) {
          pendingMigration = { folderId, folderPath, noteCount: check.count };
          return;
        }
      } catch (err) {
        console.error("Error checking browser notes:", err);
      }
    }
    if (!(await prepareFolderSwitchOrAbort(folderId))) return;
    await finalizeFolderSelection(folderId, folderPath);
  }

  async function handleConfirmMigration() {
    if (!pendingMigration) return;
    const { folderId, folderPath } = pendingMigration;
    if (!(await prepareFolderSwitchOrAbort(folderId))) return;
    try {
      const res = await api.webMigrateBrowserNotes();
      if (res.conflictCount > 0) {
        showToast(`Moved notes with ${res.conflictCount} conflict(s) to review.`);
      }
      await finalizeFolderSelection(folderId, folderPath);
    } catch (e) {
      showToast(`Migration failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleSkipMigration() {
    if (!pendingMigration) return;
    const { folderId, folderPath } = pendingMigration;
    if (!(await prepareFolderSwitchOrAbort(folderId))) return;
    await finalizeFolderSelection(folderId, folderPath);
  }

  function handleCancelMigration() {
    pendingMigration = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (pendingMigration) {
        pendingMigration = null;
      } else {
        onClose();
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="overlay" role="presentation" use:closeOnOutsideClick={onClose}>
  <div
    class="modal-card settings-modal-card onedrive-picker-card modal-lg"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label="Select OneDrive Folder"
  >
    <div class="modal-input-wrap modal-title" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <Icon name="cloud" size={16} />
        <span>Select OneDrive Notes Folder</span>
      </div>
      <button type="button" class="icon-btn modal-close-btn" aria-label="Close dialog" on:click={onClose}>
        <Icon name="close" size={14} />
      </button>
    </div>

    <!-- Breadcrumb navigation bar -->
    <div class="onedrive-breadcrumbs">
      {#if breadcrumbs.length > 1}
        <button
          type="button"
          class="icon-btn onedrive-back-btn"
          title="Go up one folder"
          on:click={navigateUp}
        >
          <Icon name="chevron-left" size={14} />
        </button>
      {/if}
      <div class="onedrive-breadcrumb-trail">
        {#each breadcrumbs as crumb, i}
          {#if i > 0}
            <span class="onedrive-breadcrumb-sep">/</span>
          {/if}
          <button
            type="button"
            class="onedrive-breadcrumb-item"
            class:active={i === breadcrumbs.length - 1}
            on:click={() => navigateToBreadcrumb(i)}
          >
            {crumb.name}
          </button>
        {/each}
      </div>
    </div>

    <!-- Folder list or state -->
    <div class="onedrive-folder-list">
      {#if loading}
        <div class="onedrive-empty-hint">Loading folders…</div>
      {:else if error}
        <div class="onedrive-error-box">
          <div>{error}</div>
          <button class="icon-btn" style="margin-top: 8px;" on:click={() => loadFolders(currentFolderId)}>
            Retry
          </button>
        </div>
      {:else}
        {#if folders.length === 0}
          <div class="onedrive-empty-hint">
            No subfolders found in this folder.
          </div>
        {:else}
          {#each folders as folder (folder.id)}
            <button
              type="button"
              class="onedrive-folder-row"
              on:click={() => navigateTo(folder)}
            >
              <div class="onedrive-folder-icon">
                <Icon name="folder" size={16} />
              </div>
              <span class="onedrive-folder-name">{folder.name}</span>
              <Icon name="chevron-right" size={14} />
            </button>
          {/each}
        {/if}
      {/if}
    </div>

    <!-- Inline create new folder -->
    {#if showNewFolderInput}
      <form
        class="onedrive-new-folder-form"
        on:submit|preventDefault={handleCreateFolder}
      >
        <input
          type="text"
          class="find-input"
          style="flex: 1; height: 32px;"
          placeholder="New folder name…"
          bind:value={newFolderName}
        />
        <button
          type="submit"
          class="icon-btn btn-primary"
          style="height: 32px; padding: 0 12px;"
          disabled={creatingFolder || !newFolderName.trim()}
        >
          {creatingFolder ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          class="icon-btn"
          style="height: 32px; padding: 0 8px;"
          on:click={() => {
            showNewFolderInput = false;
            newFolderName = "";
          }}
        >
          Cancel
        </button>
      </form>
    {:else}
      <div style="padding: 4px 0 8px;">
        <button
          type="button"
          class="icon-btn"
          style="font-size: 12px; gap: 4px;"
          on:click={() => (showNewFolderInput = true)}
        >
          <span>+ New subfolder</span>
        </button>
      </div>
    {/if}

    <!-- Footer actions -->
    <div class="onedrive-picker-footer">
      <div class="onedrive-selection-label">
        Current target: <strong>{currentFolderPath}</strong>
      </div>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="icon-btn" on:click={onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="icon-btn btn-primary"
          on:click={handleSelectCurrentFolder}
        >
          Use this folder
        </button>
      </div>
    </div>
  </div>
</div>

{#if pendingMigration}
  <MigrateNotesModal
    noteCount={pendingMigration.noteCount}
    targetFolder={pendingMigration.folderPath}
    onMigrate={handleConfirmMigration}
    onSkip={handleSkipMigration}
    onCancel={handleCancelMigration}
  />
{/if}

<style>
  .onedrive-picker-card {
    width: 480px;
    max-width: 92vw;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
  }
  .onedrive-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: var(--surface-canvas);
    border: 1px solid var(--edge-soft);
    border-radius: 6px;
    margin-bottom: 8px;
    overflow-x: auto;
  }
  .onedrive-breadcrumb-trail {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    white-space: nowrap;
  }
  .onedrive-breadcrumb-item {
    background: none;
    border: none;
    color: var(--muted);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .onedrive-breadcrumb-item:hover {
    color: var(--text);
    background: var(--surface-overlay);
  }
  .onedrive-breadcrumb-item.active {
    color: var(--primary-accent, #38bdf8);
    font-weight: bold;
  }
  .onedrive-breadcrumb-sep {
    color: var(--edge-strong);
  }
  .onedrive-back-btn {
    padding: 2px 4px;
    height: 24px;
  }
  .onedrive-folder-list {
    flex: 1;
    min-height: 180px;
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid var(--edge-soft);
    border-radius: 6px;
    background: var(--surface-canvas);
    margin-bottom: 8px;
  }
  .onedrive-folder-row {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 10px 12px;
    min-height: 44px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--edge-soft);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    gap: 10px;
    font-family: inherit;
    font-size: 13px;
  }
  .onedrive-folder-row:last-child {
    border-bottom: none;
  }
  .onedrive-folder-row:hover,
  .onedrive-folder-row:focus-visible {
    background: var(--surface-overlay);
  }
  .onedrive-folder-icon {
    color: var(--primary-accent, #38bdf8);
    display: flex;
    align-items: center;
  }
  .onedrive-folder-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .onedrive-empty-hint {
    padding: 32px 16px;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
  }
  .onedrive-error-box {
    padding: 16px;
    color: var(--state-error);
    font-size: 12px;
    text-align: center;
  }
  .onedrive-new-folder-form {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 8px;
  }
  .onedrive-picker-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 10px;
    border-top: 1px solid var(--edge-soft);
    margin-top: 4px;
  }
  .onedrive-selection-label {
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }
</style>
