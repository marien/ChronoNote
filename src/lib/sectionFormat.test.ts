import { describe, it, expect } from "vitest";
import { underlineFor } from "./sectionFormat";

describe("underlineFor", () => {
  it("matches the header's length", () => {
    expect(underlineFor("Weekly Sync")).toBe("=".repeat("Weekly Sync".length));
  });

  it("never underlines shorter than 3 characters (Setext minimum)", () => {
    expect(underlineFor("Hi")).toBe("===");
    expect(underlineFor("")).toBe("===");
  });
});
