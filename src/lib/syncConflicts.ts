/** OneDrive sync: notes whose local and cloud versions diverged in a
 * way the engine couldn't merge (`sync.rs` holds them back — the file is
 * neither uploaded nor overwritten until the user picks a side). The Rust
 * side owns the truth; this module just mirrors it into a store and applies
 * the user's choice. */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { checkActiveTabForDrift } from "./drift";
import { modal, showToast, syncConflicts } from "./stores";
import { refreshSyncConflicts, syncOneDriveNow } from "./oneDriveSync";
import { t } from "./i18n";
import { describeApiError } from "./apiError";
import type { SyncConflictResolution } from "./tauriCommands";

export async function openSyncConflicts(): Promise<void> {
  await refreshSyncConflicts();
  if (get(syncConflicts).length > 0) modal.set("syncConflicts");
}

/** Applies the choice, uploads the outcome, and refreshes the open note. */
export async function resolveSyncConflict(name: string, resolution: SyncConflictResolution): Promise<void> {
  try {
    await api.oneDriveResolveConflict(name, resolution);
  } catch (e) {
    showToast(get(t)("toast.syncConflicts.couldntResolvePrefix", { name, message: describeApiError(e) }));
    await refreshSyncConflicts();
    return;
  }
  await refreshSyncConflicts();
  if (get(syncConflicts).length === 0 && get(modal) === "syncConflicts") modal.set("none");
  showToast(
    get(t)(
      resolution === "theirs"
        ? "toast.syncConflicts.keptOneDriveVersion"
        : resolution === "both"
          ? "toast.syncConflicts.keptBothVersions"
          : "toast.syncConflicts.keptThisDeviceVersion",
      { name },
    ),
  );
  // "mine"/"both" now need uploading; "theirs" changed the file on disk, so
  // the open tab must pick that up (silent reload if it has no unsaved edits).
  void syncOneDriveNow();
  void checkActiveTabForDrift();
}
