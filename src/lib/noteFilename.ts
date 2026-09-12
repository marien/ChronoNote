/** Shared by every backend that has to enforce the daily-note filename
 * shape client-side (the mock and the web app's `WebBackend` — the real
 * Tauri backend enforces its own copy in `storage.rs::is_valid_note_filename`,
 * which this must stay in sync with). Exactly `YYYY-MM-DD.txt`; this is
 * both the spec's naming scheme and the path-traversal guard, since a
 * filename this rejects never reaches a `Map`/IndexedDB key or (on the
 * real backend) a joined filesystem path. */
const NOTE_FILENAME_RE = /^\d{4}-\d{2}-\d{2}\.txt$/;

export function isValidNoteFilename(name: string): boolean {
  return name.length === 14 && NOTE_FILENAME_RE.test(name);
}
