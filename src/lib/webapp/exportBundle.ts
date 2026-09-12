/** The export/import file format from `docs/design/webapp-roadmap.md` —
 * a single JSON file, chosen over a `.zip` of raw `.txt` files for
 * simplicity (no compression library needed), while the `notes` map
 * stays one script away from becoming a real folder of files if anyone
 * ever wants to hand-migrate without the app's own importer.
 *
 * Pure and backend-agnostic on purpose: used by the web app (export from
 * / import into IndexedDB, via `WebBackend`) and by the desktop app's own
 * "Import notes from a file" Settings entry (import into real files, via
 * `import_notes_bundle`) — neither this module nor the file format itself
 * knows or cares which backend consumes it. */
import type { ColorMode, ThemeMode } from "../types";

export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportBundle {
  chrononoteExport: number;
  exportedAt: string;
  notes: Record<string, string>;
  config?: { colorMode?: ColorMode; themeMode?: ThemeMode };
}

export function buildExportBundle(
  notes: Record<string, string>,
  config?: { colorMode?: ColorMode; themeMode?: ThemeMode },
): ExportBundle {
  return {
    chrononoteExport: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    notes,
    ...(config ? { config } : {}),
  };
}

/** Thrown with a message specific enough to show the user directly
 * (e.g. in an import confirmation's error state) rather than a generic
 * "invalid file". */
export class ExportBundleError extends Error {}

/** Validates just enough structure to safely proceed — every actual note
 * filename is re-validated again at write time by
 * `import_notes_bundle`/`WebBackend` regardless, so this isn't the
 * security boundary, just an honest "is this even the right kind of
 * file" check before showing an import preview. */
export function parseExportBundle(raw: string): ExportBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ExportBundleError("Not a valid JSON file.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ExportBundleError("Not a ChronoNote export file.");
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.chrononoteExport !== "number") {
    throw new ExportBundleError("Not a ChronoNote export file.");
  }
  if (obj.chrononoteExport > EXPORT_SCHEMA_VERSION) {
    throw new ExportBundleError(
      `This file was exported by a newer version of ChronoNote (format ${obj.chrononoteExport}) — update the app to import it.`,
    );
  }
  if (typeof obj.notes !== "object" || obj.notes === null || Array.isArray(obj.notes)) {
    throw new ExportBundleError("This export file has no notes in it.");
  }
  const notes: Record<string, string> = {};
  for (const [filename, content] of Object.entries(obj.notes as Record<string, unknown>)) {
    if (typeof content === "string") notes[filename] = content;
  }
  const config =
    typeof obj.config === "object" && obj.config !== null
      ? (obj.config as { colorMode?: ColorMode; themeMode?: ThemeMode })
      : undefined;
  return {
    chrononoteExport: obj.chrononoteExport,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : new Date(0).toISOString(),
    notes,
    ...(config ? { config } : {}),
  };
}

/** Triggers a browser download of `bundle` — a real webpage, not a
 * sandboxed context, so a plain `Blob` + temporary `<a download>` works
 * normally (see the design doc's export section). */
export function downloadExportBundle(bundle: ExportBundle, filename: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
