import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const apiMock = {
  appendLog: vi.fn().mockResolvedValue(undefined),
  readLogTail: vi.fn().mockResolvedValue("mock log line 1\nmock log line 2"),
};
vi.mock("./tauriApi", () => apiMock);

let appLog: typeof import("./appLog");
let stores: typeof import("./stores");

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  appLog = await import("./appLog");
  stores = await import("./stores");
});

describe("appLog", () => {
  it("buildDiagnostics contains the version and the log tail", async () => {
    stores.appVersion.set("0.30.4");
    apiMock.readLogTail.mockResolvedValue("sample-tail-entry");

    const diag = await appLog.buildDiagnostics();
    expect(diag).toContain("ChronoNote version: 0.30.4");
    expect(diag).toContain("sample-tail-entry");
    expect(apiMock.readLogTail).toHaveBeenCalledWith(100);
  });

  it("the error handler shows the message only once within a minute (fake timers)", () => {
    vi.useFakeTimers();
    try {
      appLog.installErrorReporting();
      stores.toastMessage.set("");

      // Trigger first error
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("err1"), message: "err1" }));
      const firstMessage = get(stores.toastMessage);
      expect(firstMessage).not.toBe("");
      expect(apiMock.appendLog).toHaveBeenCalledWith("ERROR", expect.stringContaining("err1"));

      // Clear toast to observe if second error updates it
      stores.toastMessage.set("");

      // Trigger second error within 60s
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("err2"), message: "err2" }));
      expect(get(stores.toastMessage)).toBe("");
      expect(apiMock.appendLog).toHaveBeenCalledWith("ERROR", expect.stringContaining("err2"));

      // Advance by 60 seconds
      vi.advanceTimersByTime(60_000);

      // Trigger third error after 60s
      window.dispatchEvent(new ErrorEvent("error", { error: new Error("err3"), message: "err3" }));
      expect(get(stores.toastMessage)).toBe(firstMessage);
      expect(apiMock.appendLog).toHaveBeenCalledWith("ERROR", expect.stringContaining("err3"));
    } finally {
      vi.useRealTimers();
    }
  });
});
