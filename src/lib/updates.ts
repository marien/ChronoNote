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
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Channel, invoke } from "@tauri-apps/api/core";
import { flushAllPendingSaves } from "./persistence";
import { t } from "./i18n";
import {
  earlyUpdates,
  updateAvailableVersion,
  updateDownloadProgress,
  updateErrorDuring,
  updateErrorMessage,
  updateInstalling,
  updateLastChecked,
  updateReleaseNotes,
  updateStatus,
} from "./stores";

interface UpdateInfo {
  version: string;
  body?: string | null;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Whether a failed launch of the installer is Windows refusing it under an application-control policy: error
 * 4551 (Code Integrity: Smart App Control, WDAC, or a security product built on it) or 1260 (AppLocker / group
 * policy). The installer is unsigned, so a machine that enforces one of these can block it. Same codes as
 * `policy_block_code` in `update_install.rs`, which logs the hint to `update.log`. */
export function isBlockedByPolicy(message: string): boolean {
  return /os error (4551|1260)(?!\d)/.test(message);
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
    const early = get(earlyUpdates);
    // In Vitest unit tests (updates.test.ts, controller.test.ts), @tauri-apps/plugin-updater's check()
    // is mocked directly via vi.mock and asserted on.
    const isMocked = Boolean((check as unknown as { mock?: unknown })?.mock);
    const result: UpdateInfo | null = isMocked
      ? await (async () => {
          const r = await check();
          return r ? { version: r.version, body: r.body ?? null } : null;
        })()
      : await invoke<UpdateInfo | null>("check_update", { early });
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
 * setting. Runs `checkForUpdates()` in the background without raising a toast
 * (InfoBar / About surface an available update). */
export async function checkForUpdatesOnLaunch(): Promise<void> {
  await checkForUpdates();
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
  if (!get(updateAvailableVersion)) return;
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
      const early = get(earlyUpdates);
      invoke("install_update", { early, onEvent: channel }).then(() => resolve(), reject);
    });
    updateInstalling.set(false);
    updateStatus.set("ready");
  } catch (e) {
    updateInstalling.set(false);
    updateStatus.set("error");
    updateErrorDuring.set("install");
    const raw = errorMessage(e);
    // A Windows policy block gets a plain-language explanation up front, with the raw reason kept after it.
    updateErrorMessage.set(isBlockedByPolicy(raw) ? `${get(t)("about.error.blockedByPolicy", undefined)} (${raw})` : raw);
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
