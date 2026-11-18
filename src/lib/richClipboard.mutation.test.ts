// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { htmlToNoteText } from "./richClipboard";

describe("richClipboard mutation coverage", () => {
  it("returns null when htmlToNoteText receives a non-string input at runtime", () => {
    expect(htmlToNoteText(null as unknown as string)).toBeNull();
    expect(htmlToNoteText(undefined as unknown as string)).toBeNull();
  });
});
