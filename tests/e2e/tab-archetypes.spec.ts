import { test, expect } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

test.describe("tab archetypes (§103)", () => {
  test("daily and scratchpad tabs are visually distinct, with a group divider", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hello" } } });

    // one daily tab to start
    const daily = page.locator("#tab-bar .tab.daily");
    await expect(daily).toHaveCount(1);
    await expect(daily.locator("svg")).toBeVisible(); // calendar icon
    await expect(page.locator("#tab-bar .tab-group-divider")).toHaveCount(0);

    // add a scratchpad → divider appears between the groups
    await editor(page).click();
    await page.keyboard.press("Control+n");

    const scratch = page.locator("#tab-bar .tab.scratch");
    await expect(scratch).toHaveCount(1);
    await expect(page.locator("#tab-bar .tab-group-divider")).toHaveCount(1);
    await expect(scratch.locator(".tab-label")).toHaveText("Scratchpad 1");
    const fontStyle = await scratch.locator(".tab-label").evaluate((el) => getComputedStyle(el).fontStyle);
    expect(fontStyle).toBe("italic");

    // empty scratchpad → no unsaved dot; type something → dot appears
    await expect(scratch.locator(".tab-unsaved-dot")).toHaveCount(0);
    await editor(page).click();
    await page.keyboard.type("a thought");
    await expect(scratch.locator(".tab-unsaved-dot")).toHaveCount(1);
  });
});
