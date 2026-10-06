import { describe, expect, it } from "vitest";
import { PEEK_DEFAULTS, PEEK_MAX_FADE_SECONDS, clampPeek } from "./peekDefaults";

describe("Peek defaults", () => {
  it("starts in focus at 100%, fades to 80% after 5 seconds", () => {
    expect(PEEK_DEFAULTS.opacityHover).toBe(100);
    expect(PEEK_DEFAULTS.opacity).toBe(80);
    expect(PEEK_DEFAULTS.fadeSeconds).toBe(5);
  });
  it("keeps the fade time and both opacities in range (0 = never fade)", () => {
    expect(clampPeek({ ...PEEK_DEFAULTS, fadeSeconds: -3 }).fadeSeconds).toBe(0);
    expect(clampPeek({ ...PEEK_DEFAULTS, fadeSeconds: 9999 }).fadeSeconds).toBe(PEEK_MAX_FADE_SECONDS);
    expect(clampPeek({ ...PEEK_DEFAULTS, fadeSeconds: 0 }).fadeSeconds).toBe(0);
    expect(clampPeek({ ...PEEK_DEFAULTS, opacityHover: 5 }).opacityHover).toBe(20);
    expect(clampPeek({ ...PEEK_DEFAULTS, opacity: 500 }).opacity).toBe(100);
  });
});
