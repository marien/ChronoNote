import { describe, it, expect } from "vitest";
// @ts-expect-error node:fs has no type definitions in browser tsconfig
import * as fs from "node:fs";
// @ts-expect-error node:path has no type definitions in browser tsconfig
import * as path from "node:path";
import { CONFIG_SCHEMA_VERSION, isFromNewerApp } from "./configSchema";

describe("configSchema", () => {
  it("Rust constant CONFIG_SCHEMA_VERSION equals the TypeScript constant", () => {
    const storageRsPath = path.resolve("src-tauri/src/storage.rs");
    const contents = fs.readFileSync(storageRsPath, "utf-8");
    const match = contents.match(/CONFIG_SCHEMA_VERSION:\s*u32\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const rustVersion = Number(match![1]);
    expect(rustVersion).toBe(CONFIG_SCHEMA_VERSION);
  });

  it("isFromNewerApp returns true only when schemaVersion > CONFIG_SCHEMA_VERSION", () => {
    expect(isFromNewerApp(undefined)).toBe(false);
    expect(isFromNewerApp(0)).toBe(false);
    expect(isFromNewerApp(CONFIG_SCHEMA_VERSION)).toBe(false);
    expect(isFromNewerApp(CONFIG_SCHEMA_VERSION - 1)).toBe(false);
    expect(isFromNewerApp(CONFIG_SCHEMA_VERSION + 1)).toBe(true);
    expect(isFromNewerApp(99)).toBe(true);
  });
});
