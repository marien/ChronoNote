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
    fontSize,
    isMobile,
    languageMode,
    lineHeight,
    notesDir,
    oneDriveAccount,
    oneDriveSignInExpired,
    oneDriveConnecting,
    oneDriveFolder,
    oneDriveFolderPickerOpen,
    oneDriveSyncing,
    oneDriveSyncStatus,
    pureBlack,
    readableLineLength,
    recentNotesDirs,
    settingsInitialTab,
    themeMode,
    updateAvailableVersion,
    updateDownloadProgress,
    updateErrorDuring,
    updateErrorMessage,
    updateInstalling,
    updateStatus,
    wordWrap,
  } from "../../controller";

  import * as api from "../../tauriApi";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import Icon from "../../icons/Icon.svelte";
  import Segmented from "../Segmented.svelte";
  import { t } from "../../i18n";
  import { describeApiError } from "../../apiError";
  import type { ColorMode, LanguageMode, ThemeMode } from "../../types";
  import { ExportBundleError, type ExportBundle } from "../../exportImport";
  import OneDriveFolderPickerModal from "./OneDriveFolderPickerModal.svelte";

  // Three tabs group what used to be one long scrolling list: Appearance/
  // Editor are the "how it looks and feels while typing" settings; Calendar/
  // Notes Location/Data are the "where things come from and go" settings;
  // Updates stands alone since it's neither. The same short labels on every
  // platform (they were shortened on mobile first so every tab fits).
  $: settingsTabs = [
    { value: "appearance", label: $t("settings.tabs.appearance") },
    { value: "calendar", label: $t("settings.tabs.notesAndSync") },
    ...($backendKind === "desktop" ? [{ value: "updates", label: $t("settings.tabs.updates") }] : []),
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
  let isSafariBrowser = false;
  if (typeof window !== "undefined") {
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isStandalone =
      (window.navigator as unknown as { standalone?: boolean }).standalone ||
      window.matchMedia("(display-mode: standalone)").matches;
    isSafariBrowser = (isIOS || isSafari) && !isStandalone;
  }

  let prefersDark = false;
  if (typeof window !== "undefined") {
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  $: isDarkResolved = $themeMode === "dark" || ($themeMode === "system" && prefersDark);

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

  let removeLocalOnSignOut = false;

  function handleOneDriveSyncNow() {
    void controller.syncOneDriveNow({ notify: true });
  }

  // Signing in doesn't choose a folder, and "Sync now" can't do anything
  // without one — so the moment the account is connected with no folder yet,
  // open the folder picker instead of leaving the user to find it. Once per
  // Settings visit, so closing the picker without choosing isn't nagged.
  let autoOpenedFolderPicker = false;
  $: if ($oneDriveAccount && !$oneDriveFolder && !$oneDriveFolderPickerOpen && !autoOpenedFolderPicker && $backendKind === "web") {
    autoOpenedFolderPicker = true;
    showFolderPicker = true;
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
    class="modal-card settings-modal-card modal-md"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label={$t("settings.modal.title")}
  >
    <div class="modal-input-wrap modal-title">
      <Icon name="settings" size={15} />
      <span>{$t("settings.modal.title")}</span>
      <button
        type="button"
        class="icon-btn modal-close-btn"
        aria-label={$t("common.closeDialog")}
        on:click={controller.closeAllModals}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
    <div class="settings-tabs">
      <Segmented options={settingsTabs} value={activeSettingsTab} onChange={(v) => (activeSettingsTab = v)} />
    </div>
    <div class="settings-section">
      {#if activeSettingsTab === "appearance"}
        <div>
          <div class="settings-section-label">{$t("settings.appearance.sectionLabel")}</div>
          <div class="settings-toggle-row">
            <span class="settings-inline-label">{$t("settings.appearance.theme.label")}</span>
            <Segmented
              options={[
                { value: "light", label: $t("settings.appearance.theme.light") },
                { value: "dark", label: $t("settings.appearance.theme.dark") },
                { value: "system", label: $t("common.system") },
              ]}
              value={$themeMode}
              onChange={(v) => controller.setThemeMode(v as ThemeMode)}
            />
          </div>
          <div class="settings-hint">{$t("settings.appearance.theme.hint")}</div>
          {#if isDarkResolved}
            <div class="settings-toggle-row" style="margin-top: 12px;">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked={$pureBlack}
                  on:change={(e) => controller.setPureBlack(e.currentTarget.checked)}
                />
                <span class="toggle-switch-track"></span>
                {$t("settings.appearance.pureBlack.label")}
              </label>
            </div>
            <div class="settings-hint">
              {$t("settings.appearance.pureBlack.hint")}
            </div>
          {/if}
          <div class="settings-toggle-row" style="margin-top: 12px;">
            <span class="settings-inline-label">{$t("settings.appearance.language.label")}</span>
            <Segmented
              options={[
                { value: "system", label: $t("common.system") },
                { value: "en", label: "English" },
                { value: "nl", label: "Nederlands" },
                { value: "de", label: "Deutsch" },
              ]}
              value={$languageMode}
              onChange={(v) => controller.setLanguageMode(v as LanguageMode)}
            />
          </div>
          <div class="settings-hint">{$t("settings.appearance.language.hint")}</div>
          <div class="settings-toggle-row" style="margin-top: 12px;">
            <span class="settings-inline-label">{$t("settings.appearance.glyphs.label")}</span>
            <Segmented
              options={[
                { value: "color", label: $t("settings.appearance.glyphs.color") },
                { value: "grayscale", label: $t("settings.appearance.glyphs.grayscale") },
                { value: "legacy", label: $t("settings.appearance.glyphs.legacy") },
              ]}
              value={$colorMode}
              onChange={(v) => controller.setColorMode(v as ColorMode)}
            />
          </div>
          <div class="settings-hint">
            {$t("settings.appearance.glyphs.legacyHint")}
          </div>
        </div>
        <div>
          <div class="settings-section-label">{$t("settings.editor.sectionLabel")}</div>
          <div class="settings-toggle-row">
            <Segmented
              options={[
                { value: "full", label: $t("settings.editor.width.full") },
                { value: "wrap", label: $t("settings.editor.width.wrap") },
                { value: "reading", label: $t("settings.editor.width.readingColumn") },
              ]}
              value={editorWidthMode}
              onChange={setEditorWidth}
            />
          </div>
          <div class="settings-hint">
            {$t("settings.editor.width.hint")}
          </div>
          <div class="settings-slider-row" style="margin-top: 14px;">
            <div class="settings-slider-header">
              <span class="settings-inline-label">{$t("settings.editor.fontSize.label")}</span>
              <span class="settings-slider-val">{$fontSize}px</span>
            </div>
            <input
              type="range"
              class="settings-range-slider"
              min="12"
              max="18"
              step="0.5"
              value={$fontSize}
              aria-label={$t("settings.editor.fontSize.ariaLabel")}
              on:input={(e) => controller.setFontSize(parseFloat(e.currentTarget.value))}
            />
          </div>
          <div class="settings-slider-row" style="margin-top: 12px;">
            <div class="settings-slider-header">
              <span class="settings-inline-label">{$t("settings.editor.lineSpacing.label")}</span>
              <span class="settings-slider-val">{$lineHeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              class="settings-range-slider"
              min="1.3"
              max="1.8"
              step="0.05"
              value={$lineHeight}
              aria-label={$t("settings.editor.lineSpacing.ariaLabel")}
              on:input={(e) => controller.setLineHeight(parseFloat(e.currentTarget.value))}
            />
          </div>
        </div>
      {:else if activeSettingsTab === "calendar"}
        {#if $backendKind !== "web" || $oneDriveAccount}
          <div>
            <div class="settings-section-label">{$t("settings.calendar.sectionLabel")}</div>
            <div class="settings-toggle-row">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked={$calendarSyncEnabled}
                  on:change={(e) => controller.setCalendarSyncEnabled(e.currentTarget.checked)}
                />
                <span class="toggle-switch-track"></span>
                {$t("settings.calendar.showButtonToggle")}
              </label>
            </div>
            <div class="settings-hint">
              {$t("settings.calendar.agendaHint.before")}<code>.agenda.json</code>{$t("settings.calendar.agendaHint.after")}
            </div>
            {#if $calendarSyncEnabled && !$agendaFileExists}
              <div class="settings-hint" style="color: var(--state-error);">
                {$t("settings.calendar.agendaMissing.before")}<code>.agenda.json</code>{$t("settings.calendar.agendaMissing.after")}
              </div>
            {/if}
          </div>
        {/if}
        {#if $backendKind === "web"}
            <div>
              <div class="settings-section-label">{$t("settings.oneDrive.sectionLabel")}</div>
              {#if isSafariBrowser}
                <div class="settings-hint" style="color: var(--state-warn); margin-bottom: 8px; border-left: 2px solid var(--state-warn); padding-left: 8px;">
                  <strong>{$t("settings.oneDrive.safariTip.label")}</strong> {$t("settings.oneDrive.safariTip.hint")}
                </div>
              {/if}
              {#if $oneDriveAccount}
                <div class="settings-hint" style="margin-bottom: 8px;">
                  {$t("settings.oneDrive.connectedAs.before")}<strong>{$oneDriveAccount.displayName}</strong> {$t("settings.oneDrive.connectedAs.after", { email: $oneDriveAccount.email })}
                </div>
                {#if $oneDriveSignInExpired}
                  <div class="settings-hint signin-expired" role="alert">
                    <strong>{$t("settings.oneDrive.signInExpired.title")}</strong> {$t("settings.oneDrive.signInExpired.body")}
                    <div style="margin-top: 8px;">
                      <button class="icon-btn btn-primary" on:click={handleOneDriveLogin} disabled={loggingIn || $oneDriveConnecting}>
                        <Icon name="cloud" size={16} />
                        <span>{loggingIn || $oneDriveConnecting ? $t("settings.oneDrive.connecting") : $t("statusBar.oneDrive.signInAgain")}</span>
                      </button>
                    </div>
                  </div>
                {/if}
                <div class="settings-dir-row">
                  {#if $oneDriveFolder}
                    <div class="settings-dir-path">{$oneDriveFolder.folderPath}</div>
                    <button class="icon-btn" on:click={() => (showFolderPicker = true)}>{$t("common.browse")}</button>
                  {:else}
                    <div class="settings-dir-path" style="color: var(--state-warn);">{$t("settings.oneDrive.noFolderSelected")}</div>
                    <button class="icon-btn btn-primary" on:click={() => (showFolderPicker = true)}>{$t("settings.oneDrive.chooseFolder")}</button>
                  {/if}
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <button
                    class="icon-btn"
                    on:click={handleOneDriveSyncNow}
                    disabled={$oneDriveSyncing || !$oneDriveFolder}
                    title={$oneDriveFolder ? "" : $t("settings.oneDrive.chooseFolderFirstTitle")}
                  >
                    {#if $oneDriveSyncing}
                      <span class="modal-spinner" aria-hidden="true">⟳</span> {$t("statusBar.oneDrive.syncingText")}
                    {:else}
                      {$t("settings.oneDrive.syncNow")}
                    {/if}
                  </button>
                  <button class="icon-btn" on:click={handleOneDriveLogout} disabled={$oneDriveSyncing}>{$t("settings.oneDrive.signOut")}</button>
                </div>
                {#if $backendKind === "web"}
                  <div class="settings-hint" style="margin-top: 6px;">
                    {$t("settings.oneDrive.signOutHint")}
                  </div>
                  <label class="settings-hint" style="display: flex; gap: 6px; align-items: flex-start; margin-top: 6px;">
                    <input type="checkbox" bind:checked={removeLocalOnSignOut} />
                    <span>{$t("settings.oneDrive.removeLocalOnSignOut")}</span>
                  </label>
                {/if}
                {#if !$oneDriveFolder}
                  <div class="settings-hint" style="margin-top: 6px;">
                    {$t("settings.oneDrive.noFolderYetHint")}
                  </div>
                {/if}
              {:else}
                <div class="settings-hint">
                  {$t("settings.oneDrive.connectHint")}{#if $backendKind === "web"}{$t("settings.oneDrive.connectHintWebSuffix")}{/if}
                </div>
                <div style="margin-top: 8px;">
                  <button class="icon-btn btn-primary" on:click={handleOneDriveLogin} disabled={loggingIn || $oneDriveConnecting}>
                    <Icon name="cloud" size={16} />
                    <span>{loggingIn || $oneDriveConnecting ? $t("settings.oneDrive.connecting") : $t("settings.oneDrive.connectMicrosoftAccount")}</span>
                  </button>
                  {#if $oneDriveConnecting}
                    <div class="settings-hint" style="margin-top: 6px;">
                      {$t("settings.oneDrive.waitingForBrowser")}
                    </div>
                  {/if}
                </div>
                <div style="margin-top: 10px;">
                  {#if showManualAuthInput}
                    <form on:submit|preventDefault={handleManualAuthSubmit} style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
                      <div class="settings-hint">
                        {$t("settings.oneDrive.pasteCodeHint")}
                      </div>
                      <input
                        type="text"
                        class="find-input"
                        style="width: 100%; height: 32px;"
                        placeholder={$t("settings.oneDrive.codeInputPlaceholder")}
                        bind:value={manualAuthCode}
                      />
                      {#if authError}
                        <div class="settings-hint" style="color: var(--state-error);">{authError}</div>
                      {/if}
                      <div style="display: flex; gap: 8px;">
                        <button type="submit" class="icon-btn btn-primary" disabled={exchangingCode || !manualAuthCode.trim()}>
                          {exchangingCode ? $t("settings.oneDrive.exchangingCode") : $t("settings.oneDrive.submitCode")}
                        </button>
                        <button type="button" class="icon-btn" on:click={() => (showManualAuthInput = false)}>
                          {$t("common.cancel")}
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
                      {$t("settings.oneDrive.enterCodeManually")}
                    </button>
                  {/if}
                </div>

                <div style="margin-top: 12px;">
                  <button
                    type="button"
                    class="status-link"
                    style="font-size: 11px; color: var(--muted); cursor: pointer;"
                    on:click={() => (showAdvanced = !showAdvanced)}
                  >
                    {showAdvanced ? $t("settings.oneDrive.hideAdvanced") : $t("settings.oneDrive.showAdvanced")}
                  </button>
                  {#if showAdvanced}
                    <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
                      <div class="settings-hint">
                        {$t("settings.oneDrive.advancedHint")}
                      </div>
                      <label class="settings-hint" for="onedrive-client-id-override">{$t("settings.oneDrive.clientIdLabel")}</label>
                      <input
                        id="onedrive-client-id-override"
                        type="text"
                        class="find-input"
                        style="width: 100%; height: 32px;"
                        placeholder={$t("settings.oneDrive.clientIdPlaceholder")}
                        bind:value={clientIdOverride}
                      />
                      <label class="settings-hint" for="onedrive-tenant-id-override">
                        {$t("settings.oneDrive.tenantIdLabel")}
                      </label>
                      <input
                        id="onedrive-tenant-id-override"
                        type="text"
                        class="find-input"
                        style="width: 100%; height: 32px;"
                        placeholder={$t("settings.oneDrive.tenantIdPlaceholder")}
                        bind:value={tenantIdOverride}
                      />
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="icon-btn" on:click={handleSaveAdvanced} disabled={savingAdvanced}>
                          {savingAdvanced ? $t("settings.oneDrive.saving") : $t("settings.oneDrive.save")}
                        </button>
                        {#if advancedSaved}
                          <span class="settings-hint">
                            {$t("settings.oneDrive.savedHint")}
                          </span>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {:else}
            <div>
              <div class="settings-section-label">{$t("settings.notesLocation.sectionLabel")}</div>
              <div class="settings-dir-row">
                <div class="settings-dir-path">{$notesDir}</div>
                <button class="icon-btn" bind:this={browseButtonEl} on:click={controller.pickAndSwitchNotesDirectory}>
                  {$t("common.browse")}
                </button>
              </div>
              <div class="settings-hint">
                {$t("settings.notesLocation.hint")}
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

        {#if $backendKind !== "demo"}
          <div>
            <div class="settings-section-label">{$t("settings.data.sectionLabel")}</div>
            <input
              bind:this={fileInput}
              type="file"
              accept="application/json,.json"
              style="display: none;"
              on:change={onFileChosen}
            />
            <div class="settings-toggle-row" style="gap: 8px;">
              <button class="icon-btn" disabled={exporting} on:click={handleExport}>
                {exporting ? $t("settings.data.exporting") : $t("settings.data.export")}
              </button>
              <button class="icon-btn" disabled={importing} on:click={pickImportFile}>
                {$t("settings.data.import")}
              </button>
            </div>
            {#if $backendKind === "web"}
              <div class="settings-hint">
                {$t("settings.data.webHint")}
              </div>
            {:else}
              <div class="settings-hint">
                {$t("settings.data.desktopHint")}
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
                  {$t("settings.data.noteCountInFile", { count: importPreview.noteCount })}
                </span>
                <Segmented
                  options={[
                    { value: "merge", label: $t("settings.data.importMode.merge") },
                    { value: "replace", label: $t("settings.data.importMode.replace") },
                  ]}
                  value={importMode}
                  onChange={(v) => (importMode = v as "merge" | "replace")}
                />
                {#if importMode === "replace"}
                  <div class="settings-hint" style="color: var(--state-error); margin-top: 0;">
                    {$t("settings.data.replaceWarning")}
                  </div>
                {/if}
                <div style="display: flex; gap: 8px;">
                  <button class="icon-btn btn-primary" disabled={importing} on:click={confirmImport}>
                    {importing ? $t("settings.data.importing") : $t("settings.data.importAction")}
                  </button>
                  <button class="icon-btn" disabled={importing} on:click={cancelImport}>{$t("common.cancel")}</button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {:else if activeSettingsTab === "updates" && $backendKind !== "web"}
        <div>
          <div class="settings-section-label">{$t("about.updates.sectionLabel")}</div>
          <div class="settings-toggle-row">
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={$autoCheckUpdates}
                on:change={(e) => controller.setAutoCheckUpdates(e.currentTarget.checked)}
              />
              <span class="toggle-switch-track"></span>
              {$t("settings.updates.checkOnStart")}
            </label>
          </div>
          <div class="settings-hint">
            {$t("settings.updates.checkOnStartHint")}
          </div>
          {#if $updateStatus === "checking"}
            <div class="settings-hint" style="margin-top: 8px;">
              <span class="modal-spinner" aria-label={$t("about.chip.checking")}>⟳</span> {$t("about.checkingHint")}
            </div>
          {:else if $updateStatus === "available"}
            <div class="settings-hint" style="margin-top: 8px;">
              <strong style="color: var(--text);">v{$updateAvailableVersion}</strong> {$t("about.isAvailable")}
            </div>
            <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
              <button class="icon-btn" on:click={controller.openReleasesPage}> {$t("about.whatsChanged")} </button>
              <button class="icon-btn btn-primary" on:click={() => controller.downloadAndInstallUpdate()}>
                <Icon name="update" size={14} /> {$t("about.downloadAndInstall")}
              </button>
            </div>
          {:else if $updateStatus === "downloading"}
            <div class="settings-hint" style="margin-top: 8px;">
              {#if $updateInstalling}{$t("about.downloading.startingInstaller")}{:else}{$t("about.downloading.downloading")}{progressLabel}{/if}
            </div>
          {:else if $updateStatus === "ready"}
            <div class="settings-hint" style="margin-top: 8px;">{$t("about.ready.installed")}</div>
            <button class="icon-btn btn-primary" style="margin-top: 8px;" on:click={() => controller.restartToFinishUpdate()}>
              {$t("about.ready.restartNow")}
            </button>
          {:else if $updateStatus === "error"}
            {#if $updateErrorDuring === "install"}
              <div class="settings-hint" style="margin-top: 8px; color: var(--state-error);">
                {$t("about.error.installFailedPrefix")} {$updateErrorMessage ?? ""}
              </div>
              <div class="settings-toggle-row" style="margin-top: 8px; gap: 8px;">
                <button class="icon-btn" on:click={() => controller.downloadAndInstallUpdate()}>{$t("about.error.tryAgain")}</button>
                <button class="icon-btn btn-primary" on:click={controller.openReleasesPage}>{$t("about.error.downloadFromGithub")}</button>
              </div>
            {:else}
              <div class="settings-hint" style="margin-top: 8px; color: var(--state-error);">
                {$t("about.error.couldntCheckPrefix")} {$updateErrorMessage ?? ""}
              </div>
              <button class="icon-btn" style="margin-top: 8px;" on:click={() => controller.checkForUpdates()}>
                {$t("about.error.tryAgain")}
              </button>
            {/if}
          {:else}
            <div class="settings-hint" style="margin-top: 8px;">
              {$updateStatus === "upToDate" ? $t("about.upToDate.running") : $t("about.chip.notCheckedYet")}
            </div>
            <button class="icon-btn" style="margin-top: 8px;" on:click={() => controller.checkForUpdates()}>
              {$t("about.checkNow")}
            </button>
          {/if}
        </div>
      {/if}
    </div>
    <div class="modal-footer" style="justify-content: flex-end;">
      <button class="icon-btn" on:click={controller.closeAllModals}>{$t("common.close")}</button>
    </div>
  </div>
</div>

{#if showFolderPicker}
  <OneDriveFolderPickerModal onClose={() => (showFolderPicker = false)} />
{/if}
