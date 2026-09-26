<script lang="ts">
  import {
    appVersion,
    backendKind,
    folderNameFromPath,
    justUpdatedToVersion,
    notesDir,
    oneDriveAccount,
    oneDriveFolder,
    oneDriveSignInExpired,
    oneDriveSyncing,
    LONG_TOAST_CHARS,
    oneDriveSyncStatus,
    isMobile,
    statusCounts,
    statusPos,
    statusSelection,
    statusWordCount,
    syncConflicts,
    syncHealthPopoverOpen,
    toastMessage,
    UPDATE_AVAILABLE_TOAST_KEY,
    updateStatus,
  } from "../controller";
  import * as controller from "../controller";
  import Icon from "../icons/Icon.svelte";
  import SyncHealthPopover from "./SyncHealthPopover.svelte";
  import { formatCombo, formatShortcut, shortcutById } from "../shortcuts";
  import { t } from "../i18n";

  function onCloudClick() {
    if (!$oneDriveFolder) {
      controller.openSettingsOnNotesFolder();
      return;
    }
    syncHealthPopoverOpen.update((v) => !v);
  }

  // #37/#38: how many lines the selection covers (not a character count).
  $: selectionLabel = $statusSelection ? $t("statusBar.selection", { count: $statusSelection.lines }) : "";

  // §merged-titlebar: which notes folder is active — moved here from
  // "Settings-only" now that the window title itself no longer renders
  // visibly (the merged title bar has no title text). Meaningless for the
  // web backend (no `notesDir`, IndexedDB-backed instead — the "Browser
  // storage" badge in the right zone already covers that case).
  $: folderName = $notesDir ? folderNameFromPath($notesDir) : "";
</script>

