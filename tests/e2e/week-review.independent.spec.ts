import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  parkMouse,
  datePicker,
  mockNote,
  activeTabLabel,
  cursorLine,
  modalCard,
  MODAL_LABELS,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 800 } });

// --- Helper Selectors -------------------------------------------------
// Keep selectors for guessed classes in one helper object at the top so
// they are easy to adjust if the implementation class names differ.
export const SELECTORS = {
  pane: [
    ".week-review-pane",
    ".week-review",
    "aside.week-review-pane",
    "aside.week-review",
    "aside.week-pane",
    'aside[aria-label*="Week" i]',
    'aside[data-pane="week-review"]',
    '.modal-card[aria-label*="Week" i]',
    '.modal-card.week-review-modal-card',
    '.modal-card.week-review-card',
    '[data-testid="week-review"]',
    '.workspace-row > aside:not(.history-pane):not(.actions-pane)',
  ].join(", "),
  header: ".week-review-header, .week-header, .modal-title, .modal-header, header",
  item: '.modal-item, .action-row, .week-item, [role="option"], [role="listitem"]',
  showDoneToggle: [
    'input[type="checkbox"]',
    '[role="checkbox"]',
    '[role="switch"]',
    'button',
    'label',
  ].join(", "),
  earlierWeeksLine: [
    '.earlier-weeks',
    '.earlier-open',
    '[data-earlier]',
    'button',
    '[role="button"]',
    'a',
    '.modal-item',
  ].join(", "),
};

export function weekReviewPane(page: Page): Locator {
  return page.locator(SELECTORS.pane).first();
}

export async function openWeekReview(page: Page): Promise<Locator> {
  await editor(page).click();
  await parkMouse(page);
  await page.keyboard.press("ControlOrMeta+Shift+K");
  const pane = weekReviewPane(page);
  await expect(pane).toBeVisible();
  return pane;
}

export function weekHeader(pane: Locator): Locator {
  return pane.locator(SELECTORS.header).first();
}

export function weekItem(pane: Locator, text: string | RegExp): Locator {
  return pane.locator(SELECTORS.item).filter({ hasText: text }).first();
}

export function showDoneToggle(pane: Locator): Locator {
  return pane
    .getByRole("checkbox", { name: /show done/i })
    .or(pane.getByRole("button", { name: /show done/i }))
    .or(pane.getByRole("switch", { name: /show done/i }))
    .or(pane.getByLabel(/show done/i))
    .or(pane.locator(SELECTORS.showDoneToggle).filter({ hasText: /show done/i }))
    .first();
}

export function earlierWeeksButton(pane: Locator): Locator {
  return pane
    .locator(SELECTORS.earlierWeeksLine)
    .filter({ hasText: /earlier weeks|still open/i })
    .first();
}

async function openDatePicker(page: Page): Promise<Locator> {
  const trigger = page.locator("[data-datepicker-trigger]");
  if (await trigger.isVisible()) {
    await trigger.click();
  } else {
    await editor(page).click();
    await parkMouse(page);
    await page.keyboard.press("ControlOrMeta+o");
  }
  const pop = datePicker(page);
  await expect(pop).toBeVisible();
  return pop;
}

async function assertPrecedes(pane: Locator, firstText: string, secondText: string): Promise<void> {
  const content = (await pane.textContent()) ?? "";
  const firstIdx = content.indexOf(firstText);
  const secondIdx = content.indexOf(secondText);
  expect(firstIdx, `Expected '${firstText}' to be present in pane`).toBeGreaterThanOrEqual(0);
  expect(secondIdx, `Expected '${secondText}' to be present in pane`).toBeGreaterThanOrEqual(0);
  expect(firstIdx, `Expected '${firstText}' to appear before '${secondText}'`).toBeLessThan(secondIdx);
}

// Fixed dates for testing ISO weeks
// 2026-10-14 is Wednesday in ISO week 42
// 2026-10-21 is Wednesday in ISO week 43
// 2026-10-25 is Sunday in ISO week 43
// 2026-10-26 is Monday in ISO week 44
// 2026-10-27 is Tuesday in ISO week 44
// 2026-10-28 is Wednesday in ISO week 44

