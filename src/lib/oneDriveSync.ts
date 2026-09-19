/** Android OneDrive sync, from the UI's side: one place that starts a sync,
 * tracks that one is running (`oneDriveSyncing` drives the spinner in the
 * status bar and Settings), reports the outcome when the user asked for it,
 * and refreshes the list of held conflicts afterwards. Every caller —
 * Settings' "Sync now", picking a folder, launch, returning to the app,
 * saving a note — goes through `syncOneDriveNow` so none of them can run
 * silently. Deliberately imports nothing that imports `persistence.ts`
 * (which is itself a caller). */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { oneDriveFolder, oneDriveSyncing, showToast, syncConflicts } from "./stores";
import { checkActiveTabForDrift } from "./drift";
import { refreshAgendaFileExists } from "./calendarSyncActions";

export type SyncHooks = {
  flushPendingSaves?: () => Promise<void>;
  invalidateCache?: () => void;
};

let syncHooks: SyncHooks = {};

export function registerSyncHooks(hooks: SyncHooks) {
  syncHooks = { ...syncHooks, ...hooks };
}

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

let inFlight: Promise<void> | null = null;
let announce = false;

/** Runs a sync (or joins the one already running). `notify` says the user
 * asked for it, so the outcome is reported in the status bar; background
 * syncs stay quiet unless something goes wrong. */
export function syncOneDriveNow(opts: { notify?: boolean } = {}): Promise<void> {
  if (!get(oneDriveFolder)) {
    // Nothing to sync with yet — say so instead of failing inside Rust.
    if (opts.notify) showToast("Choose a OneDrive folder first (Settings → Browse…)");
    return Promise.resolve();
  }
  if (opts.notify) announce = true;
  if (inFlight) return inFlight;

  oneDriveSyncing.set(true);
  inFlight = (async () => {
    try {
      if (syncHooks.flushPendingSaves) {
        await syncHooks.flushPendingSaves();
      }
      const result = await api.oneDriveSyncNow();
      await refreshSyncConflicts();
      syncHooks.invalidateCache?.();
      void checkActiveTabForDrift();
      void refreshAgendaFileExists();
      if (announce) {
        showToast(result.success ? "OneDrive sync finished" : `OneDrive sync failed: ${result.message ?? "unknown error"}`);
      }
    } catch (e) {
      if (announce) showToast(`OneDrive sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      announce = false;
      inFlight = null;
      oneDriveSyncing.set(false);
    }
  })();
  return inFlight;
}
