/** Android OneDrive sync: notes whose phone and cloud versions diverged in a
 * way the engine couldn't merge (`sync.rs` holds them back — the file is
 * neither uploaded nor overwritten until the user picks a side). The Rust
 * side owns the truth; this module just mirrors it into a store and applies
 * the user's choice. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { checkActiveTabForDrift } from "./drift";
import { modal, showToast, syncConflicts } from "./stores";
import type { SyncConflictResolution } from "./tauriCommands";

/** Re-reads the held conflicts. Cheap (one small JSON read), so it's safe to
 * call after every sync and on the status poll. Never throws. */
export async function refreshSyncConflicts(): Promise<void> {
  try {
    const next = await api.oneDriveGetConflicts();
    const prev = get(syncConflicts);
    // Skip identical results so the status chip doesn't re-render every poll.
    if (JSON.stringify(prev) !== JSON.stringify(next)) syncConflicts.set(next);
  } catch {
    /* not on a backend that has this (or transient) — leave as is */
  }
}

export async function openSyncConflicts(): Promise<void> {
  await refreshSyncConflicts();
  if (get(syncConflicts).length > 0) modal.set("syncConflicts");
}

/** Applies the choice, uploads the outcome, and refreshes the open note. */
export async function resolveSyncConflict(name: string, resolution: SyncConflictResolution): Promise<void> {
  try {
    await api.oneDriveResolveConflict(name, resolution);
  } catch (e) {
    showToast(`Couldn't resolve ${name}: ${e instanceof Error ? e.message : String(e)}`);
    await refreshSyncConflicts();
    return;
  }
  await refreshSyncConflicts();
  if (get(syncConflicts).length === 0 && get(modal) === "syncConflicts") modal.set("none");
  showToast(
    resolution === "theirs"
      ? `Kept the OneDrive version of ${name}`
      : resolution === "both"
        ? `Kept both versions of ${name}`
        : `Kept this device's version of ${name}`,
  );
  // "mine"/"both" now need uploading; "theirs" changed the file on disk, so
  // the open tab must pick that up (silent reload if it has no unsaved edits).
  void api.oneDriveSyncNow().then(() => refreshSyncConflicts()).catch(() => {});
  void checkActiveTabForDrift();
}