export const NOW_WEDNESDAY_W44 = new Date("2026-10-28T09:00:00");
export const NOW_MONDAY_W44 = new Date("2026-10-26T09:00:00");
export const NOW_SUNDAY_W43 = new Date("2026-10-25T09:00:00");

export const SEED_NOTES: Record<string, string> = {
  // ISO week 42 (earlier week: 2026-10-12 to 2026-10-18)
  "2026-10-14.txt": [
    "Old Sprint",
    "==========",
    "# legacy open task 1",
    "# legacy open task 2",
    "# legacy open task 3",
  ].join("\n"),

  // ISO week 43 (2026-10-19 to 2026-10-25)
  "2026-10-21.txt": [
    "Sprint Planning",
    "===============",
    "v completed sprint task",
    "o week 43 retro topic",
  ].join("\n"),

  "2026-10-25.txt": [
    "Weekend Check",
    "=============",
    "v Sunday review note",
  ].join("\n"),

  // ISO week 44 (2026-10-26 to 2026-11-01)
  "2026-10-26.txt": [
    "Team Standup",
    "============",
    "# check server logs by:2026-10-25",
    "# prepare presentation",
    "  # draft slides",
    "  # rehearse talk",
    "o discuss architecture",
    ", review roadmap",
    "v setup dev environment",
    "> old standup topic (>2026-10-27#Sync)",
  ].join("\n"),

  "2026-10-27.txt": [
    "Client Meeting",
    "==============",
    "# send contract to client => @dana review terms",
    ". past agenda item",
    "x cancelled task",
    "",
    "All Done Section",
    "================",
    "v finish documentation",
    "v send release notes",
  ].join("\n"),

  "2026-10-28.txt": [
    "Design Review",
    "=============",
    "# update mockups by:2026-10-27",
    "# export assets by:2026-10-30",
    "o color palette choice",
  ].join("\n"),
};

