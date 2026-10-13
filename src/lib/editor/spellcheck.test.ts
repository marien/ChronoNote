import { describe, expect, it } from "vitest";
import { filterMisspelledRanges, SpellCache } from "./spellcheck";

describe("filterMisspelledRanges", () => {
  it("filters out all ranges on setext underline lines", () => {
    expect(filterMisspelledRanges("===", [[0, 3]])).toEqual([]);
    expect(filterMisspelledRanges("======", [[0, 4]])).toEqual([]);
  });

  it("filters out ranges overlapping assignee tokens (@teh)", () => {
    // line: "@teh hello" -> assignee is [0, 4]. "teh" is [1, 4].
    expect(filterMisspelledRanges("@teh hello", [[1, 4]])).toEqual([]);
    // but word outside assignee is kept
    expect(filterMisspelledRanges("@alice teh", [[7, 10]])).toEqual([[7, 10]]);
  });

  it("filters out ranges overlapping action, bullet, arrow, and consequence tokens", () => {
    // Action token "# " is [0, 2]
    expect(filterMisspelledRanges("# teh", [[0, 1]])).toEqual([]);
    expect(filterMisspelledRanges("# teh", [[2, 5]])).toEqual([[2, 5]]);

    // Bullet token "- " is [0, 2]
    expect(filterMisspelledRanges("- teh", [[0, 1]])).toEqual([]);

    // Arrow token "=> " is [0, 3]
    expect(filterMisspelledRanges("=> teh", [[0, 2]])).toEqual([]);

    // Consequence token "=> # " -> consequence is [3, 5]
    expect(filterMisspelledRanges("=> # teh", [[3, 4]])).toEqual([]);
  });

  it("filters out ranges overlapping topicTag tokens", () => {
    // "# (teh) text" -> topicTag is [2, 7]
    expect(filterMisspelledRanges("# (teh) text", [[3, 6]])).toEqual([]);
    // regular parens in prose are not excluded topicTags
    expect(filterMisspelledRanges("prose (teh) text", [[7, 10]])).toEqual([[7, 10]]);
  });

  it("filters out ranges overlapping URLs", () => {
    const line = "Check https://example.com/teh for details";
    // "teh" at [26, 29] overlaps the URL
    expect(filterMisspelledRanges(line, [[26, 29]])).toEqual([]);
    // "teh" outside URL is kept
    const line2 = "teh link is https://example.com";
    expect(filterMisspelledRanges(line2, [[0, 3]])).toEqual([[0, 3]]);
  });

  it("filters out ranges overlapping dates", () => {
    const line = "Meeting on 2026-10-13";
    // date is [11, 21]
    expect(filterMisspelledRanges(line, [[11, 15]])).toEqual([]);
  });

  it("filters out words containing digits", () => {
    // "teh2" has a digit
    expect(filterMisspelledRanges("teh2 wrods", [[0, 3], [5, 10]])).toEqual([[5, 10]]);
    // "2teh" has a digit
    expect(filterMisspelledRanges("2teh wrods", [[1, 4], [5, 10]])).toEqual([[5, 10]]);
  });

  it("filters out the word the caret is currently in", () => {
    const line = "teh wrods";
    // Caret at index 1 (inside "teh" [0, 3])
    expect(filterMisspelledRanges(line, [[0, 3], [4, 9]], 1)).toEqual([[4, 9]]);

    // Caret at index 3 (at the end of "teh" [0, 3] while typing)
    expect(filterMisspelledRanges(line, [[0, 3], [4, 9]], 3)).toEqual([[4, 9]]);

    // Caret at index 4 in "teh  wrods" (in spaces between words, has left "teh" and not yet in "wrods")
    expect(filterMisspelledRanges("teh  wrods", [[0, 3], [5, 10]], 4)).toEqual([[0, 3], [5, 10]]);

    // Caret at index 6 (inside "wrods" [4, 9])
    expect(filterMisspelledRanges(line, [[0, 3], [4, 9]], 6)).toEqual([[0, 3]]);

    // Caret null or undefined
    expect(filterMisspelledRanges(line, [[0, 3], [4, 9]], null)).toEqual([[0, 3], [4, 9]]);
  });

  it("keeps normal misspelled words without exclusions", () => {
    expect(filterMisspelledRanges("teh wrods mispeled sentense", [[0, 3], [4, 9], [10, 18], [19, 27]])).toEqual([
      [0, 3],
      [4, 9],
      [10, 18],
      [19, 27],
    ]);
  });
});

describe("SpellCache", () => {
  it("stores and retrieves line ranges", () => {
    const cache = new SpellCache(10);
    cache.set("line 1", [[0, 3]]);
    expect(cache.get("line 1")).toEqual([[0, 3]]);
    expect(cache.get("line 2")).toBeUndefined();
  });

  it("maintains max entries cap with LRU eviction", () => {
    const cache = new SpellCache(3);
    cache.set("a", [[0, 1]]);
    cache.set("b", [[0, 1]]);
    cache.set("c", [[0, 1]]);
    expect(cache.size).toBe(3);

    // Access "a" to make it more recently used
    expect(cache.get("a")).toEqual([[0, 1]]);

    // Insert "d" -> oldest unused entry "b" should be evicted
    cache.set("d", [[0, 1]]);
    expect(cache.size).toBe(3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.get("d")).toBeDefined();
  });

  it("clears all entries", () => {
    const cache = new SpellCache(10);
    cache.set("a", [[0, 1]]);
    cache.set("b", [[0, 1]]);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});
