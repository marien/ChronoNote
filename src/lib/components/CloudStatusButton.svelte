<script lang="ts">
  /** The OneDrive sync state (web app): an icon (a spinner while syncing, an amber dot when the sign-in
   * expired) and a short state text. Lives in the status bar on wide screens and, `compact`, in the phone
   * app bar (§D3 put a navigation bar where the status bar was, so the cloud state moved up). Compact keeps
   * the text for screen readers only. Opens the sync health popover, or Settings while no folder is chosen. */
  import {
    oneDriveAccount,
    oneDriveFolder,
    oneDriveSignInExpired,
    oneDriveSyncing,
    oneDriveSyncStatus,
    syncHealthPopoverOpen,
  } from "../controller";
  import * as controller from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { t } from "../i18n";

  interface Props {
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  function onCloudClick() {
    if (!$oneDriveFolder) {
      controller.openSettingsOnNotesFolder();
      return;
    }
    syncHealthPopoverOpen.update((v) => !v);
  }

  const syncing = $derived($oneDriveSyncing || $oneDriveSyncStatus === "syncing");
  const label = $derived(
    !$oneDriveAccount
      ? "OneDrive"
      : syncing
        ? $t("statusBar.oneDrive.syncingText")
        : !$oneDriveFolder
          ? $t("statusBar.oneDrive.chooseFolder")
          : $oneDriveSignInExpired
            ? $t("statusBar.oneDrive.signInAgain")
            : $oneDriveSyncStatus === "error"
              ? $t("statusBar.oneDrive.syncError")
              : $oneDriveSyncStatus === "offline"
                ? $t("statusBar.oneDrive.offline")
                : ($oneDriveFolder.folderPath.split("/").filter(Boolean).pop() ?? $t("statusBar.oneDrive.defaultFolderName")),
  );
</script>

<button
  id="stat-cloud"
  class="status-folder-btn"
  class:compact
  class:stat-expired={$oneDriveSignInExpired}
  title={$oneDriveSignInExpired
    ? $t("statusBar.oneDrive.signInExpired")
    : $oneDriveAccount
      ? $t("statusBar.oneDrive.statusTitle", { path: $oneDriveFolder?.folderPath ?? "/", status: $oneDriveSyncStatus })
      : $t("statusBar.oneDrive.connectPrompt")}
  aria-label={$t("statusBar.oneDrive.ariaLabel")}
  onclick={onCloudClick}
>
  {#if syncing}
    <!-- Not gated by stat-tier0 like the label, so a narrow screen still shows *something is happening*. -->
    <span class="modal-spinner" aria-label={$t("statusBar.oneDrive.syncingAriaLabel")}>⟳</span>
  {:else}
    <span class="stat-cloud-icon-wrap">
      <Icon name="cloud" size={compact ? 20 : 12} />
      {#if $oneDriveSignInExpired}
        <span class="stat-cloud-dot" aria-hidden="true"></span>
      {/if}
    </span>
  {/if}
  <span class={compact ? "stat-cloud-sr" : "stat-tier0 status-folder-name"}>{label}</span>
</button>

<style>
  #stat-cloud {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  #stat-cloud:hover {
    color: var(--text);
  }

  /* Phone app bar: a 44px square icon button like its neighbours. */
  #stat-cloud.compact {
    width: 44px;
    height: 44px;
    justify-content: center;
    border-radius: 22px;
    flex-shrink: 0;
  }

  /* OneDrive sign-in expired: the stored session can no longer be renewed
     silently, so highlight the cloud control in amber with a dot badge. */
  #stat-cloud.stat-expired {
    color: var(--state-warn);
  }

  #stat-cloud.stat-expired:hover {
    color: var(--state-warn);
    opacity: 0.85;
  }

  .stat-cloud-icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }

  .stat-cloud-dot {
    position: absolute;
    top: -2px;
    right: -3px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--state-warn);
    box-shadow: 0 0 0 1px var(--tab-bg);
  }

  /* The spinner replaces the 12px icon while syncing; same size, so nothing
     after it shifts when a sync finishes. */
  #stat-cloud .modal-spinner {
    font-size: 12px;
  }

  #stat-cloud.compact .modal-spinner {
    font-size: 20px;
  }

  /* Same rule as the status bar's own (scoped there): the folder name never
     crowds out the rest; the full path is in the title. */
  .status-folder-name {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 860px) {
    .stat-tier0 {
      display: none;
    }
  }

  .stat-cloud-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
