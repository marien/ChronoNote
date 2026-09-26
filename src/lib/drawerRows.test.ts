import { describe, expect, it } from "vitest";
import { DRAWER_ROWS, SHORTCUTS, SHORTCUT_LABEL_KEYS, formatShortcut, shortcutById } from "./shortcuts";
import { en } from "./i18n/locales/en";
import type { Dictionary } from "./i18n/schema";

// i18n roadmap: `ShortcutDef` no longer carries an English `label` field
// directly — `SHORTCUT_LABEL_KEYS` maps each id (real or pseudo) to its
// translation key, so these tests read the canonical English text
// through that same lookup, the way `ShortcutsModal.svelte` does.
const enDict = en as Dictionary;
function labelTextFor(idOrPseudoId: string): string {
  return enDict[SHORTCUT_LABEL_KEYS[idOrPseudoId as keyof typeof SHORTCUT_LABEL_KEYS]](undefined as never);
}

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

  it("every registry id and pseudo-id has a translation key", () => {
    for (const row of DRAWER_ROWS) {
      const idOrPseudoId = Array.isArray(row) ? row[1] : row;
      expect(() => labelTextFor(idOrPseudoId)).not.toThrow();
    }
  });

  it("every row reads as keys plus a description (a row without keys on this platform is dropped, never shown empty)", () => {
    for (const row of DRAWER_ROWS) {
      const keys = Array.isArray(row) ? row[0] : formatShortcut(row);
      const text = labelTextFor(Array.isArray(row) ? row[1] : row);
      expect(text.length).toBeGreaterThan(5);
      if (Array.isArray(row)) expect(keys.length).toBeGreaterThan(0);
    }
  });

  it("includes Zen mode and describes the caret rule, not the old 'whole selection' wording", () => {
    expect(ids).toContain("toggleZenMode");
    expect(labelTextFor("setActionDone")).toMatch(/at the caret/);
    expect(labelTextFor("cycleLineState")).toMatch(/at the caret/);
  });
});
