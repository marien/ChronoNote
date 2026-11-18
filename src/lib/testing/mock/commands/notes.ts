import type { MockBackend } from "../../mockBackend";
import type { CommandArgs, CommandReturn } from "../../../tauriCommands";
import { isValidNoteFilename } from "../../../noteFilename";
import { normalizeNoteText } from "../../../noteText";
import { CONFLICTS_DIRNAME, fileMetadata, sha256Hex } from "../seed";

export function listNoteFiles(backend: MockBackend): CommandReturn<"list_note_files"> {
  return backend.listFiles();
}

export function readNote(backend: MockBackend, { filename }: CommandArgs<"read_note">): CommandReturn<"read_note"> {
  if (!isValidNoteFilename(filename)) {
    throw new Error(`Invalid note filename: ${filename}`);
  }
  const raw = backend.dir().notes.get(filename);
  return raw === undefined ? null : normalizeNoteText(raw);
}

export async function writeNote(
  backend: MockBackend,
  { filename, content, expectedHash, keepVersion }: CommandArgs<"write_note">,
): Promise<CommandReturn<"write_note">> {
  if (!isValidNoteFilename(filename)) {
    throw new Error(`Invalid note filename: ${filename}`);
  }
  // §94: compare-and-swap when the caller passed the hash it last saw.
  if (typeof expectedHash === "string") {
    const current = backend.dir().notes.get(filename);
    // A missing file matches the empty-content hash, like storage.rs.
    const currentHash = await sha256Hex(current === undefined ? "" : normalizeNoteText(current));
    if (currentHash !== expectedHash) {
      throw new Error(`conflict: note changed on disk: ${filename}`);
    }
  }
  // After the compare-and-swap, as in storage.rs: a refused write keeps no version (§412).
  const existing = backend.dir().notes.get(filename);
  if (existing !== undefined && existing.trim().length > 0) {
    if (keepVersion || backend.shouldKeepVersion(filename, content, expectedHash ?? null)) {
      backend.keepVersion(filename, existing);
    }
  }
  const text = normalizeNoteText(content);
  backend.dir().notes.set(filename, text);
  if (backend.backendKind === "web") {
    if (!backend.oneDriveFolder) backend.browserNotes.set(filename, text);
    else backend.cloudNotes.set(filename, text);
  }
  return fileMetadata(text);
}

// #63: a missing file is not an error — mirrors
// `storage.rs::delete_note_at`'s own idempotent behavior.
export async function deleteNote(
  backend: MockBackend,
  { filename, expectedHash }: CommandArgs<"delete_note">,
): Promise<CommandReturn<"delete_note">> {
  if (!isValidNoteFilename(filename)) {
    throw new Error(`Invalid note filename: ${filename}`);
  }
  if (typeof expectedHash === "string") {
    const current = backend.dir().notes.get(filename);
    if (current === undefined) return;
    if ((await sha256Hex(normalizeNoteText(current))) !== expectedHash) {
      throw new Error(`conflict: note changed on disk: ${filename}`);
    }
  }
  const raw = backend.dir().notes.get(filename);
  const text = raw !== undefined ? normalizeNoteText(raw) : "";
  if (raw === undefined || text.trim().length === 0) {
    const vers = backend.dir().versions.get(filename) ?? [];
    if (vers.length > 0) {
      const newest = vers[0];
      const versionText = normalizeNoteText(newest.content);
      if (versionText.trim().length > 0) {
        const now = Date.now();
        const d = new Date(now);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        const h = String(d.getUTCHours()).padStart(2, "0");
        const min = String(d.getUTCMinutes()).padStart(2, "0");
        const s = String(d.getUTCSeconds()).padStart(2, "0");
        const stamp = `${y}${m}${day}-${h}${min}${s}`;
        const name = `${stamp}_${filename}`;
        const firstLine = versionText.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
        const preview = firstLine.slice(0, 80);
        backend.trash.push({
          name,
          originalFilename: filename,
          deletedMs: now,
          preview,
          content: versionText,
        });
      }
    }
    if (raw !== undefined) {
      backend.dir().notes.delete(filename);
      if (backend.backendKind === "web" && !backend.oneDriveFolder) backend.browserNotes.delete(filename);
    }
  } else {
    const now = Date.now();
    const d = new Date(now);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    const stamp = `${y}${m}${day}-${h}${min}${s}`;
    const name = `${stamp}_${filename}`;
    const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    const preview = firstLine.slice(0, 80);
    backend.trash.push({
      name,
      originalFilename: filename,
      deletedMs: now,
      preview,
      content: text,
    });
    backend.dir().notes.delete(filename);
    if (backend.backendKind === "web" && !backend.oneDriveFolder) backend.browserNotes.delete(filename);
  }
}

export function getFileMetadata(
  backend: MockBackend,
  { filename }: CommandArgs<"get_file_metadata">,
): Promise<CommandReturn<"get_file_metadata">> {
  if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
  return fileMetadata(backend.dir().notes.get(filename));
}

export async function readNoteWithMetadata(
  backend: MockBackend,
  { filename }: CommandArgs<"read_note_with_metadata">,
): Promise<CommandReturn<"read_note_with_metadata">> {
  if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
  const raw = backend.dir().notes.get(filename);
  const content = raw === undefined ? null : normalizeNoteText(raw);
  return { content, metadata: await fileMetadata(content ?? undefined) };
}

export function writeConflictCopy(
  backend: MockBackend,
  { name, content }: CommandArgs<"write_conflict_copy">,
): CommandReturn<"write_conflict_copy"> {
  if (!/^[A-Za-z0-9._-]+\.txt$/.test(name) || name.includes("..")) {
    throw new Error(`Invalid conflict-copy filename: ${name}`);
  }
  backend.dir().conflictCopies.set(name, content);
  return `${backend.notesDir}/${CONFLICTS_DIRNAME}/${name}`;
}

export function readAllNotes(backend: MockBackend): CommandReturn<"read_all_notes"> {
  return backend.listFiles().map((f) => [f, normalizeNoteText(backend.dir().notes.get(f) ?? "")] as [string, string]);
}

export function importNotesBundle(
  backend: MockBackend,
  { notes, mode }: CommandArgs<"import_notes_bundle">,
): CommandReturn<"import_notes_bundle"> {
  const d = backend.dir();
  let imported = 0;
  let skipped = 0;
  for (const [filename, content] of Object.entries(notes)) {
    if (!isValidNoteFilename(filename)) {
      skipped++;
      continue;
    }
    if (mode === "merge" && d.notes.has(filename)) {
      skipped++;
      continue;
    }
    if (mode === "replace" && d.notes.has(filename)) {
      const curr = d.notes.get(filename);
      if (curr && curr.trim().length > 0) {
        backend.keepVersion(filename, curr);
      }
    }
    d.notes.set(filename, normalizeNoteText(content));
    imported++;
  }
  if (mode === "replace") {
    // Only after every note is written: old notes survive a failure part-way.
    for (const name of [...d.notes.keys()]) {
      if (isValidNoteFilename(name) && !Object.prototype.hasOwnProperty.call(notes, name)) {
        const curr = d.notes.get(name);
        if (curr && curr.trim().length > 0) {
          backend.keepVersion(name, curr);
        }
        d.notes.delete(name);
      }
    }
  }
  return { imported, skipped };
}
