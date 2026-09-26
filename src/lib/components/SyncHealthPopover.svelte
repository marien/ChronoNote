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
  import { t, locale } from "../i18n";
  import type { TranslationKey, TranslationParams } from "../i18n/schema";

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

  /** `resolvedLocale`/`translate` are passed in explicitly from the
   * template call site (`$locale`/`$t`) rather than read as `$locale`/`$t`
   * inside this function's own body — the same reactivity fix §225
   * applied to `AboutModal`'s `agoLabel`: a plain function's internal
   * `$store` reference isn't tracked as a dependency of whatever
   * template expression calls it, only stores referenced *directly* in
   * that expression are. i18n roadmap: relative times now go through
   * `Intl.RelativeTimeFormat` instead of hand-translated fragments (only
   * "Never" and the "just now (HH:MM)" case still need real dictionary
   * entries) — same reasoning as `date.ts`'s `monthName`/`weekdayAbbrev`. */
  function formatRelativeTime(
    ms: number | null | undefined,
    resolvedLocale: string,
    translate: <K extends TranslationKey>(key: K, params: TranslationParams[K]) => string,
  ): string {
    if (!ms) return translate("syncHealth.relativeTime.never", undefined);
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    const timeStr = new Date(ms).toLocaleTimeString(resolvedLocale, { hour: "2-digit", minute: "2-digit" });
    if (diffSec < 60) return translate("syncHealth.relativeTime.justNow", { time: timeStr });
    const rtf = new Intl.RelativeTimeFormat(resolvedLocale, { numeric: "always" });
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${rtf.format(-diffMin, "minute")} (${timeStr})`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${rtf.format(-diffHours, "hour")} (${timeStr})`;
    const diffDays = Math.floor(diffHours / 24);
    return rtf.format(-diffDays, "day");
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
    ? $t("syncHealth.status.signInExpired")
    : isSyncing
    ? $t("syncHealth.status.syncingChanges")
    : isOffline
      ? $t("syncHealth.status.offlineCached")
      : isError
        ? $t("statusBar.oneDrive.syncError")
        : $t("syncHealth.status.inSync");

  $: statusClass = isSyncing ? "syncing" : isOffline ? "offline" : isError ? "error" : "in-sync";
</script>

<svelte:window on:mousedown={onOutsideMousedown} on:keydown={onWindowKeydown} on:resize={positionAboveTrigger} />

<div
  id="telemetry-popover"
  class="telemetry-popover"
  bind:this={popEl}
  role="dialog"
  aria-label={$t("syncHealth.ariaLabel")}
  use:focusTrap
  style={anchorStyle}
>
  <div class="telemetry-header">
    <div class="telemetry-header-title">
      <Icon name="cloud" size={14} />
      <span>{$t("syncHealth.title")}</span>
    </div>
    <button
      type="button"
      class="modal-close-btn"
      aria-label={$t("common.close")}
      on:click={() => syncHealthPopoverOpen.set(false)}
    >
      ✕
    </button>
  </div>

  <div class="telemetry-details">
    <div class="telemetry-row">
      <span class="telemetry-label">{$t("syncHealth.label.status")}</span>
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
      <span class="telemetry-label">{$t("syncHealth.label.lastSynced")}</span>
      <span class="telemetry-value">{formatRelativeTime($syncHealth?.lastSyncSuccessMs, $locale, $t)}</span>
    </div>

    <div class="telemetry-row">
      <span class="telemetry-label">{$t("syncHealth.label.localMirror")}</span>
      <span class="telemetry-value">
        {$t("syncHealth.notesCount", { count: $syncHealth?.localNoteCount ?? 0 })} ({$backendKind === "web" ? "IndexedDB" : $t("syncHealth.storageKind.local")})
      </span>
    </div>

    {#if ($syncHealth?.pendingUploadCount ?? 0) > 0}
      <div class="telemetry-row">
        <span class="telemetry-label">{$t("syncHealth.label.pendingUploads")}</span>
        <span class="telemetry-value">{$t("syncHealth.notesCount", { count: $syncHealth?.pendingUploadCount ?? 0 })}</span>
      </div>
    {/if}

    <div class="telemetry-row">
      <span class="telemetry-label">{$t("syncHealth.label.account")}</span>
      <span class="telemetry-value telemetry-code">{$oneDriveAccount?.email ?? $t("syncHealth.accountFallback")}</span>
    </div>

    <div class="telemetry-row">
      <span class="telemetry-label">{$t("syncHealth.label.targetFolder")}</span>
      <span class="telemetry-value telemetry-code">{$oneDriveFolder?.folderPath ?? "/"}</span>
    </div>
  </div>

  {#if $oneDriveSignInExpired}
    <div class="settings-hint signin-expired" role="alert" style="margin: 0 12px 8px;">
      {$t("syncHealth.signInExpiredHint")}
    </div>
  {/if}

  <div class="telemetry-actions">
    {#if $oneDriveSignInExpired}
      <button type="button" class="telemetry-btn telemetry-sync-btn" on:click={() => controller.signInAgain()}>
        {$t("statusBar.oneDrive.signInAgain")}
      </button>
    {/if}
    <button
      type="button"
      class="telemetry-btn telemetry-sync-btn"
      disabled={isSyncing || $oneDriveSignInExpired}
      on:click={handleSyncNow}
    >
      {#if isSyncing}
        <span class="modal-spinner">⟳</span> {$t("statusBar.oneDrive.syncingText")}
      {:else}
        ⟳ {$t("syncHealth.syncNowLabel")}
      {/if}
    </button>
    <button
      type="button"
      class="telemetry-btn"
      on:click={handleOpenSettings}
    >
      {$t("syncHealth.openSettingsButton")}
    </button>
  </div>
</div>
