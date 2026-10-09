import { describe, expect, it } from "vitest";
import { lineKind } from "./lineKind";

describe("lineKind", () => {
  it("classifies action tokens as action", () => {
    expect(lineKind("# open task")).toBe("action");
    expect(lineKind("v completed task")).toBe("action");
    expect(lineKind("> deferred task")).toBe("action");
    expect(lineKind("x cancelled task")).toBe("action");
  });

  it("classifies consequence actions (=> followed by action token) as action", () => {
    expect(lineKind("=> # follow-up action")).toBe("action");
    expect(lineKind("=> v follow-up done")).toBe("action");
    expect(lineKind("=> > follow-up deferred")).toBe("action");
    expect(lineKind("=> x follow-up cancelled")).toBe("action");
  });

  it("classifies topic tokens as topic", () => {
    expect(lineKind("o topic to discuss")).toBe("topic");
    expect(lineKind(". discussed topic")).toBe("topic");
    expect(lineKind(", skipped topic")).toBe("topic");
  });

  it("classifies indented lines correctly", () => {
    expect(lineKind("  # indented open task")).toBe("action");
    expect(lineKind("    v indented completed task")).toBe("action");
    expect(lineKind("\t> tab indented deferred task")).toBe("action");
    expect(lineKind("  => # indented consequence action")).toBe("action");
    expect(lineKind("   => x indented consequence action")).toBe("action");
    expect(lineKind("  o indented topic")).toBe("topic");
    expect(lineKind("    . indented discussed topic")).toBe("topic");
    expect(lineKind("\t, tab indented skipped topic")).toBe("topic");
  });

  it("classifies hashtags and other non-delimited tokens as plain", () => {
    expect(lineKind("#hashtag")).toBe("plain");
    expect(lineKind("  #tag")).toBe("plain");
    expect(lineKind("xMark")).toBe("plain");
    expect(lineKind("v1.0")).toBe("plain");
  });

  it("classifies lone symbols without trailing whitespace as plain", () => {
    expect(lineKind("o")).toBe("plain");
    expect(lineKind("#")).toBe("plain");
    expect(lineKind(".")).toBe("plain");
    expect(lineKind(",")).toBe("plain");
    expect(lineKind("  o")).toBe("plain");
  });

  it("classifies plain text, empty string, bullets, and non-action arrows as plain", () => {
    expect(lineKind("")).toBe("plain");
    expect(lineKind("   ")).toBe("plain");
    expect(lineKind("regular text line")).toBe("plain");
    expect(lineKind("- bullet item")).toBe("plain");
    expect(lineKind("=> note without action")).toBe("plain");
    expect(lineKind("=> @person delegation")).toBe("plain");
    expect(lineKind("! emphasis text")).toBe("plain");
  });

  it("handles discussed topic with dot followed by space", () => {
    expect(lineKind(". discussed")).toBe("topic");
    expect(lineKind("  . discussed")).toBe("topic");
  });
});
