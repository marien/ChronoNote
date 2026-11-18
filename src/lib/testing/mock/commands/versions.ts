import type { MockBackend } from "../../mockBackend";
import type { CommandArgs, CommandReturn } from "../../../tauriCommands";
import { isValidNoteFilename } from "../../../noteFilename";
import { normalizeNoteText } from "../../../noteText";
import { fileMetadata } from "../seed";

export function cleanUpVersionsAndTrash(backend: MockBackend): CommandReturn<"clean_up_versions_and_trash"> {
  return backend.cleanUpVersionsAndTrash();
}

export function listTrash(backend: MockBackend): CommandReturn<"list_trash"> {
  return [...backend.trash]
    .sort((a, b) => b.deletedMs - a.deletedMs)
    .map(({ name, originalFilename, deletedMs, preview }) => ({
      name,
      originalFilename,
      deletedMs,
      preview,
    }));
}

export function restoreFromTrash(
  backend: MockBackend,
  { name }: CommandArgs<"restore_from_trash">,
): CommandReturn<"restore_from_trash"> {
  if (name.includes("/") || name.includes("\\")) throw new Error("Invalid trash name");
  const parts = name.split("_");
  if (parts.length !== 2) throw new Error("Invalid trash name");
  const [stamp, orig] = parts;
  if (!/^\d{8}-\d{6}$/.test(stamp) || !isValidNoteFilename(orig)) {
    throw new Error("Invalid trash name");
  }
  const existing = backend.dir().notes.get(orig);
  if (existing !== undefined && existing.trim().length > 0) {
    throw new Error("note-exists");
  }
  const idx = backend.trash.findIndex((item) => item.name === name);
  if (idx === -1) {
    throw new Error(`Trash item not found: ${name}`);
  }
  const [item] = backend.trash.splice(idx, 1);
  backend.dir().notes.set(orig, item.content);
  return orig;
}

export function listVersions(
  backend: MockBackend,
  { filename }: CommandArgs<"list_versions">,
): CommandReturn<"list_versions"> {
  if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
  const vers = backend.dir().versions.get(filename) ?? [];
  return vers.map(({ name, savedMs, sizeBytes }) => ({ name, savedMs, sizeBytes }));
}

export function readVersion(
  backend: MockBackend,
  { filename, name }: CommandArgs<"read_version">,
): CommandReturn<"read_version"> {
  if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
  const baseName = name.endsWith(".txt") ? name.slice(0, -4) : name;
  const vers = backend.dir().versions.get(filename) ?? [];
  const v = vers.find((x) => x.name === baseName);
  if (!v) throw new Error(`Version not found: ${name}`);
  return normalizeNoteText(v.content);
}

export async function restoreVersion(
  backend: MockBackend,
  { filename, name }: CommandArgs<"restore_version">,
): Promise<CommandReturn<"restore_version">> {
  if (!isValidNoteFilename(filename)) throw new Error(`Invalid note filename: ${filename}`);
  const baseName = name.endsWith(".txt") ? name.slice(0, -4) : name;
  const vers = backend.dir().versions.get(filename) ?? [];
  const v = vers.find((x) => x.name === baseName);
  if (!v) throw new Error(`Version not found: ${name}`);
  const current = backend.dir().notes.get(filename);
  if (current !== undefined && current.trim().length > 0) {
    backend.keepVersion(filename, current);
  }
  const restored = normalizeNoteText(v.content);
  backend.dir().notes.set(filename, restored);
  return fileMetadata(restored);
}