<div id="status-bar">
  <div class="status-zone status-left">
    {#if $backendKind === "web" && $oneDriveAccount}
      <button
        id="stat-cloud"
        class="status-folder-btn"
        title={$oneDriveSignInExpired ? $t("statusBar.oneDrive.signInExpired") : $oneDriveAccount ? $t("statusBar.oneDrive.statusTitle", { path: $oneDriveFolder?.folderPath ?? "/", status: $oneDriveSyncStatus }) : $t("statusBar.oneDrive.connectPrompt")}
        aria-label={$t("statusBar.oneDrive.ariaLabel")}
        on:click={onCloudClick}
      >
        {#if $oneDriveSyncing || $oneDriveSyncStatus === "syncing"}
          <!-- Not gated by stat-tier0 like the label, so a narrow screen still shows *something is happening*. -->
          <span class="modal-spinner" aria-label={$t("statusBar.oneDrive.syncingAriaLabel")}>⟳</span>
        {:else}
          <Icon name="cloud" size={12} />
        {/if}
        <span class="stat-tier0 status-folder-name">
          {#if $oneDriveAccount}
            {$oneDriveSyncing || $oneDriveSyncStatus === "syncing" ? $t("statusBar.oneDrive.syncingText") : !$oneDriveFolder ? $t("statusBar.oneDrive.chooseFolder") : $oneDriveSignInExpired ? $t("statusBar.oneDrive.signInAgain") : $oneDriveSyncStatus === "error" ? $t("statusBar.oneDrive.syncError") : $oneDriveSyncStatus === "offline" ? $t("statusBar.oneDrive.offline") : ($oneDriveFolder.folderPath.split("/").filter(Boolean).pop() ?? $t("statusBar.oneDrive.defaultFolderName"))}
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
          title={$t("statusBar.conflicts.title")}
          on:click={controller.openSyncConflicts}
        >
          ⚠ {$t("statusBar.conflicts.count", { count: $syncConflicts.length })}
        </button>
        <span class="status-sep">·</span>
      {/if}
    {:else if $backendKind === "web"}
      <button
        id="stat-storage"
        class="status-folder-btn"
        title={$t("statusBar.browserStorage.title")}
        aria-label={$t("statusBar.browserStorage.label")}
        on:click={controller.openSettingsOnNotesFolder}
      >
        <Icon name="folder" size={12} />
        <span class="stat-tier0 status-folder-name">{$t("statusBar.browserStorage.label")}</span>
      </button>
      <span class="status-sep stat-tier0">·</span>
    {:else if folderName}
      <button
        id="stat-folder"
        class="status-folder-btn"
        title={$notesDir}
        aria-label={$t("statusBar.changeFolderAriaLabel")}
        on:click={controller.openSettingsOnNotesFolder}
      >
        <Icon name="folder" size={12} />
        <span class="stat-tier0 status-folder-name">{folderName}</span>
      </button>
      <span class="status-sep stat-tier0">·</span>
    {/if}
    <span id="stat-pos" class="stat-tier2">{$t("statusBar.position", { line: $statusPos.line, col: $statusPos.col })}</span>
    {#if selectionLabel}
      <span class="status-sep stat-tier2">·</span>
      <span id="stat-selection" class="stat-tier2">{selectionLabel}</span>
    {/if}
    <span class="status-sep stat-tier1">·</span>
    <span id="stat-words" class="stat-tier1">{$t("statusBar.wordCount", { count: $statusWordCount })}</span>
    <span class="status-sep stat-tier2">·</span>
    <span id="stat-open" class="stat-full">{$t("statusBar.openCount", { count: $statusCounts.open })}</span>
    <span class="stat-compact">☐ {$statusCounts.open}</span>
    <span class="status-sep">·</span>
    <span id="stat-closed" class="stat-full">{$t("statusBar.closedCount", { count: $statusCounts.closed })}</span>
    <span class="stat-compact">☑ {$statusCounts.closed}</span>
    <span class="status-sep">·</span>
    <span id="stat-forwarded" class="stat-full">{$t("statusBar.forwardedCount", { count: $statusCounts.forwarded })}</span>
    <span class="stat-compact">» {$statusCounts.forwarded}</span>
  </div>

  <div class="status-zone status-centre">
    {#if $justUpdatedToVersion}
      <span id="stat-updated" role="status">
        {$t("statusBar.updatedTo", { version: $justUpdatedToVersion })}
        <button type="button" class="status-link" on:click={controller.openJustUpdatedReleaseNotes}>
          {$t("statusBar.whatsNew")}
        </button>
      </span>
    {:else if $toastMessage === $t(UPDATE_AVAILABLE_TOAST_KEY, undefined) && $updateStatus === "available"}
      <!-- §update-check follow-up: this specific toast is a shortcut to
           About, not the generic "read and forget" toast — matched by
           exact text (not just `updateStatus === "available"`, which
           persists long after the toast itself fades) so an unrelated
           toast firing while an update happens to be available doesn't
           also render as a misleading link. -->
      <button type="button" id="stat-message" class="status-link" on:click={controller.openAbout}>
        {$toastMessage}
      </button>
    {:else if $toastMessage && !$isMobile && $toastMessage.length <= LONG_TOAST_CHARS}
      <span id="stat-message" role="status">{$toastMessage}</span>
    {/if}
  </div>

  <div class="status-zone status-right">
    {#if $updateStatus === "available" && $backendKind !== "web"}
      <button type="button" class="status-update-btn" title={$t("statusBar.updateAvailableTitle")} on:click={controller.openAbout}>
        <Icon name="update" size={12} />
      </button>
    {/if}
    {#if $appVersion}
      <button type="button" id="stat-version" title={$t("shortcuts.openAbout.label")} on:click={controller.openAbout}>
        v{$appVersion}
      </button>
    {/if}
    <button
      type="button"
      class="status-help"
      title={$t("statusBar.shortcutsTitle", { combo: formatCombo(shortcutById('openShortcutsHelp').combos[0]) })}
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
      title={$t("statusBar.aboutTitleWithCombo", { combo: formatShortcut('openAbout') })}
      on:click={controller.openAbout}
    >
      <Icon name="about" size={12} />
    </button>
  </div>

  {#if $syncHealthPopoverOpen}
    <SyncHealthPopover />
  {/if}
</div>
