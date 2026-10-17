import { test, expect } from "@playwright/test";
import { seedApp } from "./helpers";

/** §52: once the desktop tab strip overflows, ‹ › arrows scroll it. §392: they stop at the ends, where the arrow is
 * disabled, instead of wrapping; and dragging over the tabs scrolls the strip. The Android branch had dropped the
 * arrows in favour of the tabs-drawer button; desktop keeps the arrows, touch devices keep the drawer. */
async function openManyScratchpads(page: import("@playwright/test").Page, n: number) {
  for (let i = 0; i < n; i++) await page.getByTitle(/New Scratchpad/).click();
}

const scrollLeft = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.getElementById("tab-bar")!.scrollLeft);
const setScroll = (page: import("@playwright/test").Page, where: "start" | "end") =>
  page.evaluate((w) => {
    const bar = document.getElementById("tab-bar")!;
    bar.scrollLeft = w === "start" ? 0 : bar.scrollWidth;
  }, where);

test.describe("desktop tab strip", () => {
  test.use({ viewport: { width: 900, height: 700 } });

  test("overflowing tabs show scroll arrows that stop at the ends, greyed out there", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await expect(page.getByRole("button", { name: "Scroll tabs right" })).toHaveCount(0);

    await openManyScratchpads(page, 16);
    const right = page.getByRole("button", { name: "Scroll tabs right" });
    const left = page.getByRole("button", { name: "Scroll tabs left" });
    await expect(right).toBeVisible();
    await expect(left).toBeVisible();

    // The newest tab is active and scrolled into view, a few pixels short of the very end (the strip's padding):
    // the last tab is fully visible, so right is already disabled.
    await expect(right).toBeDisabled();
    await expect(left).toBeEnabled();
    // At the very end too: right is disabled, left scrolls back.
    await setScroll(page, "end");
    await expect(right).toBeDisabled();
    await expect(left).toBeEnabled();
    const atEnd = await scrollLeft(page);
    await left.click();
    await expect.poll(() => scrollLeft(page)).toBeLessThan(atEnd);

    // At the start: left is disabled, and clicking it does not wrap to the end.
    await setScroll(page, "start");
    await expect(left).toBeDisabled();
    await expect(right).toBeEnabled();
    await left.click({ force: true });
    await page.waitForTimeout(300);
    expect(await scrollLeft(page)).toBe(0);
    await right.click();
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0);

    // No tabs-drawer button on desktop.
    await expect(page.getByRole("button", { name: /Open tabs list/ })).toHaveCount(0);
  });

  test("dragging over the tabs scrolls the strip without switching tabs; a plain click still switches", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await openManyScratchpads(page, 16);
    await setScroll(page, "start");
    const active = () => page.evaluate(() => document.querySelector("#tab-bar .tab.active")?.getAttribute("data-tab-id"));
    const before = await active();

    const first = page.locator("#tab-bar .tab").nth(1);
    const box = (await first.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(100);
    expect(await active()).toBe(before);

    // A press without movement is still a click.
    const target = page.locator("#tab-bar .tab").nth(4);
    const id = await target.getAttribute("data-tab-id");
    await target.click();
    await expect.poll(active).toBe(id);
  });
});

test.describe("touch device", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test("uses the tabs-drawer button, not the scroll arrows", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await expect(page.getByRole("button", { name: /Open tabs list/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Scroll tabs right" })).toHaveCount(0);
  });
});
