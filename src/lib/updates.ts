/** GitHub-releases update check (§update-check,
 * `docs/design/maturity-0.7-roadmap.md`). Wraps `@tauri-apps/plugin-
 * updater` (polls a signed `latest.json` manifest attached to the latest
 * GitHub release, verifies its minisign signature) and `@tauri-apps/
 * plugin-process` (relaunch, for the platforms where installing doesn't
 * already exit the app). Checking can run automatically on launch; a
 * download only ever starts from the user's own click in About or
 * Settings — never silent, never forced.
 *
 * The `Update` handle `check()` returns is a Tauri `Resource` (backed by
 * a Rust-side id) — kept in this module's own variable rather than a
 * store, which should only ever hold plain, serializable-ish state. */
import { get } from "svelte/store";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  showToast,
  updateAvailableVersion,
  updateDownloadProgress,
  updateErrorMessage,
  updateReleaseNotes,
  updateStatus,
} from "./stores";

let pendingUpdate: Update | null = null;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Runs a check and updates the stores — used by both the launch-time
 * check and every user-initiated "Check now" click. Never throws: a
 * failure lands in `updateStatus === "error"` / `updateErrorMessage`
 * rather than an unhandled rejection, since the launch call is never
 * awaited by anything that would catch it. */
export async function checkForUpdates(): Promise<void> {
  updateStatus.set("checking");
  updateErrorMessage.set(null);
  try {
    const result = await check();
    await pendingUpdate?.close();
    pendingUpdate = result;
    if (result) {
      updateAvailableVersion.set(result.version);
      updateReleaseNotes.set(result.body ?? null);
      updateStatus.set("available");
    } else {
      updateAvailableVersion.set(null);
      updateReleaseNotes.set(null);
      updateStatus.set("upToDate");
    }
  } catch (e) {
    updateStatus.set("error");
    updateErrorMessage.set(errorMessage(e));
  }
}

/** `boot.ts`'s launch-time check, gated on the `autoCheckUpdates`
 * setting. Identical to `checkForUpdates()` except it also surfaces a
 * quiet, auto-dismissing status-bar message when it finds something —
 * the one thing a purely background check needs to say out loud; "no
 * update" and a failed check both stay silent (About shows either, for
 * whoever goes looking). */
export async function checkForUpdatesOnLaunch(): Promise<void> {
  await checkForUpdates();
  if (get(updateStatus) === "available") {
    showToast("Update available — see About");
  }
}

/** Downloads and installs the update found by the last `checkForUpdates`
 * call. Only ever called from an explicit "Download & install" click.
 *
 * Platform note: on Windows, a successful install exits the app to run
 * the installer and (by default) relaunches it automatically — this
 * function may simply never resolve because the process ends first. The
 * `"ready"` status below only matters when that *doesn't* happen (a
 * platform, or an install option, where install doesn't self-relaunch). */
export async function downloadAndInstallUpdate(): Promise<void> {
  if (!pendingUpdate) return;
  updateStatus.set("downloading");
  updateDownloadProgress.set({ doneBytes: 0, totalBytes: 0 });
  let doneBytes = 0;
  try {
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") {
        updateDownloadProgress.set({ doneBytes: 0, totalBytes: event.data.contentLength ?? 0 });
      } else if (event.event === "Progress") {
        doneBytes += event.data.chunkLength;
        updateDownloadProgress.update((p) => ({ doneBytes, totalBytes: p?.totalBytes ?? 0 }));
      }
    });
    updateStatus.set("ready");
  } catch (e) {
    updateStatus.set("error");
    updateErrorMessage.set(errorMessage(e));
  }
}

/** "Restart to finish" — only needed when `downloadAndInstallUpdate`
 * actually reached `"ready"` rather than the app having already exited
 * on its own (the normal Windows path). */
export async function restartToFinishUpdate(): Promise<void> {
  await relaunch();
}
