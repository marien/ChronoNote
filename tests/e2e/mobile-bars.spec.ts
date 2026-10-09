import { test, expect } from "@playwright/test";
import { seedApp, editor, todayFilename, activeTabContent } from "./helpers";

test.describe("mobile app bar and bottom nav bar (§D2, §D3)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("the title reads 'Today' with the date below", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "# today open task\n" },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const titleBtn = page.locator(".mobile-title-btn");
    await expect(titleBtn).toBeVisible();
    await expect(titleBtn.locator(".mobile-title-line1")).toHaveText("Today");
    const subLine = titleBtn.locator(".mobile-title-line2");
    await expect(subLine).toBeVisible();
    await expect(subLine).toContainText("1 open");
  });

  test("previous goes to the previous note with content (seed two dated notes)", async ({ page }) => {
    const today = todayFilename();
    const yesterday = "2026-09-06.txt";
    await seedApp(page, {
      seed: {
        notes: {
          [today]: "# today note\n",
          [yesterday]: "yesterday note content\n",
        },
        session: { openTabs: [today], activeTab: today },
      },
    });

    const prevBtn = page.locator(".mobile-prev-btn");
    await expect(prevBtn).toBeEnabled();
    await prevBtn.click();

    const titleBtn = page.locator(".mobile-title-btn");
    await expect(titleBtn.locator(".mobile-title-line1")).toHaveText("Yesterday");
    expect(await activeTabContent(page)).toContain("yesterday note content");
  });

  test("tapping the title opens the date picker", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "note text\n" },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await page.locator(".mobile-title-btn").click();
    const picker = page.locator(".datepicker-pop");
    await expect(picker).toBeVisible();
  });

  test("the nav bar's Actions opens the Action Drawer and shows the open-count badge", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "# task one\n# task two\n" },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const actionsDest = page.locator(".mobile-nav-bar .mobile-nav-dest", { hasText: "Actions" });
    await expect(actionsDest).toBeVisible();
    const badge = actionsDest.locator(".mobile-nav-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("2");

    await actionsDest.click();
    const drawer = page.getByRole("dialog", { name: "Actions" });
    await expect(drawer).toBeVisible();
  });

  test("the nav bar hides when the editor is focused", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { [todayFilename()]: "some content to edit\n" },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const navBar = page.locator(".mobile-nav-bar");
    await expect(navBar).toBeVisible();

    await editor(page).click();
    await expect(navBar).toHaveCount(0);
    await expect(page.locator(".mobile-accessory-bar")).toBeVisible();
  });
});
