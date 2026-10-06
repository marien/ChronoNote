import { describe, expect, it } from "vitest";
import { PEEK_DEFAULTS, PEEK_MAX_FADE_SECONDS, clampPeek } from "./peekDefaults";

describe("Peek defaults", () => {
  it("starts in focus at 95%, fades to 50% after 3 seconds", () => {
    expect(PEEK_DEFAULTS.opacityHover).toBe(95);
    expect(PEEK_DEFAULTS.opacity).toBe(50);
    expect(PEEK_DEFAULTS.fadeSeconds).toBe(3);
  });
  it("keeps the fade time and both opacities in range (0 = never fade)", () => {
    expect(clampPeek({ ...PEEK_DEFAULTS, fadeSeconds: -3 }).fadeSeconds).toBe(0);
    expect(clampPeek({ ...PEEK_DEFAULTS, fadeSeconds: 9999 }).fadeSeconds).toBe(PEEK_MAX_FADE_SECONDS);
    expect(clampPeek({ ...PEEK_DEFAULTS, fadeSeconds: 0 }).fadeSeconds).toBe(0);
    expect(clampPeek({ ...PEEK_DEFAULTS, opacityHover: 5 }).opacityHover).toBe(20);
    expect(clampPeek({ ...PEEK_DEFAULTS, opacity: 500 }).opacity).toBe(100);
  });
});
