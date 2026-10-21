import { describe, expect, it } from "vitest";
// @ts-expect-error node:fs has no type definitions in browser tsconfig
import { readFileSync } from "node:fs";
import { SHORTCUTS, combosForPlatform, formatCombo } from "./shortcuts";

/** The website guide (website/guide.html) lists the shortcuts by hand. It once missed several for releases on end
 * (§175): every shortcut in the registry must appear in its shortcut table, written the way the app shows it on
 * Windows (§411). The drawer has its own test (drawerRows.test.ts). */

const guide = readFileSync("website/guide.html", "utf8");
/** Keys in the guide's shortcut table rows, without spaces ("Ctrl+Shift+T"). */
const guideKeys = new Set(
  [...guide.matchAll(/<div class="shortcut-row">.*?<\/div>/g)].flatMap((row) =>
    [...row[0].matchAll(/<kbd>(.*?)<\/kbd>/g)].map((k) => k[1].replace(/\s+/g, "")),
  ),
);
/** Arrow keys as the guide writes them (the app writes "Left", "ArrowRight" or "↑"). */
const ARROWS: Record<string, string> = { Left: "←", Right: "→", Up: "↑", Down: "↓" };
const asGuideWrites = (s: string) =>
  s.replace(/\s+/g, "").replace(/\+(?:Arrow)?(Left|Right|Up|Down)$/, (_, dir: string) => `+${ARROWS[dir]}`);

describe("website guide shortcut table", () => {
  it("was found and has rows", () => {
    expect(guideKeys.size).toBeGreaterThan(20);
  });

  it("lists every shortcut in the registry (at least one of its key combinations)", () => {
    const missing = SHORTCUTS.flatMap((def) => {
      const combos = combosForPlatform(def).map((c) => asGuideWrites(formatCombo(c)));
      if (combos.length === 0) return []; // no keys on this platform
      return combos.some((c) => guideKeys.has(c)) ? [] : [`${def.id}: ${combos.join(" or ")}`];
    });
    expect(missing).toEqual([]);
  });
});
