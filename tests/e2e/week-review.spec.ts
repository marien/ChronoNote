import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  currentModal,
  todayFilename,
  cursorLine,
  datePicker,
} from "./helpers";

const reviewCard = (page: Page) => modalCard(page, MODAL_LABELS.weekReview);

test.describe("Week review (feature review A3 / §432)", () => {
  // REFERENCE_TODAY is 2026-09-07 (a Monday).
  // Decision 1b: Monday opens the previous ISO week (Week 36: 2026-08-31 to 2026-09-06).
  const seedNotes = {
    // Note in previous week (week 36)
    "2026-09-02.txt": [
      "Team Sync",
      "=========",
      "# prepare quarterly review",
      "o discuss roadmap",
      "v already finished task",
    ].join("\n"),
    // Note in current week (week 37)
    [todayFilename()]: [
      "Monday Planning",
      "===============",
      "# kick off sprint",
    ].join("\n"),
    // Note in earlier week (week 34)
    "2026-08-20.txt": [
      "Old Meeting",
      "===========",
      "# lingering old action",
    ].join("\n"),
  };

  test("opens with Ctrl+Shift+K on the right week, Left/Right change week", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await editor(page).click();

    // 1. Opens with Ctrl+Shift+K on the right week (Week 36 on Monday 2026-09-07)
    await page.keyboard.press("ControlOrMeta+Shift+K");
    const card = reviewCard(page);
    await expect(card).toBeVisible();
    await expect(card.locator(".week-title")).toContainText("Week 36");
    await expect(card).toContainText("prepare quarterly review");
    await expect(card).toContainText("discuss roadmap");

    // 2. Left changes week to 35
    await page.keyboard.press("ArrowLeft");
    await expect(card.locator(".week-title")).toContainText("Week 35");

    // 3. Right changes week back to 36
    await page.keyboard.press("ArrowRight");
    await expect(card.locator(".week-title")).toContainText("Week 36");
  });

  test("Enter jumps to line in note and closes dialog", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+K");
    const card = reviewCard(page);
    await expect(card).toBeVisible();

    // Press Enter on the first item ("prepare quarterly review", line 3 in 2026-09-02.txt)
    await page.keyboard.press("Enter");
    await expect(card).toHaveCount(0);
    await expect.poll(() => cursorLine(page)).toBe(3);
  });

  test("Ctrl+Space closes an action and the counts update, Show done adds done items", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: ["2026-09-02.txt"], activeTab: "2026-09-02.txt" },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+K");
    const card = reviewCard(page);
    await expect(card).toBeVisible();

    // 1 open action initially
    await expect(card.locator(".week-review-counts")).toContainText("1 open action");

    // Ctrl+Space closes the action
    await page.keyboard.press("ControlOrMeta+Space");
    await expect(card.locator(".week-review-counts")).toContainText("0 open actions");

    // "Show done" toggle adds completed items
    await card.getByText("Show done", { exact: false }).click();
    await expect(card.locator(".item-completed").first()).toBeVisible();
    await expect(card).toContainText("prepare quarterly review");
    await expect(card).toContainText("already finished task");
  });

  test("earlier-weeks line opens the Action Drawer", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+K");
    const card = reviewCard(page);
    await expect(card).toBeVisible();

    const earlierBtn = card.locator(".earlier-weeks-btn");
    await expect(earlierBtn).toBeVisible();
    await expect(earlierBtn).toContainText("still open from earlier weeks");

    await earlierBtn.click();
    const actionsDrawer = modalCard(page, MODAL_LABELS.actions);
    await expect(actionsDrawer).toBeVisible();
    expect(await currentModal(page)).toBe("actions");
  });

  test("date picker's week number opens that week in Week Review", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await editor(page).click();
    // Open date picker
    await page.locator("[data-datepicker-trigger]").click();
    const pop = datePicker(page);
    await expect(pop).toBeVisible();

    // Click week number for week 37
    const weekBtn = pop.locator(".cal-week-num", { hasText: "37" }).first();
    await expect(weekBtn).toBeVisible();
    await weekBtn.click();

    // Date picker closes and Week Review opens on Week 37
    const card = reviewCard(page);
    await expect(card).toBeVisible();
    await expect(card.locator(".week-title")).toContainText("Week 37");
    await expect(card).toContainText("kick off sprint");
  });

  test("docked on a wide window (>=1000px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+K");

    const pane = page.locator(".week-review-pane");
    await expect(pane).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(page.locator(".overlay")).toHaveCount(0);

    // Enter jumps to line and keeps pane open
    await page.keyboard.press("Enter");
    await expect(pane).toBeVisible();
    expect(await currentModal(page)).toBe("weekReview");
  });
});
