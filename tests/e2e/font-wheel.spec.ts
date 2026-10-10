import { test, expect } from "@playwright/test";
import { seedApp, editor } from "./helpers";

test.describe("Ctrl+scroll in the note changes the font size (Marien, 2026-10-10)", () => {
  test("up = bigger, down = smaller, clamped to the Settings range, saved, survives a reload", async ({ page }) => {
    await seedApp(page, { seed: "single-day" });
    const size = () => editor(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const start = await size();
    const box = (await editor(page).boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 40);

    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect.poll(size).toBe(start + 2);
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.fontSize)).toBe(start + 2);

    // Clamped at the top of the range.
    await page.keyboard.down("Control");
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect.poll(size).toBe(18);

    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 100);
    await page.keyboard.up("Control");
    await expect.poll(size).toBe(17);
    await expect.poll(() => page.evaluate(() => window.__CHRONO_MOCK__!.fontSize)).toBe(17);

    await page.reload();
    await expect.poll(size).toBe(17);

    // A plain wheel scrolls; it does not change the size.
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(500);
    expect(await size()).toBe(17);
  });
});