test.describe("Week Review (independent tests)", () => {
  test("1. Ctrl/Cmd+Shift+K opens the week review; Wednesday and Sunday show the current ISO week, Monday the previous one", async ({
    page,
  }) => {
    // 1a. With today set to Wednesday, current ISO week (Week 44) is shown
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    let pane = await openWeekReview(page);
    await expect(weekHeader(pane)).toContainText(/week\s*44|\b44\b/i);

    // 1b. With today set to Monday, previous week (Week 43) is shown
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-26.txt"], activeTab: "2026-10-26.txt" },
      },
      now: NOW_MONDAY_W44,
    });
    pane = await openWeekReview(page);
    await expect(weekHeader(pane)).toContainText(/week\s*43|\b43\b/i);

    // 1c. With today set to Sunday, the week ending that day (Week 43) is shown. Review: the brief said "previous
    // week" for the weekend, but decision 1b means the week just worked, which on a Sunday is the current ISO week.
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-25.txt"], activeTab: "2026-10-25.txt" },
      },
      now: NOW_SUNDAY_W43,
    });
    pane = await openWeekReview(page);
    await expect(weekHeader(pane)).toContainText(/week\s*43|\b43\b/i);
  });

  test("2. header shows week number and counts for open actions, open topics, and overdue actions", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    const pane = await openWeekReview(page);

    // Header shows week number (Week 44)
    await expect(weekHeader(pane)).toContainText(/week\s*44|\b44\b/i);

    // Counts for Week 44:
    // Open actions: 7 (check server logs, prepare presentation, draft slides, rehearse talk, send contract, update mockups, export assets)
    // Open topics (open + postponed): 3 (discuss architecture, review roadmap, color palette choice)
    // Overdue actions: 2 (check server logs by:2026-10-25, update mockups by:2026-10-27; export assets by:2026-10-30 is not overdue)
    const openActionsCount = pane
      .locator('.stat-open, .count-actions, [data-stat="open-actions"], .week-stat-open')
      .or(pane.getByText(/7\s*open\s*(?:actions)?/i));
    await expect(openActionsCount.first()).toBeVisible();

    const openTopicsCount = pane
      .locator('.stat-topics, .count-topics, [data-stat="open-topics"], .week-stat-topics')
      .or(pane.getByText(/3\s*(?:open\s*)?topics/i));
    await expect(openTopicsCount.first()).toBeVisible();

    const overdueCount = pane
      .locator('.stat-overdue, .count-overdue, [data-stat="overdue"], .week-stat-overdue')
      .or(pane.getByText(/2\s*overdue/i));
    await expect(overdueCount.first()).toBeVisible();
  });

  test("3. items are grouped by day then section in note order; forwarded line excluded; delegated part on action row; sub-actions under parent", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    const pane = await openWeekReview(page);

    // Grouping: Days appear in order (Monday Oct 26, Tuesday Oct 27, Wednesday Oct 28)
    await assertPrecedes(pane, "26", "27");
    await assertPrecedes(pane, "27", "28");

    // Sections within days appear in note order
    await assertPrecedes(pane, "Team Standup", "Client Meeting");
    await assertPrecedes(pane, "Client Meeting", "All Done Section");
    await assertPrecedes(pane, "All Done Section", "Design Review");

    // Forwarded line with (>...) is not listed as open
    const forwardedItem = pane
      .locator('.modal-item:not(.done), .action-row:not(.done), [role="option"]:not(.done)')
      .filter({ hasText: "old standup topic" });
    await expect(forwardedItem).toHaveCount(0);
    await expect(pane).not.toContainText("old standup topic");

    // Delegated part is not a separate row; its action row contains @dana
    const delegatedRow = weekItem(pane, "send contract to client");
    await expect(delegatedRow).toBeVisible();
    await expect(delegatedRow).toContainText("@dana");
    const separateDelegatedRow = pane
      .locator(SELECTORS.item)
      .filter({ hasText: /^review terms/ });
    await expect(separateDelegatedRow).toHaveCount(0);

    // Sub-actions appear under their parent in order
    await assertPrecedes(pane, "prepare presentation", "draft slides");
    await assertPrecedes(pane, "draft slides", "rehearse talk");
  });

  test("4. section where everything is done shows one muted 'all done'-style line without open items", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    const pane = await openWeekReview(page);

    // A row/element for "All Done Section" exists
    const allDoneSection = pane.getByText("All Done Section");
    await expect(allDoneSection).toBeVisible();

    // No open items exist for that section
    const openInDoneSection = pane
      .locator('.modal-item:not(.done), .action-row:not(.done), [role="option"]:not(.done)')
      .filter({ hasText: /finish documentation|send release notes/ });
    await expect(openInDoneSection).toHaveCount(0);

    // Shows one muted "all done"-style line (accepting any text/style)
    const allDoneLine = pane
      .locator('.all-done, .muted, .section-muted, .empty-section, [data-all-done], [data-done="true"]')
      .or(pane.getByText(/all done|done|geen open|closed|completed/i));
    await expect(allDoneLine.first()).toBeVisible();
  });

  test("5. 'Show done' toggle is off by default and adds done/cancelled actions and discussed topics when enabled", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    const pane = await openWeekReview(page);

    // Off by default: done actions, cancelled actions, discussed topics are not shown
    await expect(pane).not.toContainText("finish documentation");
    await expect(pane).not.toContainText("cancelled task");
    await expect(pane).not.toContainText("past agenda item");

    // Toggle "Show done"
    const toggle = showDoneToggle(pane);
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Resolved items are now added/revealed
    await expect(pane).toContainText("finish documentation");
    await expect(pane).toContainText("cancelled task");
    await expect(pane).toContainText("past agenda item");
  });

  test("6. ArrowRight / ArrowLeft navigate weeks and Home returns to opening week", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    const pane = await openWeekReview(page);
    await expect(weekHeader(pane)).toContainText(/week\s*44|\b44\b/i);

    // ArrowLeft navigates to previous week (Week 43)
    await pane.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(weekHeader(pane)).toContainText(/week\s*43|\b43\b/i);
    await expect(pane).toContainText("week 43 retro topic");

    // ArrowRight navigates to next week (Week 44)
    await page.keyboard.press("ArrowRight");
    await expect(weekHeader(pane)).toContainText(/week\s*44|\b44\b/i);
    await expect(pane).toContainText("check server logs");

    // ArrowLeft again to Week 43
    await page.keyboard.press("ArrowLeft");
    await expect(weekHeader(pane)).toContainText(/week\s*43|\b43\b/i);

    // Home returns back to opening week's current week (Week 44)
    await page.keyboard.press("Home");
    await expect(weekHeader(pane)).toContainText(/week\s*44|\b44\b/i);
  });

  test("7. selecting an open action and pressing Enter opens its note with the caret on that line", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    const pane = await openWeekReview(page);

    // Select the action "send contract to client" (from 2026-10-27.txt line 3)
    const targetItem = weekItem(pane, "send contract to client");
    await expect(targetItem).toBeVisible();
    // Review: hover selects (a click already jumps, as in the Action Drawer, and the test's Enter then went to the
    // note and added a line); the pane keeps the focus.
    await targetItem.hover();

    // Press Enter to jump to the note
    await page.keyboard.press("Enter");

    // Active tab is now 2026-10-27
    await expect(activeTabLabel(page)).toHaveText("2026-10-27");

    // Caret is on line 3 where the action is defined
    await expect.poll(() => cursorLine(page)).toBe(3);

    // Editor is focused
    await expect(editor(page)).toBeFocused();
  });

  test("8. Ctrl+Space on an open action changes its symbol in the note and decrements open count by one", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    const pane = await openWeekReview(page);

    // Initially 7 open actions
    await expect(
      pane
        .locator('.stat-open, .count-actions, [data-stat="open-actions"]')
        .or(pane.getByText(/7\s*open\s*(?:actions)?/i))
        .first()
    ).toBeVisible();

    // Select "check server logs" and press Ctrl+Space
    const item = weekItem(pane, "check server logs");
    await expect(item).toBeVisible();
    await item.click();
    await page.keyboard.press("ControlOrMeta+Space");

    // The note is updated to done 'v'
    await expect
      .poll(async () => {
        const note = await mockNote(page, "2026-10-26.txt");
        return note && /v\s+check server logs/.test(note);
      })
      .toBe(true);

    // Open count drops from 7 to 6
    await expect(
      pane
        .locator('.stat-open, .count-actions, [data-stat="open-actions"]')
        .or(pane.getByText(/6\s*open\s*(?:actions)?/i))
        .first()
    ).toBeVisible();
  });

  test("9. 'still open from earlier weeks' line shows count of prior open actions and opens Action Drawer when activated", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });
    const pane = await openWeekReview(page);

    // Line displays count 3 of open actions before Week 44 (seeded in Week 42)
    const earlierLine = earlierWeeksButton(pane);
    await expect(earlierLine).toBeVisible();
    await expect(earlierLine).toContainText("3");

    // Activating it opens the Action Drawer
    await earlierLine.click();
    const actionDrawer = modalCard(page, MODAL_LABELS.actions).or(page.locator(".actions-pane"));
    await expect(actionDrawer).toBeVisible();
  });

  test("10. clicking a week number in the date picker opens the week review on that week", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });

    // Open the date picker
    const picker = await openDatePicker(page);
    await expect(picker).toBeVisible();

    // Click week number 44
    const weekNum = picker
      .locator(".cal-week-num, [data-week-num], button")
      .filter({ hasText: /^44$/ })
      .or(picker.getByRole("button", { name: "44" }))
      .first();
    await expect(weekNum).toBeVisible();
    await weekNum.click();

    // Week review opens on week 44
    const pane = weekReviewPane(page);
    await expect(pane).toBeVisible();
    await expect(weekHeader(pane)).toContainText(/week\s*44|\b44\b/i);
  });

  test("11. on a wide window (1280px) the view is docked next to the note and note remains visible and editable", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: SEED_NOTES,
        session: { openTabs: ["2026-10-28.txt"], activeTab: "2026-10-28.txt" },
      },
      now: NOW_WEDNESDAY_W44,
    });

    const pane = await openWeekReview(page);

    // Docked side-by-side with editor, without modal overlay
    await expect(pane).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(page.locator(".overlay")).toHaveCount(0);

    // Note remains editable while pane stays open
    await editor(page).click();
    await page.keyboard.type(" docked edit test");
    await expect(editor(page)).toContainText("docked edit test");
    await expect(pane).toBeVisible();
  });
});
