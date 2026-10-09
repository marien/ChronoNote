import { describe, it, expect, vi } from "vitest";
import { pickInfoBar, type InfoBarState } from "./infoBar";

function createMockState(overrides: Partial<InfoBarState> = {}): InfoBarState {
  return {
    backendKind: "desktop",
    syncConflictsCount: 0,
    oneDriveSignInExpired: false,
    updateStatus: "idle",
    updateAvailableVersion: null,
    justUpdatedToVersion: null,
    callbacks: {
      openSyncConflicts: vi.fn(),
      signInAgain: vi.fn(),
      openAbout: vi.fn(),
      openJustUpdatedReleaseNotes: vi.fn(),
      dismissJustUpdatedNotice: vi.fn(),
    },
    translate: {
      conflictsText: (count: number) => `${count} sync conflicts`,
      resolveLabel: () => "Resolve",
      signInExpiredText: () => "Your OneDrive sign-in has expired. Click to sign in again.",
      signInAgainLabel: () => "Sign in again",
      updateAvailableText: (v: string) => `ChronoNote ${v} is available.`,
      viewUpdateLabel: () => "View update",
      updatedText: (v: string) => `Updated to ${v}.`,
      whatsNewLabel: () => "What's new",
    },
    ...overrides,
  };
}

describe("pickInfoBar", () => {
  it("returns null when no notifications are pending", () => {
    const state = createMockState();
    expect(pickInfoBar(state, new Set())).toBeNull();
  });

  it("prioritizes sync conflicts over everything else", () => {
    const state = createMockState({
      syncConflictsCount: 2,
      oneDriveSignInExpired: true,
      updateStatus: "available",
      updateAvailableVersion: "1.2.3",
      justUpdatedToVersion: "1.2.0",
    });
    const item = pickInfoBar(state, new Set());
    expect(item).not.toBeNull();
    expect(item?.key).toBe("conflicts:2");
    expect(item?.severity).toBe("warning");
    expect(item?.actionLabel).toBe("Resolve");
    expect(item?.text).toBe("2 sync conflicts");

    item?.action();
    expect(state.callbacks.openSyncConflicts).toHaveBeenCalled();
  });

  it("shows sign-in expired if conflicts are absent or dismissed", () => {
    const state = createMockState({
      syncConflictsCount: 2,
      oneDriveSignInExpired: true,
      updateStatus: "available",
      updateAvailableVersion: "1.2.3",
    });
    // With conflicts dismissed:
    const item = pickInfoBar(state, new Set(["conflicts:2"]));
    expect(item).not.toBeNull();
    expect(item?.key).toBe("signin-expired");
    expect(item?.severity).toBe("warning");
    expect(item?.actionLabel).toBe("Sign in again");

    item?.action();
    expect(state.callbacks.signInAgain).toHaveBeenCalled();
  });

  it("shows update available on desktop/demo, but not on web", () => {
    const desktopState = createMockState({
      backendKind: "desktop",
      updateStatus: "available",
      updateAvailableVersion: "1.2.3",
    });
    const desktopItem = pickInfoBar(desktopState, new Set());
    expect(desktopItem).not.toBeNull();
    expect(desktopItem?.key).toBe("update:1.2.3");
    expect(desktopItem?.severity).toBe("info");
    expect(desktopItem?.actionLabel).toBe("View update");
    expect(desktopItem?.text).toBe("ChronoNote 1.2.3 is available.");

    desktopItem?.action();
    expect(desktopState.callbacks.openAbout).toHaveBeenCalled();

    // On web, updates are skipped
    const webState = createMockState({
      backendKind: "web",
      updateStatus: "available",
      updateAvailableVersion: "1.2.3",
    });
    expect(pickInfoBar(webState, new Set())).toBeNull();

    // On demo, updates are shown
    const demoState = createMockState({
      backendKind: "demo",
      updateStatus: "available",
      updateAvailableVersion: "1.2.3",
    });
    expect(pickInfoBar(demoState, new Set())?.key).toBe("update:1.2.3");
  });

  it("shows just updated when no higher priority items exist", () => {
    const state = createMockState({
      justUpdatedToVersion: "0.30.0",
    });
    const item = pickInfoBar(state, new Set());
    expect(item).not.toBeNull();
    expect(item?.key).toBe("updated:0.30.0");
    expect(item?.severity).toBe("success");
    expect(item?.text).toBe("Updated to 0.30.0.");
    expect(item?.actionLabel).toBe("What's new");

    item?.action();
    expect(state.callbacks.openJustUpdatedReleaseNotes).toHaveBeenCalled();

    item?.onDismiss?.();
    expect(state.callbacks.dismissJustUpdatedNotice).toHaveBeenCalled();
  });

  it("returns null when all active items are dismissed", () => {
    const state = createMockState({
      syncConflictsCount: 1,
      oneDriveSignInExpired: true,
      updateStatus: "available",
      updateAvailableVersion: "1.0.0",
      justUpdatedToVersion: "0.9.0",
    });

    const dismissed = new Set(["conflicts:1", "signin-expired", "update:1.0.0", "updated:0.9.0"]);
    expect(pickInfoBar(state, dismissed)).toBeNull();
  });
});
