<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import {
    agendaFileExists,
    autoCheckUpdates,
    backendKind,
    calendarSyncEnabled,
    colorMode,
    isMobile,
    notesDir,
    oneDriveAccount,
    oneDriveConnecting,
    oneDriveFolder,
    oneDriveSyncStatus,
    readableLineLength,
    recentNotesDirs,
    settingsInitialTab,
    themeMode,
    updateAvailableVersion,
    updateDownloadProgress,
    updateErrorMessage,
    updateStatus,
    wordWrap,
  } from "../../controller";

  import * as api from "../../tauriApi";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import type { ColorMode, ThemeMode } from "../../types";
  import { ExportBundleError, type ExportBundle } from "../../exportImport";
  import OneDriveFolderPickerModal from "./OneDriveFolderPickerModal.svelte";

  // Three tabs group what used to be one long scrolling list: Appearance/
  // Editor are the "how it looks and feels while typing" settings; Calendar/
  // Notes Location/Data are the "where things come from and go" settings;
  // Updates stands alone since it's neither. On mobile, shorter labels ensure
  // every tab fits without truncation.
  $: settingsTabs = [
    { value: "appearance", label: $isMobile ? "Appearance" : "Appearance & Editor" },
    { value: "calendar", label: $isMobile ? "Notes & Sync" : "Calendar, Notes & Data" },
    ...($backendKind === "desktop" ? [{ value: "updates", label: "Updates" }] : []),
  ];
  // #71: the status bar's folder icon/name opens Settings landed
  // directly on this tab (`openSettingsOnNotesFolder`, `menu.ts`) —
  // consumed once here so a later plain Settings open still starts on
  // the default first tab, same as any other freshly-opened modal.
  const openedOnNotesFolder = get(settingsInitialTab) !== null;
  let activeSettingsTab: string = get(settingsInitialTab) ?? "appearance";
  settingsInitialTab.set(null);

  // Filtered at open time (not reactively) — a directory switch closes
  // this modal anyway, so there's no case where the list needs to update
  // while it's open. A recent folder that no longer exists on disk
  // (deleted or moved) is silently omitted rather than shown as a dead
  // link — checked here rather than stored as a flag, so a folder that
  // reappears later (e.g. a drive remounted) isn't permanently lost from
  // the list.
  let visibleRecentDirs: string[] = [];
  let browseButtonEl: HTMLButtonElement;
  onMount(async () => {
    if ($backendKind === "android") {
      const advanced = await api.oneDriveGetAdvancedConfig();
      clientIdOverride = advanced.clientIdOverride ?? "";
      tenantIdOverride = advanced.tenantIdOverride ?? "";
      return;
    }
    if ($backendKind === "web") return; // no local directory browsing

    const candidates = $recentNotesDirs.filter((p) => p !== $notesDir);
    const exists = await Promise.all(candidates.map((p) => api.pathExists(p)));
    visibleRecentDirs = candidates.filter((_, i) => exists[i]);
    // #71: "focus on changing the folder" — land keyboard focus on the
    // control itself, not just the right tab.
    if (openedOnNotesFolder) {
      await tick();
      browseButtonEl?.focus();
    }
  });

  // #64: the Updates tab's own status block mirrors About's — shares the
  // same `updateStatus`/etc. stores (a click here updates the exact same
  // state About reads), so both places always agree.
  $: progressLabel = (() => {
    const p = $updateDownloadProgress;
    if (!p || !p.totalBytes) return "";
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    return ` ${mb(p.doneBytes)} / ${mb(p.totalBytes)} MB`;
  })();

  // --- Data: export / import (web-app design doc, Phase 1) --------------
  //
  // Shown on both the desktop app and the web app (not the demo — nothing
  // meaningful to export there, and the design doc keeps the demo's fake
  // data clearly separate from anything real). A plain hidden file input
  // does the picking; Tauri's webview supports the File API exactly like
  // a real browser, so no OS dialog / native fs read is needed even on
  // desktop — see `docs/design/webapp-roadmap.md`.
  let fileInput: HTMLInputElement;
  let importPreview: { bundle: ExportBundle; noteCount: number } | null = null;
  let importError: string | null = null;
  let importMode: "merge" | "replace" = "merge";
  let importing = false;
  let exporting = false;

  let loggingIn = false;
  let syncingOneDrive = false;

  let showFolderPicker = false;
  let showManualAuthInput = false;
  let manualAuthCode = "";
  let exchangingCode = false;
  let authError: string | null = null;

  // Advanced overrides for work/school Entra tenants that reject the
  // default multi-tenant client ID and/or the generic `/common` endpoint
  // — the same escape hatch the earlier M365 calendar-import effort
  // needed for the identical reason. Blank means "use the built-in
  // defaults." Set these *before* connecting; changing them afterward
  // only takes effect on the next sign-in.
  let showAdvanced = false;
  let clientIdOverride = "";
  let tenantIdOverride = "";
  let savingAdvanced = false;
  let advancedSaved = false;

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
      const res = await api.oneDriveLogin();
      if (res.success && res.account) {
        oneDriveAccount.set(res.account);
      } else if (res.pending) {
        // Android: the browser is open and the real outcome arrives
        // later via the onedrive-login-result event (boot.ts) — driven
        // by the store rather than local state since Settings may well
        // be closed again before it resolves.
        oneDriveConnecting.set(true);
      } else if (res.error) {
        authError = res.error;
        showManualAuthInput = true;
      }
    } catch (err) {
      authError = err instanceof Error ? err.message : String(err);
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
        authError = res.error ?? "Failed to authenticate code.";
      }
    } catch (e) {
      authError = e instanceof Error ? e.message : String(e);
    } finally {
      exchangingCode = false;
    }
  }

  async function handleOneDriveLogout() {
    await api.oneDriveLogout();
    oneDriveAccount.set(null);
    oneDriveFolder.set(null);
  }

  async function handleOneDriveSyncNow() {
    syncingOneDrive = true;
    try {
      await api.oneDriveSyncNow();
    } finally {
      syncingOneDrive = false;
    }
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
    fileInput.click();
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

  // §127 (finding K): `word_wrap` and `readable_line_length` used to be
  // two separate toggles, the second force-enabling (and disabling) the
  // first — a checked-and-greyed-out switch reads as confusing state. One
  // 3-way choice instead; no Rust/config change, it's still just the same
  // two booleans underneath (full = both off, wrap = word_wrap only,
  // reading = both on, since "reading column" only ever applies with wrap
  // on too).
  $: editorWidthMode = $readableLineLength ? "reading" : $wordWrap ? "wrap" : "full";
  async function setEditorWidth(mode: string) {
    if (mode === "reading") {
      await controller.setReadableLineLength(true);
    } else {
      if ($readableLineLength) await controller.setReadableLineLength(false);
      await controller.setWordWrap(mode === "wrap");
    }
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
  <div
    class="modal-card settings-modal-card"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label="Settings"
    style="width: 520px;"
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="settings" size={15} /> Settings
    </div>
    <div class="settings-tabs">
      <Segmented options={settingsTabs} value={activeSettingsTab} onChange={(v) => (activeSettingsTab = v)} />
    </div>
    <div class="settings-section">
      {#if activeSettingsTab === "appearance"}
        <div>
          <div class="settings-section-label">Appearance</div>
          <div class="settings-toggle-row">
            <span class="settings-inline-label">Theme</span>
            <Segmented
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
              value={$themeMode}
              onChange={(v) => controller.setThemeMode(v as ThemeMode)}
            />
          </div>
          <div class="settings-hint">System follows your OS's own light/dark setting.</div>
          <div class="settings-toggle-row" style="margin-top: 12px;">
            <span class="settings-inline-label">Glyphs</span>
            <Segmented
              options={[
                { value: "color", label: "Color" },
                { value: "grayscale", label: "Grayscale" },
                { value: "legacy", label: "Legacy" },
              ]}
              value={$colorMode}
              onChange={(v) => controller.setColorMode(v as ColorMode)}
            />
          </div>
          <div class="settings-hint">
            Legacy restores the pre-0.6 glyph colours — red open, amber deferred, green done.
          </div>
        </div>
        <div>
          <div class="settings-section-label">Editor</div>
          <div class="settings-toggle-row">
            <Segmented
              options={[
                { value: "full", label: "Full" },
                { value: "wrap", label: "Wrap" },
                { value: "reading", label: "Reading column" },
              ]}
              value={editorWidthMode}
              onChange={setEditorWidth}
            />
          </div>
          <div class="settings-hint">
            Full keeps every line unwrapped — the monospace grid stays intact for tables and aligned columns. Wrap
            breaks long lines to fit the window. Reading column also caps the text to a comfortable centred measure,
            for a single prose-reading mode.
          </div>
        </div>
      {:else if activeSettingsTab === "calendar"}
        {#if $backendKind !== "web"}
          <div>
            <div class="settings-section-label">Calendar</div>
            <div class="settings-toggle-row">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked={$calendarSyncEnabled}
                  on:change={(e) => controller.setCalendarSyncEnabled(e.currentTarget.checked)}
                />
                <span class="toggle-switch-track"></span>
                Show "Sync calendar for this day"
              </label>
            </div>
            <div class="settings-hint">
              Reads meetings from a <code>.agenda.json</code> file in your notes folder — kept up to date by whatever
              process you use to sync it, not by ChronoNote itself. Meetings are matched to sections by title — keep
              section titles matching your calendar if you want re-syncing to find them. Two meetings with the exact
              same title on the same day can't be told apart.
            </div>
            {#if $calendarSyncEnabled && !$agendaFileExists}
              <div class="settings-hint" style="color: var(--state-error);">
                No <code>.agenda.json</code> file found in this notes folder yet — the sync button stays grayed out
                until one exists.
              </div>
            {/if}
          </div>
          {#if $backendKind === "android"}
            <div>
              <div class="settings-section-label">OneDrive Cloud Sync</div>
              {#if $oneDriveAccount}
                <div class="settings-hint" style="margin-bottom: 8px;">
                  Connected as <strong>{$oneDriveAccount.displayName}</strong> ({$oneDriveAccount.email})
                </div>
                <div class="settings-dir-row">
                  <div class="settings-dir-path">{$oneDriveFolder?.folderPath ?? "/Documents/Notes"}</div>
                  <button class="icon-btn" on:click={() => (showFolderPicker = true)}>
                    Browse…
                  </button>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <button class="icon-btn" on:click={handleOneDriveSyncNow} disabled={syncingOneDrive}>
                    {syncingOneDrive ? "Syncing…" : "Sync now"}
                  </button>
                  <button class="icon-btn" on:click={handleOneDriveLogout}>Sign out</button>
                </div>
              {:else}
                <div class="settings-hint">
                  Connect your Microsoft account to use a OneDrive folder as your Notes folder. Notes stay synchronized across all your devices.
                </div>
                <div style="margin-top: 8px;">
                  <button class="icon-btn btn-primary" on:click={handleOneDriveLogin} disabled={loggingIn || $oneDriveConnecting}>
                    <Icon name="cloud" size={16} />
                    <span>{loggingIn || $oneDriveConnecting ? "Connecting…" : "Connect Microsoft Account"}</span>
                  </button>
                  {#if $oneDriveConnecting}
                    <div class="settings-hint" style="margin-top: 6px;">
                      Waiting for you to finish signing in in your browser…
                    </div>
                  {/if}
                </div>
                <div style="margin-top: 10px;">
                  {#if showManualAuthInput}
                    <form on:submit|preventDefault={handleManualAuthSubmit} style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
                      <div class="settings-hint">
                        Paste the redirect URL or authorization code from your browser:
                      </div>
                      <input
                        type="text"
                        class="find-input"
                        style="width: 100%; height: 32px;"
                        placeholder="chrononote://auth?code=... or code"
                        bind:value={manualAuthCode}
                      />
                      {#if authError}
                        <div class="settings-hint" style="color: var(--state-error);">{authError}</div>
                      {/if}
                      <div style="display: flex; gap: 8px;">
                        <button type="submit" class="icon-btn btn-primary" disabled={exchangingCode || !manualAuthCode.trim()}>
                          {exchangingCode ? "Exchanging…" : "Submit code"}
                        </button>
                        <button type="button" class="icon-btn" on:click={() => (showManualAuthInput = false)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  {:else}
                    <button
                      type="button"
                      class="status-link"
                      style="font-size: 11px; color: var(--muted); cursor: pointer;"
                      on:click={() => (showManualAuthInput = true)}
                    >
                      Enter authorization code manually
                    </button>
                  {/if}
                </div>
              {/if}
              <div style="margin-top: 12px;">
                <button
                  type="button"
                  class="status-link"
                  style="font-size: 11px; color: var(--muted); cursor: pointer;"
                  on:click={() => (showAdvanced = !showAdvanced)}
                >
                  {showAdvanced ? "Hide advanced" : "Advanced (work/school accounts)"}
                </button>
                {#if showAdvanced}
                  <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
                    <div class="settings-hint">
                      A locked-down corporate Entra tenant may reject the generic sign-in endpoint and require its
                      own app registration. Leave both blank for a personal Microsoft account.
                    </div>
                    <label class="settings-hint" for="onedrive-client-id-override">Client ID override</label>
                    <input
                      id="onedrive-client-id-override"
                      type="text"
                      class="find-input"
                      style="width: 100%; height: 32px;"
                      placeholder="(default) personal accounts"
                      bind:value={clientIdOverride}
                    />
                    <label class="settings-hint" for="onedrive-tenant-id-override">
                      Tenant ID or domain override
                    </label>
                    <input
                      id="onedrive-tenant-id-override"
                      type="text"
                      class="find-input"
                      style="width: 100%; height: 32px;"
                      placeholder="common"
                      bind:value={tenantIdOverride}
                    />
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button class="icon-btn" on:click={handleSaveAdvanced} disabled={savingAdvanced}>
                        {savingAdvanced ? "Saving…" : "Save"}
                      </button>
                      {#if advancedSaved}
                        <span class="settings-hint">
                          Saved — sign out and reconnect for this to take effect.
                        </span>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div>
              <div class="settings-section-label">Notes Location</div>
              <div class="settings-dir-row">
                <div class="settings-dir-path">{$notesDir}</div>
                <button class="icon-btn" bind:this={browseButtonEl} on:click={controller.pickAndSwitchNotesDirectory}>
                  Browse…
                </button>
              </div>
              <div class="settings-hint">
                Changing this switches your whole workspace — open tabs close and everything reloads from the new
                folder. Existing files are not moved.
              </div>
              {#if visibleRecentDirs.length > 0}
                <div class="settings-recent-dirs">
                  {#each visibleRecentDirs as dir (dir)}
                    <button class="settings-recent-dir" on:click={() => controller.switchToRecentDirectory(dir)}>
                      {dir}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/if}

        {#if $backendKind !== "demo"}
          <div>
            <div class="settings-section-label">Data</div>
            <input
              bind:this={fileInput}
              type="file"
              accept="application/json,.json"
              style="display: none;"
              on:change={onFileChosen}
            />
            <div class="settings-toggle-row" style="gap: 8px;">
              <button class="icon-btn" disabled={exporting} on:click={handleExport}>
                {exporting ? "Exporting…" : "Export all notes…"}
              </button>
              <button class="icon-btn" disabled={importing} on:click={pickImportFile}>
                Import notes from a file…
              </button>
            </div>
            {#if $backendKind === "web"}
              <div class="settings-hint">
                Your notes live in this browser only — clearing site data, a private window, or Safari's storage
                limits can lose them. Export a backup now and then, or install the desktop app for notes that live on
                your disk.
              </div>
            {:else}
              <div class="settings-hint">
                Import reads a ChronoNote export file (from the web app, or another install) and writes its notes in
                here.
              </div>
            {/if}
            {#if importError}
              <div class="settings-hint" style="color: var(--state-error);">{importError}</div>
            {/if}
            {#if importPreview}
              <div
                class="settings-toggle-row"
                style="margin-top: 8px; flex-direction: column; align-items: flex-start; gap: 8px;"
              >
                <span class="settings-inline-label">
                  {importPreview.noteCount} note{importPreview.noteCount === 1 ? "" : "s"} in this file.
                </span>
                <Segmented
                  options={[
                    { value: "merge", label: "Merge (skip duplicates)" },
                    { value: "replace", label: "Replace everything" },
                  ]}
                  value={importMode}
                  onChange={(v) => (importMode = v as "merge" | "replace")}
                />
                {#if importMode === "replace"}
                  <div class="settings-hint" style="color: var(--state-error); margin-top: 0;">
                    This deletes every note currently here first — not reversible.
                  </div>
                {/if}
                <div style="display: flex; gap: 8px;">
                  <button class="icon-btn btn-primary" disabled={importing} on:click={confirmImport}>
                    {importing ? "Importing…" : "Import"}
                  </button>
                  <button class="icon-btn" disabled={importing} on:click={cancelImport}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {:else if activeSettingsTab === "updates" && $backendKind !== "web"}
        <div>
          <div class="settings-section-label">Updates</div>
          <div class="settings-toggle-row">
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={$autoCheckUpdates}
                on:change={(e) => controller.setAutoCheckUpdates(e.currentTarget.checked)}
              />
              <span class="toggle-switch-track"></span>
              Check for updates when ChronoNote starts
            </label>
          </div>
          <div class="settings-hint">
            A quiet check against github.com — never downloads or installs anything without your say.
          </div>
          {#if $updateStatus === "checking"}
            <div class="settings-hint" style="margin-top: 8px;">
              <span class="modal-spinner" aria-label="Checking">⟳</span> Checking for updates…
            </div>
          {:else if $updateStatus === "available"}
            <div class="settings-hint" style="margin-top: 8px;">
              <strong style="color: var(--text);">v{$updateAvailableVersion}</strong> is available.
            </div>
            <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
              <button class="icon-btn" on:click={controller.openReleasesPage}> What's changed </button>
              <button class="icon-btn btn-primary" on:click={() => controller.downloadAndInstallUpdate()}>
                <Icon name="update" size={14} /> Download &amp; install
              </button>
            </div>
          {:else if $updateStatus === "downloading"}
            <div class="settings-hint" style="margin-top: 8px;">Downloading update…{progressLabel}</div>
          {:else if $updateStatus === "ready"}
            <div class="settings-hint" style="margin-top: 8px;">Installed — restart to finish.</div>
            <button class="icon-btn btn-primary" style="margin-top: 8px;" on:click={() => controller.restartToFinishUpdate()}>
              Restart now
            </button>
          {:else if $updateStatus === "error"}
            <div class="settings-hint" style="margin-top: 8px; color: var(--state-error);">
              Couldn't check for updates. {$updateErrorMessage ?? ""}
            </div>
            <button class="icon-btn" style="margin-top: 8px;" on:click={() => controller.checkForUpdates()}>
              Try again
            </button>
          {:else}
            <div class="settings-hint" style="margin-top: 8px;">
              {$updateStatus === "upToDate" ? "You're up to date." : "Not checked yet."}
            </div>
            <button class="icon-btn" style="margin-top: 8px;" on:click={() => controller.checkForUpdates()}>
              Check now
            </button>
          {/if}
        </div>
      {/if}
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>Close</button>
    </div>
  </div>
</div>

{#if showFolderPicker}
  <OneDriveFolderPickerModal onClose={() => (showFolderPicker = false)} />
{/if}
