<script lang="ts">
  import { onMount } from "svelte";
  import * as controller from "../controller";
  import {
    backendKind,
    oneDriveAccount,
    oneDriveFolder,
    oneDriveSignInExpired,
    oneDriveSyncing,
    oneDriveSyncStatus,
    syncHealth,
    syncHealthPopoverOpen,
  } from "../controller";
  import Icon from "../icons/Icon.svelte";
  import { focusTrap } from "../actions/focusTrap";

  let popEl: HTMLDivElement;
  let anchorStyle = "visibility:hidden";

  function positionAboveTrigger() {
    const trigger = document.querySelector<HTMLElement>("#stat-cloud");
    if (!trigger || !popEl) {
      anchorStyle = "";
      return;
    }
    const r = trigger.getBoundingClientRect();
    const w = popEl.offsetWidth || 290;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const bottom = window.innerHeight - r.top + 6;
    anchorStyle = `bottom:${bottom}px; left:${left}px`;
  }

  function formatRelativeTime(ms: number | null | undefined): string {
    if (!ms) return "Never";
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    const timeStr = new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffSec < 60) return `Just now (${timeStr})`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin === 1) return `1 minute ago (${timeStr})`;
    if (diffMin < 60) return `${diffMin} minutes ago (${timeStr})`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) return `1 hour ago (${timeStr})`;
    if (diffHours < 24) return `${diffHours} hours ago (${timeStr})`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }

  onMount(async () => {
    positionAboveTrigger();
    await controller.refreshSyncHealth();
    positionAboveTrigger();
  });

  function onOutsideMousedown(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (t?.closest("#stat-cloud")) return;
    if (popEl && !popEl.contains(t)) {
      syncHealthPopoverOpen.set(false);
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      syncHealthPopoverOpen.set(false);
      e.stopPropagation();
    }
  }

  async function handleSyncNow() {
    await controller.syncOneDriveNow({ notify: true });
    await controller.refreshSyncHealth();
  }

  function handleOpenSettings() {
    syncHealthPopoverOpen.set(false);
    controller.openSettingsOnNotesFolder();
  }

  $: isSyncing = $oneDriveSyncing || $oneDriveSyncStatus === "syncing" || $syncHealth?.status === "syncing";
  $: isOffline = $oneDriveSyncStatus === "offline" || $syncHealth?.status === "offline";
  $: isError = $oneDriveSignInExpired || $oneDriveSyncStatus === "error" || $syncHealth?.status === "error";

  $: statusLabel = $oneDriveSignInExpired
    ? "Sign-in expired"
    : isSyncing
    ? "Syncing changes…"
    : isOffline
      ? "Offline (cached)"
      : isError
        ? "Sync error"
        : "In sync";

  $: statusClass = isSyncing ? "syncing" : isOffline ? "offline" : isError ? "error" : "in-sync";
</script>

<svelte:window on:mousedown={onOutsideMousedown} on:keydown={onWindowKeydown} on:resize={positionAboveTrigger} />

<div
  id="telemetry-popover"
  class="telemetry-popover"
  bind:this={popEl}
  role="dialog"
  aria-label="Cloud sync health and telemetry"
  use:focusTrap
  style={anchorStyle}
>
  <div class="telemetry-header">
    <div class="telemetry-header-title">
      <Icon name="cloud" size={14} />
      <span>OneDrive Cloud Sync</span>
    </div>
    <button
      type="button"
      class="modal-close-btn"
      aria-label="Close"
      on:click={() => syncHealthPopoverOpen.set(false)}
    >
      ✕
    </button>
  </div>

  <div class="telemetry-details">
    <div class="telemetry-row">
      <span class="telemetry-label">Status:</span>
      <span class="telemetry-status {statusClass}">
        {#if isSyncing}
          <span class="modal-spinner" aria-hidden="true">⟳</span>
        {:else if isOffline}
          <span aria-hidden="true">▲</span>
        {:else if isError}
          <span aria-hidden="true">✕</span>
        {:else}
          <span aria-hidden="true">●</span>
        {/if}
        {statusLabel}
      </span>
    </div>

    <div class="telemetry-row">
      <span class="telemetry-label">Last synced:</span>
      <span class="telemetry-value">{formatRelativeTime($syncHealth?.lastSyncSuccessMs)}</span>
    </div>

    <div class="telemetry-row">
      <span class="telemetry-label">Local mirror:</span>
      <span class="telemetry-value">
        {$syncHealth?.localNoteCount ?? 0} notes ({$backendKind === "web" ? "IndexedDB" : "local"})
      </span>
    </div>

    {#if ($syncHealth?.pendingUploadCount ?? 0) > 0}
      <div class="telemetry-row">
        <span class="telemetry-label">Pending uploads:</span>
        <span class="telemetry-value">{$syncHealth?.pendingUploadCount} notes</span>
      </div>
    {/if}

    <div class="telemetry-row">
      <span class="telemetry-label">Account:</span>
      <span class="telemetry-value telemetry-code">{$oneDriveAccount?.email ?? "Connected"}</span>
    </div>

    <div class="telemetry-row">
      <span class="telemetry-label">Target folder:</span>
      <span class="telemetry-value telemetry-code">{$oneDriveFolder?.folderPath ?? "/"}</span>
    </div>
  </div>

  {#if $oneDriveSignInExpired}
    <div class="settings-hint signin-expired" role="alert" style="margin: 0 12px 8px;">
      Your notes are safe on this device. Sign in again to keep syncing; nothing is signed out and your unsynced edits are kept.
    </div>
  {/if}

  <div class="telemetry-actions">
    {#if $oneDriveSignInExpired}
      <button type="button" class="telemetry-btn telemetry-sync-btn" on:click={() => controller.signInAgain()}>
        Sign in again
      </button>
    {/if}
    <button
      type="button"
      class="telemetry-btn telemetry-sync-btn"
      disabled={isSyncing || $oneDriveSignInExpired}
      on:click={handleSyncNow}
    >
      {#if isSyncing}
        <span class="modal-spinner">⟳</span> Syncing…
      {:else}
        ⟳ Sync Now
      {/if}
    </button>
    <button
      type="button"
      class="telemetry-btn"
      on:click={handleOpenSettings}
    >
      Open Settings
    </button>
  </div>
</div>
