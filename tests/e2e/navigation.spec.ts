import { test, expect } from "@playwright/test";
import { seedApp, editor, modalCard, MODAL_LABELS, activeTabLabel, tab, currentModal, parkMouse } from "./helpers";

const picker = (page: import("@playwright/test").Page) => modalCard(page, MODAL_LABELS.date);

test.describe("date picker / navigation (Ctrl+O)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await editor(page).click();
    await parkMouse(page);
    await page.keyboard.press("Control+o");
    await expect(picker(page)).toBeVisible();
  });

  test("a relative query resolves to a direct match and Enter opens it", async ({ page }) => {
    await picker(page).locator(".modal-input").fill("-3");
    await expect(picker(page)).toContainText("Direct match: 2026-09-04");
    await page.keyboard.press("Enter");

    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(/2026-09-04/);
  });

  test("'today' and 'yesterday' keywords resolve", async ({ page }) => {
    await picker(page).locator(".modal-input").fill("yesterday");
    await expect(picker(page)).toContainText("Direct match: 2026-09-06");
    await picker(page).locator(".modal-input").fill("today");
    await expect(picker(page)).toContainText("Direct match: 2026-09-07");
  });

  test("opening a future date that has no file yet creates a fresh tab", async ({ page }) => {
    await picker(page).locator(".modal-input").fill("2026-12-25");
    await expect(picker(page)).toContainText("[New Daily Note]");
    await page.keyboard.press("Enter");

    await expect(tab(page, "2026-12-25.txt")).toHaveCount(1);
    await expect(activeTabLabel(page)).toHaveText(/2026-12-25/);
  });

  test("'Open Only' hides dates with zero open actions", async ({ page }) => {
    const allCount = await picker(page).locator('.modal-item[role="option"]').count();
    await picker(page).getByText("Open Only", { exact: false }).click();
    await expect
      .poll(() => picker(page).locator('.modal-item[role="option"]').count())
      .toBeLessThanOrEqual(allCount);
    // Every remaining browsed row shows a non-zero open count.
    for (const txt of await picker(page).locator(".item-tag").allTextContents()) {
      if (txt.includes("open action")) expect(txt).not.toMatch(/\b0 open action/);
    }
  });
});
