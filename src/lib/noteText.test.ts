import { describe, expect, it } from "vitest";
import { normalizeNoteText } from "./noteText";

describe("normalizeNoteText", () => {
  it("strips a BOM and converts CRLF and lone CR to LF", () => {
    expect(normalizeNoteText("﻿a\r\nb\rc")).toBe("a\nb\nc");
  });
  it("leaves plain LF text unchanged", () => {
    expect(normalizeNoteText("a\nb")).toBe("a\nb");
  });
});
