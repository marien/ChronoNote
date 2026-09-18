import { test, expect } from "@playwright/test";
import { seedApp } from "./helpers";

/** §52: once the desktop tab strip overflows, ‹ › arrows scroll it (wrapping
 * at the edges). The Android branch had dropped them in favour of the
 * tabs-drawer button; desktop keeps the arrows, touch devices keep the drawer. */
async function openManyScratchpads(page: import("@playwright/test").Page, n: number) {
  for (let i = 0; i < n; i++) await page.getByTitle(/New Scratchpad/).click();
}

const scrollLeft = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.getElementById("tab-bar")!.scrollLeft);

test.describe("desktop tab strip", () => {
  test.use({ viewport: { width: 900, height: 700 } });

  test("overflowing tabs show scroll arrows that move the strip and wrap at the edges", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await expect(page.getByRole("button", { name: "Scroll tabs right" })).toHaveCount(0);

    await openManyScratchpads(page, 16);
    const right = page.getByRole("button", { name: "Scroll tabs right" });
    const left = page.getByRole("button", { name: "Scroll tabs left" });
    await expect(right).toBeVisible();
    await expect(left).toBeVisible();

    // The newest tab is active, so the strip sits at its right edge:
    // scrolling right wraps back to the start...
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0);
    await right.click();
    await expect.poll(() => scrollLeft(page)).toBe(0);
    // ...and scrolling left from the start wraps to the far end.
    await left.click();
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0);

    // No tabs-drawer button on desktop.
    await expect(page.getByRole("button", { name: /Open tabs list/ })).toHaveCount(0);
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
