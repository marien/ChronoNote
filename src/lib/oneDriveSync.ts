/** OneDrive sync, from the UI's side: one place that starts a sync,
 * tracks that one is running (`oneDriveSyncing` drives the spinner in the
 * status bar and Settings), reports the outcome when the user asked for it,
 * and refreshes the list of held conflicts afterwards. Every caller —
 * Settings' "Sync now", picking a folder, launch, returning to the app,
 * saving a note — goes through `syncOneDriveNow` so none of them can run
 * silently. Deliberately imports nothing that imports `persistence.ts`
 * (which is itself a caller). */
import { get } from "svelte/store";
import * as api from "./tauriApi";
import { oneDriveAccount, oneDriveConnecting, oneDriveFolder, oneDriveSignInExpired, oneDriveSyncing, showToast, syncConflicts } from "./stores";
import { SIGN_IN_EXPIRED_MESSAGE } from "./signInExpired";
import { checkActiveTabForDrift } from "./drift";
import { refreshAgendaFileExists } from "./calendarSyncActions";
import { t } from "./i18n";
import { describeApiError } from "./apiError";

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
    if (opts.notify) showToast(get(t)("toast.oneDriveSync.chooseFolderFirst", undefined));
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
      if (result.success) oneDriveSignInExpired.set(false);
      // The web app's own sync engine reports an expired sign-in as a plain
      // `AppError.Other` carrying this exact text (its refresh token isn't
      // renewable) — Rust's own sync never produces it.
      else if (result.message?.code === "other" && result.message.detail === SIGN_IN_EXPIRED_MESSAGE)
        oneDriveSignInExpired.set(true);
      await refreshSyncConflicts();
      syncHooks.invalidateCache?.();
      void checkActiveTabForDrift();
      void refreshAgendaFileExists();
      if (announce) {
        showToast(
          result.success
            ? get(t)("toast.oneDriveSync.syncFinished", undefined)
            : get(t)("toast.oneDriveSync.syncFailedPrefix", {
                message: result.message ? describeApiError(result.message) : "unknown error",
              }),
        );
      }
    } catch (e) {
      if (announce) showToast(get(t)("toast.oneDriveSync.syncFailedPrefix", { message: describeApiError(e) }));
    } finally {
      announce = false;
      inFlight = null;
      oneDriveSyncing.set(false);
    }
  })();
  return inFlight;
}

/** Starts a new sign-in for an account whose sign-in expired. Nothing is signed out and no notes or
 * settings are touched: the folder, the local copy and the sync bookkeeping all stay, so the next sync
 * simply continues. Pending edits are saved first because the web app leaves the page to sign in. */
export async function signInAgain(): Promise<void> {
  try {
    await syncHooks.flushPendingSaves?.();
  } catch {
    /* saving is best effort here; the notes are already in local storage */
  }
  try {
    const res = await api.oneDriveLogin();
    if (res.success && res.account) {
      oneDriveAccount.set(res.account);
      oneDriveSignInExpired.set(false);
      void syncOneDriveNow({ notify: true });
    } else if (res.pending) {
      oneDriveConnecting.set(true); // the browser (or, on the web, this page) is going to Microsoft
    } else if (res.error) {
      showToast(get(t)("toast.oneDriveSync.couldntStartSignInPrefix", { message: describeApiError(res.error) }));
    }
  } catch (e) {
    showToast(
      get(t)("toast.oneDriveSync.couldntStartSignInPrefix", {
        message: describeApiError(e),
      }),
    );
  }
}
