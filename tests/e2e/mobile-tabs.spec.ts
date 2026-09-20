import { test, expect, type Page } from "@playwright/test";
import { seedApp } from "./helpers";

/** Phone feedback on the tabs drawer: it lists tabs in the tab bar's order, uses
 * the tab bar's colour scheme, and the active tab is always visible next to the
 * drawer button. */
const seed = {
  notes: {
    "2026-09-03.txt": "# three",
    "2026-09-01.txt": "# one",
    "2026-09-02.txt": "# two",
  },
  // Deliberately not in date order.
  session: { openTabs: ["2026-09-03.txt", "2026-09-01.txt", "2026-09-02.txt"], activeTab: "2026-09-02.txt" },
};

const drawer = (page: Page) => page.getByRole("dialog", { name: "Open tabs" });

test.describe("mobile tabs drawer", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test("lists dated tabs by date, then scratchpads", async ({ page }) => {
    await seedApp(page, { seed });
    await page.getByRole("button", { name: /^Open tabs list/ }).click();
    const names = drawer(page).locator(".drawer-tab-name");
    // (Today's note is always open too, so compare against the sorted order.)
    await expect(names.first()).toHaveText("2026-09-01");
    const shown = await names.allTextContents();
    expect(shown).toContain("2026-09-03");
    expect(shown).toEqual([...shown].sort());
  });

  test("uses the tab bar's scheme: an accent-marked active tab and tinted date icons", async ({ page }) => {
    await seedApp(page, { seed });
    await page.getByRole("button", { name: /^Open tabs list/ }).click();
    const active = drawer(page).locator(".drawer-tab-item.active");
    await expect(active).toHaveCount(1);
    await expect(active.locator(".drawer-tab-name")).toHaveText("2026-09-02");
    // Past dates are dimmed, like the tab bar's.
    const opacity = await drawer(page)
      .locator(".drawer-tab-item.past .drawer-tab-icon")
      .first()
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeLessThan(0.6);
    // The active tab carries the accent edge (box-shadow), not the old selection fill.
    const shadow = await active.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe("none");
  });

  test("the active tab is shown next to the drawer button, and follows the selection", async ({ page }) => {
    await seedApp(page, { seed });
    const chip = page.locator(".mobile-active-tab");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("2026-09-02");

    await page.getByRole("button", { name: /^Open tabs list/ }).click();
    await drawer(page).locator(".drawer-tab-item", { hasText: "2026-09-03" }).click();
    await expect(chip).toContainText("2026-09-03");

    // Tapping it opens the drawer too.
    await chip.click();
    await expect(drawer(page)).toBeVisible();
  });

  test("the top bar has room for the active tab's whole date", async ({ page }) => {
    // The mock backend is a "desktop" one and so also draws window controls (~130px) that a
    // phone browser never has; widen the viewport by that much to compare like with like.
    await page.setViewportSize({ width: 520, height: 800 });
    await seedApp(page, { seed });
    const fits = await page.evaluate(() => {
      const bar = document.getElementById("top-bar")!;
      const chip = document.querySelector<HTMLElement>(".mobile-active-tab .tab-label")!;
      return { barOverflow: bar.scrollWidth - bar.clientWidth, labelClipped: chip.scrollWidth > chip.clientWidth };
    });
    expect(fits.barOverflow).toBeLessThanOrEqual(1);
    expect(fits.labelClipped).toBe(false);
    // The buttons that no longer fit are still reachable.
    await expect(page.getByRole("button", { name: /More actions/ })).toBeVisible();
  });
});
