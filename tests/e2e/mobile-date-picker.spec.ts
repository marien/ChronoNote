import { test, expect, type Page } from "@playwright/test";
import { seedApp } from "./helpers";

/** On a touch device the day the date picker opens on isn't a selection, so it isn't
 * marked - until the keyboard moves it. (Desktop keeps marking it; see navigation.spec.) */
const seed = {
  notes: { "2026-09-02.txt": "# two" },
  session: { openTabs: ["2026-09-02.txt"], activeTab: "2026-09-02.txt" },
};

const picker = (page: Page) => page.locator(".cal-grid");
const marked = (page: Page) => picker(page).locator(".cal-day.target");

async function openPicker(page: Page) {
  await seedApp(page, { seed });
  await page.getByTitle(/Open Date Note/).click();
  await expect(picker(page)).toBeVisible();
}

test.describe("date picker on a touch device", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test("opens with no day marked as selected, and stays that way across months", async ({ page }) => {
    await openPicker(page);
    await expect(marked(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(marked(page)).toHaveCount(0);
  });

  test("a day is marked once the keyboard moves it", async ({ page }) => {
    await openPicker(page);
    await picker(page).locator('.cal-day[data-iso="2026-09-02"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(marked(page)).toHaveCount(1);
    await expect(marked(page)).toHaveAttribute("data-iso", "2026-09-03");
  });

  test("typing a date marks it", async ({ page }) => {
    await openPicker(page);
    await page.locator("input").first().fill("2026-09-15");
    await expect(marked(page)).toHaveAttribute("data-iso", "2026-09-15");
  });

  test("tapping a day still opens it", async ({ page }) => {
    await openPicker(page);
    await picker(page).locator('.cal-day[data-iso="2026-09-10"]').click();
    await expect(page.locator(".mobile-active-tab")).toContainText("2026-09-10");
  });
});
