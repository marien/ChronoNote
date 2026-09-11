import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const updaterMock = { check: vi.fn() };
vi.mock("@tauri-apps/plugin-updater", () => updaterMock);

const processMock = { relaunch: vi.fn() };
vi.mock("@tauri-apps/plugin-process", () => processMock);

let updates: typeof import("./updates");
let stores: typeof import("./stores");

type FakeUpdate = {
  version: string;
  currentVersion: string;
  body?: string;
  close: () => Promise<void>;
  downloadAndInstall: (onEvent: (e: unknown) => void) => Promise<void>;
};

function fakeUpdate(overrides: Partial<FakeUpdate> = {}): FakeUpdate {
  return {
    version: "9.9.9",
    currentVersion: "0.7.0",
    body: "Mock release notes.",
    close: vi.fn().mockResolvedValue(undefined),
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  updates = await import("./updates");
  stores = await import("./stores");
});

describe("checkForUpdates", () => {
  it("no update available -> upToDate, clears any previous version/notes", async () => {
    updaterMock.check.mockResolvedValue(null);
    await updates.checkForUpdates();
    expect(get(stores.updateStatus)).toBe("upToDate");
    expect(get(stores.updateAvailableVersion)).toBeNull();
    expect(get(stores.updateReleaseNotes)).toBeNull();
  });

  it("an update available -> available, with its version and notes", async () => {
    updaterMock.check.mockResolvedValue(fakeUpdate());
    await updates.checkForUpdates();
    expect(get(stores.updateStatus)).toBe("available");
    expect(get(stores.updateAvailableVersion)).toBe("9.9.9");
    expect(get(stores.updateReleaseNotes)).toBe("Mock release notes.");
  });

  it("a failed check lands on 'error' with a message rather than throwing", async () => {
    updaterMock.check.mockRejectedValue(new Error("network down"));
    await expect(updates.checkForUpdates()).resolves.toBeUndefined();
    expect(get(stores.updateStatus)).toBe("error");
    expect(get(stores.updateErrorMessage)).toBe("network down");
  });
});

describe("checkForUpdatesOnLaunch (§update-check: the quiet boot-time check)", () => {
  it("surfaces a status-bar message when it finds an update", async () => {
    updaterMock.check.mockResolvedValue(fakeUpdate());
    await updates.checkForUpdatesOnLaunch();
    expect(get(stores.toastMessage)).toContain("Update available");
  });

  it("stays silent when already up to date", async () => {
    updaterMock.check.mockResolvedValue(null);
    await updates.checkForUpdatesOnLaunch();
    expect(get(stores.toastMessage)).toBe("");
  });

  it("stays silent when the check fails — never interrupts startup", async () => {
    updaterMock.check.mockRejectedValue(new Error("offline"));
    await updates.checkForUpdatesOnLaunch();
    expect(get(stores.toastMessage)).toBe("");
    expect(get(stores.updateStatus)).toBe("error");
  });
});

describe("downloadAndInstallUpdate", () => {
  it("is a no-op without a pending update from an earlier check", async () => {
    await updates.downloadAndInstallUpdate();
    expect(get(stores.updateStatus)).toBe("idle");
  });

  it("tracks progress from the update's own events and lands on 'ready'", async () => {
    const update = fakeUpdate({
      downloadAndInstall: vi.fn(async (onEvent: (e: unknown) => void) => {
        onEvent({ event: "Started", data: { contentLength: 100 } });
        onEvent({ event: "Progress", data: { chunkLength: 60 } });
        onEvent({ event: "Progress", data: { chunkLength: 40 } });
        onEvent({ event: "Finished" });
      }),
    });
    updaterMock.check.mockResolvedValue(update);
    await updates.checkForUpdates();
    await updates.downloadAndInstallUpdate();
    expect(get(stores.updateStatus)).toBe("ready");
    expect(get(stores.updateDownloadProgress)).toEqual({ doneBytes: 100, totalBytes: 100 });
  });

  it("a failed install lands on 'error' with a message", async () => {
    const update = fakeUpdate({ downloadAndInstall: vi.fn().mockRejectedValue(new Error("disk full")) });
    updaterMock.check.mockResolvedValue(update);
    await updates.checkForUpdates();
    await updates.downloadAndInstallUpdate();
    expect(get(stores.updateStatus)).toBe("error");
    expect(get(stores.updateErrorMessage)).toBe("disk full");
  });
});

describe("restartToFinishUpdate", () => {
  it("calls the process plugin's relaunch", async () => {
    processMock.relaunch.mockResolvedValue(undefined);
    await updates.restartToFinishUpdate();
    expect(processMock.relaunch).toHaveBeenCalledTimes(1);
  });
});
