import { describe, it, expect } from "vitest";
import { e2ePort, e2eReuse } from "./e2ePort";

describe("e2ePort and e2eReuse", () => {
  it("uses explicit E2E_PORT in 1024..65535 without reusing a server", () => {
    const env = { E2E_PORT: "1437" };
    expect(e2ePort("C:\\a\\ChronoNote", env)).toBe(1437);
    expect(e2eReuse(env)).toBe(false);
  });

  it("uses 1420 and reuses a running server when E2E_REUSE=1 outside CI", () => {
    const env = { E2E_REUSE: "1" };
    expect(e2ePort("C:\\a\\ChronoNote", env)).toBe(1420);
    expect(e2eReuse(env)).toBe(true);
  });

  it("uses 1420 without reusing a server when E2E_REUSE=1 and CI=true", () => {
    const env = { E2E_REUSE: "1", CI: "true" };
    expect(e2ePort("C:\\a\\ChronoNote", env)).toBe(1420);
    expect(e2eReuse(env)).toBe(false);
  });

  it("derives a fixed port in 1500..1899 for a folder and does not reuse", () => {
    const first = e2ePort("C:\\a\\ChronoNote", {});
    const second = e2ePort("C:\\a\\ChronoNote", {});
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(1500);
    expect(first).toBeLessThanOrEqual(1899);
    expect(second).toBe(first);
    expect(e2eReuse({})).toBe(false);
  });

  it("treats case and slash style identically when deriving a port", () => {
    expect(e2ePort("c:/a/chrononote", {})).toBe(e2ePort("C:\\a\\ChronoNote", {}));
    expect(e2eReuse({})).toBe(false);
  });

  it("derives a different port for a distinct folder name", () => {
    const basePort = e2ePort("C:\\a\\ChronoNote", {});
    const otherPort = e2ePort("C:\\a\\ChronoNote-x", {});
    expect(otherPort).toBeGreaterThanOrEqual(1500);
    expect(otherPort).toBeLessThanOrEqual(1899);
    expect(otherPort).not.toBe(basePort);
    expect(e2eReuse({})).toBe(false);
  });

  it("falls through to the derived port when E2E_PORT is invalid or out of range", () => {
    const derived = e2ePort("C:\\a\\ChronoNote", {});
    expect(e2ePort("C:\\a\\ChronoNote", { E2E_PORT: "abc" })).toBe(derived);
    expect(e2ePort("C:\\a\\ChronoNote", { E2E_PORT: "80" })).toBe(derived);
    expect(e2eReuse({ E2E_PORT: "abc" })).toBe(false);
    expect(e2eReuse({ E2E_PORT: "80" })).toBe(false);
  });
});
