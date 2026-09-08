import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, toast } from "./helpers";

/** §78 / §83 — F2 / Shift+F2 jump the cursor between open actions in the
 * current note, wrapping at the ends. The scan/wrap logic is unit-tested
 * in tokens.test.ts (`adjacentOpenActionLine`); this checks the keymap
 * wiring and that the cursor actually lands where expected. */
async function cursorLine(page: import("@playwright/test").Page): Promise<number> {
  // Status bar reads "Ln N, Col C" (1-based).
  const t = (await page.locator("#stat-pos").textContent()) ?? "";
  return Number(t.match(/Ln\s+(\d+)/)?.[1] ?? 0);
}

const NOTE = [
  "Weekly review", // 1
  "=============", // 2
  "# renew the cert", // 3
  "- some notes", // 4
  "v shipped the docs", // 5
  "  # follow up with Dana", // 6 (indented open)
  "plain prose here", // 7
  "Talked to Sam => # loop back next week", // 8 (consequence open)
  "> deferred item", // 9
].join("\n");

test.describe("open-action navigation (F2 / Shift+F2)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, NOTE);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home"); // cursor to line 1
  });

  test("F2 walks forward through the open actions and wraps", async ({ page }) => {
    await page.keyboard.press("F2");
    expect(await cursorLine(page)).toBe(3); // # renew the cert
    await page.keyboard.press("F2");
    expect(await cursorLine(page)).toBe(6); // indented # follow up
    await page.keyboard.press("F2");
    expect(await cursorLine(page)).toBe(8); // => # consequence action
    await page.keyboard.press("F2");
    expect(await cursorLine(page)).toBe(3); // wrapped back to the first
  });

  test("Shift+F2 walks backward through the open actions and wraps", async ({ page }) => {
    await page.keyboard.press("Shift+F2");
    expect(await cursorLine(page)).toBe(8); // wraps to the last open action
    await page.keyboard.press("Shift+F2");
    expect(await cursorLine(page)).toBe(6);
    await page.keyboard.press("Shift+F2");
    expect(await cursorLine(page)).toBe(3);
  });

  test("skips resolved actions (v / x / >) and non-action lines", async ({ page }) => {
    // From line 5 (`v shipped`), forward should skip to line 6, not stop on 5.
    await page.keyboard.press("F2"); // -> 3
    await page.keyboard.press("F2"); // -> 6
    expect(await cursorLine(page)).toBe(6);
  });

  test("toast when the note has no open actions", async ({ page }) => {
    await setEditorText(page, "v done\n> deferred\njust notes");
    await editor(page).click();
    await page.keyboard.press("F2");
    await expect(toast(page)).toContainText(/no open actions/i);
  });

  test("Ctrl+↓ no longer runs the jump — three presses don't land on the last action", async ({ page }) => {
    // The old binding did line 1 → 3 → 6 → 8. Ctrl+↓ is unbound now, so
    // whatever the browser does with it, we should not end up on line 8.
    await page.keyboard.press("Control+ArrowDown");
    await page.keyboard.press("Control+ArrowDown");
    await page.keyboard.press("Control+ArrowDown");
    expect(await cursorLine(page)).not.toBe(8);
  });
});
