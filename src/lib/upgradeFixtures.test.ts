import { describe, it, expect, vi } from "vitest";
// @ts-expect-error node:fs has no type definitions in browser tsconfig
import * as fs from "node:fs";
// @ts-expect-error node:path has no type definitions in browser tsconfig
import * as path from "node:path";
import { WebBackend } from "./webapp/webBackend";

describe("upgrade fixtures - web backend config handling", () => {
  const fixturesDir = path.resolve("src-tauri/tests/fixtures");

  vi.stubGlobal("indexedDB", {
    open: () => ({ onsuccess: null, onerror: null, onupgradeneeded: null, result: {} }),
  });

  const backend = Object.create(WebBackend.prototype) as WebBackend;
  backend.appVersion = "0.30.0";
  (backend as any).getActiveWorkspace = async () => "browser";

  it("loads v0.20.0 config fixture and preserves every field", async () => {
    const rawPath = path.join(fixturesDir, "v0.20.0/config.json");
    const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8"));

    const cfg = await (backend as any).toAppConfig(raw);

    // Stored fields from v0.20.0 fixture must all survive
    expect(cfg.colorMode).toBe(raw.colorMode);
    expect(cfg.themeMode).toBe(raw.themeMode);
    expect(cfg.languageMode).toBe(raw.languageMode);
    expect(cfg.wordWrap).toBe(raw.wordWrap);
    expect(cfg.readableLineLength).toBe(raw.readableLineLength);
    expect(cfg.autoCheckUpdates).toBe(raw.autoCheckUpdates);
    expect(cfg.lastSeenVersion).toBe(raw.lastSeenVersion);
    expect(cfg.calendarSyncEnabled).toBe(raw.calendarSyncEnabled);
    expect(cfg.fontSize).toBe(raw.fontSize);
    expect(cfg.lineHeight).toBe(raw.lineHeight);
    expect(cfg.pureBlack).toBe(raw.pureBlack);
    expect(cfg.onboardingCompleted).toBe(raw.onboardingCompleted);

    // Schema and later defaults
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.startupTabMode).toBe("today");
    expect(cfg.occurrenceHint).toBe(false);
    expect(cfg.statusBarVisible).toBe(true);
    expect(cfg.tabLabelStyle).toBe("iso");
    expect(cfg.earlyUpdates).toBe(false);
    expect(cfg.historyPaneShare).toBe(0.30);
    expect(cfg.actionsPaneShare).toBe(0.30);
    expect(cfg.notesDir).toBe("Browser storage");
  });

  it("loads v0.25.0 config fixture and preserves every field including peek", async () => {
    const rawPath = path.join(fixturesDir, "v0.25.0/config.json");
    const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8"));

    const cfg = await (backend as any).toAppConfig(raw);

    expect(cfg.colorMode).toBe(raw.colorMode);
    expect(cfg.themeMode).toBe(raw.themeMode);
    expect(cfg.languageMode).toBe(raw.languageMode);
    expect(cfg.wordWrap).toBe(raw.wordWrap);
    expect(cfg.readableLineLength).toBe(raw.readableLineLength);
    expect(cfg.autoCheckUpdates).toBe(raw.autoCheckUpdates);
    expect(cfg.lastSeenVersion).toBe(raw.lastSeenVersion);
    expect(cfg.calendarSyncEnabled).toBe(raw.calendarSyncEnabled);
    expect(cfg.fontSize).toBe(raw.fontSize);
    expect(cfg.lineHeight).toBe(raw.lineHeight);
    expect(cfg.pureBlack).toBe(raw.pureBlack);
    expect(cfg.onboardingCompleted).toBe(raw.onboardingCompleted);
    expect(cfg.startupTabMode).toBe(raw.startupTabMode);
    expect(cfg.occurrenceHint).toBe(raw.occurrenceHint);
    expect(cfg.peek).toEqual(raw.peek);

    // Defaults for fields added in v0.30.0
    expect(cfg.statusBarVisible).toBe(true);
    expect(cfg.tabLabelStyle).toBe("iso");
    expect(cfg.earlyUpdates).toBe(false);
  });

  it("loads v0.30.0 config fixture and preserves every field", async () => {
    const rawPath = path.join(fixturesDir, "v0.30.0/config.json");
    const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8"));

    const cfg = await (backend as any).toAppConfig(raw);

    expect(cfg.colorMode).toBe(raw.colorMode);
    expect(cfg.themeMode).toBe(raw.themeMode);
    expect(cfg.languageMode).toBe(raw.languageMode);
    expect(cfg.wordWrap).toBe(raw.wordWrap);
    expect(cfg.readableLineLength).toBe(raw.readableLineLength);
    expect(cfg.autoCheckUpdates).toBe(raw.autoCheckUpdates);
    expect(cfg.lastSeenVersion).toBe(raw.lastSeenVersion);
    expect(cfg.calendarSyncEnabled).toBe(raw.calendarSyncEnabled);
    expect(cfg.fontSize).toBe(raw.fontSize);
    expect(cfg.lineHeight).toBe(raw.lineHeight);
    expect(cfg.pureBlack).toBe(raw.pureBlack);
    expect(cfg.onboardingCompleted).toBe(raw.onboardingCompleted);
    expect(cfg.startupTabMode).toBe(raw.startupTabMode);
    expect(cfg.occurrenceHint).toBe(raw.occurrenceHint);
    expect(cfg.peek).toEqual(raw.peek);
    expect(cfg.statusBarVisible).toBe(raw.statusBarVisible);
    expect(cfg.tabLabelStyle).toBe(raw.tabLabelStyle);
    expect(cfg.historyPaneShare).toBe(raw.historyPaneShare);
    expect(cfg.actionsPaneShare).toBe(raw.actionsPaneShare);
    expect(cfg.earlyUpdates).toBe(false);
  });

  it("migrates legacy colorMode to color", async () => {
    const rawPath = path.join(fixturesDir, "v0.20.0/config.json");
    const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
    const legacy = { ...raw, colorMode: "legacy" };

    const cfg = await (backend as any).toAppConfig(legacy);
    expect(cfg.colorMode).toBe("color");
  });
});
