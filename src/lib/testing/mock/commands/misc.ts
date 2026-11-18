import {
  activeAgendaDates,
  activeDetailsForDate,
  activeEntriesForDate,
  parseAgendaMeetings,
} from "../../../agendaTitles";
import type { MockBackend } from "../../mockBackend";
import { isValidNoteFilename } from "../../../noteFilename";
import type { CommandArgs, CommandReturn } from "../../../tauriCommands";
import {
  MOCK_SPELL_SUGGESTIONS,
  removedTitlesForDate,
  titlesAfterDate,
  titlesForDate,
} from "../seed";

// F1: the update check (Rust `check_update`); records which channel was asked.
export function checkUpdate(
  backend: MockBackend,
  { early }: CommandArgs<"check_update">,
): CommandReturn<"check_update"> {
  backend.lastCheckUpdateEarly = early;
  backend.lastCheckEarly = early;
  if (backend.updateCheck === "available") {
    return { version: backend.updateCheckVersion, body: "Mock release notes for the test suite." };
  }
  return null;
}

export function pathExists(backend: MockBackend, { path }: CommandArgs<"path_exists">): CommandReturn<"path_exists"> {
  return backend.dirs.has(path);
}

export function readAgendaForDate(
  backend: MockBackend,
  { date }: CommandArgs<"read_agenda_for_date">,
): CommandReturn<"read_agenda_for_date"> {
  return titlesForDate(backend.agendaJson, date);
}

export function readAgendaRemovedForDate(
  backend: MockBackend,
  { date }: CommandArgs<"read_agenda_removed_for_date">,
): CommandReturn<"read_agenda_removed_for_date"> {
  return removedTitlesForDate(backend.agendaJson, date);
}

export function readAgendaEntriesForDate(
  backend: MockBackend,
  { date }: CommandArgs<"read_agenda_entries_for_date">,
): CommandReturn<"read_agenda_entries_for_date"> {
  return activeEntriesForDate(parseAgendaMeetings(backend.agendaJson), date);
}

export function readAgendaDetailsForDate(
  backend: MockBackend,
  { date }: CommandArgs<"read_agenda_details_for_date">,
): CommandReturn<"read_agenda_details_for_date"> {
  return activeDetailsForDate(parseAgendaMeetings(backend.agendaJson), date);
}

export function readAgendaAfter(
  backend: MockBackend,
  { afterDate }: CommandArgs<"read_agenda_after">,
): CommandReturn<"read_agenda_after"> {
  return titlesAfterDate(backend.agendaJson, afterDate);
}

export function readAgendaDates(backend: MockBackend): CommandReturn<"read_agenda_dates"> {
  if (!backend.agendaJson) return [];
  try {
    return activeAgendaDates(parseAgendaMeetings(backend.agendaJson));
  } catch {
    return [];
  }
}

// Mirrors `agenda.rs::agenda_file_exists` — a cheap existence check,
// deliberately not the fuller `titlesForDate` validation (an
// existing-but-invalid file still greys the button *in* rather than
// out, so its own real error surfaces on click).
export function agendaFileExists(backend: MockBackend): CommandReturn<"agenda_file_exists"> {
  return backend.agendaJson !== undefined;
}

export function onedriveLogin(backend: MockBackend): CommandReturn<"onedrive_login"> {
  backend.oneDriveSyncError = undefined; // a fresh sign-in renews an expired one
  return { success: true, account: { email: "test@example.com", displayName: "Test User" }, pending: false };
}

export function onedriveLogout(): CommandReturn<"onedrive_logout"> {}

export function onedriveGetAccount(): CommandReturn<"onedrive_get_account"> {
  return { email: "test@example.com", displayName: "Test User" };
}

export function onedriveListFolders(): CommandReturn<"onedrive_list_folders"> {
  return [
    { id: "folder-1", name: "Documents" },
    { id: "folder-2", name: "Notes" },
  ];
}

export function onedriveCreateFolder({ name }: CommandArgs<"onedrive_create_folder">): CommandReturn<"onedrive_create_folder"> {
  return { id: `folder-${Date.now()}`, name };
}

export function onedriveSetFolder(
  backend: MockBackend,
  { folderId, folderPath }: CommandArgs<"onedrive_set_folder">,
): CommandReturn<"onedrive_set_folder"> {
  backend.oneDriveFolder = { folderId, folderPath };
}

export function onedriveGetFolder(backend: MockBackend): CommandReturn<"onedrive_get_folder"> {
  return backend.oneDriveFolder;
}

