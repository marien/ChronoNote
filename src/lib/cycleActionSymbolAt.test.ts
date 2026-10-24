import { describe, expect, it } from "vitest";
import { cycleActionSymbolAt } from "./tokens";

describe("cycleActionSymbolAt", () => {
  it("cycles exactly the symbol at the index, forward", () => {
    const line = "# Call bank => # get quote => v send form";
    expect(cycleActionSymbolAt(line, 0)).toBe("v Call bank => # get quote => v send form");
    expect(cycleActionSymbolAt(line, line.indexOf("# get"))).toBe("# Call bank => v get quote => v send form");
    expect(cycleActionSymbolAt(line, line.indexOf("v send"))).toBe("# Call bank => # get quote => > send form");
  });

  it("cycles backwards and wraps around the order # v > x", () => {
    expect(cycleActionSymbolAt("# a", 0, -1)).toBe("x a");
    expect(cycleActionSymbolAt("x a", 0)).toBe("# a");
    expect(cycleActionSymbolAt("> a", 0, -1)).toBe("v a");
  });

  it("keeps indentation and the rest of the line", () => {
    expect(cycleActionSymbolAt("    # nested", 4)).toBe("    v nested");
  });

  it("returns null when the character is not an action symbol or out of range", () => {
    expect(cycleActionSymbolAt("# a", 1)).toBeNull();
    expect(cycleActionSymbolAt("# a", 2)).toBeNull();
    expect(cycleActionSymbolAt("# a", 9)).toBeNull();
    expect(cycleActionSymbolAt("# a", -1)).toBeNull();
  });
});
