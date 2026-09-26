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
import { Channel, invoke } from "@tauri-apps/api/core";
import { flushAllPendingSaves } from "./persistence";
import { t } from "./i18n";
import {
  showToast,
  updateAvailableVersion,
  updateDownloadProgress,
  updateErrorDuring,
  updateErrorMessage,
  updateInstalling,
  updateLastChecked,
  updateReleaseNotes,
  updateStatus,
} from "./stores";

let pendingUpdate: Update | null = null;

/** §update-check follow-up: the exact text of the launch-time "found an
 * update" toast — `StatusBar.svelte` recognizes *this* toast specifically
 * (and renders it as a click-to-About link) without making every other
 * transient status message clickable too. i18n roadmap: both sides read
 * the same `toast.updates.updateAvailable` key rather than one shared
 * hardcoded string, so the identity check still holds once this text is
 * translated — the same reasoning as `SHORTCUT_LABEL_KEYS`/
 * `COMMAND_PALETTE_GROUP_KEYS`'s logic-vs-display split (§220/§223). */
export const UPDATE_AVAILABLE_TOAST_KEY = "toast.updates.updateAvailable" as const;

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
  updateErrorDuring.set("check");
  try {
    const result = await check();
    await pendingUpdate?.close();
    pendingUpdate = result;
    if (result) {
      updateAvailableVersion.set(result.version);
      updateReleaseNotes.set(result.body ?? null);
      updateLastChecked.set(Date.now());
      updateStatus.set("available");
    } else {
      updateAvailableVersion.set(null);
      updateReleaseNotes.set(null);
      updateLastChecked.set(Date.now());
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
    showToast(get(t)(UPDATE_AVAILABLE_TOAST_KEY, undefined));
  }
}

/** How long the installer gets to start once it's been launched. On Windows the
 * app exits the moment it has started, so still being here a minute later
 * means it never did (typically security software holding or blocking it). */
const LAUNCH_TIMEOUT_MS = 60_000;

type InstallEvent =
  | { event: "started"; data: { contentLength: number | null } }
  | { event: "progress"; data: { chunkLength: number } }
  | { event: "finished" }
  | { event: "launching" };

/** Downloads and installs the update found by the last `checkForUpdates`
 * call. Only ever called from an explicit "Download & install" click.
 *
 * Runs Rust's `install_update` (`update_install.rs`) rather than the plugin's
 * own `downloadAndInstall`: the plugin closes every window before it launches
 * the Windows installer, so when that launch fails the error has nowhere to
 * show and the app is left running without a window (seen on a laptop with
 * F-Secure). Here the window stays until the installer is really running.
 *
 * Platform note: on Windows a successful install exits the app to run the
 * installer and (by default) relaunches it automatically - this function may
 * simply never resolve because the process ends first. The `"ready"` status
 * only matters where install doesn't self-relaunch. */
export async function downloadAndInstallUpdate(): Promise<void> {
  if (!pendingUpdate) return;
  updateStatus.set("downloading");
  updateInstalling.set(false);
  updateErrorMessage.set(null);
  updateDownloadProgress.set({ doneBytes: 0, totalBytes: 0 });
  let doneBytes = 0;
  let launchTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The process exits without the window-close barrier once the installer
    // starts, so write out anything still waiting on its autosave first.
    await flushAllPendingSaves();
    await new Promise<void>((resolve, reject) => {
      const channel = new Channel<InstallEvent>();
      channel.onmessage = (e) => {
        if (e.event === "started") {
          updateDownloadProgress.set({ doneBytes: 0, totalBytes: e.data.contentLength ?? 0 });
        } else if (e.event === "progress") {
          doneBytes += e.data.chunkLength;
          updateDownloadProgress.update((p) => ({ doneBytes, totalBytes: p?.totalBytes ?? 0 }));
        } else if (e.event === "launching") {
          updateInstalling.set(true);
          launchTimer = setTimeout(
            () =>
              reject(
                new Error(
                  "The installer didn't start within a minute. Security software may be blocking it - " +
                    "download the installer from GitHub instead.",
                ),
              ),
            LAUNCH_TIMEOUT_MS,
          );
        }
      };
      invoke("install_update", { onEvent: channel }).then(() => resolve(), reject);
    });
    updateInstalling.set(false);
    updateStatus.set("ready");
  } catch (e) {
    updateInstalling.set(false);
    updateStatus.set("error");
    updateErrorDuring.set("install");
    updateErrorMessage.set(errorMessage(e));
  } finally {
    if (launchTimer) clearTimeout(launchTimer);
  }
}

/** "Restart to finish" — only needed when `downloadAndInstallUpdate`
 * actually reached `"ready"` rather than the app having already exited
 * on its own (the normal Windows path). */
export async function restartToFinishUpdate(): Promise<void> {
  await relaunch();
}
