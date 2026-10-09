/** §B2/§B3: the reworked title bar — a + split button right after the tabs, icon-only commands with an
 * always-present More menu, and the optional friendly tab labels. */
import { test, expect } from "@playwright/test";
import { seedApp, todayFilename } from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

test.describe("title bar (§B2/§B3)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("the + button sits directly right of the last tab when there are few tabs", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hi" } } });
    const lastTab = page.locator("#tab-bar .tab").last();
    const plus = page.locator(".tab-bar-split");
    await expect(plus).toBeVisible();
    const t = (await lastTab.boundingBox())!;
    const p = (await plus.boundingBox())!;
    // Next to it, not pushed to the far end of the bar.
    expect(p.x - (t.x + t.width)).toBeGreaterThanOrEqual(-1);
    expect(p.x - (t.x + t.width)).toBeLessThan(24);
  });

  test("the + menu offers New scratchpad, Open date and Reopen closed tab; Open date opens the date picker", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hi" } } });
    await page.getByRole("button", { name: "New…" }).click();
    const items = page.getByRole("menuitem");
    await expect(items.filter({ hasText: /New scratchpad/i })).toBeVisible();
    await expect(items.filter({ hasText: /dated note/i })).toBeVisible();
    await expect(items.filter({ hasText: /Reopen/i })).toBeVisible();
    await items.filter({ hasText: /dated note/i }).click();
    await expect(page.locator(".datepicker-pop")).toBeVisible();
  });

  test("More always lists Settings, Shortcuts & symbols, Zen mode and About", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.getByTitle("More actions").click();
    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu.getByRole("menuitem", { name: /^Settings/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Shortcuts/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Zen mode/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /About ChronoNote/ })).toBeVisible();
  });

  test("Friendly tab labels: today's tab reads Today, the ISO date is its tooltip, and the choice survives a reload", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hi" } } });
    const label = page.locator("#tab-bar .tab.active .tab-label");
    await expect(label).toHaveText(REFERENCE_TODAY);

    await page.keyboard.press("ControlOrMeta+Comma");
    await page.getByRole("radio", { name: "Friendly", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(label).toHaveText("Today");
    await expect(page.locator("#tab-bar .tab.active")).toHaveAttribute("title", new RegExp(REFERENCE_TODAY));

    await page.reload();
    await expect(page.locator("#tab-bar .tab.active .tab-label")).toHaveText("Today");
  });
});
