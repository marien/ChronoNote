import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const updaterMock = { check: vi.fn() };
vi.mock("@tauri-apps/plugin-updater", () => updaterMock);

const processMock = { relaunch: vi.fn() };
vi.mock("@tauri-apps/plugin-process", () => processMock);

// The install itself is Rust's `install_update`, driven over a Channel.
class FakeChannel {
  onmessage: (e: unknown) => void = () => {};
}
const coreMock = { Channel: FakeChannel, invoke: vi.fn() };
vi.mock("@tauri-apps/api/core", () => coreMock);
vi.mock("./persistence", () => ({ flushAllPendingSaves: vi.fn().mockResolvedValue(undefined) }));

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

  async function withPendingUpdate() {
    updaterMock.check.mockResolvedValue(fakeUpdate());
    await updates.checkForUpdates();
  }

  it("tracks progress from the install command's events and lands on 'ready'", async () => {
    coreMock.invoke.mockImplementation(async (_cmd: string, args: { onEvent: FakeChannel }) => {
      args.onEvent.onmessage({ event: "started", data: { contentLength: 100 } });
      args.onEvent.onmessage({ event: "progress", data: { chunkLength: 60 } });
      args.onEvent.onmessage({ event: "progress", data: { chunkLength: 40 } });
      args.onEvent.onmessage({ event: "finished" });
      args.onEvent.onmessage({ event: "launching" });
    });
    await withPendingUpdate();
    await updates.downloadAndInstallUpdate();
    expect(coreMock.invoke).toHaveBeenCalledWith("install_update", expect.anything());
    expect(get(stores.updateStatus)).toBe("ready");
    expect(get(stores.updateDownloadProgress)).toEqual({ doneBytes: 100, totalBytes: 100 });
    expect(get(stores.updateInstalling)).toBe(false);
  });

  it("a failed install lands on 'error', marked as an install error, with the reason", async () => {
    coreMock.invoke.mockRejectedValue("couldn't start the installer: Access is denied. (os error 5)");
    await withPendingUpdate();
    await updates.downloadAndInstallUpdate();
    expect(get(stores.updateStatus)).toBe("error");
    expect(get(stores.updateErrorDuring)).toBe("install");
    expect(get(stores.updateErrorMessage)).toContain("Access is denied");
  });

  it("a new check clears the install-error marker", async () => {
    coreMock.invoke.mockRejectedValue("nope");
    await withPendingUpdate();
    await updates.downloadAndInstallUpdate();
    expect(get(stores.updateErrorDuring)).toBe("install");
    updaterMock.check.mockResolvedValue(null);
    await updates.checkForUpdates();
    expect(get(stores.updateErrorDuring)).toBe("check");
  });

  it("gives up if the installer is launched but the app is still here a minute later", async () => {
    vi.useFakeTimers();
    try {
      coreMock.invoke.mockImplementation(
        (_cmd: string, args: { onEvent: FakeChannel }) =>
          new Promise<void>(() => {
            args.onEvent.onmessage({ event: "launching" }); // ...and then nothing, ever
          }),
      );
      await withPendingUpdate();
      const run = updates.downloadAndInstallUpdate();
      await vi.advanceTimersByTimeAsync(60_000);
      await run;
      expect(get(stores.updateStatus)).toBe("error");
      expect(get(stores.updateErrorDuring)).toBe("install");
      expect(get(stores.updateErrorMessage)).toMatch(/didn't start within a minute/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("restartToFinishUpdate", () => {
  it("calls the process plugin's relaunch", async () => {
    processMock.relaunch.mockResolvedValue(undefined);
    await updates.restartToFinishUpdate();
    expect(processMock.relaunch).toHaveBeenCalledTimes(1);
  });
});
