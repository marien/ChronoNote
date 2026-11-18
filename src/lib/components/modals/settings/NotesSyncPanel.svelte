<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import * as controller from "../../../controller";
  import {
    agendaFileExists,
    backendKind,
    calendarAutoAdd,
    calendarSyncEnabled,
    minutesName,
    notesDir,
    oneDriveAccount,
    oneDriveSignInExpired,
    oneDriveConnecting,
    oneDriveFolder,
    oneDriveSyncing,
    recentNotesDirs,
    startupTabMode,
    trashItems,
  } from "../../../controller";
  import * as api from "../../../tauriApi";
  import Icon from "../../../icons/Icon.svelte";
  import Segmented from "../../Segmented.svelte";
  import SettingRow from "../../SettingRow.svelte";
  import SettingToggle from "../../SettingToggle.svelte";
  import { phoneCompanionEnabled, setPhoneCompanion } from "../../../phoneCompanion";
  import { locale, t } from "../../../i18n";
  import { describeApiError } from "../../../apiError";
  import type { StartupTabMode } from "../../../types";
  import { ExportBundleError, type ExportBundle } from "../../../exportImport";

  interface Props {
    openedOnNotesFolder: boolean;
    onOpenFolderPicker: () => void;
  }
  let { openedOnNotesFolder, onOpenFolderPicker }: Props = $props();

  let minutesNameTimer: ReturnType<typeof setTimeout> | null = null;
  let minutesNameFocused = false;
  let minutesNameDraft = $state($minutesName);

  $effect(() => {
    const storeValue = $minutesName;
    if (!minutesNameFocused && minutesNameTimer === null) {
      minutesNameDraft = storeValue;
    }
  });

  function clearMinutesNameTimer() {
    if (minutesNameTimer !== null) {
      clearTimeout(minutesNameTimer);
      minutesNameTimer = null;
    }
  }

  function onMinutesNameInput(e: Event) {
    minutesNameDraft = (e.currentTarget as HTMLInputElement).value;
    clearMinutesNameTimer();
    minutesNameTimer = setTimeout(() => {
      minutesNameTimer = null;
      void controller.setMinutesName(minutesNameDraft);
    }, 400);
  }

  function flushMinutesName() {
    const hadPending = minutesNameTimer !== null;
    clearMinutesNameTimer();
    const clamped = Array.from(minutesNameDraft.trim()).slice(0, 60).join("");
    minutesNameDraft = clamped;
    if (hadPending || clamped !== $minutesName) {
      void controller.setMinutesName(clamped);
    }
  }

  onDestroy(() => {
    if (minutesNameTimer !== null) {
      flushMinutesName();
    }
  });

  // Filtered at open time (not reactively) — a directory switch closes
  // this modal anyway, so there's no case where the list needs to update
  // while it's open. A recent folder that no longer exists on disk
  // (deleted or moved) is silently omitted rather than shown as a dead
  // link — checked here rather than stored as a flag, so a folder that
  // reappears later (e.g. a drive remounted) isn't permanently lost from
  // the list.
  let visibleRecentDirs: string[] = $state([]);
  let browseButtonEl = $state<HTMLButtonElement>();
  let isSafariBrowser = $state(false);
  if (typeof window !== "undefined") {
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone ||
      window.matchMedia("(display-mode: standalone)").matches;
    isSafariBrowser = (isIOS || isSafari) && !isStandalone;
  }

  onMount(async () => {
    if ($backendKind === "web") {
      const advanced = await api.oneDriveGetAdvancedConfig();
      clientIdOverride = advanced.clientIdOverride ?? "";
      tenantIdOverride = advanced.tenantIdOverride ?? "";
      return; // no local directory browsing
    }

    const candidates = $recentNotesDirs.filter((p) => p !== $notesDir);
    const exists = await Promise.all(candidates.map((p) => api.pathExists(p)));
    visibleRecentDirs = candidates.filter((_, i) => exists[i]);
    // #71: "focus on changing the folder" — land keyboard focus on the
    // control itself, not just the right tab.
    if (openedOnNotesFolder) {
      await tick();
      browseButtonEl?.focus();
    }

    const pending = get(controller.pendingImportPreview);
    if (pending) {
      importPreview = pending;
      importMode = "merge";
      controller.pendingImportPreview.set(null);
    }
  });

  // --- Data: export / import (web-app design doc, Phase 1) --------------
  //
  // Shown on both the desktop app and the web app (not the demo — nothing
  // meaningful to export there, and the design doc keeps the demo's fake
  // data clearly separate from anything real). A plain hidden file input
  // does the picking; Tauri's webview supports the File API exactly like
  // a real browser, so no OS dialog / native fs read is needed even on
  // desktop — see `docs/design/webapp-roadmap.md`.
  let fileInput = $state<HTMLInputElement>();
  let importPreview: { bundle: ExportBundle; noteCount: number } | null = $state(null);
  let importError: string | null = $state(null);
  let importMode: "merge" | "replace" = $state("merge");
  let importing = $state(false);
  let exporting = $state(false);

  let showTrash = $state(false);

  async function toggleTrash() {
    showTrash = !showTrash;
    if (showTrash) {
      await controller.loadTrash();
    }
  }

  function formatRelative(ms: number): string {
    const s = Math.round((ms - Date.now()) / 1000);
    const m = Math.round(s / 60);
    const h = Math.round(m / 60);
    const d = Math.round(h / 24);
    const rtf = new Intl.RelativeTimeFormat($locale, { numeric: "auto" });
    if (Math.abs(s) < 45) return rtf.format(s, "second");
    if (Math.abs(m) < 60) return rtf.format(m, "minute");
    if (Math.abs(h) < 24) return rtf.format(h, "hour");
    return rtf.format(d, "day");
  }

  let loggingIn = $state(false);

  let showManualAuthInput = $state(false);
  let manualAuthCode = $state("");
  let exchangingCode = $state(false);
  let authError: string | null = $state(null);

  // Advanced overrides for work/school Entra tenants that reject the
  // default multi-tenant client ID and/or the generic `/common` endpoint
  // — the same escape hatch the earlier M365 calendar-import effort
  // needed for the identical reason. Blank means "use the built-in
  // defaults." Set these *before* connecting; changing them afterward
  // only takes effect on the next sign-in.
  let showAdvanced = $state(false);
  let clientIdOverride = $state("");
  let tenantIdOverride = $state("");
  let savingAdvanced = $state(false);
  let advancedSaved = $state(false);

  async function handleSaveAdvanced() {
    savingAdvanced = true;
    advancedSaved = false;
    try {
      await api.oneDriveSetAdvancedConfig({
        clientIdOverride: clientIdOverride.trim() || undefined,
        tenantIdOverride: tenantIdOverride.trim() || undefined,
      });
      advancedSaved = true;
    } finally {
      savingAdvanced = false;
    }
  }

  async function handleOneDriveLogin() {
    loggingIn = true;
    authError = null;
    try {
      // The web app leaves the page to sign in: get pending edits safely stored first.
      await controller.flushAllPendingSaves().catch(() => {});
      const res = await api.oneDriveLogin();
      if (res.success && res.account) {
        oneDriveAccount.set(res.account);
        oneDriveSignInExpired.set(false);
      } else if (res.pending) {
        // The web app just redirected to Microsoft — the real outcome
        // arrives after the page comes back, possibly with Settings
        // closed again by then, hence the store rather than local state.
        oneDriveConnecting.set(true);
      } else if (res.error) {
        authError = describeApiError(res.error);
        showManualAuthInput = true;
      }
    } catch (err) {
      authError = describeApiError(err);
      showManualAuthInput = true;
    } finally {
      loggingIn = false;
    }
  }

  async function handleManualAuthSubmit() {
    if (!manualAuthCode.trim()) return;
    exchangingCode = true;
    authError = null;
    try {
      const res = await api.oneDriveExchangeCode(manualAuthCode.trim());
      if (res.success && res.account) {
        oneDriveAccount.set(res.account);
        oneDriveConnecting.set(false);
        showManualAuthInput = false;
        manualAuthCode = "";
      } else {
        authError = res.error ? describeApiError(res.error) : "Failed to authenticate code.";
      }
    } catch (e) {
      authError = describeApiError(e);
    } finally {
      exchangingCode = false;
    }
  }

  async function handleOneDriveLogout() {
    await api.oneDriveLogout($backendKind === "web" && removeLocalOnSignOut);
    removeLocalOnSignOut = false;
    oneDriveAccount.set(null);
    oneDriveSignInExpired.set(false);
    oneDriveFolder.set(null);
    if ($backendKind === "web") {
      await controller.performDirectorySwitch("Browser storage");
    }
  }

  let removeLocalOnSignOut = $state(false);

  function handleOneDriveSyncNow() {
    void controller.syncOneDriveNow({ notify: true });
  }

  async function handleExport() {
    exporting = true;
    try {
      await controller.exportAllNotesToFile();
    } finally {
      exporting = false;
    }
  }

  function pickImportFile() {
    importError = null;
    importPreview = null;
    fileInput?.click();
  }

  async function onFileChosen(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      importPreview = await controller.readImportFile(file);
      importMode = "merge";
    } catch (err) {
      importError = err instanceof ExportBundleError ? err.message : "Couldn't read that file.";
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    importing = true;
    try {
      await controller.applyImport(importPreview.bundle, importMode);
      importPreview = null;
    } finally {
      importing = false;
    }
  }

  function cancelImport() {
    importPreview = null;
    importError = null;
  }
