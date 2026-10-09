export interface InfoBarItem {
  key: string;
  severity: "info" | "success" | "warning" | "error";
  text: string;
  actionLabel: string;
  action: () => void;
  onDismiss?: () => void;
}

export interface InfoBarState {
  backendKind: string;
  syncConflictsCount: number;
  oneDriveSignInExpired: boolean;
  updateStatus: string;
  updateAvailableVersion: string | null;
  justUpdatedToVersion: string | null;
  callbacks: {
    openSyncConflicts: () => void;
    signInAgain: () => void;
    openAbout: () => void;
    openJustUpdatedReleaseNotes: () => void;
    dismissJustUpdatedNotice: () => void;
  };
  translate: {
    conflictsText: (count: number) => string;
    resolveLabel: () => string;
    signInExpiredText: () => string;
    signInAgainLabel: () => string;
    updateAvailableText: (version: string) => string;
    viewUpdateLabel: () => string;
    updatedText: (version: string) => string;
    whatsNewLabel: () => string;
  };
}

/**
 * Pure function choosing the ONE message to show in the InfoBar, in priority order:
 * 1. Sync conflicts (warning, "Resolve" -> openSyncConflicts)
 * 2. Sign-in expired (warning, "Sign in again" -> signInAgain)
 * 3. Update available on desktop/demo only, not web (info, "View update" -> modal.set("about"))
 * 4. Just updated (success, "What's new" -> openJustUpdatedReleaseNotes, dismiss also calls dismissJustUpdatedNotice)
 *
 * An item whose key is in `dismissed` is skipped.
 */
export function pickInfoBar(state: InfoBarState, dismissed: ReadonlySet<string>): InfoBarItem | null {
  // 1. Sync conflicts
  if (state.syncConflictsCount > 0) {
    const key = `conflicts:${state.syncConflictsCount}`;
    if (!dismissed.has(key)) {
      return {
        key,
        severity: "warning",
        text: state.translate.conflictsText(state.syncConflictsCount),
        actionLabel: state.translate.resolveLabel(),
        action: state.callbacks.openSyncConflicts,
      };
    }
  }

  // 2. Sign-in expired
  if (state.oneDriveSignInExpired) {
    const key = "signin-expired";
    if (!dismissed.has(key)) {
      return {
        key,
        severity: "warning",
        text: state.translate.signInExpiredText(),
        actionLabel: state.translate.signInAgainLabel(),
        action: state.callbacks.signInAgain,
      };
    }
  }

  // 3. Update available (desktop / demo only, not web)
  if (
    state.backendKind !== "web" &&
    state.updateStatus === "available" &&
    state.updateAvailableVersion
  ) {
    const key = `update:${state.updateAvailableVersion}`;
    if (!dismissed.has(key)) {
      return {
        key,
        severity: "info",
        text: state.translate.updateAvailableText(state.updateAvailableVersion),
        actionLabel: state.translate.viewUpdateLabel(),
        action: state.callbacks.openAbout,
      };
    }
  }

  // 4. Just updated
  if (state.justUpdatedToVersion) {
    const key = `updated:${state.justUpdatedToVersion}`;
    if (!dismissed.has(key)) {
      return {
        key,
        severity: "success",
        text: state.translate.updatedText(state.justUpdatedToVersion),
        actionLabel: state.translate.whatsNewLabel(),
        action: state.callbacks.openJustUpdatedReleaseNotes,
        onDismiss: state.callbacks.dismissJustUpdatedNotice,
      };
    }
  }

  return null;
}