export function onedriveExchangeCode(): CommandReturn<"onedrive_exchange_code"> {
  return {
    success: true,
    account: { email: "test@example.com", displayName: "Test User" },
    pending: false,
  };
}

export function onedriveSyncNow(backend: MockBackend): CommandReturn<"onedrive_sync_now"> {
  if (backend.oneDriveSyncError) return { success: false, message: { code: "other", detail: backend.oneDriveSyncError } };
  backend.lastSyncSuccessMs = Date.now();
  return { success: true };
}

// Mirrors `sync.rs::list_conflicts` / `resolve_conflict_files`.
export function onedriveGetConflicts(backend: MockBackend): CommandReturn<"onedrive_get_conflicts"> {
  return [...backend.oneDriveConflicts].map(([name, remote]) => ({
    name,
    local: backend.dir().notes.get(name) ?? "",
    remote,
  }));
}

export function onedriveResolveConflict(
  backend: MockBackend,
  { name, resolution }: CommandArgs<"onedrive_resolve_conflict">,
): CommandReturn<"onedrive_resolve_conflict"> {
  const remote = backend.oneDriveConflicts.get(name);
  if (remote === undefined) throw new Error(`${name} has no sync conflict to resolve`);
  const notes = backend.dir().notes;
  if (resolution === "theirs") notes.set(name, remote);
  else if (resolution === "both") {
    notes.set(name, `${(notes.get(name) ?? "").trimEnd()}\n\n--- other version (sync conflict) ---\n${remote}`);
  } else if (resolution !== "mine") throw new Error(`Unknown resolution: ${resolution}`);
  backend.oneDriveConflicts.delete(name);
  backend.persist();
}

export function onedriveGetSyncStatus(): CommandReturn<"onedrive_get_sync_status"> {
  return "idle";
}

export function onedriveGetAdvancedConfig(backend: MockBackend): CommandReturn<"onedrive_get_advanced_config"> {
  return { ...backend.oneDriveAdvancedConfig };
}

export function onedriveSetAdvancedConfig(
  backend: MockBackend,
  { config }: CommandArgs<"onedrive_set_advanced_config">,
): CommandReturn<"onedrive_set_advanced_config"> {
  backend.oneDriveAdvancedConfig = { ...config };
}

export function webCheckBrowserNotes(backend: MockBackend): CommandReturn<"web_check_browser_notes"> {
  const filenames = [...backend.browserNotes.keys()].filter(isValidNoteFilename).sort();
  return { count: filenames.length, filenames };
}

export function webMigrateBrowserNotes(backend: MockBackend): CommandReturn<"web_migrate_browser_notes"> {
  const validEntries = [...backend.browserNotes.entries()].filter(([k]) => isValidNoteFilename(k));
  if (validEntries.length === 0) return { migratedCount: 0, conflictCount: 0 };

  for (const [k, v] of validEntries) {
    backend.archiveNotes.set(k, v);
  }

  let migratedCount = 0;
  let conflictCount = 0;

  for (const [filename, noteContent] of validEntries) {
    const existingCloud = backend.cloudNotes.get(filename);
    if (existingCloud === undefined || existingCloud.trim() === "") {
      backend.cloudNotes.set(filename, noteContent);
      migratedCount++;
    } else if (existingCloud === noteContent || noteContent.trim() === "") {
      migratedCount++;
    } else {
      // Both exist with different non-empty content: flag as conflict
      backend.cloudNotes.set(filename, noteContent);
      backend.oneDriveConflicts.set(filename, existingCloud);
      conflictCount++;
      migratedCount++;
    }
  }

  backend.browserNotes.clear();
  backend.dir().notes.clear();

  return { migratedCount, conflictCount };
}

export function onedrivePrepareFolderSwitch(): CommandReturn<"onedrive_prepare_folder_switch"> {
  return { ready: true, switched: false, archivedCount: 0 };
}

export function getSyncHealth(backend: MockBackend): CommandReturn<"get_sync_health"> {
  return {
    status: "idle",
    lastSyncSuccessMs: backend.lastSyncSuccessMs,
    localNoteCount: backend.listFiles().length,
    pendingUploadCount: 0,
  };
}

export function appendLog(backend: MockBackend, { level, message }: CommandArgs<"append_log">): CommandReturn<"append_log"> {
  backend.logLines.push(`${level} ${message}`);
}

