import { writable, get } from "svelte/store";
import type { TrashItem } from "./generated/tauri-types";
import { listTrash, restoreFromTrash } from "./tauriApi";
import { showToast } from "./stores";
import { invalidateDiskNotesCache, refreshAllNotesCache } from "./persistence";
import { openOrCreateDatedFile } from "./tabs";
import { t } from "./i18n";

export const trashItems = writable<TrashItem[]>([]);

export async function loadTrash(): Promise<void> {
  try {
    const items = await listTrash();
    trashItems.set(items);
  } catch (err) {
    console.error("Failed to load trash:", err);
    trashItems.set([]);
  }
}

export async function restoreTrashItem(name: string): Promise<void> {
  try {
    const filename = await restoreFromTrash(name);
    showToast(get(t)("toast.trash.restored", { filename }));
    invalidateDiskNotesCache();
    await refreshAllNotesCache();
    const dateStr = filename.replace(/\.txt$/, "");
    await openOrCreateDatedFile(dateStr);
    await loadTrash();
  } catch (err: unknown) {
    const msg = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
    if (msg.includes("note-exists")) {
      const parts = name.split("_");
      const filename = parts.length > 1 ? parts.slice(1).join("_") : name;
      showToast(get(t)("toast.trash.noteExists", { filename }));
    } else {
      console.error("Failed to restore note from trash:", err);
    }
  }
}
