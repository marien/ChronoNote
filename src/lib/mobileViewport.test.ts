import { describe, it, expect } from "vitest";
import { keyboardHeight } from "./mobileViewport";

describe("keyboardHeight", () => {
  it("is 0 when the visual viewport is the full window", () => {
    expect(keyboardHeight(800, 800)).toBe(0);
  });
  it("ignores small changes (browser chrome showing or hiding)", () => {
    expect(keyboardHeight(800, 740)).toBe(0);
  });
  it("reports the height a keyboard takes", () => {
    expect(keyboardHeight(800, 480)).toBe(320);
  });
});

describe("shouldApplyMobileDefaults (via mobileViewport)", () => {
  it("exports and evaluates mobile defaults decision", async () => {
    const { shouldApplyMobileDefaults } = await import("./mobileViewport");
    expect(shouldApplyMobileDefaults({ wordWrap: false, fontSize: 13 }, true, "web", false)).toBe(true);
    expect(shouldApplyMobileDefaults({ wordWrap: false, fontSize: 13 }, true, "desktop", false)).toBe(false);
  });
});

