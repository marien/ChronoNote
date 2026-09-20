<script lang="ts">
  import {
    appVersion,
    backendKind,
    folderNameFromPath,
    justUpdatedToVersion,
    notesDir,
    oneDriveAccount,
    oneDriveFolder,
    oneDriveSyncing,
    oneDriveSyncStatus,
    statusCounts,
    statusPos,
    statusSelection,
    statusWordCount,
    syncConflicts,
    toastMessage,
    UPDATE_AVAILABLE_TOAST,
    updateStatus,
  } from "../controller";
  import * as controller from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { formatCombo, formatShortcut, shortcutById } from "../shortcuts";

  // #37/#38: how many lines the selection covers (not a character count).
  $: selectionLabel = $statusSelection
    ? `${$statusSelection.lines} ${$statusSelection.lines === 1 ? "line" : "lines"} selected`
    : "";

  // §merged-titlebar: which notes folder is active — moved here from
  // "Settings-only" now that the window title itself no longer renders
  // visibly (the merged title bar has no title text). Meaningless for the
  // web backend (no `notesDir`, IndexedDB-backed instead — the "Browser
  // storage" badge in the right zone already covers that case).
  $: folderName = $notesDir ? folderNameFromPath($notesDir) : "";
</script>

<div id="status-bar">
  <div class="status-zone status-left">
    {#if $backendKind === "android" || ($backendKind === "web" && $oneDriveAccount)}
      <button
        id="stat-cloud"
        class="status-folder-btn"
        title={$oneDriveAccount ? `OneDrive: ${$oneDriveFolder?.folderPath ?? "/"} (${$oneDriveSyncStatus})` : "Connect OneDrive in Settings"}
        aria-label="OneDrive cloud sync"
        on:click={controller.openSettingsOnNotesFolder}
      >
        {#if $oneDriveSyncing || $oneDriveSyncStatus === "syncing"}
          <!-- Not gated by stat-tier0 like the label, so a narrow screen still shows *something is happening*. -->
          <span class="modal-spinner" aria-label="Syncing">⟳</span>
        {:else}
          <Icon name="cloud" size={12} />
        {/if}
        <span class="stat-tier0 status-folder-name">
          {#if $oneDriveAccount}
            {$oneDriveSyncing || $oneDriveSyncStatus === "syncing" ? "Syncing…" : !$oneDriveFolder ? "Choose a folder" : $oneDriveSyncStatus === "error" ? "Sync error" : $oneDriveSyncStatus === "offline" ? "Offline" : ($oneDriveFolder.folderPath.split("/").filter(Boolean).pop() ?? "Notes")}
          {:else}
            OneDrive
          {/if}
        </span>
      </button>
      <span class="status-sep stat-tier0">·</span>
      {#if $syncConflicts.length > 0}
        <button
          id="stat-conflicts"
          class="status-folder-btn stat-conflicts"
          title="Some notes changed on this device and in OneDrive — tap to choose"
          on:click={controller.openSyncConflicts}
        >
          ⚠ {$syncConflicts.length === 1 ? "1 sync conflict" : `${$syncConflicts.length} sync conflicts`}
        </button>
        <span class="status-sep">·</span>
      {/if}
    {:else if $backendKind === "web"}
      <button
        id="stat-storage"
        class="status-folder-btn"
        title="Notes are stored in browser storage. Click to open Settings."
        aria-label="Browser storage"
        on:click={controller.openSettingsOnNotesFolder}
      >
        <Icon name="folder" size={12} />
        <span class="stat-tier0 status-folder-name">Browser storage</span>
      </button>
      <span class="status-sep stat-tier0">·</span>
    {:else if folderName}
      <button
        id="stat-folder"
        class="status-folder-btn"
        title={$notesDir}
        aria-label="Change notes folder"
        on:click={controller.openSettingsOnNotesFolder}
      >
        <Icon name="folder" size={12} />
        <span class="stat-tier0 status-folder-name">{folderName}</span>
      </button>
      <span class="status-sep stat-tier0">·</span>
    {/if}
    <span id="stat-pos" class="stat-tier2">Ln {$statusPos.line}, Col {$statusPos.col}</span>
    {#if selectionLabel}
      <span class="status-sep stat-tier2">·</span>
      <span id="stat-selection" class="stat-tier2">{selectionLabel}</span>
    {/if}
    <span class="status-sep stat-tier1">·</span>
    <span id="stat-words" class="stat-tier1">{$statusWordCount} {$statusWordCount === 1 ? "word" : "words"}</span>
    <span class="status-sep stat-tier2">·</span>
    <span id="stat-open" class="stat-full">Open {$statusCounts.open}</span>
    <span class="stat-compact">☐ {$statusCounts.open}</span>
    <span class="status-sep">·</span>
    <span id="stat-closed" class="stat-full">Closed {$statusCounts.closed}</span>
    <span class="stat-compact">☑ {$statusCounts.closed}</span>
    <span class="status-sep">·</span>
    <span id="stat-forwarded" class="stat-full">Forwarded {$statusCounts.forwarded}</span>
    <span class="stat-compact">» {$statusCounts.forwarded}</span>
  </div>

  <div class="status-zone status-centre">
    {#if $justUpdatedToVersion}
      <span id="stat-updated" role="status">
        Updated to v{$justUpdatedToVersion} —
        <button type="button" class="status-link" on:click={controller.openJustUpdatedReleaseNotes}>
          What's new
        </button>
      </span>
    {:else if $toastMessage === UPDATE_AVAILABLE_TOAST && $updateStatus === "available"}
      <!-- §update-check follow-up: this specific toast is a shortcut to
           About, not the generic "read and forget" toast — matched by
           exact text (not just `updateStatus === "available"`, which
           persists long after the toast itself fades) so an unrelated
           toast firing while an update happens to be available doesn't
           also render as a misleading link. -->
      <button type="button" id="stat-message" class="status-link" on:click={controller.openAbout}>
        {$toastMessage}
      </button>
    {:else if $toastMessage}
      <span id="stat-message" role="status">{$toastMessage}</span>
    {/if}
  </div>

  <div class="status-zone status-right">
    {#if $updateStatus === "available" && $backendKind !== "web" && $backendKind !== "android"}
      <button type="button" class="status-update-btn" title="Update available — see About" on:click={controller.openAbout}>
        <Icon name="update" size={12} />
      </button>
    {/if}
    {#if $appVersion}
      <button type="button" id="stat-version" title="About ChronoNote" on:click={controller.openAbout}>
        v{$appVersion}
      </button>
    {/if}
    <button
      type="button"
      class="status-help"
      title="Shortcuts & symbols ({formatCombo(shortcutById('openShortcutsHelp').combos[0])})"
      on:click={controller.openShortcutsHelp}
    >
      ?
    </button>
    <!-- #58: moved from the top bar (last, after Shortcuts & symbols) — always reachable here regardless of
         window width, instead of competing for room with the tab strip
         and folding into "More" once things got tight. -->
    <button
      type="button"
      class="status-about-btn"
      title="About ChronoNote ({formatShortcut('openAbout')})"
      on:click={controller.openAbout}
    >
      <Icon name="about" size={12} />
    </button>
  </div>
</div>
