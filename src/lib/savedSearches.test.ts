// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";

const apiMock = {
  readSavedSearches: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
  writeSavedSearches: vi.fn<(content: string) => Promise<void>>().mockResolvedValue(undefined),
  appendLog: vi.fn().mockResolvedValue(undefined),
};
vi.mock("./tauriApi", () => apiMock);

let mod: typeof import("./savedSearches");

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  apiMock.readSavedSearches.mockResolvedValue(null);
  apiMock.writeSavedSearches.mockResolvedValue(undefined);
  mod = await import("./savedSearches");
});

describe("savedSearches", () => {
  it("parses the table cases from the spec", () => {
    expect(
      mod.parseSavedSearches(
        'has:@dana is:open\n\nsection:"design review"   is:decision\nhas:@dana  is:open\n',
      ),
    ).toEqual(["has:@dana is:open", 'section:"design review" is:decision']);

    expect(mod.parseSavedSearches("")).toEqual([]);
    expect(mod.parseSavedSearches(null)).toEqual([]);
  });

  it("normalizeQuery preserves two spaces inside section quotes while collapsing outside", () => {
    expect(mod.normalizeQuery('  section:"design  review"   is:decision  ')).toBe(
      'section:"design  review" is:decision',
    );
  });

  it("serializeSavedSearches joins lines with trailing newline", () => {
    expect(mod.serializeSavedSearches(["a", "b"])).toBe("a\nb\n");
    expect(mod.serializeSavedSearches([])).toBe("");
  });

  it("toggleSavedSearch adds, then removes", async () => {
    await mod.toggleSavedSearch("  has:@dana   is:open  ");
    expect(get(mod.savedSearches)).toEqual(["has:@dana is:open"]);
    expect(apiMock.writeSavedSearches).toHaveBeenLastCalledWith("has:@dana is:open\n");

    await mod.toggleSavedSearch("has:@dana is:open");
    expect(get(mod.savedSearches)).toEqual([]);
    expect(apiMock.writeSavedSearches).toHaveBeenLastCalledWith("");
  });

  it("adding a 31st entry drops the first (oldest) one", async () => {
    for (let i = 1; i <= 30; i++) {
      await mod.toggleSavedSearch(`q${i}`);
    }
    expect(get(mod.savedSearches)).toHaveLength(30);
    expect(get(mod.savedSearches)[0]).toBe("q1");

    await mod.toggleSavedSearch("q31");
    const list = get(mod.savedSearches);
    expect(list).toHaveLength(30);
    expect(list[0]).toBe("q2");
    expect(list[29]).toBe("q31");
  });

  it("removeSavedSearch removes a saved query and writes", async () => {
    mod.savedSearches.set(["is:open", "is:done"]);
    await mod.removeSavedSearch("is:open");
    expect(get(mod.savedSearches)).toEqual(["is:done"]);
    expect(apiMock.writeSavedSearches).toHaveBeenCalledWith("is:done\n");
  });

  it("loadSavedSearches leaves the store unchanged on read error and logs once", async () => {
    mod.savedSearches.set(["existing:query"]);
    apiMock.readSavedSearches.mockRejectedValue(new Error("read failed"));

    await mod.loadSavedSearches();
    expect(get(mod.savedSearches)).toEqual(["existing:query"]);
    expect(apiMock.appendLog).toHaveBeenCalledTimes(1);

    await mod.loadSavedSearches();
    expect(get(mod.savedSearches)).toEqual(["existing:query"]);
    expect(apiMock.appendLog).toHaveBeenCalledTimes(1);
  });
});
