/** Mac keyboard shortcuts (`shortcuts.ts`/`platform.ts`) — CI runs headless
 * Chromium on Windows/Linux, so "being on a Mac" is emulated by overriding
 * `navigator.platform` before the app's scripts ever run (`isMac` is a
 * module-level constant, computed once at import time). Playwright's own
 * `Meta+`/`Control+` key-press tokens set real `metaKey`/`ctrlKey` on the
 * synthetic event regardless of the host OS, so this genuinely exercises
 * the app's platform-branching logic, not just its non-Mac path.
 *
 * Matching is strict by design (`shortcuts.ts`'s `matchesCombo`): a
 * shortcut only fires with the platform-correct modifier, so every "works"
 * assertion here has a matching "the other platform's modifier does
 * nothing" assertion right next to it. */
import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS } from "./helpers";

async function emulateMac(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // `platform.ts` checks `userAgentData.platform` first, falling back to
    // the older `navigator.platform` — Chromium's `userAgentData` reports
    // the *real* host OS regardless of the legacy property, so it has to
    // be overridden too or it silently wins over the override below.
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    if ("userAgentData" in navigator) {
      Object.defineProperty(navigator, "userAgentData", { get: () => ({ platform: "macOS" }) });
    }
  });
}

test.describe("Mac keyboard shortcuts — Cmd works, Ctrl doesn't", () => {
  test("Cmd+K opens the command palette; Ctrl+K does nothing", async ({ page }) => {
    await emulateMac(page);
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();

    await page.keyboard.press("Control+k");
    await expect(modalCard(page, MODAL_LABELS.commandPalette)).toBeHidden();

    await page.keyboard.press("Meta+k");
    await expect(modalCard(page, MODAL_LABELS.commandPalette)).toBeVisible();
  });

  test("Cmd+, opens Settings; Ctrl+, does nothing", async ({ page }) => {
    await emulateMac(page);
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();

    await page.keyboard.press("Control+Comma");
    await expect(modalCard(page, MODAL_LABELS.settings)).toBeHidden();

    await page.keyboard.press("Meta+Comma");
    await expect(modalCard(page, MODAL_LABELS.settings)).toBeVisible();
  });

  test("Cmd+Shift+A opens Actions; Ctrl+Shift+A does nothing", async ({ page }) => {
    await emulateMac(page);
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();

    await page.keyboard.press("Control+Shift+A");
    await expect(modalCard(page, MODAL_LABELS.actions)).toBeHidden();

    await page.keyboard.press("Meta+Shift+A");
    await expect(modalCard(page, MODAL_LABELS.actions)).toBeVisible();
  });

  test("editor-level Cmd+Enter cycles the action state; Ctrl+Space does nothing (OS-reserved on Mac)", async ({
    page,
  }) => {
    await emulateMac(page);
    await seedApp(page, { seed: { notes: {}, session: null } });
    await editor(page).click();
    await page.keyboard.type("# a task");
    await page.keyboard.press("Home");

    await page.keyboard.press("Control+Space");
    await expect(editor(page)).toContainText("a task"); // unchanged — still "# " (open)
    await expect(editor(page).locator(".glyph-open")).toHaveCount(1);

    await page.keyboard.press("Meta+Enter");
    await expect(editor(page).locator(".glyph-done")).toHaveCount(1);
  });

  test("§145: Cmd+Shift+Enter cycles backwards; Ctrl+Shift+Space does nothing on Mac", async ({ page }) => {
    await emulateMac(page);
    await seedApp(page, { seed: { notes: {}, session: null } });
    await editor(page).click();
    await page.keyboard.type("# a task");
    await page.keyboard.press("Home");

    await page.keyboard.press("Control+Shift+Space");
    await expect(editor(page).locator(".glyph-open")).toHaveCount(1); // unchanged

    await page.keyboard.press("Meta+Shift+Enter");
    await expect(editor(page).locator(".glyph-cancelled")).toHaveCount(1); // # -> x, the reverse step
  });

  test("Shortcuts drawer shows Cmd, not Ctrl, and drops the Windows/Linux-only caret-nav row", async ({ page }) => {
    await emulateMac(page);
    await seedApp(page, { seed: "busy-week" });
    await page.keyboard.press("Meta+Slash");
    const drawer = modalCard(page, MODAL_LABELS.shortcuts);
    await expect(drawer).toBeVisible();

    await expect(drawer.getByText("Cmd+K", { exact: false })).toBeVisible();
    await expect(drawer.getByText("Cmd+Shift+A", { exact: false })).toBeVisible();
    // Win/Linux-only — no Mac binding exists, so the row is dropped rather
    // than shown with a combo that wouldn't actually work.
    await expect(drawer.getByText("Caret to start of line", { exact: false })).toHaveCount(0);
    // No stray literal "Ctrl" left anywhere in the drawer's shortcut list.
    await expect(drawer.locator(".shortcuts-list").first().getByText(/Ctrl/)).toHaveCount(0);
  });
});
