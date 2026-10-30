import { describe, it, expect, vi } from "vitest";
import { pickInfoBar, type InfoBarState } from "./infoBar";

export interface PhoneInfoBarState extends InfoBarState {
  phoneConflictsCount: number;
  callbacks: InfoBarState["callbacks"] & {
    openPhoneChanges: () => void;
  };
  translate: InfoBarState["translate"] & {
    phoneConflictsText: (count: number) => string;
    reviewLabel: () => string;
  };
}

function createPhoneMockState(overrides: Partial<PhoneInfoBarState> = {}): PhoneInfoBarState {
  return {
    backendKind: "desktop",
    syncConflictsCount: 0,
    phoneConflictsCount: 0,
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
      openPhoneChanges: vi.fn(),
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
      phoneConflictsText: (count: number) =>
        count === 1 ? "1 change from your phone needs a look." : `${count} changes from your phone need a look.`,
      reviewLabel: () => "Review",
    },
    ...overrides,
  };
}

describe("pickInfoBar - phone conflicts", () => {
  it("never shows phone conflicts notice when phoneConflictsCount is 0", () => {
    const state = createPhoneMockState({ phoneConflictsCount: 0 });
    expect(pickInfoBar(state, new Set())).toBeNull();
  });

  it("shows phone conflicts notice with severity warning and Review action when phoneConflictsCount > 0", () => {
    const state = createPhoneMockState({ phoneConflictsCount: 1 });
    const item = pickInfoBar(state, new Set());

    expect(item).not.toBeNull();
    expect(item?.key).toBe("phone-conflicts:1");
    expect(item?.severity).toBe("warning");
    expect(item?.text).toBe("1 change from your phone needs a look.");
    expect(item?.actionLabel).toBe("Review");

    item?.action();
    expect(state.callbacks.openPhoneChanges).toHaveBeenCalled();
  });

  it("includes the count in the item key and text for multiple conflicts", () => {
    const state = createPhoneMockState({ phoneConflictsCount: 4 });
    const item = pickInfoBar(state, new Set());

    expect(item).not.toBeNull();
    expect(item?.key).toBe("phone-conflicts:4");
    expect(item?.text).toBe("4 changes from your phone need a look.");
  });

  it("yields to sync conflicts when both are present (sync conflicts win)", () => {
    const state = createPhoneMockState({
      syncConflictsCount: 2,
      phoneConflictsCount: 3,
    });
    const item = pickInfoBar(state, new Set());

    expect(item).not.toBeNull();
    expect(item?.key).toBe("conflicts:2");
    expect(item?.actionLabel).toBe("Resolve");
  });

  it("shows phone conflicts when sync conflicts are dismissed", () => {
    const state = createPhoneMockState({
      syncConflictsCount: 2,
      phoneConflictsCount: 3,
    });
    const item = pickInfoBar(state, new Set(["conflicts:2"]));

    expect(item).not.toBeNull();
    expect(item?.key).toBe("phone-conflicts:3");
    expect(item?.actionLabel).toBe("Review");
  });

  it("prioritizes phone conflicts over OneDrive sign-in expired", () => {
    const state = createPhoneMockState({
      phoneConflictsCount: 1,
      oneDriveSignInExpired: true,
    });
    const item = pickInfoBar(state, new Set());

    expect(item).not.toBeNull();
    expect(item?.key).toBe("phone-conflicts:1");
    expect(item?.actionLabel).toBe("Review");
  });

  it("shows OneDrive sign-in expired when phone conflicts are dismissed", () => {
    const state = createPhoneMockState({
      phoneConflictsCount: 1,
      oneDriveSignInExpired: true,
    });
    const item = pickInfoBar(state, new Set(["phone-conflicts:1"]));

    expect(item).not.toBeNull();
    expect(item?.key).toBe("signin-expired");
    expect(item?.actionLabel).toBe("Sign in again");
  });

  it("prioritizes phone conflicts over update available", () => {
    const state = createPhoneMockState({
      backendKind: "desktop",
      phoneConflictsCount: 1,
      updateStatus: "available",
      updateAvailableVersion: "1.2.3",
    });
    const item = pickInfoBar(state, new Set());

    expect(item).not.toBeNull();
    expect(item?.key).toBe("phone-conflicts:1");
    expect(item?.actionLabel).toBe("Review");
  });

  it("shows update available when phone conflicts are dismissed", () => {
    const state = createPhoneMockState({
      backendKind: "desktop",
      phoneConflictsCount: 1,
      updateStatus: "available",
      updateAvailableVersion: "1.2.3",
    });
    const item = pickInfoBar(state, new Set(["phone-conflicts:1"]));

    expect(item).not.toBeNull();
    expect(item?.key).toBe("update:1.2.3");
    expect(item?.actionLabel).toBe("View update");
  });

  it("prioritizes phone conflicts over just updated notice", () => {
    const state = createPhoneMockState({
      phoneConflictsCount: 1,
      justUpdatedToVersion: "0.35.0",
    });
    const item = pickInfoBar(state, new Set());

    expect(item).not.toBeNull();
    expect(item?.key).toBe("phone-conflicts:1");
    expect(item?.actionLabel).toBe("Review");
  });

  it("shows just updated notice when phone conflicts are dismissed", () => {
    const state = createPhoneMockState({
      phoneConflictsCount: 1,
      justUpdatedToVersion: "0.35.0",
    });
    const item = pickInfoBar(state, new Set(["phone-conflicts:1"]));

    expect(item).not.toBeNull();
    expect(item?.key).toBe("updated:0.35.0");
    expect(item?.actionLabel).toBe("What's new");
  });

  it("returns null when phone conflicts is the only item and its key is in dismissed", () => {
    const state = createPhoneMockState({ phoneConflictsCount: 1 });
    expect(pickInfoBar(state, new Set(["phone-conflicts:1"]))).toBeNull();
  });
});
