import { describe, expect, it } from "vitest";
import { micaWanted, resolvedDark } from "./mica";

describe("micaWanted", () => {
  const base = { backend: "desktop", win11: true, pureBlack: false, peek: false };
  it("is on in the desktop app on Windows 11", () => {
    expect(micaWanted(base)).toBe(true);
  });
  it("is off for the web app and the demo, before Windows 11, in pure black and in Peek", () => {
    expect(micaWanted({ ...base, backend: "web" })).toBe(false);
    expect(micaWanted({ ...base, backend: "demo" })).toBe(false);
    expect(micaWanted({ ...base, win11: false })).toBe(false);
    expect(micaWanted({ ...base, pureBlack: true })).toBe(false);
    expect(micaWanted({ ...base, peek: true })).toBe(false);
  });
});

describe("resolvedDark", () => {
  it("follows an explicit theme, else the OS", () => {
    expect(resolvedDark("dark", false)).toBe(true);
    expect(resolvedDark("light", true)).toBe(false);
    expect(resolvedDark("system", true)).toBe(true);
    expect(resolvedDark("system", false)).toBe(false);
  });
});
