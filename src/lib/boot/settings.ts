import { get } from "svelte/store";
import * as api from "../tauriApi";
import {
  actionsPaneShare,
  autoCheckUpdates,
  backendKind,
  calendarAutoAdd,
  calendarSyncEnabled,
  colorMode,
  earlyUpdates,
  fontSize,
  historyPaneShare,
  languageMode,
  lineHeight,
  minutesName,
  pureBlack,
  readableLineLength,
  showToast,
  spellCheck,
  spellLanguages,
  startupTabMode,
  statusBarVisible,
  tabLabelStyle,
  themeMode,
  wordWrap,
} from "../stores";
import { computeEffectiveSpellLanguages, languagesChanged } from "../editor/spellcheck";
import { refreshAgendaFileExists } from "../calendarSyncActions";
import { locale, t } from "../i18n";
import { writeTextWidthChosen } from "../webappLaunch";
import type { ColorMode, LanguageMode, StartupTabMode, ThemeMode } from "../types";
import type { TabLabelStyle } from "../generated/tauri-types";
import {
  applyColorModeToDom,
  applyLocaleToDom,
  applyPureBlackToDom,
  applyThemeModeToDom,
} from "./dom";

export async function setColorMode(mode: ColorMode) {
  colorMode.set(mode);
  applyColorModeToDom(mode);
  try {
    await api.setColorMode(mode);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.theme", undefined));
  }
}

/** #48 — light / dark / system. Distinct from `setColorMode` above (the
 * glyph palette); this is the chrome's own light-vs-dark rendering. */
export async function setThemeMode(mode: ThemeMode) {
  themeMode.set(mode);
  applyThemeModeToDom(mode);
  try {
    await api.setThemeMode(mode);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.lightDark", undefined));
  }
}

/** i18n roadmap — UI display language override, independent of theme. */
export async function setLanguageMode(mode: LanguageMode) {
  languageMode.set(mode);
  applyLocaleToDom(get(locale));
  try {
    await api.setLanguageMode(mode);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.language", undefined));
  }
}

export async function setWordWrap(enabled: boolean) {
  writeTextWidthChosen();
  wordWrap.set(enabled);
  try {
    await api.setWordWrap(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.wordWrap", undefined));
  }
}

export async function setSpellCheck(enabled: boolean) {
  spellCheck.set(enabled);
  try {
    await api.setSpellCheck(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.spellCheck", undefined));
  }
}

let isSyncingSpellLanguages = false;
export async function syncSpellLanguages(): Promise<void> {
  if (get(backendKind) === "web") return;
  if (isSyncingSpellLanguages) return;
  isSyncingSpellLanguages = true;
  try {
    const [avail, win] = await Promise.all([
      api.spellAvailableLanguages(),
      api.spellWindowsLanguages(),
    ]);
    const stored = get(spellLanguages);
    const effective = computeEffectiveSpellLanguages(stored, win, avail);
    await api.spellSetLanguages(effective);
    await languagesChanged();
  } catch (err) {
    console.error("Failed to sync spell languages", err);
  } finally {
    isSyncingSpellLanguages = false;
  }
}

export async function setSpellLanguages(languages: string[] | null) {
  spellLanguages.set(languages);
  try {
    await api.setSpellLanguagesConfig(languages);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.spellLanguages", undefined));
  }
}

export async function setReadableLineLength(enabled: boolean) {
  writeTextWidthChosen();
  readableLineLength.set(enabled);
  // §110: "limit line width" owns word-wrap while it's on — turning it on
  // force-enables wrap; the Settings wrap toggle is disabled meanwhile.
  if (enabled && !get(wordWrap)) await setWordWrap(true);
  try {
    await api.setReadableLineLength(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.readingWidth", undefined));
  }
}

export async function setAutoCheckUpdates(enabled: boolean) {
  autoCheckUpdates.set(enabled);
  try {
    await api.setAutoCheckUpdates(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.updateCheck", undefined));
  }
}

export async function setEarlyUpdates(enabled: boolean) {
  earlyUpdates.set(enabled);
  try {
    await api.setEarlyUpdates(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.updateCheck", undefined));
  }
}

export async function setCalendarSyncEnabled(enabled: boolean) {
  calendarSyncEnabled.set(enabled);
  // Turning it on shouldn't show a stale/default "gray" state until the
  // next window-focus check happens to fire — check right away.
  if (enabled) void refreshAgendaFileExists();
  try {
    await api.setCalendarSyncEnabled(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.calendarSync", undefined));
  }
}

export async function setCalendarAutoAdd(enabled: boolean) {
  calendarAutoAdd.set(enabled);
  try {
    await api.setCalendarAutoAdd(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.calendarAutoAdd", undefined));
  }
}

export async function setMinutesName(name: string) {
  const clamped = Array.from(name.trim()).slice(0, 60).join("");
  minutesName.set(clamped);
  try {
    await api.setMinutesName(clamped);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.minutesName", undefined));
  }
}

export async function setFontSize(size: number) {
  const clamped = Math.min(18, Math.max(12, size));
  fontSize.set(clamped);
  try {
    await api.setFontSize(clamped);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.fontSize", undefined));
  }
}

export async function setLineHeight(height: number) {
  const clamped = Math.min(1.8, Math.max(1.3, height));
  lineHeight.set(clamped);
  try {
    await api.setLineHeight(clamped);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.lineHeight", undefined));
  }
}

export async function setPureBlack(enabled: boolean) {
  pureBlack.set(enabled);
  applyPureBlackToDom(enabled);
  try {
    await api.setPureBlack(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.pureBlack", undefined));
  }
}

export async function setStartupTabMode(mode: StartupTabMode) {
  startupTabMode.set(mode);
  try {
    await api.setStartupTabMode(mode);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.startup", undefined));
  }
}

export async function setStatusBarVisible(enabled: boolean) {
  statusBarVisible.set(enabled);
  try {
    await api.setStatusBarVisible(enabled);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.statusBarVisible", undefined));
  }
}

export async function setTabLabelStyle(style: TabLabelStyle) {
  tabLabelStyle.set(style);
  try {
    await api.setTabLabelStyle(style);
  } catch {
    showToast(get(t)("toast.boot.failedToSave.tabLabelStyle", undefined));
  }
}

export async function setHistoryPaneShare(share: number) {
  const clamped = Math.min(0.60, Math.max(0.18, share));
  historyPaneShare.set(clamped);
  try {
    await api.setHistoryPaneShare(clamped);
  } catch {
    // Best-effort persistence
  }
}

export async function setActionsPaneShare(share: number) {
  const clamped = Math.min(0.60, Math.max(0.18, share));
  actionsPaneShare.set(clamped);
  try {
    await api.setActionsPaneShare(clamped);
  } catch {
    // Best-effort persistence
  }
}
