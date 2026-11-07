import { test, expect, type Page } from "@playwright/test";
import { seedApp } from "./helpers";

/** §450: the due item in the status bar starts with the due date's flag, drawn in the same box as the action
 * squares in front of the other counts (size, baseline, gap to the label), coloured by the most pressing part. */
const today = "2026-09-07";

async function seed(page: Page, body: string) {
  await seedApp(page, {
    now: new Date(`${today}T09:00:00`),
    seed: { notes: { [`${today}.txt`]: `Work\n====\n${body}` }, session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` } },
  });
  await expect(page.locator("#stat-due")).toBeVisible();
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const box = q("#stat-open .stat-glyph");
    const flag = q("#stat-due .stat-due-flag");
    return {
      box: { w: box.width, h: box.height, bottom: box.bottom, gap: q("#stat-open .stat-full").left - box.right },
      flag: { w: flag.width, h: flag.height, bottom: flag.bottom, gap: q("#stat-due .stat-full").left - flag.right },
    };
  });
}

test.describe("the due item's flag", () => {
  for (const [name, body] of [
    ["overdue and upcoming", "# late by:2026-09-04\n# soon by:2026-09-09"],
    ["upcoming only", "# soon by:2026-09-09"],
  ] as const) {
    test(`sits like the action squares: same size, baseline and gap (${name})`, async ({ page }) => {
      await seed(page, body);
      const g = await geometry(page);
      expect(Math.abs(g.flag.w - g.box.w)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(g.flag.h - g.box.h)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(g.flag.bottom - g.box.bottom)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(g.flag.gap - g.box.gap)).toBeLessThanOrEqual(0.5);
    });
  }

  test("is red with something overdue, amber with something due today, else plain", async ({ page }) => {
    const flag = page.locator("#stat-due .stat-due-flag");
    await seed(page, "# late by:2026-09-04\n# now by:2026-09-07");
    await expect(flag).toHaveClass(/is-overdue/);
    await seed(page, "# now by:2026-09-07");
    await expect(flag).toHaveClass(/is-today/);
    await expect(flag).not.toHaveClass(/is-overdue/);
    await seed(page, "# soon by:2026-09-09");
    await expect(flag).not.toHaveClass(/is-overdue|is-today/);
  });

  test("the two parts are spaced around the separator", async ({ page }) => {
    await seed(page, "# late by:2026-09-04\n# soon by:2026-09-09");
    const gaps = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const sep = q("#stat-due .stat-due-sep");
      return [sep.left - q("#stat-due .stat-due-overdue").right, q("#stat-due .stat-due-upcoming").left - sep.right];
    });
    expect(gaps[0]).toBeGreaterThan(3);
    expect(gaps[1]).toBeGreaterThan(3);
  });
});
