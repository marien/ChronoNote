/** App startup: load config, restore the tab session (§34), and wire the
 * standing subscriptions (status-bar action counts, window title, session
 * autosave). Also the two small config-backed toggles (`setColorMode` /
 * `setWordWrap`) and the maximize/fullscreen chrome watcher. Split out of
 * `controller.ts` in the v0.5.0 refactor. `directory.ts` reuses
 * `restoreOrBootstrapTabs` for the workspace re-load on a folder switch. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { installErrorReporting, logError, logInfo, logWarn } from "./appLog";
import { todayISO } from "./date";
import {
  activeTabId,
  appVersion,
  autoAddedMeetings,
  autoCheckUpdates,
  backendKind,
  earlyUpdates,
  calendarAutoAdd,
  calendarSyncEnabled,
  colorMode,
  fontSize,
  languageMode,
  lineHeight,
  minutesName,
  pureBlack,
  isMobile,
  justUpdatedToVersion,
  notesDir,
  oneDriveAccount,
  readableLineLength,
  recentNotesDirs,
  showToast,
  statusBarVisible,
  tabLabelStyle,
  historyPaneShare,
  actionsPaneShare,
  startupTabMode,
  tabs,
  themeMode,
  wordWrap,
  spellCheck,
  spellLanguages,
} from "./stores";
import { setWriteConflictHandler } from "./persistence";
import { ensureLoaded } from "./notesIndex";
import { handleWriteConflict } from "./drift";
import { initCalendarSyncDiffTracking, refreshAgendaFileExists } from "./calendarSyncActions";
import { checkForUpdatesOnLaunch } from "./updates";
import { applyPeekConfig } from "./peek";
import { wireMica } from "./mica";
import { occurrenceHint } from "./occurrences";
import { phoneCompanionEnabled, wirePhoneCompanion } from "./phoneCompanion";
import { wirePhoneInboxUi } from "./phoneInboxUi";
import { locale, t } from "./i18n";
import { isFromNewerApp } from "./configSchema";
import { getOnboardingTemplate } from "./onboardingTemplate";
import { normalizeAutoAddedMeetings } from "./sessionMeetings";
import {
  handleWebappLaunch,
  readMobileDefaultsApplied,
  shouldApplyMobileDefaults,
  writeMobileDefaultsApplied,
} from "./webappLaunch";
import {
  bringToFrontAfterUpdate,
  wireCloseBarrier,
  wireDateRollover,
  wireDriftDetection,
  wireStatusBarSync,
  wireWindowTitleSync,
} from "./boot/subscriptions";
import {
  applyColorModeToDom,
  applyLocaleToDom,
  applyPureBlackToDom,
  applyThemeModeToDom,
} from "./boot/dom";
import { restoreOrBootstrapTabs, scheduleTabSessionSave } from "./boot/tabSession";
import { initOneDriveSync } from "./boot/oneDrive";
import { setFontSize, setWordWrap, syncSpellLanguages } from "./boot/settings";

export { cancelAppClose, confirmDiscardAndClose, folderNameFromPath } from "./boot/subscriptions";
export {
  applyColorModeToDom,
  applyLocaleToDom,
  applyPureBlackToDom,
  applyThemeModeToDom,
} from "./boot/dom";
export { restoreOrBootstrapTabs, writeTabSessionNow } from "./boot/tabSession";
export {
  initOneDriveSync,
  initWindowChromeWatcher,
  refreshSyncHealth,
} from "./boot/oneDrive";
export {
  setActionsPaneShare,
  setAutoCheckUpdates,
  setCalendarAutoAdd,
  setCalendarSyncEnabled,
  setColorMode,
  setEarlyUpdates,
  setFontSize,
  setHistoryPaneShare,
  setLanguageMode,
  setLineHeight,
  setMinutesName,
  setPureBlack,
  setReadableLineLength,
  setSpellCheck,
  setSpellLanguages,
  setStartupTabMode,
  setStatusBarVisible,
  setTabLabelStyle,
  setThemeMode,
  setWordWrap,
  syncSpellLanguages,
} from "./boot/settings";

// --- Boot ---

export async function initApp() {
  const bootStart = typeof performance !== "undefined" ? performance.now() : Date.now();
  installErrorReporting();
  wireStatusBarSync();
  wireWindowTitleSync();
  wireCloseBarrier();
  wireDriftDetection();
  setWriteConflictHandler(handleWriteConflict);
  wireDateRollover();
  initCalendarSyncDiffTracking();
  const cfg = await api.getConfig();
  if (isFromNewerApp(cfg.schemaVersion)) {
    showToast(get(t)("toast.boot.configFromNewerVersion", undefined));
  }
  // §D1: on first launch on a phone in the web app, apply wrap and 16px font size defaults
  const mobileDefaultsApplied = readMobileDefaultsApplied();
  if (shouldApplyMobileDefaults(cfg, get(isMobile), get(backendKind), mobileDefaultsApplied)) {
    writeMobileDefaultsApplied();
    cfg.wordWrap = true;
    cfg.fontSize = 16;
    await setWordWrap(true);
    await setFontSize(16);
  }
  notesDir.set(cfg.notesDir);
  recentNotesDirs.set(cfg.recentNotesDirs);
  colorMode.set(cfg.colorMode);
  applyColorModeToDom(cfg.colorMode);
  themeMode.set(cfg.themeMode);
  applyThemeModeToDom(cfg.themeMode);
  languageMode.set(cfg.languageMode);
  applyLocaleToDom(get(locale));
  // §110: "limit line width" implies word-wrap. Reconcile a stale config
  // (from the version where the two were gated the other way round).
  readableLineLength.set(cfg.readableLineLength);
  wordWrap.set(cfg.wordWrap || cfg.readableLineLength);
  spellCheck.set(cfg.spellCheck ?? false);
  spellLanguages.set(cfg.spellLanguages ?? null);
  if (get(backendKind) !== "web") {
    spellLanguages.subscribe(() => {
      void syncSpellLanguages();
    });
  }
  autoCheckUpdates.set(cfg.autoCheckUpdates);
  earlyUpdates.set(cfg.earlyUpdates ?? false);
  calendarSyncEnabled.set(cfg.calendarSyncEnabled);
  calendarAutoAdd.set(cfg.calendarAutoAdd ?? true);
  minutesName.set(cfg.minutesName ?? "");
  fontSize.set(cfg.fontSize ?? 13);
  lineHeight.set(cfg.lineHeight ?? 1.6);
  pureBlack.set(cfg.pureBlack ?? false);
  applyPureBlackToDom(cfg.pureBlack ?? false);
  startupTabMode.set(cfg.startupTabMode ?? "today");
  applyPeekConfig(cfg.peek);
  occurrenceHint.set(cfg.occurrenceHint ?? false);
  phoneCompanionEnabled.set(cfg.phoneCompanion ?? false);
  statusBarVisible.set(cfg.statusBarVisible ?? true);
  tabLabelStyle.set(cfg.tabLabelStyle ?? "iso");
  historyPaneShare.set(cfg.historyPaneShare ?? 0.30);
  actionsPaneShare.set(cfg.actionsPaneShare ?? 0.30);
  if (cfg.calendarSyncEnabled && (get(backendKind) !== "web" || !!get(oneDriveAccount))) {
    await refreshAgendaFileExists();
  }
  // First-time installation onboarding (§onboarding, §255):
  // Strictly once per installation globally (tracked in config.json).
  // Distinguish genuine first install from existing user upgrades:
  // If the user upgraded from an earlier version (lastSeenVersion is set),
  // or a tab session already exists, or existing notes are present on disk,
  // skip seeding and mark completed silently. On the web app the welcome is a
  // scratchpad rather than a dated file (see below).
  let welcomeScratchpadName: string | null = null;
  if (cfg.onboardingCompleted === false) {
    try {
      const isUpgrade = Boolean(cfg.lastSeenVersion);
      const isWeb = get(backendKind) === "web";

      if (isUpgrade) {
        await api.setOnboardingCompleted(true);
      } else {
        const existingFiles = (await api.listNoteFiles()) ?? [];
        if (existingFiles.length > 0) {
          await api.setOnboardingCompleted(true);
        } else {
          const session = await api.readTabSession();
          autoAddedMeetings.set(normalizeAutoAddedMeetings(session?.autoAddedMeetings));
          if (session && session.openTabs && session.openTabs.length > 0) {
            await api.setOnboardingCompleted(true);
          } else {
            const template = getOnboardingTemplate(get(locale));
            if (isWeb) {
              // The web app's browser storage is empty on every new browser/
              // device, and a OneDrive sync after boot would collide with a
              // welcome note written as today's file. A scratchpad has no file,
              // so it can't. It is seeded as a draft; restoreOrBootstrapTabs
              // then restores it as an ordinary scratchpad tab.
              welcomeScratchpadName = get(t)("onboarding.scratchpadName", undefined);
              await api.saveScratchpadDrafts({ [welcomeScratchpadName]: template });
            } else {
              await api.writeNote(todayISO() + ".txt", template);
            }
            await api.setOnboardingCompleted(true);
            if (get(isMobile)) {
              showToast(get(t)("toast.onboarding.mobileHint", undefined));
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to seed onboarding note:", err);
      logError(`Failed to seed onboarding note: ${err}`);
    }
  }
  await restoreOrBootstrapTabs();
  if (welcomeScratchpadName) {
    const welcome = get(tabs).find((t) => t.isScratchpad && t.filename === welcomeScratchpadName);
    if (welcome) activeTabId.set(welcome.id);
  }
  // #62: warm the "all notes" disk-read cache in the background, right
  // after the app has something to show — never awaited, so it can't
  // delay becoming interactive. Section History/Actions Drawer's "All
  // Files"/Cross-Tab Search's "All Files" all share this one cache
  // (`persistence.ts`'s `diskNotesCacheRaw`) and used to each pay its
  // full one-time disk-read cost themselves, whichever happened to be
  // opened first — usually finished by the time any of them are actually
  // opened now; each still has its own loading indicator for whenever
  // it isn't (a very large notes folder, or a very fast keypress).
  // Deferred a moment past app-ready (not just un-awaited): the read itself is
  // off the UI thread, but on a big OneDrive folder it still competes with the
  // editor's first paint for disk and CPU.
  setTimeout(() => void ensureLoaded(), 1500);
  tabs.subscribe(() => scheduleTabSessionSave());
  activeTabId.subscribe(() => scheduleTabSessionSave());
  const version = await api.getAppVersion();
  appVersion.set(version);
  // After the version is known: the outbox carries it.
  if (get(backendKind) === "desktop") {
    wirePhoneCompanion();
    wirePhoneInboxUi();
  }
  // #50: a first launch after an in-place update shows a one-time
  // "Updated to vX.Y.Z" status-bar link (see StatusBar.svelte); a fresh
  // install or a config from before this field existed has no prior
  // version to say we updated *from*, so `lastSeenVersion` being unset
  // just means "record the current version, nothing to announce."
  if (cfg.lastSeenVersion && cfg.lastSeenVersion !== version) {
    // §415: recorded as seen only when the notice is clicked or closed (menu.ts), so a reload before that (an
    // OneDrive sign-in) shows it again.
    justUpdatedToVersion.set(version);
    if (get(backendKind) === "desktop") void bringToFrontAfterUpdate(version);
  } else if (cfg.lastSeenVersion !== version) {
    // Nothing to announce (a first install): record the version now.
    api.setLastSeenVersion(version).catch(() => {
      // Best-effort bookkeeping — worst case the notice repeats next launch.
    });
  }
  // §update-check: a silent background check, never blocking app-ready.
  // Quiet by design — "no update" and a failed check both leave no trace
  // beyond the About drawer; only "an update is available" shows anything
  // (a status-bar message), and only the user's own click ever downloads.
  // Meaningless in the web app (see AboutModal.svelte's same gate).
  if (cfg.autoCheckUpdates && get(backendKind) !== "web") {
    void checkForUpdatesOnLaunch();
  }
  void initOneDriveSync();
  // B1/B2: collapse earlier days' versions and empty the 30-day trash, in the background (every backend).
  void api.cleanUpVersionsAndTrash().catch((e) => logWarn(`clean up versions and trash failed: ${e}`));
  if (get(backendKind) === "desktop") wireMica();
  if (get(backendKind) === "web") {
    await handleWebappLaunch();
  }
  const elapsed = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - bootStart);
  logInfo(`boot done in ${elapsed} ms, ${get(tabs).length} tabs`);
}
