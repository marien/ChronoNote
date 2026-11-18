import { pushRecentNotesDir, type MockBackend } from "../../mockBackend";
import { clampPeek } from "../../../peekDefaults";
import type { CommandArgs, CommandReturn } from "../../../tauriCommands";

export function getConfig(backend: MockBackend): CommandReturn<"get_config"> {
  return backend.config();
}

export function setNotesDir(backend: MockBackend, { path }: CommandArgs<"set_notes_dir">): CommandReturn<"set_notes_dir"> {
  if (path !== backend.notesDir) {
    pushRecentNotesDir(backend.recentNotesDirs, backend.notesDir, path);
  }
  backend.notesDir = path;
  const d = backend.dir(path); // materialise if brand-new
  if (backend.backendKind === "web") {
    if (path === "Browser storage" || path === "browser") {
      d.notes.clear();
      for (const [k, v] of backend.browserNotes) {
        d.notes.set(k, v);
      }
    } else {
      for (const [k, v] of backend.cloudNotes) {
        d.notes.set(k, v);
      }
    }
  }
  return backend.config();
}

export function updateConfig(backend: MockBackend, { patch }: CommandArgs<"update_config">): CommandReturn<"update_config"> {
  // Only the present fields change; clamps mirror `ConfigPatch::apply` in storage.rs.
  if (patch.colorMode !== undefined) backend.colorMode = patch.colorMode;
  if (patch.themeMode !== undefined) backend.themeMode = patch.themeMode;
  if (patch.languageMode !== undefined) backend.languageMode = patch.languageMode;
  if (patch.startupTabMode !== undefined) backend.startupTabMode = patch.startupTabMode;
  if (patch.wordWrap !== undefined) backend.wordWrap = patch.wordWrap;
  if (patch.spellCheck !== undefined) backend.spellCheck = patch.spellCheck;
  if (patch.spellLanguages !== undefined) backend.spellLanguages = patch.spellLanguages;
  if (patch.readableLineLength !== undefined) backend.readableLineLength = patch.readableLineLength;
  if (patch.autoCheckUpdates !== undefined) backend.autoCheckUpdates = patch.autoCheckUpdates;
  if (patch.earlyUpdates !== undefined) backend.earlyUpdates = patch.earlyUpdates;
  if (patch.phoneCompanion !== undefined) backend.phoneCompanion = patch.phoneCompanion;
  if (patch.calendarSyncEnabled !== undefined) backend.calendarSyncEnabled = patch.calendarSyncEnabled;
  if (patch.calendarAutoAdd !== undefined) backend.calendarAutoAdd = patch.calendarAutoAdd;
  if (patch.minutesName !== undefined) backend.minutesName = Array.from(patch.minutesName.trim()).slice(0, 60).join("");
  if (patch.fontSize !== undefined) backend.fontSize = Math.min(18, Math.max(12, patch.fontSize));
  if (patch.lineHeight !== undefined) backend.lineHeight = Math.min(1.8, Math.max(1.3, patch.lineHeight));
  if (patch.occurrenceHint !== undefined) backend.occurrenceHint = patch.occurrenceHint;
  if (patch.statusBarVisible !== undefined) backend.statusBarVisible = patch.statusBarVisible;
  if (patch.tabLabelStyle !== undefined) backend.tabLabelStyle = patch.tabLabelStyle;
  if (patch.historyPaneShare !== undefined) backend.historyPaneShare = Math.min(0.60, Math.max(0.18, patch.historyPaneShare));
  if (patch.actionsPaneShare !== undefined) backend.actionsPaneShare = Math.min(0.60, Math.max(0.18, patch.actionsPaneShare));
  if (patch.pureBlack !== undefined) backend.pureBlack = patch.pureBlack;
  if (patch.peek !== undefined) backend.peek = clampPeek(patch.peek);
  if (patch.lastSeenVersion !== undefined) backend.lastSeenVersion = patch.lastSeenVersion;
  if (patch.onboardingCompleted !== undefined) backend.onboardingCompleted = patch.onboardingCompleted;
  return backend.config();
}
