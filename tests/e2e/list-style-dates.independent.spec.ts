import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  seedApp,
  editor,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
  todayFilename,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 800 } });

// --- Helper Selectors & Locators ---

const settings = (page: Page) => modalCard(page, MODAL_LABELS.settings);

const drawer = (page: Page) =>
  page
    .locator(
      `.modal-card[aria-label="${MODAL_LABELS.actions}"], aside.actions-pane[aria-label="${MODAL_LABELS.actions}"], .actions-pane, .modal-card.action-drawer-modal-card`
    )
    .first();

const weekReview = (page: Page) =>
  page
    .locator(
      `.modal-card[aria-label="${MODAL_LABELS.weekReview}"], aside.week-review-pane[aria-label="${MODAL_LABELS.weekReview}"], .week-review-pane, .modal-card.week-review-modal-card`
    )
    .first();

const history = (page: Page) =>
  page
    .locator(
      `.modal-card[aria-label="${MODAL_LABELS.history}"], aside.history-pane[aria-label="${MODAL_LABELS.history}"], .history-pane, .modal-card.history-modal-card`
    )
    .first();

const search = (page: Page) => modalCard(page, MODAL_LABELS.search);

function parseRgba(color: string): { r: number; g: number; b: number; a: number } {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) throw new Error(`Unexpected color format: ${color}`);
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

function assertGrey(color: string) {
  const { r, g, b, a } = parseRgba(color);
  expect(a).toBeGreaterThan(0);
  expect(Math.abs(r - g)).toBeLessThanOrEqual(10);
  expect(Math.abs(g - b)).toBeLessThanOrEqual(10);
  expect(Math.abs(r - b)).toBeLessThanOrEqual(10);
}

async function assertDateLabel(
  container: Locator,
  isoDate: string,
  options: { style: "friendly" | "iso"; isToday?: boolean }
) {
  const target = container.locator(`[title="${isoDate}"]`).first();
  await expect(target).toBeVisible();
  const title = await target.getAttribute("title");
  expect(title).toBe(isoDate);

  const text = (await target.textContent())?.trim() ?? "";
  if (options.style === "iso") {
    expect(text).toContain(isoDate);
  } else if (options.isToday) {
    expect(text).toContain("Today");
    expect(text).not.toContain(isoDate);
  } else {
    // Note dated two days before today (2026-09-05: Saturday, 5 Sep)
    // Short weekday + day + month label, not YYYY-MM-DD
    expect(text).not.toContain(isoDate);
    expect(text).toMatch(/Sat/i);
    expect(text).toMatch(/\b5\b/);
    expect(text).toMatch(/Sep/i);
  }
}

