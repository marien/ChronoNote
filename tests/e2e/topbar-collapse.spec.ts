/** #56: on a narrow window, the top bar's secondary action buttons
 * (Actions/History/Search/Import/Promote/Settings/About) collapse into a
 * single "More actions" button — `TopBar.svelte`'s `settleLayout`,
 * extended one tier past its existing label-collapse logic — freeing that
 * space back to the tab strip. New Scratchpad and Open Date Note stay
 * pinned regardless of width. `MoreActionsModal` is the resulting
 * popover, anchored to the "More actions" button the same way
 * `DatePickerModal` anchors to its own trigger. */
import { test, expect } from "@playwright/test";
import { seedApp, modalCard, MODAL_LABELS } from "./helpers";

test.describe("top bar: collapsing secondary buttons on a narrow window (#56)", () => {
  test("wide window: every action button is visible individually, no More button", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await expect(page.getByTitle(/^Actions /)).toBeVisible();
    await expect(page.getByTitle(/^Settings /)).toBeVisible();
    await expect(page.getByTitle(/^About ChronoNote /)).toBeVisible();
    await expect(page.getByTitle("More actions")).toHaveCount(0);
  });

  test("narrow window: secondary buttons collapse into More; New Scratchpad and Open Date stay pinned", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await expect(page.getByTitle("More actions")).toBeVisible();

    // Pinned — never collapse.
    await expect(page.getByTitle(/^New Scratchpad /)).toBeVisible();
    await expect(page.getByTitle(/^Open Date Note /)).toBeVisible();

    // Collapsed — no longer rendered as individual top-bar buttons.
    await expect(page.getByTitle(/^Actions /)).toHaveCount(0);
    await expect(page.getByTitle(/^Section history /)).toHaveCount(0);
    await expect(page.getByTitle(/^Cross-Tab Search /)).toHaveCount(0);
    await expect(page.getByTitle(/^Import Sections /)).toHaveCount(0);
    await expect(page.getByTitle(/^Settings /)).toHaveCount(0);
    await expect(page.getByTitle(/^About ChronoNote /)).toHaveCount(0);
  });

  test("More actions lists every collapsed action with its shortcut, and running one closes the popover", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await page.getByTitle("More actions").click();

    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Actions.*Ctrl\+Shift\+A/s })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Section history.*Ctrl\+Shift\+H/s })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Cross-tab search.*Ctrl\+Shift\+F/s })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Import sections.*Ctrl\+Shift\+I/s })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^Settings/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /About ChronoNote/ })).toBeVisible();

    await menu.getByRole("menuitem", { name: /^Settings/ }).click();
    await expect(modalCard(page, MODAL_LABELS.settings)).toBeVisible();
    await expect(menu).toBeHidden();
  });

  test("More actions includes Promote only when the active tab is a scratchpad", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.setViewportSize({ width: 480, height: 720 });
    await page.keyboard.press("Control+n"); // fresh scratchpad, becomes active

    await page.getByTitle("More actions").click();
    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu.getByRole("menuitem", { name: /Promote/ })).toBeVisible();
  });

  test("clicking outside, or Escape, closes the popover without running anything", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await page.getByTitle("More actions").click();
    const menu = page.getByRole("menu", { name: "More actions" });
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await page.getByTitle("More actions").click();
    await expect(menu).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(menu).toBeHidden();
  });

  test("widening the window back un-collapses the buttons", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });
    await expect(page.getByTitle("More actions")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTitle("More actions")).toHaveCount(0);
    await expect(page.getByTitle(/^Actions /)).toBeVisible();
    await expect(page.getByTitle(/^About ChronoNote /)).toBeVisible();
  });
});
