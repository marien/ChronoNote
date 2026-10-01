import { test, expect } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS } from "./helpers";

/** Web/PWA only: the browser/Android Back button closes the topmost overlay
 * instead of leaving the app, and closing an overlay by hand unwinds the
 * history entry it pushed. */
test.describe("web back navigation (overlays)", () => {
  const settings = (page: import("@playwright/test").Page) => modalCard(page, MODAL_LABELS.settings);

  test("Back closes an open modal and stays in the app", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web" } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(settings(page)).toBeVisible();

    await page.goBack();
    await expect(settings(page)).toBeHidden();
    await expect(editor(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("closing with Escape unwinds the pushed entry, so a later Back doesn't hit a phantom state", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web" } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(settings(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settings(page)).toBeHidden();
    await expect.poll(() => page.evaluate(() => JSON.stringify(history.state))).not.toContain("chrononoteOverlay");

    // Reopening still works and Back still closes it.
    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(settings(page)).toBeVisible();
    await page.goBack();
    await expect(settings(page)).toBeHidden();
  });

  test("the desktop app never pushes overlay history entries", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "desktop" } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Comma");
    await expect(settings(page)).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain("chrononoteOverlay");
  });
});