test.describe("List style for week review and Action Drawer, and date setting (S433)", () => {
  // 1. The Settings label for the date setting reads "Dates in tabs and lists" (English UI).
  test("1. Settings label for the date setting reads 'Dates in tabs and lists' (English UI)", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await openViaShortcut(page, "ControlOrMeta+,", "settings");
    const s = settings(page);
    await expect(s).toBeVisible();

    const dateSettingLabel = s.getByText("Dates in tabs and lists");
    await expect(dateSettingLabel).toBeVisible();

    // Verify option labels "ISO date" and "Friendly"
    await expect(s.getByRole("radio", { name: "ISO date" }).or(s.getByText("ISO date"))).toBeVisible();
    await expect(s.getByRole("radio", { name: "Friendly" }).or(s.getByText("Friendly"))).toBeVisible();
  });

  // 2. Friendly and ISO date formatting across Action Drawer, Section History, Search, and Week Review
  // REFERENCE_TODAY is 2026-09-07. Two days before today is 2026-09-05.
  const dateSettingNotes = {
    "2026-09-05.txt": [
      "Project Apollo",
      "==============",
      "# apollo task from two days ago",
    ].join("\n"),
    [todayFilename()]: [
      "Project Apollo",
      "==============",
      "# apollo task from today",
    ].join("\n"),
  };

  test("2a. With 'Friendly' setting, date labels show short weekday + day + month (or 'Today') with full ISO date in title in Action Drawer", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: dateSettingNotes,
        session: { openTabs: ["2026-09-05.txt", todayFilename()], activeTab: todayFilename() },
        tabLabelStyle: "friendly",
      },
    });

    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await assertDateLabel(d, "2026-09-05", { style: "friendly" });
    await assertDateLabel(d, "2026-09-07", { style: "friendly", isToday: true });
  });

  test("2b. With 'Friendly' setting, Section History date tabs show short weekday + day + month (or 'Today') with full ISO date in title", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: dateSettingNotes,
        session: { openTabs: ["2026-09-05.txt", todayFilename()], activeTab: todayFilename() },
        tabLabelStyle: "friendly",
      },
    });

    // Place caret inside "Project Apollo" section
    await editor(page).locator(".cm-line", { hasText: "apollo task from today" }).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const h = history(page);
    await expect(h).toBeVisible();
    await assertDateLabel(h, "2026-09-05", { style: "friendly" });
    await assertDateLabel(h, "2026-09-07", { style: "friendly", isToday: true });
  });

  test("2c. With 'Friendly' setting, Search group headings show short weekday + day + month (or 'Today') with full ISO date in title", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: dateSettingNotes,
        session: { openTabs: ["2026-09-05.txt", todayFilename()], activeTab: todayFilename() },
        tabLabelStyle: "friendly",
      },
    });

    const s = await openViaShortcut(page, "ControlOrMeta+Shift+F", "search");
    await s.locator(".modal-input").fill("apollo task");

    await assertDateLabel(s, "2026-09-05", { style: "friendly" });
    await assertDateLabel(s, "2026-09-07", { style: "friendly", isToday: true });
  });

  test("2d. With 'Friendly' setting, Week Review day bands show short weekday + day + month (or 'Today') with full ISO date in title", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: dateSettingNotes,
        session: { openTabs: ["2026-09-05.txt", todayFilename()], activeTab: todayFilename() },
        tabLabelStyle: "friendly",
      },
    });

    const wr = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");

    // On Monday 2026-09-07, Week Review opens Week 36 (contains 2026-09-05)
    await assertDateLabel(wr, "2026-09-05", { style: "friendly" });

    // Navigate to Week 37 (contains today: 2026-09-07)
    await page.keyboard.press("ArrowRight");
    await assertDateLabel(wr, "2026-09-07", { style: "friendly", isToday: true });
  });

  test("2e. With 'ISO date' setting, Action Drawer, Section History, Search, and Week Review show YYYY-MM-DD with full ISO date in title", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: dateSettingNotes,
        session: { openTabs: ["2026-09-05.txt", todayFilename()], activeTab: todayFilename() },
        tabLabelStyle: "iso",
      },
    });

    // 1. Action Drawer
    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await assertDateLabel(d, "2026-09-05", { style: "iso" });
    await assertDateLabel(d, "2026-09-07", { style: "iso" });
    await page.keyboard.press("Escape");

    // 2. Section History
    await editor(page).locator(".cm-line", { hasText: "apollo task from today" }).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const h = history(page);
    await expect(h).toBeVisible();
    await assertDateLabel(h, "2026-09-05", { style: "iso" });
    await assertDateLabel(h, "2026-09-07", { style: "iso" });
    await page.keyboard.press("Escape");

    // 3. Search
    const s = await openViaShortcut(page, "ControlOrMeta+Shift+F", "search");
    await s.locator(".modal-input").fill("apollo task");
    await assertDateLabel(s, "2026-09-05", { style: "iso" });
    await assertDateLabel(s, "2026-09-07", { style: "iso" });
    await page.keyboard.press("Escape");

    // 4. Week Review
    const wr = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");
    await assertDateLabel(wr, "2026-09-05", { style: "iso" });
    await page.keyboard.press("ArrowRight");
    await assertDateLabel(wr, "2026-09-07", { style: "iso" });
  });

  // 3. In the Action Drawer and the week review, the day heading is not uppercase (computed text-transform is none).
  test("3. Day heading in Action Drawer and week review has computed text-transform of 'none'", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-02.txt": ["Sync", "====", "# task 1"].join("\n"),
          [todayFilename()]: ["Planning", "========", "# task 2"].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    // Action Drawer day heading
    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const drawerHeading = d
      .locator('.band, .modal-group-header, .day-header, [data-testid="sticky-date-header"]')
      .first();
    await expect(drawerHeading).toBeVisible();
    const drawerTransform = await drawerHeading.evaluate(
      (el) => window.getComputedStyle(el).textTransform
    );
    expect(drawerTransform).toBe("none");

    await page.keyboard.press("Escape");

    // Week Review day heading / band
    const wr = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");
    const reviewHeading = wr.locator(".band, .day-header, .modal-group-header").first();
    await expect(reviewHeading).toBeVisible();
    const reviewTransform = await reviewHeading.evaluate(
      (el) => window.getComputedStyle(el).textTransform
    );
    expect(reviewTransform).toBe("none");
  });

  // 4. A selected row in the Action Drawer and in the week review has a grey background and font-weight 600.
  test("4. A selected row in Action Drawer and week review has a grey background and font-weight 600", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-02.txt": ["Sync", "====", "# task in week 36"].join("\n"),
          [todayFilename()]: ["Planning", "========", "# task today"].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    // Action Drawer selected row
    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const dRow = d.locator('.modal-item[role="option"], .action-row, .r').first();
    await dRow.click();
    const selectedDRow = d
      .locator('.modal-item.selected, .modal-item[aria-selected="true"], .r.sel')
      .first();
    await expect(selectedDRow).toBeVisible();

    const dStyle = await selectedDRow.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { bg: s.backgroundColor, weight: s.fontWeight };
    });
    assertGrey(dStyle.bg);
    expect(dStyle.weight).toBe("600");

    await page.keyboard.press("Escape");

    // Week Review selected row
    const wr = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");
    const wrRow = wr.locator('.modal-item[role="option"], .action-row, .r').first();
    await wrRow.click();
    const selectedWrRow = wr
      .locator('.modal-item.selected, .modal-item[aria-selected="true"], .r.sel')
      .first();
    await expect(selectedWrRow).toBeVisible();

    const wrStyle = await selectedWrRow.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { bg: s.backgroundColor, weight: s.fontWeight };
    });
    assertGrey(wrStyle.bg);
    expect(wrStyle.weight).toBe("600");
  });

  // 5. Action Drawer rows on a desktop-size window are between 18 and 26px tall.
  test("5. Action Drawer rows on a desktop-size window are between 18 and 26px tall", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: [
            "Sprint Tasks",
            "============",
            "# line one",
            "# line two",
            "# line three",
          ].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const itemRows = d.locator('.modal-item[role="option"], .action-row, .r:not(.band):not(.sec)');
    await expect(itemRows.first()).toBeVisible();

    const count = await itemRows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await itemRows.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(18);
      expect(box!.height).toBeLessThanOrEqual(26);
    }
  });

  // 6. Week review: a meeting where everything is done shows its title muted with "all done" on the same line and no separate row.
  test("6. Week review: all-done meeting shows title muted with 'all done' on same line and no separate row", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-02.txt": [
            "Weekly Sync",
            "===========",
            "# open action needs follow-up",
            "",
            "Standup",
            "=======",
            "v completed standup item",
            "x cancelled standup item",
          ].join("\n"),
        },
        session: { openTabs: ["2026-09-02.txt"], activeTab: "2026-09-02.txt" },
      },
    });

    const wr = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");

    const openMeetingTitle = wr.getByText("Weekly Sync").first();
    const doneMeetingTitle = wr.getByText("Standup").first();
    const allDoneText = wr.getByText(/all done|alles voltooid/i).first();

    await expect(openMeetingTitle).toBeVisible();
    await expect(doneMeetingTitle).toBeVisible();
    await expect(allDoneText).toBeVisible();

    // Muted title: color differs from open meeting title color
    const openColor = await openMeetingTitle.evaluate((el) => window.getComputedStyle(el).color);
    const doneColor = await doneMeetingTitle.evaluate((el) => window.getComputedStyle(el).color);
    expect(doneColor).not.toBe(openColor);

    // "all done" on the same line (same vertical position within 4px)
    const doneBox = (await doneMeetingTitle.boundingBox())!;
    const allDoneBox = (await allDoneText.boundingBox())!;
    expect(Math.abs(doneBox.y - allDoneBox.y)).toBeLessThanOrEqual(4);

    // No separate row for it: title and "all done" reside within the same meeting header container
    const sharedContainer = await doneMeetingTitle.evaluate((titleEl, allDoneEl) => {
      const container = titleEl.closest(".sec, .section-header, .modal-group-header, [role='heading'], div");
      return container !== null && container.contains(allDoneEl as Node);
    }, await allDoneText.elementHandle());
    expect(sharedContainer).toBe(true);

    // No old-style separate all-done row element
    await expect(wr.locator(".all-done-row")).toHaveCount(0);
  });

  // 7. Week review: earlier-weeks line reads "N open from earlier weeks, 1 overdue" and links open Action Drawer.
  test("7. Week review: earlier-weeks line reads 'N open from earlier weeks, 1 overdue' and links open Action Drawer in All files or By due date", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          // Shown week: Week 36 (Monday 2026-09-07 opens Week 36). Sunday before Week 36 is 2026-08-30.
          "2026-09-02.txt": [
            "Current Week Sync",
            "=================",
            "# action in week 36",
          ].join("\n"),
          // Earlier week: Week 34 note
          "2026-08-20.txt": [
            "Older Meeting",
            "=============",
            "# overdue task by:2026-08-25",
            "# open task 2",
            "# open task 3",
          ].join("\n"),
        },
        session: { openTabs: ["2026-09-02.txt"], activeTab: "2026-09-02.txt" },
      },
    });

    const wr = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");

    // Line reads like "3 open from earlier weeks, 1 overdue"
    const earlierLine = wr
      .locator('.earlier, .earlier-weeks, [data-earlier]')
      .or(wr.getByText(/open from earlier weeks/i))
      .first();
    await expect(earlierLine).toBeVisible();
    await expect(earlierLine).toHaveText(/\b3\s+open from earlier weeks,\s+1\s+overdue\b/i);

    // Click "3 open from earlier weeks" -> opens Action Drawer on "All files" with filter containing "before:2026-08-30" and "is:open"
    const openPart = earlierLine.getByText(/open from earlier weeks/i).first();
    await openPart.click();

    const d = drawer(page);
    await expect(d).toBeVisible();

    const allFilesRadio = d.getByRole("radio", { name: /All files/i });
    const allFilesSeg = d.locator(".seg span.on, [role='tab'][aria-selected='true']").filter({ hasText: /All files/i });
    const isAllFilesActive =
      (await allFilesRadio.isChecked().catch(() => false)) ||
      (await allFilesSeg.isVisible().catch(() => false));
    expect(isAllFilesActive).toBe(true);

    const filterInput = d.locator(".modal-input, input[type='text'], input[role='searchbox']");
    const filterArea = d.locator(".filter, .search-chips-row");
    const filterText =
      (await filterInput.inputValue().catch(() => "")) +
      " " +
      ((await filterArea.textContent().catch(() => "")) ?? "");
    expect(filterText).toContain("before:2026-08-30");
    expect(filterText).toContain("is:open");

    // Close Action Drawer and re-open Week Review
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();

    // Click "1 overdue" -> opens Action Drawer in "By due date" view with same filter
    const wr2 = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");
    const earlierLine2 = wr2
      .locator('.earlier, .earlier-weeks, [data-earlier]')
      .or(wr2.getByText(/open from earlier weeks/i))
      .first();
    const overduePart = earlierLine2.getByText(/1\s+overdue|overdue/i).first();
    await overduePart.click();

    await expect(d).toBeVisible();

    const dueRadio = d.getByRole("radio", { name: /By due date/i });
    // Review: in the app the due view is a switch (checkbox), not a radio.
    const dueSwitch = d.getByRole("checkbox", { name: /By due date/i });
    const dueSeg = d.locator(".seg span.on, [role='tab'][aria-selected='true']").filter({ hasText: /By due date/i });
    const isDueActive =
      (await dueSwitch.isChecked().catch(() => false)) ||
      (await dueRadio.isChecked().catch(() => false)) ||
      (await dueSeg.isVisible().catch(() => false));
    expect(isDueActive).toBe(true);

    const filterText2 =
      (await filterInput.inputValue().catch(() => "")) +
      " " +
      ((await filterArea.textContent().catch(() => "")) ?? "");
    expect(filterText2).toContain("before:2026-08-30");
    expect(filterText2).toContain("is:open");
  });

  // 8. The Action Drawer shows no meeting headings; the selected row shows its section name right-aligned.
  test("8. Action Drawer shows no meeting headings; selected row shows its section name right-aligned", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: [
            "Weekly Sync",
            "===========",
            "# draft quarterly plan",
            "# send recap email",
            "",
            "Design Review",
            "=============",
            "# update mockups",
          ].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");

    // 1. The Action Drawer shows NO meeting headings
    await expect(d.locator(".sec, .section-header")).toHaveCount(0);

    const headerRows = d.locator('.modal-group-header, .band, [role="heading"]');
    const headerTexts = await headerRows.allTextContents();
    for (const hText of headerTexts) {
      expect(hText).not.toContain("Weekly Sync");
      expect(hText).not.toContain("Design Review");
    }

    // 2. Selected row shows its section name right-aligned
    const row = d
      .locator('.modal-item[role="option"], .action-row, .r')
      .filter({ hasText: "draft quarterly plan" })
      .first();
    await row.click();
    await expect(row).toBeVisible();

    const sectionLabel = row
      .locator('.src, .item-breadcrumb, .item-source, span')
      .filter({ hasText: "Weekly Sync" })
      .first();
    await expect(sectionLabel).toBeVisible();

    const rowBox = (await row.boundingBox())!;
    const secBox = (await sectionLabel.boundingBox())!;
    // Section label is on the right side of the row
    expect(secBox.x + secBox.width / 2).toBeGreaterThan(rowBox.x + rowBox.width / 2);
    // Section label is near the right edge
    expect(rowBox.x + rowBox.width - (secBox.x + secBox.width)).toBeLessThan(60);

    // Unselected row does NOT show its section name
    const unselectedRow = d
      .locator('.modal-item[role="option"], .action-row, .r')
      .filter({ hasText: "send recap email" })
      .first();
    const unselectedSec = unselectedRow
      .locator('.src, .item-breadcrumb, .item-source')
      .filter({ hasText: "Weekly Sync" });
    await expect(unselectedSec).toBeHidden();
  });
});