</script>

{#if $backendKind === "web"}
  <section class="s-group">
    <div class="settings-section-label">{$t("settings.oneDrive.sectionLabel")}</div>
    {#if isSafariBrowser}
      <div class="s-note warn">
        <strong>{$t("settings.oneDrive.safariTip.label")}</strong> {$t("settings.oneDrive.safariTip.hint")}
      </div>
    {/if}
    {#if $oneDriveAccount}
      <div class="s-note">
        {$t("settings.oneDrive.connectedAs.before")}<strong>{$oneDriveAccount.displayName}</strong> {$t("settings.oneDrive.connectedAs.after", { email: $oneDriveAccount.email })}
      </div>
      {#if $oneDriveSignInExpired}
        <div class="s-note warn signin-expired" role="alert">
          <strong>{$t("settings.oneDrive.signInExpired.title")}</strong> {$t("settings.oneDrive.signInExpired.body")}
          <div class="s-actions">
            <button class="settings-btn primary" onclick={handleOneDriveLogin} disabled={loggingIn || $oneDriveConnecting}>
              <Icon name="cloud" size={14} />
              <span>{loggingIn || $oneDriveConnecting ? $t("settings.oneDrive.connecting") : $t("statusBar.oneDrive.signInAgain")}</span>
            </button>
          </div>
        </div>
      {/if}
      <SettingRow label={$oneDriveFolder ? $oneDriveFolder.folderPath : $t("settings.oneDrive.noFolderSelected")}>
        {#if $oneDriveFolder}
          <button class="settings-btn" onclick={onOpenFolderPicker}>{$t("common.browse")}</button>
        {:else}
          <button class="settings-btn primary" onclick={onOpenFolderPicker}>{$t("settings.oneDrive.chooseFolder")}</button>
        {/if}
      </SettingRow>
      <div class="s-actions">
        <button
          class="settings-btn"
          onclick={handleOneDriveSyncNow}
          disabled={$oneDriveSyncing || !$oneDriveFolder}
          title={$oneDriveFolder ? "" : $t("settings.oneDrive.chooseFolderFirstTitle")}
        >
          {#if $oneDriveSyncing}
            <span class="modal-spinner" aria-hidden="true">⟳</span> {$t("statusBar.oneDrive.syncingText")}
          {:else}
            {$t("settings.oneDrive.syncNow")}
          {/if}
        </button>
        <button class="settings-btn" onclick={handleOneDriveLogout} disabled={$oneDriveSyncing}>{$t("settings.oneDrive.signOut")}</button>
      </div>
      <SettingToggle
        label={$t("settings.oneDrive.removeLocalOnSignOut")}
        checked={removeLocalOnSignOut}
        onChange={(v) => (removeLocalOnSignOut = v)}
      >
        {#snippet description()}{$t("settings.oneDrive.signOutHint")}{/snippet}
      </SettingToggle>
      {#if !$oneDriveFolder}
        <div class="s-note">{$t("settings.oneDrive.noFolderYetHint")}</div>
      {/if}
    {:else}
      <div class="s-note">
        {$t("settings.oneDrive.connectHint")}{$t("settings.oneDrive.connectHintWebSuffix")}
      </div>
      <div class="s-actions">
        <button class="settings-btn primary" onclick={handleOneDriveLogin} disabled={loggingIn || $oneDriveConnecting}>
          <Icon name="cloud" size={14} />
          <span>{loggingIn || $oneDriveConnecting ? $t("settings.oneDrive.connecting") : $t("settings.oneDrive.connectMicrosoftAccount")}</span>
        </button>
      </div>
      {#if $oneDriveConnecting}
        <div class="s-note">{$t("settings.oneDrive.waitingForBrowser")}</div>
      {/if}
      {#if showManualAuthInput}
        <form
          class="s-fields"
          onsubmit={(e) => {
            e.preventDefault();
            handleManualAuthSubmit();
          }}
        >
          <div class="s-note">{$t("settings.oneDrive.pasteCodeHint")}</div>
          <input type="text" class="find-input s-input" placeholder={$t("settings.oneDrive.codeInputPlaceholder")} bind:value={manualAuthCode} />
          {#if authError}
            <div class="s-note error">{authError}</div>
          {/if}
          <div class="s-actions">
            <button type="submit" class="settings-btn primary" disabled={exchangingCode || !manualAuthCode.trim()}>
              {exchangingCode ? $t("settings.oneDrive.exchangingCode") : $t("settings.oneDrive.submitCode")}
            </button>
            <button type="button" class="settings-btn" onclick={() => (showManualAuthInput = false)}>
              {$t("common.cancel")}
            </button>
          </div>
        </form>
      {:else}
        <button type="button" class="s-linkbtn" onclick={() => (showManualAuthInput = true)}>
          {$t("settings.oneDrive.enterCodeManually")}
        </button>
      {/if}
      <button type="button" class="s-linkbtn" onclick={() => (showAdvanced = !showAdvanced)}>
        {showAdvanced ? $t("settings.oneDrive.hideAdvanced") : $t("settings.oneDrive.showAdvanced")}
      </button>
      {#if showAdvanced}
        <div class="s-fields">
          <div class="s-note">{$t("settings.oneDrive.advancedHint")}</div>
          <label class="s-field-label" for="onedrive-client-id-override">{$t("settings.oneDrive.clientIdLabel")}</label>
          <input
            id="onedrive-client-id-override"
            type="text"
            class="find-input s-input"
            placeholder={$t("settings.oneDrive.clientIdPlaceholder")}
            bind:value={clientIdOverride}
          />
          <label class="s-field-label" for="onedrive-tenant-id-override">{$t("settings.oneDrive.tenantIdLabel")}</label>
          <input
            id="onedrive-tenant-id-override"
            type="text"
            class="find-input s-input"
            placeholder={$t("settings.oneDrive.tenantIdPlaceholder")}
            bind:value={tenantIdOverride}
          />
          <div class="s-actions">
            <button class="settings-btn" onclick={handleSaveAdvanced} disabled={savingAdvanced}>
              {savingAdvanced ? $t("settings.oneDrive.saving") : $t("settings.oneDrive.save")}
            </button>
            {#if advancedSaved}
              <span class="s-desc">{$t("settings.oneDrive.savedHint")}</span>
            {/if}
          </div>
        </div>
      {/if}
    {/if}
  </section>
{:else}
  <section class="s-group">
    <div class="settings-section-label">{$t("settings.notesLocation.sectionLabel")}</div>
    <SettingRow label={$notesDir}>
      {#snippet description()}{$t("settings.notesLocation.hint")}{/snippet}
      <button class="settings-btn" bind:this={browseButtonEl} onclick={controller.pickAndSwitchNotesDirectory}>
        {$t("common.browse")}
      </button>
    </SettingRow>
    {#if visibleRecentDirs.length > 0}
      <div class="settings-recent-dirs">
        {#each visibleRecentDirs as dir (dir)}
          <button class="settings-recent-dir" onclick={() => controller.switchToRecentDirectory(dir)}>
            {dir}
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<section class="s-group">
  <div class="settings-section-label">{$t("settings.startup.sectionLabel")}</div>
  <SettingRow label={$t("settings.startup.label")}>
    {#snippet description()}
      {$startupTabMode === "smart_last_active" ? $t("settings.startup.smartHint") : $t("settings.startup.todayHint")}
    {/snippet}
    <Segmented
      options={[
        { value: "today", label: $t("settings.startup.today") },
        { value: "smart_last_active", label: $t("settings.startup.smart") },
      ]}
      value={$startupTabMode}
      onChange={(v) => controller.setStartupTabMode(v as StartupTabMode)}
    />
  </SettingRow>
</section>

<section class="s-group">
  <SettingRow label={$t("settings.minutesName.label")}>
    {#snippet description()}
      {$t("settings.minutesName.hint")}
    {/snippet}
    <input
      type="text"
      class="s-input minutes-name-input"
      aria-label={$t("settings.minutesName.label")}
      value={minutesNameDraft}
      onfocus={() => (minutesNameFocused = true)}
      oninput={onMinutesNameInput}
      onblur={() => {
        minutesNameFocused = false;
        flushMinutesName();
      }}
    />
  </SettingRow>
</section>

{#if $backendKind !== "web" || $oneDriveAccount}
  <section class="s-group">
    <div class="settings-section-label">{$t("settings.calendar.sectionLabel")}</div>
    <SettingToggle
      label={$t("settings.calendar.showButtonToggle")}
      checked={$calendarSyncEnabled}
      onChange={(v) => controller.setCalendarSyncEnabled(v)}
    >
      {#snippet description()}
        {$t("settings.calendar.agendaHint.before")}<code>.agenda.json</code>{$t("settings.calendar.agendaHint.after")}
      {/snippet}
    </SettingToggle>
    {#if $calendarSyncEnabled}
      <SettingToggle
        label={$t("settings.calendar.autoAddToggle")}
        checked={$calendarAutoAdd}
        onChange={(v) => controller.setCalendarAutoAdd(v)}
      >
        {#snippet description()}
          {$t("settings.calendar.autoAddHint")}
        {/snippet}
      </SettingToggle>
    {/if}
    {#if $calendarSyncEnabled && !$agendaFileExists}
      <div class="s-note error">
        {$t("settings.calendar.agendaMissing.before")}<code>.agenda.json</code>{$t("settings.calendar.agendaMissing.after")}
      </div>
    {/if}
  </section>
{/if}

{#if $backendKind === "desktop"}
  <section class="s-group">
    <div class="settings-section-label">{$t("phoneCompanion.settings.title")}</div>
    <SettingToggle
      label={$t("phoneCompanion.settings.toggle.label")}
      checked={$phoneCompanionEnabled}
      onChange={(v) => void setPhoneCompanion(v)}
    >
      {#snippet description()}
        {$t("phoneCompanion.settings.toggle.hint.before")}<code>.chrononote-mobile</code>{$t("phoneCompanion.settings.toggle.hint.after")}
      {/snippet}
    </SettingToggle>
  </section>
{/if}

{#if $backendKind !== "demo"}
  <section class="s-group">
    <div class="settings-section-label">{$t("settings.data.sectionLabel")}</div>
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      class="s-hidden-input"
      onchange={onFileChosen}
    />
    <SettingRow label={$t("settings.trash.label")}>
      {#snippet description()}{$t("settings.trash.hint")}{/snippet}
      <button
        type="button"
        class="settings-btn quiet"
        onclick={toggleTrash}
      >
        {showTrash ? $t("about.licencesHide") : $t("about.licencesShow")}
      </button>
    </SettingRow>
    {#if showTrash}
      <div class="trash-container">
        {#if $trashItems.length === 0}
          <div class="trash-empty">{$t("settings.trash.empty")}</div>
        {:else}
          <div class="trash-list">
            {#each $trashItems as item (item.name)}
              <div class="trash-row">
                <div class="trash-row-info">
                  <div class="trash-row-header">
                    <span class="trash-row-date">{item.originalFilename.replace(/\.txt$/, "")}</span>
                    <span class="trash-row-when">{$t("settings.trash.deletedOn", { when: formatRelative(item.deletedMs) })}</span>
                  </div>
                  {#if item.preview}
                    <div class="trash-row-preview">{item.preview}</div>
                  {/if}
                </div>
                <button
                  type="button"
                  class="settings-btn quiet"
                  onclick={() => controller.restoreTrashItem(item.name)}
                >
                  {$t("settings.trash.restore")}
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <SettingRow stack>
      {#snippet description()}
        {$backendKind === "web" ? $t("settings.data.webHint") : $t("settings.data.desktopHint")}
      {/snippet}
      <div class="s-actions inline">
        <button class="settings-btn" disabled={exporting} onclick={handleExport}>
          {exporting ? $t("settings.data.exporting") : $t("settings.data.export")}
        </button>
        <button class="settings-btn" disabled={importing} onclick={pickImportFile}>
          {$t("settings.data.import")}
        </button>
      </div>
    </SettingRow>
    {#if importError}
      <div class="s-note error">{importError}</div>
    {/if}
    {#if importPreview}
      <div class="s-fields">
        <span class="s-label">{$t("settings.data.noteCountInFile", { count: importPreview.noteCount })}</span>
        <Segmented
          options={[
            { value: "merge", label: $t("settings.data.importMode.merge") },
            { value: "replace", label: $t("settings.data.importMode.replace") },
          ]}
          value={importMode}
          onChange={(v) => (importMode = v as "merge" | "replace")}
        />
        {#if importMode === "replace"}
          <div class="s-note error">{$t("settings.data.replaceWarning")}</div>
        {/if}
        <div class="s-actions">
          <button class="settings-btn primary" disabled={importing} onclick={confirmImport}>
            {importing ? $t("settings.data.importing") : $t("settings.data.importAction")}
          </button>
          <button class="settings-btn" disabled={importing} onclick={cancelImport}>{$t("common.cancel")}</button>
        </div>
      </div>
    {/if}
  </section>
{/if}

<style>
.settings-recent-dirs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
}

.settings-recent-dir {
  text-align: left;
  font-size: 13px;
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  padding: 4px 8px;
  cursor: pointer;
  overflow-wrap: anywhere;
  font-family: inherit;
}

.settings-recent-dir:hover {
  background: var(--surface-raised);
  border-color: var(--edge-strong);
  color: var(--text);
}

.s-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.s-actions.inline {
  margin-top: 0;
}

.s-fields {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
}

.s-fields .s-input {
  width: 100%;
  height: 32px;
}

.s-field-label {
  font-size: var(--type-caption);
  color: var(--muted);
}

.s-linkbtn {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  margin-top: 10px;
  font: inherit;
  font-size: var(--type-caption);
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.s-linkbtn:hover {
  color: var(--text);
}

.s-hidden-input {
  display: none;
}

.s-note.warn {
  color: var(--state-warn);
  border-left: 2px solid var(--state-warn);
  padding-left: 8px;
}

.s-note.error {
  color: var(--state-error);
}

.trash-container {
  background: var(--surface-sunken, var(--surface-canvas));
  border: 1px solid var(--edge-soft);
  border-radius: var(--radius-control);
  padding: 8px 12px;
  margin-top: 4px;
  margin-bottom: 8px;
}

.trash-empty {
  font-size: var(--type-caption);
  color: var(--muted);
  padding: 8px 0;
  text-align: center;
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--edge-soft);
}

.trash-row:last-child {
  border-bottom: none;
}

.trash-row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.trash-row-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.trash-row-date {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.trash-row-when {
  font-size: var(--type-caption);
  color: var(--muted);
}

.trash-row-preview {
  font-size: var(--type-caption);
  color: var(--text-secondary, var(--muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.minutes-name-input {
  width: 220px;
  max-width: 100%;
  height: 32px;
  box-sizing: border-box;
}
</style>
