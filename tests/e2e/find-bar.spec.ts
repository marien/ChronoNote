import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, todayFilename, activeTabContent } from "./helpers";

const NOTE = "alpha beta alpha\ngamma alpha delta\nalpha omega";

test.describe("in-document find bar (Ctrl+F, §108)", () => {
  test("opens on Ctrl+F, counts matches, and navigates with Enter / Shift+Enter", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: NOTE } } });
    await editor(page).click();
    await page.keyboard.press("Control+f");

    const bar = page.locator(".find-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator(".find-input")).toBeFocused();

    await bar.locator(".find-input").fill("alpha");
    await expect(bar.locator(".find-count")).toHaveText("1 of 4");
    await expect(page.locator(".cm-searchMatch")).toHaveCount(4);

    await page.keyboard.press("Enter");
    await expect(bar.locator(".find-count")).toHaveText("2 of 4");
    await page.keyboard.press("Enter");
    await expect(bar.locator(".find-count")).toHaveText("3 of 4");
    await page.keyboard.press("Shift+Enter");
    await expect(bar.locator(".find-count")).toHaveText("2 of 4");
  });

  test("the editor stays live while the bar is open", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "editable text" } } });
    await editor(page).click();
    await page.keyboard.press("Control+f");
    await page.locator(".find-input").fill("text");

    // click back into the document and type — no modal is blocking it
    await editor(page).click();
    await page.keyboard.type("!!!");
    expect(await activeTabContent(page)).toContain("!!!");
    await expect(page.locator(".find-bar")).toBeVisible();
  });

  test("no results reads clearly; Escape closes and clears the highlights", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: NOTE } } });
    await editor(page).click();
    await page.keyboard.press("Control+f");
    await page.locator(".find-input").fill("zzznope");
    await expect(page.locator(".find-count")).toHaveText("No results");

    await page.locator(".find-input").fill("alpha");
    await expect(page.locator(".cm-searchMatch")).toHaveCount(4);
    await page.keyboard.press("Escape");
    await expect(page.locator(".find-bar")).toBeHidden();
    await expect(page.locator(".cm-searchMatch")).toHaveCount(0);
  });

  test("switching tabs closes the bar", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: NOTE } } });
    await editor(page).click();
    await page.keyboard.press("Control+f");
    await expect(page.locator(".find-bar")).toBeVisible();

    await page.keyboard.press("Control+n"); // new scratchpad
    await expect(page.locator(".find-bar")).toBeHidden();
  });
});
