import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

vi.mock("./tauriApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tauriApi")>();
  return {
    ...actual,
    readSavedSearches: vi.fn(),
    writeSavedSearches: vi.fn(),
  };
});

import {
  normalizeQuery,
  parseSavedSearches,
  serializeSavedSearches,
  savedSearches,
  loadSavedSearches,
  toggleSavedSearch,
} from "./savedSearches";
import { readSavedSearches, writeSavedSearches } from "./tauriApi";

describe("savedSearches helpers", () => {
  it("parseSavedSearches normalizes lines, drops blanks, and deduplicates keeping first", () => {
    const input = 'has:@dana is:open\n\nsection:"design review"   is:decision\nhas:@dana  is:open\n';
    expect(parseSavedSearches(input)).toEqual([
      "has:@dana is:open",
      'section:"design review" is:decision',
    ]);
  });

  it("parseSavedSearches returns [] for empty string and null", () => {
    expect(parseSavedSearches("")).toEqual([]);
    expect(parseSavedSearches(null)).toEqual([]);
  });

  it("normalizeQuery trims and collapses whitespace outside quotes", () => {
    expect(normalizeQuery("  is:open   budget ")).toBe("is:open budget");
  });

  it("normalizeQuery preserves spaces inside quoted section terms", () => {
    expect(normalizeQuery('section:"design  review"  x')).toBe('section:"design  review" x');
  });

  it("serializeSavedSearches joins lines with a trailing newline", () => {
    expect(serializeSavedSearches(["a", "b"])).toBe("a\nb\n");
  });
});

describe("savedSearches store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedSearches.set([]);
    vi.mocked(writeSavedSearches).mockResolvedValue(undefined);
  });

  it("toggleSavedSearch adds on first call, writes the file, and removes on second call", async () => {
    await toggleSavedSearch("is:open");
    expect(get(savedSearches)).toEqual(["is:open"]);
    expect(writeSavedSearches).toHaveBeenCalledWith("is:open\n");

    await toggleSavedSearch("is:open");
    expect(get(savedSearches)).toEqual([]);
  });

  it("caps saved searches at 30 by dropping the oldest when adding a 31st", async () => {
    const initial = Array.from({ length: 30 }, (_, i) => `q${i + 1}`);
    vi.mocked(readSavedSearches).mockResolvedValueOnce(initial.join("\n") + "\n");
    await loadSavedSearches();

    await toggleSavedSearch("q31");

    const expected = Array.from({ length: 30 }, (_, i) => `q${i + 2}`);
    expect(get(savedSearches)).toEqual(expected);
  });

  it("loadSavedSearches leaves the store unchanged when reading throws", async () => {
    vi.mocked(readSavedSearches).mockResolvedValueOnce("existing\n");
    await loadSavedSearches();
    expect(get(savedSearches)).toEqual(["existing"]);

    vi.mocked(readSavedSearches).mockRejectedValueOnce(new Error("read failed"));
    await loadSavedSearches();
    expect(get(savedSearches)).toEqual(["existing"]);
  });
});
