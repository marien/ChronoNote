<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import * as controller from "../../controller";
  import { focusTrap } from "../../actions/focusTrap";
  import { sheetSwipe } from "../../actions/sheetSwipe";
  import { matchesShortcut } from "../../shortcuts";
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
    startupTabMode,
    statusBarVisible,
    tabLabelStyle,
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
  import SettingRow from "../SettingRow.svelte";
  import SettingToggle from "../SettingToggle.svelte";
  import AboutPanel from "../AboutPanel.svelte";
  import { PEEK_DEFAULTS, peekSettings, type PeekHeaderMode } from "../../peek";
  import { occurrenceHint, setOccurrenceHint } from "../../occurrences";
  import { t } from "../../i18n";
  import { describeApiError } from "../../apiError";
  import type { ColorMode, LanguageMode, StartupTabMode, ThemeMode } from "../../types";
  import type { TabLabelStyle } from "../../generated/tauri-types";
  import { ExportBundleError, type ExportBundle } from "../../exportImport";
  import OneDriveFolderPickerModal from "./OneDriveFolderPickerModal.svelte";

  interface Props {
    page?: boolean;
  }
  let { page = false }: Props = $props();

  onDestroy(() => {
    if (page) {
      void tick().then(() => {
        controller.editorApi?.focus();
        document.querySelector<HTMLElement>(".cm-content")?.focus();
      });
    }
  });

  // Four tabs group settings: Appearance/Editor, Notes & Sync, Updates (desktop only), and About.
  const settingsTabs = $derived([
    { value: "appearance", label: $t("settings.tabs.appearance") },
    { value: "calendar", label: $t("settings.tabs.notesAndSync") },
    ...($backendKind === "desktop" ? [{ value: "updates", label: $t("settings.tabs.updates") }] : []),
    { value: "about", label: $t("settings.tab.about") },
  ]);
  // Left/Right move between the tabs (and select them, as the tab pattern does).
  function onTabsKeydown(e: KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const list = e.currentTarget as HTMLElement;
    const i = settingsTabs.findIndex((tab) => tab.value === activeSettingsTab);
    const step = e.key === "ArrowRight" ? 1 : -1;
    activeSettingsTab = settingsTabs[(i + step + settingsTabs.length) % settingsTabs.length].value;
    e.preventDefault();
    void tick().then(() => list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  }
  // #71: the status bar's folder icon/name opens Settings landed
  // directly on this tab (`openSettingsOnNotesFolder`, `menu.ts`) —
  // consumed once here so a later plain Settings open still starts on
  // the default first tab, same as any other freshly-opened modal.
  const openedOnNotesFolder = get(settingsInitialTab) !== null;
  let activeSettingsTab: string = $state(get(settingsInitialTab) ?? "appearance");
  settingsInitialTab.set(null);

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

  let prefersDark = false;
  if (typeof window !== "undefined") {
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  const isDarkResolved = $derived($themeMode === "dark" || ($themeMode === "system" && prefersDark));

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
  const progressLabel = $derived.by(() => {
    const p = $updateDownloadProgress;
    if (!p || !p.totalBytes) return "";
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    return ` ${mb(p.doneBytes)} / ${mb(p.totalBytes)} MB`;
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

  let loggingIn = $state(false);

  let showFolderPicker = $state(false);
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

  // Signing in doesn't choose a folder, and "Sync now" can't do anything
  // without one — so the moment the account is connected with no folder yet,
  // open the folder picker instead of leaving the user to find it. Once per
  // Settings visit, so closing the picker without choosing isn't nagged.
  let autoOpenedFolderPicker = false;
  $effect(() => {
    if ($oneDriveAccount && !$oneDriveFolder && !$oneDriveFolderPickerOpen && !autoOpenedFolderPicker && $backendKind === "web") {
      autoOpenedFolderPicker = true;
      showFolderPicker = true;
    }
  });

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

  // §127 (finding K): `word_wrap` and `readable_line_length` used to be
  // two separate toggles, the second force-enabling (and disabling) the
  // first — a checked-and-greyed-out switch reads as confusing state. One
  // 3-way choice instead; no Rust/config change, it's still just the same
  // two booleans underneath (full = both off, wrap = word_wrap only,
  // reading = both on, since "reading column" only ever applies with wrap
  // on too).
  const editorWidthMode = $derived($readableLineLength ? "reading" : $wordWrap ? "wrap" : "full");
  async function setEditorWidth(mode: string) {
    if (mode === "reading") {
      await controller.setReadableLineLength(true);
    } else {
      if ($readableLineLength) await controller.setReadableLineLength(false);
      await controller.setWordWrap(mode === "wrap");
    }
  }
</script>
<svelte:window onkeydown={(e) => {
  if (page && matchesShortcut(e, "openSettings")) {
    e.preventDefault();
    controller.closeAllModals();
  }
}} />

{#snippet tabsStrip()}
  <div class="settings-tabs" role="tablist" tabindex="-1" onkeydown={onTabsKeydown}>
    {#each settingsTabs as tab (tab.value)}
      <button
        type="button"
        role="tab"
        class="settings-tab"
        aria-selected={tab.value === activeSettingsTab}
        tabindex={tab.value === activeSettingsTab ? 0 : -1}
        onclick={() => (activeSettingsTab = tab.value)}
      >
        {tab.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet tabContent()}
      {#if activeSettingsTab === "appearance"}
        <section class="s-group">
          <div class="settings-section-label">{$t("settings.appearance.sectionLabel")}</div>
          <SettingRow label={$t("settings.appearance.theme.label")}>
            <Segmented
              options={[
                { value: "light", label: $t("settings.appearance.theme.light") },
                { value: "dark", label: $t("settings.appearance.theme.dark") },
                { value: "system", label: $t("common.system") },
              ]}
              value={$themeMode}
              onChange={(v) => controller.setThemeMode(v as ThemeMode)}
            />
          </SettingRow>
          {#if isDarkResolved}
            <SettingToggle
              label={$t("settings.appearance.pureBlack.label")}
              checked={$pureBlack}
              onChange={(v) => controller.setPureBlack(v)}
            >
              {#snippet description()}{$t("settings.appearance.pureBlack.hint")}{/snippet}
            </SettingToggle>
          {/if}
          <SettingRow label={$t("settings.appearance.language.label")}>
            <div class="select-wrap">
              <select
                class="settings-select"
                aria-label={$t("settings.appearance.language.label")}
                value={$languageMode}
                onchange={(e) => controller.setLanguageMode(e.currentTarget.value as LanguageMode)}
              >
                <option value="system">{$t("common.system")}</option>
                <option value="en">English</option>
                <option value="nl">Nederlands</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="pl">Polski</option>
                <option value="es">Español</option>
                <option value="it">Italiano</option>
              </select>
              <span class="select-chevron" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 4.5L6 8L9.5 4.5" />
                </svg>
              </span>
            </div>
          </SettingRow>
          <SettingRow label={$t("settings.appearance.glyphs.label")}>
            {#snippet description()}{$t("settings.appearance.glyphs.hint")}{/snippet}
            <Segmented
              options={[
                { value: "color", label: $t("settings.appearance.glyphs.color") },
                { value: "grayscale", label: $t("settings.appearance.glyphs.grayscale") },
              ]}
              value={$colorMode}
              onChange={(v) => controller.setColorMode(v as ColorMode)}
            />
          </SettingRow>
          <SettingToggle
            label={$t("settings.appearance.statusBar.label")}
            checked={$statusBarVisible}
            onChange={(v) => void controller.setStatusBarVisible(v)}
          >
            {#snippet description()}{$t("settings.appearance.statusBar.hint")}{/snippet}
          </SettingToggle>
          <SettingRow label={$t("settings.appearance.tabLabels.label")}>
            {#snippet description()}{$t("settings.appearance.tabLabels.hint")}{/snippet}
            <Segmented
              options={[
                { value: "iso", label: $t("settings.appearance.tabLabels.iso") },
                { value: "friendly", label: $t("settings.appearance.tabLabels.friendly") },
              ]}
              value={$tabLabelStyle}
              onChange={(v) => void controller.setTabLabelStyle(v as TabLabelStyle)}
            />
          </SettingRow>
        </section>
        <section class="s-group">
          <div class="settings-section-label">{$t("settings.editor.sectionLabel")}</div>
          <SettingRow label={$t("settings.editor.width.label")} stack>
            {#snippet description()}{$t("settings.editor.width.hint")}{/snippet}
            <Segmented
              options={[
                { value: "full", label: $t("settings.editor.width.full") },
                { value: "wrap", label: $t("settings.editor.width.wrap") },
                { value: "reading", label: $t("settings.editor.width.readingColumn") },
              ]}
              value={editorWidthMode}
              onChange={setEditorWidth}
            />
          </SettingRow>
          <SettingRow label={$t("settings.editor.fontSize.label")}>
            <div class="s-slider">
              <input
                type="range"
                class="settings-range-slider"
                min="12"
                max="18"
                step="0.5"
                value={$fontSize}
                aria-label={$t("settings.editor.fontSize.ariaLabel")}
                oninput={(e) => controller.setFontSize(parseFloat(e.currentTarget.value))}
              />
              <span class="settings-slider-val">{$fontSize}px</span>
            </div>
          </SettingRow>
          <SettingRow label={$t("settings.editor.lineSpacing.label")}>
            <div class="s-slider">
              <input
                type="range"
                class="settings-range-slider"
                min="1.3"
                max="1.8"
                step="0.05"
                value={$lineHeight}
                aria-label={$t("settings.editor.lineSpacing.ariaLabel")}
                oninput={(e) => controller.setLineHeight(parseFloat(e.currentTarget.value))}
              />
              <span class="settings-slider-val">{$lineHeight.toFixed(2)}</span>
            </div>
          </SettingRow>
        </section>
        <section class="s-group">
          <div class="settings-section-label">{$t("occurrence.settings.title")}</div>
          <SettingToggle
            label={$t("occurrence.settings.hint.label")}
            checked={$occurrenceHint}
            onChange={(v) => void setOccurrenceHint(v)}
          >
            {#snippet description()}{$t("occurrence.settings.hint.hint")}{/snippet}
          </SettingToggle>
        </section>
        {#if $backendKind === "desktop"}
          <section class="s-group">
            <div class="settings-section-label">{$t("peek.settings.title")}</div>
            <div class="s-note">{$t("peek.settings.hint")}</div>
            <SettingToggle
              label={$t("peek.settings.fitSection.label")}
              checked={$peekSettings.lines === 0}
              onChange={(v) => peekSettings.update((s) => ({ ...s, lines: v ? 0 : PEEK_DEFAULTS.lines, useLinesHeight: true }))}
            />
            <SettingRow label={$t("peek.settings.opacity.label")}>
              <div class="s-slider">
                <input
                  type="range"
                  class="settings-range-slider"
                  min="20"
                  max="100"
                  step="5"
                  value={$peekSettings.opacity}
                  aria-label={$t("peek.settings.opacity.label")}
                  oninput={(e) => peekSettings.update((s) => ({ ...s, opacity: parseInt(e.currentTarget.value, 10) }))}
                />
                <span class="settings-slider-val">{$peekSettings.opacity}%</span>
              </div>
            </SettingRow>
            <SettingRow label={$t("peek.settings.opacityHover.label")}>
              <div class="s-slider">
                <input
                  type="range"
                  class="settings-range-slider"
                  min="20"
                  max="100"
                  step="5"
                  value={$peekSettings.opacityHover}
                  aria-label={$t("peek.settings.opacityHover.label")}
                  oninput={(e) => peekSettings.update((s) => ({ ...s, opacityHover: parseInt(e.currentTarget.value, 10) }))}
                />
                <span class="settings-slider-val">{$peekSettings.opacityHover}%</span>
              </div>
            </SettingRow>
            <SettingRow label={$t("peek.settings.fadeSeconds.label")}>
              <div class="s-slider">
                <input
                  type="range"
                  class="settings-range-slider"
                  min="0"
                  max="60"
                  step="1"
                  value={$peekSettings.fadeSeconds}
                  aria-label={$t("peek.settings.fadeSeconds.label")}
                  oninput={(e) => peekSettings.update((s) => ({ ...s, fadeSeconds: parseInt(e.currentTarget.value, 10) }))}
                />
                <span class="settings-slider-val">{$peekSettings.fadeSeconds === 0 ? $t("peek.settings.fadeSeconds.never") : $peekSettings.fadeSeconds + " s"}</span>
              </div>
            </SettingRow>
            <SettingToggle
              label={$t("peek.settings.alwaysOnTop.label")}
              checked={$peekSettings.alwaysOnTop}
              onChange={(v) => peekSettings.update((s) => ({ ...s, alwaysOnTop: v }))}
            />
            <SettingRow label={$t("peek.settings.header.label")}>
              <Segmented
                options={[
                  { value: "always", label: $t("peek.settings.header.always") },
                  { value: "hover", label: $t("peek.settings.header.hover") },
                  { value: "never", label: $t("peek.settings.header.never") },
                ]}
                value={$peekSettings.header}
                onChange={(v) => peekSettings.update((s) => ({ ...s, header: v as PeekHeaderMode }))}
              />
            </SettingRow>
            <SettingRow label={$t("peek.settings.callShortcut.label")}>
              <input
                type="text"
                class="find-input s-input"
                value={$peekSettings.callShortcut}
                aria-label={$t("peek.settings.callShortcut.label")}
                onchange={(e) => peekSettings.update((s) => ({ ...s, callShortcut: e.currentTarget.value.trim() }))}
              />
            </SettingRow>
          </section>
        {/if}
      {:else if activeSettingsTab === "calendar"}
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
                  <button class="settings-btn" onclick={() => (showFolderPicker = true)}>{$t("common.browse")}</button>
                {:else}
                  <button class="settings-btn primary" onclick={() => (showFolderPicker = true)}>{$t("settings.oneDrive.chooseFolder")}</button>
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
            {#if $calendarSyncEnabled && !$agendaFileExists}
              <div class="s-note error">
                {$t("settings.calendar.agendaMissing.before")}<code>.agenda.json</code>{$t("settings.calendar.agendaMissing.after")}
              </div>
            {/if}
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
      {:else if activeSettingsTab === "updates" && $backendKind !== "web"}
        <section class="s-group">
          <SettingToggle
            label={$t("settings.updates.checkOnStart")}
            checked={$autoCheckUpdates}
            onChange={(v) => controller.setAutoCheckUpdates(v)}
          >
            {#snippet description()}{$t("settings.updates.checkOnStartHint")}{/snippet}
          </SettingToggle>
          <div class="s-status">
            {#if $updateStatus === "checking"}
              <div class="s-note"><span class="modal-spinner" aria-label={$t("about.chip.checking")}>⟳</span> {$t("about.checkingHint")}</div>
            {:else if $updateStatus === "available"}
              <div class="s-note"><strong class="s-strong">v{$updateAvailableVersion}</strong> {$t("about.isAvailable")}</div>
              <div class="s-actions">
                <button class="settings-btn" onclick={controller.openReleasesPage}>{$t("about.whatsChanged")}</button>
                <button class="settings-btn primary" onclick={() => controller.downloadAndInstallUpdate()}>
                  <Icon name="update" size={14} /> {$t("about.downloadAndInstall")}
                </button>
              </div>
            {:else if $updateStatus === "downloading"}
              <div class="s-note">
                {#if $updateInstalling}{$t("about.downloading.startingInstaller")}{:else}{$t("about.downloading.downloading")}{progressLabel}{/if}
              </div>
            {:else if $updateStatus === "ready"}
              <div class="s-note">{$t("about.ready.installed")}</div>
              <div class="s-actions">
                <button class="settings-btn primary" onclick={() => controller.restartToFinishUpdate()}>
                  {$t("about.ready.restartNow")}
                </button>
              </div>
            {:else if $updateStatus === "error"}
              {#if $updateErrorDuring === "install"}
                <div class="s-note error">{$t("about.error.installFailedPrefix")} {$updateErrorMessage ?? ""}</div>
                <div class="s-actions">
                  <button class="settings-btn" onclick={() => controller.downloadAndInstallUpdate()}>{$t("about.error.tryAgain")}</button>
                  <button class="settings-btn primary" onclick={controller.openReleasesPage}>{$t("about.error.downloadFromGithub")}</button>
                </div>
              {:else}
                <div class="s-note error">{$t("about.error.couldntCheckPrefix")} {$updateErrorMessage ?? ""}</div>
                <div class="s-actions">
                  <button class="settings-btn" onclick={() => controller.checkForUpdates()}>{$t("about.error.tryAgain")}</button>
                </div>
              {/if}
            {:else}
              <div class="s-note">{$updateStatus === "upToDate" ? $t("about.upToDate.running") : $t("about.chip.notCheckedYet")}</div>
              <div class="s-actions">
                <button class="settings-btn" onclick={() => controller.checkForUpdates()}>{$t("about.checkNow")}</button>
              </div>
            {/if}
          </div>
        </section>
      {:else if activeSettingsTab === "about"}
        <AboutPanel />
      {/if}
{/snippet}

{#if page}
  <main class="settings-page" aria-label={$t("settings.modal.title")}>
    <header class="settings-page-header">
      <button
        type="button"
        class="icon-btn settings-back-btn"
        aria-label={$t("settings.back")}
        onclick={controller.closeAllModals}
      >
        <Icon name="chevron-left" size={18} />
      </button>
      <h1 class="modal-title settings-page-title">{$t("settings.modal.title")}</h1>
    </header>
    {@render tabsStrip()}
    <div class="settings-section" role="tabpanel">
      {@render tabContent()}
    </div>
  </main>
{:else}
  <div class="overlay" role="presentation" use:closeOnOutsideClick={controller.closeAllModals}>
    <div
      class="modal-card settings-modal-card modal-md"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      use:sheetSwipe
      aria-label={$t("settings.modal.title")}
    >
      <div class="modal-input-wrap modal-title">
        <Icon name="settings" size={15} />
        <span>{$t("settings.modal.title")}</span>
        <button
          type="button"
          class="icon-btn modal-close-btn"
          aria-label={$t("common.closeDialog")}
          onclick={controller.closeAllModals}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      {@render tabsStrip()}
      <div class="settings-section" role="tabpanel">
        {@render tabContent()}
      </div>
      <div class="modal-footer s-footer">
        <button class="settings-btn" onclick={controller.closeAllModals}>{$t("common.close")}</button>
      </div>
    </div>
  </div>
{/if}

{#if showFolderPicker}
  <OneDriveFolderPickerModal onClose={() => (showFolderPicker = false)} />
{/if}

<style>
/* Tabbed Settings: the tab switcher sits between the title and the
   scrollable section below, never itself part of what scrolls. */

/* Real tabs (an underline on the selected one), deliberately unlike the
   bordered `.segmented` controls inside them, so navigation and settings
   don't look like the same thing. */

.settings-tabs {
  display: flex;
  gap: 4px;
  /* The tabs sit 1px lower than the content (margin-bottom: -1px) so the active tab's underline covers the rule
     under the row. With the rule as a border that 1px poked out of the padding box and, because this box scrolls
     sideways (overflow-x: auto makes overflow-y auto too), showed a tiny vertical scrollbar. The rule is an inset
     shadow in 1px of bottom padding instead: the same look, and the tabs stay inside the box. */
  padding: 6px 16px 1px;
  box-shadow: inset 0 -1px 0 var(--edge-soft);
  flex-shrink: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.settings-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 7px 12px;
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
}

.settings-tab:hover {
  color: var(--text);
}

.settings-tab[aria-selected="true"] {
  color: var(--text);
  font-weight: 600;
  border-bottom-color: var(--tab-active-border);
}

@media (max-width: 600px) {
  .settings-tabs {
    gap: 0;
  }
  /* Size to the label (grow to share spare room) rather than forcing equal
     widths: a long translation ("Notities & sync") must never overflow its tab. */
  .settings-tab {
    flex: 1 1 auto;
    padding: 7px 6px;
    font-size: 11.5px;
    text-align: center;
  }
}

.settings-slider-val {
  font-size: var(--type-caption);
  font-family: var(--font-mono);
  color: var(--muted);
}

.settings-range-slider {
  width: 100%;
  accent-color: var(--glyph-open-color);
  cursor: pointer;
}

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

/* Settings layout. Every setting is one `.s-row` (SettingRow/SettingToggle):
   label + optional one-line description on the left, control on the right;
   rows in a group are divided by a hairline. A `stack` row puts the control
   under the text, and on a phone every row stacks. Spacing lives here, not
   in inline styles. */

.s-group {
  display: flex;
  flex-direction: column;
}

.s-slider {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 200px;
}

.s-slider .settings-range-slider {
  flex: 1;
  min-width: 0;
}

.s-slider .settings-slider-val {
  min-width: 42px;
  text-align: right;
}

/* Buttons in Settings read as buttons: bordered, the primary one filled. */

.settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--edge-strong);
  border-radius: var(--radius-control);
  color: var(--text);
  padding: 5px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.settings-btn:hover {
  background: var(--surface-raised);
}

.settings-btn.primary {
  background: var(--text);
  color: var(--bg);
  border-color: transparent;
}

.settings-btn.primary:hover {
  background: var(--text);
  opacity: 0.85;
}

.settings-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.settings-btn:disabled:hover {
  background: transparent;
}

.settings-btn.primary:disabled:hover {
  background: var(--text);
  opacity: 0.4;
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

.s-note {
  font-size: var(--type-caption);
  color: var(--muted);
  margin-top: 8px;
}

.s-strong {
  color: var(--text);
}

.s-status {
  border-top: 1px solid var(--edge-soft);
  padding-top: 2px;
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

.s-footer {
  justify-content: flex-end;
}

.s-note.warn {
  color: var(--state-warn);
  border-left: 2px solid var(--state-warn);
  padding-left: 8px;
}

.s-note.error {
  color: var(--state-error);
}

/* Was inside the global phone-width block that also holds the row rules. */
@media (max-width: 600px) {
  .s-slider {
    width: 100%;
  }
}
</style>