export function readLogTail(backend: MockBackend, { lines }: CommandArgs<"read_log_tail">): CommandReturn<"read_log_tail"> {
  const slice = backend.logLines.slice(-lines);
  return slice.join("\n");
}

export function openLogFolder(backend: MockBackend): CommandReturn<"open_log_folder"> {
  backend.openedUrls.push("log-folder");
}

export function writeExportFile({ path }: CommandArgs<"write_export_file">): CommandReturn<"write_export_file"> {
  if (!path.endsWith(".md") && !path.endsWith(".html")) {
    throw new Error("Export file path must end with .md or .html");
  }
}

export function spellAvailableLanguages(): CommandReturn<"spell_available_languages"> {
  return ["de-DE", "en-GB", "en-US", "fr-FR", "nl-NL"];
}

export function spellWindowsLanguages(): CommandReturn<"spell_windows_languages"> {
  return ["nl-NL"];
}

export function spellSetLanguages(
  backend: MockBackend,
  { tags }: CommandArgs<"spell_set_languages">,
): CommandReturn<"spell_set_languages"> {
  backend.mockSpellLanguages = [...tags];
  return backend.mockSpellLanguages;
}

export function spellLanguages(backend: MockBackend): CommandReturn<"spell_languages"> {
  return backend.mockSpellLanguages;
}

export function spellCheckLines(
  backend: MockBackend,
  { lines }: CommandArgs<"spell_check_lines">,
): CommandReturn<"spell_check_lines"> {
  return lines.map((line) => {
    if (backend.spellMisspelled.size === 0) return [];
    const ranges: [number, number][] = [];
    const regex = /\b[A-Za-z]+\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      if (backend.spellMisspelled.has(match[0].toLowerCase())) {
        ranges.push([match.index, match.index + match[0].length]);
      }
    }
    return ranges;
  });
}

export function spellSuggest({ word }: CommandArgs<"spell_suggest">): CommandReturn<"spell_suggest"> {
  return MOCK_SPELL_SUGGESTIONS[word.toLowerCase()] ?? [];
}

export function spellAdd(backend: MockBackend, { word }: CommandArgs<"spell_add">): CommandReturn<"spell_add"> {
  backend.spellMisspelled.delete(word.toLowerCase());
  return null;
}

export function spellIgnore(backend: MockBackend, { word }: CommandArgs<"spell_ignore">): CommandReturn<"spell_ignore"> {
  backend.spellMisspelled.delete(word.toLowerCase());
  return null;
}

export function peekSetBounds(): CommandReturn<"peek_set_bounds"> {}

export function peekSetTransparent(): CommandReturn<"peek_set_transparent"> {}

// §393: a 1100x720 "screen"; the strip is full width at its bottom. Recorded for the tests.
export function peekDockBottom(
  backend: MockBackend,
  { height }: CommandArgs<"peek_dock_bottom">,
): CommandReturn<"peek_dock_bottom"> {
  backend.windowCalls.push(`dock ${height}`);
  backend.peekDocked = true;
  return { x: 0, y: 720 - height, width: 1100, height };
}

export function peekUndock(backend: MockBackend): CommandReturn<"peek_undock"> {
  backend.windowCalls.push("undock");
  backend.peekDocked = false;
}

export function peekDockState(backend: MockBackend): CommandReturn<"peek_dock_state"> {
  return {
    docked: backend.peekDocked,
    registered: backend.peekDocked,
    lostPending: false,
    window: null,
    work: null,
    monitors: 1,
  };
}

export function peekLog(backend: MockBackend, { kind, message }: CommandArgs<"peek_log">): CommandReturn<"peek_log"> {
  backend.peekLogLines.push(`${kind}: ${message}`);
}

export function snapOverlaySetRect(): CommandReturn<"snap_overlay_set_rect"> {}

export function zenCoverMonitor(): CommandReturn<"zen_cover_monitor"> {}

export function zenPrepareLeave(): CommandReturn<"zen_prepare_leave"> {}

export function installUpdate({ onEvent }: CommandArgs<"install_update">): CommandReturn<"install_update"> {
  const channel = onEvent as { onmessage?: (e: unknown) => void } | undefined;
  channel?.onmessage?.({ event: "started", data: { contentLength: 1000 } });
  channel?.onmessage?.({ event: "progress", data: { chunkLength: 600 } });
  channel?.onmessage?.({ event: "progress", data: { chunkLength: 400 } });
  channel?.onmessage?.({ event: "finished" });
  channel?.onmessage?.({ event: "launching" });
}
