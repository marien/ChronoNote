import { describe, it, expect } from "vitest";
import { underlineFor, linesToSections } from "./sectionImport";

describe("underlineFor", () => {
  it("matches the header's length", () => {
    expect(underlineFor("Weekly Sync")).toBe("=".repeat("Weekly Sync".length));
  });

  it("never underlines shorter than 3 characters (Setext minimum)", () => {
    expect(underlineFor("Hi")).toBe("===");
    expect(underlineFor("")).toBe("===");
  });
});

describe("linesToSections", () => {
  it("turns each non-empty pasted line into its own section, appended to the note", () => {
    const result = linesToSections("", "Standup\nPlanning");
    expect(result).toBe("Standup\n=======\n\n\nPlanning\n========\n");
  });

  it("appends after existing content with two-blank-line spacing (spec 2.3)", () => {
    const result = linesToSections("Existing Note\n=============\nsome text", "New Section");
    expect(result).toBe("Existing Note\n=============\nsome text\n\n\nNew Section\n===========\n");
  });

  it("ignores blank lines in the pasted text", () => {
    const result = linesToSections("", "First\n\n\nSecond");
    expect(result).toBe("First\n=====\n\n\nSecond\n======\n");
  });

  it("trims each title line", () => {
    const result = linesToSections("", "  Padded Title  ");
    expect(result).toBe("Padded Title\n============\n");
  });

  it("returns the content unchanged when there's nothing to import", () => {
    expect(linesToSections("existing", "")).toBe("existing");
    expect(linesToSections("existing", "   \n\n  ")).toBe("existing");
  });

  it("trims trailing whitespace from existing content before appending", () => {
    const result = linesToSections("existing content\n\n\n\n", "New");
    expect(result).toBe("existing content\n\n\nNew\n===\n");
  });
});
