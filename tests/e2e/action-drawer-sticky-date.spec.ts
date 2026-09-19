import { test, expect, type Page } from "@playwright/test";
import { openViaShortcut, seedApp } from "./helpers";

/** #77: scrolling the Actions drawer used to leave actions with no date —
 * each group's own header scrolls away (and is unmounted) long before its
 * last action, so nothing said which day an action belonged to. The date
 * heading of the group at the top of the list now stays pinned. */
const DATES = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
const notes = Object.fromEntries(
  DATES.map((d) => [`${d}.txt`, Array.from({ length: 12 }, (_, i) => `# ${d} item ${i + 1}`).join("\n")]),
);
const seed = { notes, session: { openTabs: DATES.map((d) => `${d}.txt`), activeTab: `${DATES[0]}.txt` } };

const ROW = 36;
const HEADER = 29;

const list = (page: Page) => page.locator(".modal-list");
const sticky = (page: Page) => page.getByTestId("sticky-date-header");

/** The date carried in the text of the first action row fully below the pinned heading. */
async function dateOfTopVisibleAction(page: Page): Promise<string> {
  return page.evaluate(() => {
    const box = document.querySelector(".modal-list")!.getBoundingClientRect();
    const rows = [...document.querySelectorAll<HTMLElement>(".modal-item")]
      .map((el) => ({ el, top: el.getBoundingClientRect().top }))
      .filter((r) => r.top >= box.top + 29 - 1)
      .sort((a, b) => a.top - b.top);
    return rows[0]?.el.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  });
}

test.describe("Actions drawer keeps the date in view (#77)", () => {
  test("no pinned heading at the top, then one showing the group being read as you scroll", async ({ page }) => {
    await seedApp(page, { seed });
    await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await expect(list(page).locator(".modal-item").first()).toBeVisible();

    // At the very top the real heading is on screen — nothing pinned. (The
    // drawer opens scrolled to the active tab's actions, so go to the top first.)
    await list(page).evaluate((el) => (el.scrollTop = 0));
    await expect(sticky(page)).toHaveCount(0);

    // Scroll well into each group: its real heading has scrolled away.
    const perGroup = HEADER + 12 * ROW;
    for (const scrollTo of [HEADER + ROW * 5, perGroup + HEADER + ROW * 3, perGroup * 2 + HEADER + ROW * 8]) {
      await list(page).evaluate((el, y) => (el.scrollTop = y), scrollTo);
      await expect(sticky(page)).toBeVisible();
      const date = await dateOfTopVisibleAction(page);
      expect(date).not.toBe("");
      // The pinned heading names the same day as the action beneath it.
      await expect(sticky(page)).toContainText(date);
    }
  });

  test("keyboard navigation never leaves the selected action hidden under the pinned heading", async ({ page }) => {
    await seedApp(page, { seed });
    await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await expect(list(page).locator(".modal-item").first()).toBeVisible();

    // Walk down past the first group, then back up a few rows.
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowDown");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowUp");

    const box = await page.evaluate(() => {
      const listBox = document.querySelector(".modal-list")!.getBoundingClientRect();
      const sel = document.querySelector(".modal-item.selected")!.getBoundingClientRect();
      return { listTop: listBox.top, listBottom: listBox.bottom, selTop: sel.top, selBottom: sel.bottom };
    });
    expect(box.selTop).toBeGreaterThanOrEqual(box.listTop + HEADER - 1); // below the heading
    expect(box.selBottom).toBeLessThanOrEqual(box.listBottom + 1);
  });
});
