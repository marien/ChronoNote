import { afterEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import {
  oneDriveSignInExpired,
  oneDriveSyncing,
  oneDriveSyncState,
  oneDriveSyncStateOf,
  oneDriveSyncStatus,
} from "./stores";

describe("oneDriveSyncStateOf", () => {
  it("passes the engine status through when nothing else applies", () => {
    expect(oneDriveSyncStateOf(false, false, "idle")).toBe("idle");
    expect(oneDriveSyncStateOf(false, false, "offline")).toBe("offline");
    expect(oneDriveSyncStateOf(false, false, "error")).toBe("error");
    expect(oneDriveSyncStateOf(false, false, "syncing")).toBe("syncing");
  });

  it("a running sync wins over the last reported status", () => {
    expect(oneDriveSyncStateOf(false, true, "idle")).toBe("syncing");
    expect(oneDriveSyncStateOf(false, true, "offline")).toBe("syncing");
    expect(oneDriveSyncStateOf(false, true, "error")).toBe("syncing");
  });

  it("an expired sign-in wins over everything", () => {
    expect(oneDriveSyncStateOf(true, true, "syncing")).toBe("signInExpired");
    expect(oneDriveSyncStateOf(true, false, "idle")).toBe("signInExpired");
    expect(oneDriveSyncStateOf(true, false, "error")).toBe("signInExpired");
  });
});

describe("oneDriveSyncState store", () => {
  afterEach(() => {
    oneDriveSignInExpired.set(false);
    oneDriveSyncing.set(false);
    oneDriveSyncStatus.set("idle");
  });

  it("follows its three source stores", () => {
    expect(get(oneDriveSyncState)).toBe("idle");
    oneDriveSyncStatus.set("offline");
    expect(get(oneDriveSyncState)).toBe("offline");
    oneDriveSyncing.set(true);
    expect(get(oneDriveSyncState)).toBe("syncing");
    oneDriveSignInExpired.set(true);
    expect(get(oneDriveSyncState)).toBe("signInExpired");
  });
});
