import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
} from "./helpers";

const settings = (page: Page) => page.locator(".settings-modal-card, .settings-page");

async function openSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(settings(page)).toBeVisible();
}

test.describe("Dates in tabs and lists & shared list style (Part 1 & 2)", () => {
  test("day bands in Action Drawer and Week Review follow tabLabelStyle setting", async ({
    page,
  }) => {
    const today = "2026-09-07";
    const yesterday = "2026-09-06";
    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: "Standup\n=======\n# today task\n",
          [`${yesterday}.txt`]: "Planning\n========\n# yesterday task\n",
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    // 1. Initial setting is ISO: day band shows full ISO date
    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await expect(drawer).toBeVisible();

    const bands = drawer.locator(".band.modal-group-header");
    await expect(bands.first()).toBeVisible();
    await expect(bands.first().locator(".band-title")).toHaveText(today);
    expect(await bands.first().getAttribute("title")).toBe(today);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // 2. Switch setting to "Friendly" via Settings
    await openSettings(page);
    await expect(settings(page).getByText("Dates in tabs and lists")).toBeVisible();
    await settings(page).getByRole("radio", { name: "Friendly" }).click();
    await page.keyboard.press("Escape");
    await expect(settings(page)).toBeHidden();

    // 3. Action Drawer now reflects "Friendly" format: "Today" for today
    await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await expect(drawer).toBeVisible();

    const friendlyBands = drawer.locator(".band.modal-group-header");
    await expect(friendlyBands.first()).toBeVisible();
    await expect(friendlyBands.first().locator(".band-title")).toHaveText(/Today/i);
    // Title attribute retains full ISO date
    expect(await friendlyBands.first().getAttribute("title")).toBe(today);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // 4. Week Review reflects "Friendly" format: yesterday shown for Week 36
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+K");
    const weekReview = modalCard(page, MODAL_LABELS.weekReview);
    await expect(weekReview).toBeVisible();

    const reviewBands = weekReview.locator(".band.modal-group-header");
    await expect(reviewBands.first()).toBeVisible();
    await expect(reviewBands.first().locator(".band-title")).toHaveText(/Yesterday/i);
    expect(await reviewBands.first().getAttribute("title")).toBe(yesterday);

    await page.keyboard.press("Escape");
  });

  test("Section History date tabs and Search group headings follow tabLabelStyle", async ({
    page,
  }) => {
    const today = "2026-09-07";
    const yesterday = "2026-09-06";
    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: "Standup\n=======\n# discuss roadmap\n",
          [`${yesterday}.txt`]: "Standup\n=======\n# roadmap kick-off\n",
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    // Switch setting to "Friendly"
    await openSettings(page);
    await settings(page).getByRole("radio", { name: "Friendly" }).click();
    await page.keyboard.press("Escape");

    // 1. Section History date tabs
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const historyModal = modalCard(page, MODAL_LABELS.history);
    await expect(historyModal).toBeVisible();

    const occTabs = historyModal.locator(".history-occ-tab");
    await expect(occTabs.first()).toBeVisible();
    const occTexts = await occTabs.allTextContents();
    expect(occTexts.some((t) => /today/i.test(t))).toBe(true);
    // Tab date span has full ISO date in title
    expect(await occTabs.first().locator(".history-occ-date").getAttribute("title")).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.keyboard.press("Escape");
    await expect(historyModal).toBeHidden();

    // 2. Search Modal group headings
    await page.keyboard.press("ControlOrMeta+Shift+F");
    const searchModal = modalCard(page, MODAL_LABELS.search);
    await expect(searchModal).toBeVisible();

    const searchInput = searchModal.locator(".modal-input");
    await searchInput.fill("roadmap");
    const searchGroups = searchModal.locator(".modal-group-header");
    await expect(searchGroups.first()).toBeVisible();
    const groupTexts = await searchGroups.allTextContents();
    expect(groupTexts.some((t) => /today/i.test(t))).toBe(true);
    expect(await searchGroups.first().getAttribute("title")).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.keyboard.press("Escape");
  });

  test("row height is 21px on desktop, selected row has grey background and 600 weight", async ({
    page,
  }) => {
    const today = "2026-09-07";
    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: "Standup\n=======\n# action item one\n# action item two\n",
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await expect(drawer).toBeVisible();

    const rows = drawer.locator('.modal-item.action-row[role="option"]');
    await expect(rows.first()).toBeVisible();

    // Check row height is approx 21px
    const box = await rows.first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeCloseTo(21, 1);

    // Selected row (first row by default)
    const selectedRow = drawer.locator(".modal-item.action-row.selected");
    await expect(selectedRow).toBeVisible();

    const styles = await selectedRow.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const textEl = el.querySelector(".item-text");
      const textComputed = textEl ? window.getComputedStyle(textEl) : null;
      return {
        bg: computed.backgroundColor,
        fontWeight: textComputed?.fontWeight,
      };
    });

    // Background should be rgba(128, 128, 128, 0.2)
    expect(styles.bg).toContain("rgba(128, 128, 128, 0.2");
    // Text weight 600
    expect(styles.fontWeight).toBe("600");

    await page.keyboard.press("Escape");
  });

  test("week review all-done meeting section is muted with 'all done' on same line", async ({
    page,
  }) => {
    // ISO week 36 (2026-08-31 to 2026-09-06)
    // Standup has only completed actions
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-01.txt": "Standup\n=======\nv completed item\n",
        },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+K");
    const weekReview = modalCard(page, MODAL_LABELS.weekReview);
    await expect(weekReview).toBeVisible();

    // Section header should have .sec.quiet
    const secHeader = weekReview.locator(".sec.quiet");
    await expect(secHeader).toBeVisible();
    await expect(secHeader.locator(".sec-title")).toContainText("Standup");

    // All done indicator on the same line
    const allDone = secHeader.locator(".alldone");
    await expect(allDone).toBeVisible();
    await expect(allDone).toContainText("all done");

    // No separate .all-done-row element exists
    await expect(weekReview.locator(".all-done-row")).toHaveCount(0);

    await page.keyboard.press("Escape");
  });

  test("earlier-weeks line shows two links (all files and due view) with prefilled filter", async ({
    page,
  }) => {
    // Current note Monday 2026-09-07 (Week 37 opens Week 36: 2026-08-31 to 2026-09-06).
    // Earlier week: note 2026-08-25 has:
    // - 1 open action overdue: # overdue task by:2026-08-28
    // - 1 open action not overdue: # future task by:2026-09-20
    const today = "2026-09-07";
    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: "Current\n=======\n# today task\n",
          "2026-08-25.txt": "Old Meeting\n===========\n# overdue task by:2026-08-28\n# future task by:2026-09-20\n",
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+K");
    const weekReview = modalCard(page, MODAL_LABELS.weekReview);
    await expect(weekReview).toBeVisible();

    // Sunday before shown week 36 is 2026-08-30
    const sundayBefore = "2026-08-30";
    const expectedQuery = `before:${sundayBefore} is:open`;

    // Earlier-weeks line has 2 open actions and 1 overdue
    const earlierLine = weekReview.locator(".earlier-weeks-bar");
    await expect(earlierLine).toBeVisible();

    const earlierWeeksBtn = weekReview.locator(".earlier-weeks-btn");
    await expect(earlierWeeksBtn).toContainText("2 open from earlier weeks");

    const overdueBtn = weekReview.locator(".earlier-overdue-btn");
    await expect(overdueBtn).toContainText("1 overdue");

    // Click earlierWeeksBtn -> opens Action Drawer in All Files with prefilled filter
    await earlierWeeksBtn.click();
    const actionDrawer = modalCard(page, MODAL_LABELS.actions);
    await expect(actionDrawer).toBeVisible();

    // Check filter input has the prefilled query
    const filterInput = actionDrawer.locator(".modal-input");
    await expect(filterInput).toHaveValue(expectedQuery);

    // Verify All Files radio is active
    const allFilesRadio = actionDrawer.getByRole("radio", { name: "All Files" });
    await expect(allFilesRadio).toBeChecked();

    // Close Action Drawer and reopen Week Review to test overdue link
    await page.keyboard.press("Escape");
    await expect(actionDrawer).toBeHidden();

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+K");
    await expect(weekReview).toBeVisible();

    // Click overdueBtn -> opens Action Drawer in Due View with prefilled filter
    const overdueBtn2 = weekReview.locator(".earlier-overdue-btn");
    await overdueBtn2.click();
    await expect(actionDrawer).toBeVisible();

    // Verify Due View toggle is checked
    const dueToggleInput = actionDrawer.locator(".toggle-switch").filter({ hasText: /due date/i }).locator("input");
    await expect(dueToggleInput).toBeChecked();
    await expect(allFilesRadio).toBeChecked();
    await expect(filterInput).toHaveValue(expectedQuery);

    await page.keyboard.press("Escape");
  });
});
