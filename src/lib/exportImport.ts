/** Export/import — shared by the desktop app's "Import notes from a
 * file" Settings entry and the web app's own Export/Import section (both
 * render from the same `SettingsModal.svelte` code, gated by
 * `backendKind`). The file format and its parsing live in the
 * backend-agnostic `webapp/exportBundle.ts`; this module is the
 * controller-layer glue — reading/writing through `tauriApi.ts` and
 * updating the usual stores/caches afterward. See
 * `docs/design/webapp-roadmap.md`. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { colorMode, droppedConflicts, modal, pendingImportPreview, settingsInitialTab, showToast, themeMode } from "./stores";
import { checkActiveTabForDrift } from "./drift";
import type { DroppedNoteConflict } from "./stores";
import { invalidateDiskNotesCache, refreshAllNotesCache } from "./persistence";
import { todayISO } from "./date";
import { isValidNoteFilename } from "./noteFilename";
import {
  buildExportBundle,
  downloadExportBundle,
  parseExportBundle,
  ExportBundleError,
  type ExportBundle,
} from "./webapp/exportBundle";
import { t } from "./i18n";

export type { ExportBundle } from "./webapp/exportBundle";
export { ExportBundleError } from "./webapp/exportBundle";

/** Reads every note and triggers a browser download of the export file.
 * `config` is included for convenience (round-tripping the color/theme
 * choice) — never required on import, see `parseExportBundle`. */
export async function exportAllNotesToFile(): Promise<void> {
  const entries = await api.readAllNotes();
  const notes = Object.fromEntries(entries);
  const bundle = buildExportBundle(notes, { colorMode: get(colorMode), themeMode: get(themeMode) });
  downloadExportBundle(bundle, `chrononote-export-${todayISO()}.json`);
}

export interface ImportPreview {
  bundle: ExportBundle;
  noteCount: number;
}

/** Reads and validates a picked file without writing anything — the
 * confirmation step (counts, merge/replace choice) reads from the result
 * before `applyImport` is ever called. Throws `ExportBundleError` (with a
 * message safe to show directly) for anything that isn't a well-formed
 * export file. */
export async function readImportFile(file: File): Promise<ImportPreview> {
  const text = await file.text();
  const bundle = parseExportBundle(text);
  return { bundle, noteCount: Object.keys(bundle.notes).length };
}

/** Writes the bundle's notes through `import_notes_bundle` (real files on
 * the desktop app, IndexedDB in the web app — the command means the same
 * thing to both), then refreshes the caches that read through
 * `read_all_notes` so the date picker / Cross-Tab Search / Section
 * History all see the imported notes immediately rather than on next
 * reload. Currently open tabs are left alone — an import landing content
 * underneath an open, unsaved tab is the same class of situation §94's
 * drift detection already exists to catch on next focus, not something
 * this needs to special-case. */
export async function applyImport(bundle: ExportBundle, mode: "merge" | "replace"): Promise<void> {
  const result = await api.importNotesBundle(bundle.notes, mode);
  invalidateDiskNotesCache();
  await refreshAllNotesCache();
  const translate = get(t);
  const parts = [translate("toast.exportImport.importedNoteCount", { count: result.imported })];
  if (result.skipped > 0) parts.push(translate("toast.exportImport.skippedCount", { count: result.skipped }));
  showToast(`${parts.join(", ")}.`);
}

/** §v0.12.2 (Area 4.1): routes a dropped .json file to the safe import preview dialog. */
export async function handleDroppedBundle(file: File): Promise<void> {
  try {
    const preview = await readImportFile(file);
    pendingImportPreview.set(preview);
    settingsInitialTab.set("calendar");
    modal.set("settings");
  } catch (err) {
    showToast(err instanceof ExportBundleError ? err.message : get(t)("toast.exportImport.couldntReadExportFile", undefined));
  }
}

/** §v0.12.2 (Area 4.1): imports dropped YYYY-MM-DD.txt daily notes with collision protection.
 * Identical notes are skipped; a differing note is never written: it goes to the review dialog
 * (`DroppedNotesModal`), where the user keeps theirs, takes the dropped text, or keeps both. */
export async function handleDroppedNotes(files: File[]): Promise<void> {
  let imported = 0;
  let skipped = 0;
  let conflicts = 0;
  const held: DroppedNoteConflict[] = [];

  for (const file of files) {
    if (!isValidNoteFilename(file.name)) {
      skipped++;
      continue;
    }
    const content = await file.text();
    const existing = await api.readNote(file.name);
    if (existing === null) {
      await api.writeNote(file.name, content, undefined);
      imported++;
    } else if (existing === content) {
      skipped++;
    } else {
      held.push({ name: file.name, existing, dropped: content });
      conflicts++;
    }
  }

  invalidateDiskNotesCache();
  await refreshAllNotesCache();

  const translate = get(t);
  const parts: string[] = [];
  if (imported > 0) parts.push(translate("toast.exportImport.importedNoteCount", { count: imported }));
  if (skipped > 0) parts.push(translate("toast.exportImport.skippedCount", { count: skipped }));
  if (conflicts > 0) parts.push(translate("toast.exportImport.differsFromWhatYouHave", { count: conflicts }));
  showToast(parts.length > 0 ? `${parts.join(", ")}.` : translate("toast.exportImport.noNotesImported", undefined));
  if (held.length > 0) {
    droppedConflicts.set(held);
    modal.set("droppedNotes");
  }
}

export type DroppedResolution = "keep" | "replace" | "both";

/** Applies the user's choice for one dropped note that differs from the existing one. */
export async function resolveDroppedNote(name: string, resolution: DroppedResolution): Promise<void> {
  const item = get(droppedConflicts).find((c) => c.name === name);
  if (!item) return;
  try {
    if (resolution === "replace") {
      await api.writeNote(name, item.dropped, undefined);
    } else if (resolution === "both") {
      await api.writeNote(name, `${item.existing}

---
# Dropped copy

${item.dropped}`, undefined);
    }
  } catch (e) {
    showToast(`${get(t)("toast.exportImport.couldntSavePrefix", { name })} ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  droppedConflicts.update((list) => list.filter((c) => c.name !== name));
  if (resolution !== "keep") {
    invalidateDiskNotesCache();
    await refreshAllNotesCache();
    // The note may be open in a tab: pick the new text up (silent reload if it has no unsaved edits).
    void checkActiveTabForDrift();
  }
  if (get(droppedConflicts).length === 0 && get(modal) === "droppedNotes") modal.set("none");
}
