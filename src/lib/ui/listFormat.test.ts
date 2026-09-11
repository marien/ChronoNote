import { describe, expect, it } from "vitest";
import { groupHeaderLabel } from "./listFormat";

describe("groupHeaderLabel (§127, finding C)", () => {
  it("strips a .txt extension and joins with a middle dot", () => {
    expect(groupHeaderLabel("2026-09-07.txt", 8)).toBe("2026-09-07  ·  8");
  });

  it("leaves a bare date (no extension) unchanged", () => {
    expect(groupHeaderLabel("2026-09-07", 1)).toBe("2026-09-07  ·  1");
  });

  it("works for a scratchpad name too", () => {
    expect(groupHeaderLabel("Scratchpad 1", 3)).toBe("Scratchpad 1  ·  3");
  });
});
