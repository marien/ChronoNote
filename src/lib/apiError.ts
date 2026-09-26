/** Multilanguage support, Phase 2 (`docs/design/i18n-roadmap.md`) —
 * translates a Rust command's structured `AppError` into a display
 * string. Only the small, deliberately growing set of codes Rust
 * actually authors itself gets a real translation here; `"other"` (the
 * overwhelming majority of failures — raw OS/network diagnostic text)
 * passes its `detail` straight through untranslated, the same
 * "translated headline, untranslated diagnostic tail" shape Phase 1's
 * toast sweep already used everywhere, for the same reason: translating
 * an OS error's or a remote server's own response text would mean either
 * inventing a generic bucket that throws away the real diagnostic detail,
 * or translating text we didn't write. A value that isn't shaped like an
 * `AppError` at all (a plain `Error`, a bare string — every call site
 * this Phase 2 batch didn't touch yet) falls back to the pre-Phase-2
 * behavior unchanged. */
import { get } from "svelte/store";
import { t } from "./i18n";
import type { AppError, FolderSwitchBlocked } from "./types";

function isAppError(e: unknown): e is AppError {
  return typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string";
}

/** Wraps any caught value into a real `AppError` — passes an already
 * `AppError`-shaped value through unchanged (the web app's own
 * `webOneDriveAuth.ts` throws these directly, to mirror `auth.rs`'s
 * codes exactly), and folds everything else (a plain `Error`, a bare
 * string, a `DOMException`) into `"other"`. Used at any boundary that
 * needs to keep returning a real `AppError` for later translation —
 * unlike `describeApiError` above, which resolves straight to display
 * text. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  return { code: "other", detail: e instanceof Error ? e.message : String(e) };
}

export function describeApiError(e: unknown): string {
  if (isAppError(e)) {
    const translate = get(t);
    switch (e.code) {
      case "agendaInvalid":
        return translate("error.agendaInvalid", undefined);
      case "oneDriveSyncBusy":
        return translate("error.oneDriveSyncBusy", undefined);
      case "oneDriveLoopbackBindFailed":
        return translate("error.oneDriveLoopbackBindFailed", { detail: e.detail });
      case "oneDriveBrowserOpenFailed":
        return translate("error.oneDriveBrowserOpenFailed", { detail: e.detail });
      case "oneDriveCallbackAcceptFailed":
        return translate("error.oneDriveCallbackAcceptFailed", { detail: e.detail });
      case "oneDriveAuthTimedOut":
        return translate("error.oneDriveAuthTimedOut", undefined);
      case "oneDriveNoAuthCode":
        return translate("error.oneDriveNoAuthCode", undefined);
      case "oneDriveNoPendingSession":
        return translate("error.oneDriveNoPendingSession", undefined);
      case "oneDriveKeychainSaveFailed":
        return translate("error.oneDriveKeychainSaveFailed", { detail: e.detail });
      case "oneDriveAuthStateSaveFailed":
        return translate("error.oneDriveAuthStateSaveFailed", { detail: e.detail });
      case "oneDriveProfileFetchFailed":
        return translate("error.oneDriveProfileFetchFailed", { detail: e.detail });
      case "oneDriveMissingRefreshTokenScope":
        return translate("error.oneDriveMissingRefreshTokenScope", undefined);
      case "oneDriveTokenRequestFailed":
        return translate("error.oneDriveTokenRequestFailed", { detail: e.detail });
      case "oneDriveTokenExchangeRejected":
        return translate("error.oneDriveTokenExchangeRejected", { detail: e.detail });
      case "oneDriveTokenResponseUnparseable":
        return translate("error.oneDriveTokenResponseUnparseable", { detail: e.detail });
      case "other":
        return e.detail;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

/** Translates `prepare_folder_switch`'s structured block reason
 * (`src-tauri/src/onedrive/mod.rs::FolderSwitchBlocked`) into the one
 * composed sentence the folder picker shows. Replaces what used to be a
 * `format!(...)`-composed English sentence on the Rust side (and a
 * matching hand-composed one in the web app's own `webOneDriveSync.ts`)
 * with real translation, including a genuinely pluralized conflict
 * count — something a flat template string could never get right in
 * Dutch/German. */
export function describeFolderSwitchBlocked(blocked: FolderSwitchBlocked): string {
  const translate = get(t);
  const reason =
    blocked.reason === "syncFailed"
      ? blocked.detail
        ? describeApiError(blocked.detail)
        : translate("oneDrivePicker.toast.syncFailedNoDetail", undefined)
      : translate("oneDrivePicker.toast.heldConflictsReason", { count: blocked.count });
  return translate("oneDrivePicker.toast.couldntSwitchBeforeSwitching", { folderPath: blocked.folderPath, reason });
}
