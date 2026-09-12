import { describe, expect, it } from "vitest";
import { buildExportBundle, EXPORT_SCHEMA_VERSION, ExportBundleError, parseExportBundle } from "./exportBundle";

describe("buildExportBundle", () => {
  it("stamps the schema version and an ISO export timestamp", () => {
    const bundle = buildExportBundle({ "2026-09-12.txt": "hello" });
    expect(bundle.chrononoteExport).toBe(EXPORT_SCHEMA_VERSION);
    expect(bundle.notes).toEqual({ "2026-09-12.txt": "hello" });
    expect(() => new Date(bundle.exportedAt).toISOString()).not.toThrow();
    expect(bundle.config).toBeUndefined();
  });

  it("includes config only when given", () => {
    const bundle = buildExportBundle({}, { colorMode: "color", themeMode: "dark" });
    expect(bundle.config).toEqual({ colorMode: "color", themeMode: "dark" });
  });
});

describe("parseExportBundle", () => {
  it("round-trips a bundle built by buildExportBundle", () => {
    const built = buildExportBundle(
      { "2026-09-12.txt": "# do a thing", "2026-09-11.txt": "done" },
      { colorMode: "grayscale" },
    );
    const parsed = parseExportBundle(JSON.stringify(built));
    expect(parsed.notes).toEqual(built.notes);
    expect(parsed.config).toEqual({ colorMode: "grayscale" });
  });

  it("rejects non-JSON", () => {
    expect(() => parseExportBundle("not json")).toThrow(ExportBundleError);
  });

  it("rejects a JSON file that isn't a ChronoNote export", () => {
    expect(() => parseExportBundle(JSON.stringify({ hello: "world" }))).toThrow(ExportBundleError);
    expect(() => parseExportBundle(JSON.stringify([1, 2, 3]))).toThrow(ExportBundleError);
  });

  it("rejects a newer schema version with a specific message", () => {
    const future = { chrononoteExport: EXPORT_SCHEMA_VERSION + 1, notes: {} };
    expect(() => parseExportBundle(JSON.stringify(future))).toThrow(/newer version/);
  });

  it("rejects a bundle with no notes object", () => {
    expect(() => parseExportBundle(JSON.stringify({ chrononoteExport: 1 }))).toThrow(ExportBundleError);
    expect(() => parseExportBundle(JSON.stringify({ chrononoteExport: 1, notes: [] }))).toThrow(ExportBundleError);
  });

  it("drops non-string note values rather than throwing", () => {
    const raw = JSON.stringify({
      chrononoteExport: 1,
      notes: { "2026-09-12.txt": "kept", "2026-09-11.txt": 42 },
    });
    const parsed = parseExportBundle(raw);
    expect(parsed.notes).toEqual({ "2026-09-12.txt": "kept" });
  });

  it("tolerates a missing config and exportedAt", () => {
    const parsed = parseExportBundle(JSON.stringify({ chrononoteExport: 1, notes: {} }));
    expect(parsed.config).toBeUndefined();
    expect(() => new Date(parsed.exportedAt).toISOString()).not.toThrow();
  });
});
