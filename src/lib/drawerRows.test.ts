import { describe, expect, it } from "vitest";
import { DRAWER_ROWS, SHORTCUTS, formatShortcut, shortcutById } from "./shortcuts";

/** The Shortcuts & Symbols drawer is built from `DRAWER_ROWS`; it had quietly lost Zen mode. This keeps the drawer and the
 * registry in step: every registered shortcut has a row, and every row is real. */
describe("Shortcuts & Symbols drawer rows", () => {
  const ids = DRAWER_ROWS.filter((r): r is string => typeof r === "string");

  it("has a row for every shortcut in the registry", () => {
    const missing = SHORTCUTS.map((s) => s.id).filter((id) => !ids.includes(id));
    expect(missing).toEqual([]);
  });

  it("lists nothing that is not in the registry, and nothing twice", () => {
    for (const id of ids) expect(() => shortcutById(id)).not.toThrow();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every row reads as keys plus a description (a row without keys on this platform is dropped, never shown empty)", () => {
    for (const row of DRAWER_ROWS) {
      const [keys, text] = Array.isArray(row) ? row : [formatShortcut(row), shortcutById(row).label];
      expect(text.length).toBeGreaterThan(5);
      if (Array.isArray(row)) expect(keys.length).toBeGreaterThan(0);
    }
  });

  it("includes Zen mode and describes the caret rule, not the old 'whole selection' wording", () => {
    expect(ids).toContain("toggleZenMode");
    expect(shortcutById("setActionDone").label).toMatch(/at the caret/);
    expect(shortcutById("cycleLineState").label).toMatch(/at the caret/);
  });
});
