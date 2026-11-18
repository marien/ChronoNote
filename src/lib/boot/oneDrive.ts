import { get } from "svelte/store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "../tauriApi";
import { logError } from "../appLog";
import {
  backendKind,
  chromeExpanded,
  oneDriveAccount,
  oneDriveConnecting,
  oneDriveFolder,
  oneDriveFolderPickerOpen,
  oneDriveSignInExpired,
  oneDriveSyncStatus,
  showToast,
  syncHealth,
} from "../stores";
import { refreshSyncConflicts, syncOneDriveNow } from "../oneDriveSync";
import { t } from "../i18n";
import { describeApiError } from "../apiError";

let oneDriveSyncWired = false;
let lastAutoSyncTime = 0;

export async function initOneDriveSync() {
  if (get(backendKind) !== "web") return;
  if (oneDriveSyncWired) return;
  oneDriveSyncWired = true;

  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const returnedState = urlParams.get("state") ?? undefined;
    const error = urlParams.get("error");
    const errorDescription = urlParams.get("error_description");

    if (code) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);

      oneDriveConnecting.set(true);
      void api
        .oneDriveExchangeCode(code, returnedState)
        .then(async (result) => {
          oneDriveConnecting.set(false);
          if (result.success && result.account) {
            oneDriveAccount.set(result.account);
        oneDriveSignInExpired.set(false);
            const folder = await api.oneDriveGetFolder();
            if (folder) {
              oneDriveFolder.set(folder);
              void syncOneDriveNow();
            } else {
              // Signed in but no folder yet: ask for it right away rather than
              // leaving a "Choose a folder" label for the user to find.
              oneDriveFolderPickerOpen.set(true);
            }
            showToast(
              folder ? get(t)("toast.boot.oneDrive.connected", undefined) : get(t)("toast.boot.oneDrive.connectedChooseFolder", undefined),
            );
          } else if (result.error) {
            showToast(`${get(t)("toast.boot.oneDrive.signInFailedPrefix", undefined)} ${describeApiError(result.error)}`);
          }
        })
        .catch((err) => {
          oneDriveConnecting.set(false);
          showToast(`${get(t)("toast.boot.oneDrive.signInFailedPrefix", undefined)} ${describeApiError(err)}`);
        });
    } else if (error) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);
      showToast(`${get(t)("toast.boot.oneDrive.signInErrorPrefix", undefined)} ${errorDescription || error}`);
    }
  }

  try {
    const account = await api.oneDriveGetAccount();
    if (account) {
      oneDriveAccount.set(account);
      const folder = await api.oneDriveGetFolder();
      if (folder) oneDriveFolder.set(folder);
      void syncOneDriveNow();
    }
  } catch {
    // Fail silently
  }

  // Periodic status polling (every 6 seconds). Also picks up sync conflicts
  // the engine has just held back, since the sync itself is fire-and-forget.
  setInterval(async () => {
    if (get(oneDriveAccount)) {
      try {
        const status = await api.oneDriveGetSyncStatus();
        oneDriveSyncStatus.set(status);
      } catch {}
      void refreshSyncConflicts();
      void refreshSyncHealth();
    }
  }, 6000);

  const triggerResumeSync = () => {
    if (!get(oneDriveAccount)) return;
    const now = Date.now();
    if (now - lastAutoSyncTime < 15000) return;
    lastAutoSyncTime = now;
    void syncOneDriveNow();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") triggerResumeSync();
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("focus", triggerResumeSync);
    window.addEventListener("online", triggerResumeSync);
  }
}

export async function refreshSyncHealth(): Promise<void> {
  if (get(backendKind) !== "web") return;
  try {
    const health = await api.getSyncHealth();
    syncHealth.set(health);
    // Same engine status `onedrive_get_sync_status` reports; keep the one store the UI reads current.
    oneDriveSyncStatus.set(health.status);
  } catch (err) {
    console.error("Failed to fetch sync health:", err);
    logError(`Failed to fetch sync health: ${err}`);
  }
}

/** Tracks whether the OS window is maximized or fullscreen, so the top bar
 * can show icon+label when there's room and icon-only when there isn't. */
export async function initWindowChromeWatcher() {
  const win = getCurrentWindow();
  async function refresh() {
    try {
      const [fullscreen, maximized] = await Promise.all([win.isFullscreen(), win.isMaximized()]);
      chromeExpanded.set(fullscreen || maximized);
    } catch {
      // Window introspection unavailable — keep the icon-only default.
    }
  }
  await refresh();
  await win.onResized(() => {
    refresh();
  });
}
