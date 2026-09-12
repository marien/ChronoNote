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
import { colorMode, showToast, themeMode } from "./stores";
import { invalidateDiskNotesCache, refreshAllNotesCache } from "./persistence";
import { todayISO } from "./date";
import {
  buildExportBundle,
  downloadExportBundle,
  parseExportBundle,
  type ExportBundle,
} from "./webapp/exportBundle";

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
  const parts = [`Imported ${result.imported} note${result.imported === 1 ? "" : "s"}`];
  if (result.skipped > 0) parts.push(`skipped ${result.skipped}`);
  showToast(`${parts.join(", ")}.`);
}
