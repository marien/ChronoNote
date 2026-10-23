import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  currentModal,
  mockNote,
  activeTabLabel,
  cursorLine,
  tab,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

const drawer = (page: Page): Locator => modalCard(page, MODAL_LABELS.actions);
const history = (page: Page): Locator => modalCard(page, MODAL_LABELS.history);
const occRow = (page: Page, date: string) => history(page).locator(".history-occ-tab").filter({ hasText: date });
const detailLine = (page: Page, text: string) => history(page).locator(".history-select-line", { hasText: text });
const rows = (page: Page): Locator => drawer(page).locator('.modal-item[role="option"]');
const filterInput = (page: Page): Locator => drawer(page).locator(".modal-input");
const dueToggleLabel = (page: Page): Locator =>
  drawer(page).locator(".toggle-switch").filter({ hasText: "By due date" });
const dueToggleInput = (page: Page): Locator => dueToggleLabel(page).locator("input");
const onlyOpenToggleLabel = (page: Page): Locator =>
  drawer(page).locator(".toggle-switch").filter({ hasText: "Only Open" });
const onlyOpenToggleInput = (page: Page): Locator => onlyOpenToggleLabel(page).locator("input");

test.describe("due dates slice 3 independent: overdue count and due view", () => {
  test("status bar overdue count covers all notes, scratchpads, live tab edits, multiple parts per line, and updates reactively", async ({
    page,
  }) => {
    // Pinned to Monday REFERENCE_TODAY (2026-09-07)
    await page.setViewportSize({ width: 950, height: 720 });
    const today = REFERENCE_TODAY;
    const closedDate = "2026-09-01";
    const activeDate = "2026-09-03";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# today action by:${today}\n# future action by:2026-09-20`,
          [`${closedDate}.txt`]: `# closed overdue by:${closedDate}`,
          [`${activeDate}.txt`]: [
            `# active overdue by:${activeDate}`,
            `v done past by:2026-08-30`,
            `> deferred past by:2026-08-30`,
            `x cancelled past by:2026-08-30`,
            `=> @dana delegated past by:2026-08-30`,
            `# unparsed word by:fri`,
            `o topic past by:2026-08-30`,
            `- bullet past by:2026-08-30`,
            `# multi 1 by:2026-09-04 => # multi 2 by:2026-09-05`,
          ].join("\n"),
        },
        session: {
          openTabs: [`${today}.txt`, `${activeDate}.txt`],
          activeTab: `${activeDate}.txt`,
        },
      },
    });

    const statOverdue = page.locator("#stat-overdue");
    // Expected count:
    // closedDate: 1 (# closed overdue)
    // activeDate: 1 (# active overdue) + 2 (# multi 1 and # multi 2) = 3
    // Total = 4
    await expect(statOverdue).toBeVisible();
    await expect(statOverdue.locator(".stat-full")).toHaveText("4 overdue");
    await expect(statOverdue.locator(".stat-compact")).toHaveText("4");

    // Close '# active overdue' in place via editor -> count drops to 3
    const overdueLine = editor(page).locator(".cm-line").filter({ hasText: "active overdue" });
    await overdueLine.click();
    await page.keyboard.press("Control+Space");
    await expect(statOverdue.locator(".stat-full")).toHaveText("3 overdue");

    // Reopen it in place via editor -> count returns to 4
    await page.keyboard.press("Control+Shift+Space");
    await expect(statOverdue.locator(".stat-full")).toHaveText("4 overdue");

    // Type a new overdue action in the active editor -> count increases to 5 without reload
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("# freshly typed overdue by:2026-09-02");
    await expect(statOverdue.locator(".stat-full")).toHaveText("5 overdue");
  });

  test("deleting a note removes its overdue actions from count without reload", async ({ page }) => {
    await page.setViewportSize({ width: 950, height: 720 });
    const today = REFERENCE_TODAY;
    const oldNote = "2026-09-01";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# today note\n`,
          [`${oldNote}.txt`]: `# overdue task to be deleted by:${oldNote}\n`,
        },
        session: {
          openTabs: [`${today}.txt`, `${oldNote}.txt`],
          activeTab: `${oldNote}.txt`,
        },
      },
    });

    const statOverdue = page.locator("#stat-overdue");
    await expect(statOverdue).toBeVisible();
    await expect(statOverdue.locator(".stat-full")).toHaveText("1 overdue");

    // Empty the old note's content and close the tab (which deletes the note)
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");

    // Close tab via middle click
    await tab(page, `${oldNote}.txt`).click({ button: "middle" });
    await expect(tab(page, `${oldNote}.txt`)).not.toBeVisible();
    await expect.poll(() => mockNote(page, `${oldNote}.txt`)).toBeNull();

    // Overdue count is now 0, button disappears
    await expect(statOverdue).toHaveCount(0);
  });

  test("after midnight rollover and window focus, a due-today action counts as overdue", async ({ page }) => {
    await page.setViewportSize({ width: 950, height: 720 });
    const today = REFERENCE_TODAY; // 2026-09-07

    // Start with clock pinned to 23:59:00 on REFERENCE_TODAY
    await seedApp(page, {
      now: new Date(`${today}T23:59:00`),
      seed: {
        notes: {
          [`${today}.txt`]: `# due today action by:${today}\n`,
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    // Zero overdue at start
    await expect(page.locator("#stat-overdue")).toHaveCount(0);

    // Fast-forward clock past midnight to next morning (2026-09-08T09:00:00)
    await page.clock.setFixedTime(new Date("2026-09-08T09:00:00"));

    // Trigger window focus
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    // The due-today action is now overdue!
    const statOverdue = page.locator("#stat-overdue");
    await expect(statOverdue).toBeVisible();
    await expect(statOverdue.locator(".stat-full")).toHaveText("1 overdue");
  });

  test("narrow windows: overdue item stays visible when folder name, word count and position hide", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY;
    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# overdue action by:2026-09-01\nSome words here to count\n`,
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    const statOverdue = page.locator("#stat-overdue");
    const statFolderName = page.locator(".status-folder-name");
    const statWords = page.locator("#stat-words");
    const statPos = page.locator("#stat-pos");

    // Wide window (1000px): all are visible
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect(statOverdue).toBeVisible();
    await expect(statFolderName).toBeVisible();
    await expect(statWords).toBeVisible();
    await expect(statPos).toBeVisible();

    // Collapse width to 500px: folder name, words, and position are hidden, overdue stays visible
    await page.setViewportSize({ width: 500, height: 700 });
    await expect(statFolderName).toBeHidden();
    await expect(statWords).toBeHidden();
    await expect(statPos).toBeHidden();
    await expect(statOverdue).toBeVisible();
    await expect(statOverdue.locator(".stat-full")).toBeVisible();

    // Collapse width to 400px: .stat-full hides and .stat-compact shows, overdue button stays visible
    await page.setViewportSize({ width: 400, height: 700 });
    await expect(statOverdue).toBeVisible();
    await expect(statOverdue.locator(".stat-full")).toBeHidden();
    await expect(statOverdue.locator(".stat-compact")).toBeVisible();
  });

  test("forwarding via paste, drawer Shift+Enter, and Section History take-over preserves by: and does not double count", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 950, height: 720 });
    const today = REFERENCE_TODAY;
    const old1 = "2026-09-01";
    const old2 = "2026-09-02";
    const old3 = "2026-09-03";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: "Sprint Review\n=============\nTop priorities\n==============\n",
          [`${old1}.txt`]: `Section A\n=========\n# paste forward task by:${old1}\n`,
          [`${old2}.txt`]: `Section B\n=========\n# drawer forward task by:${old2}\n`,
          [`${old3}.txt`]: `Sprint Review\n=============\n# history takeover task by:${old3}\n`,
        },
        session: {
          openTabs: [`${today}.txt`, `${old1}.txt`, `${old2}.txt`],
          activeTab: `${old1}.txt`,
        },
      },
    });

    const statOverdue = page.locator("#stat-overdue");
    await expect(statOverdue).toBeVisible();
    await expect(statOverdue.locator(".stat-full")).toHaveText("3 overdue");

    // 1. Copy-forward by paste: navigate to action line in old1 tab, copy it
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+C");

    // Switch to today tab and paste
    await tab(page, `${today}.txt`).click();
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ControlOrMeta+V");

    // Verify source note became '>' and destination has '#' with from-link, both keeping by:
    await expect.poll(() => mockNote(page, `${old1}.txt`)).toContain(`> paste forward task by:${old1}`);
    await expect.poll(() => mockNote(page, `${today}.txt`)).toContain(`# paste forward task by:${old1}`);

    // Overdue count is still 3 (did not double!)
    await expect(statOverdue.locator(".stat-full")).toHaveText("3 overdue");

    // 2. Shift+Enter in Action Drawer on old2 task
    await statOverdue.click();
    await expect(drawer(page)).toBeVisible();
    await filterInput(page).fill("drawer forward task");
    await filterInput(page).focus();
    await page.keyboard.press("Shift+Enter");

    // Verify old2 note became '>' and today note has '#', keeping by:
    await expect.poll(() => mockNote(page, `${old2}.txt`)).toContain(`> drawer forward task by:${old2}`);
    await expect.poll(() => mockNote(page, `${today}.txt`)).toContain(`# drawer forward task by:${old2}`);

    // Overdue count is still 3 (did not double!)
    await expect(statOverdue.locator(".stat-full")).toHaveText("3 overdue");

    // Close drawer
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();

    // 3. Section History take-over:
    // In today's note, place cursor inside Sprint Review section header
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown"); // move onto Sprint Review
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(history(page)).toBeVisible();

    // Click old3 occurrence and select the history takeover task line
    await occRow(page, old3).click();
    await detailLine(page, "history takeover task").click();

    // Takeover bar offers "Add to today"
    const takeoverBar = history(page).locator(".history-takeover-bar");
    await expect(takeoverBar).toBeVisible();
    await takeoverBar.getByRole("button", { name: "Add to today" }).click();

    // Verify old3 note became '>' and today note has '#', keeping by:
    await expect.poll(() => mockNote(page, `${old3}.txt`)).toContain(`> history takeover task by:${old3}`);
    await expect.poll(() => mockNote(page, `${today}.txt`)).toContain(`# history takeover task by:${old3}`);

    // Overdue count is STILL 3 (did not double!)
    await expect(statOverdue.locator(".stat-full")).toHaveText("3 overdue");
  });

  test("due view groups on Monday vs Sunday: 'This week' ends on Sunday and is omitted when today is Sunday", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 950, height: 720 });

    // --- Scenario A: Today is Monday 2026-09-07 (ISO week ends Sunday 2026-09-13) ---
    const monday = "2026-09-07";
    await seedApp(page, {
      now: new Date(`${monday}T09:00:00`),
      seed: {
        notes: {
          [`${monday}.txt`]: [
            `# overdue item by:2026-09-05`,
            `# today item by:${monday}`,
            `# this week item 1 by:2026-09-09`,
            `# this week item 2 by:2026-09-13`,
            `# later item by:2026-09-14`,
          ].join("\n"),
        },
        session: { openTabs: [`${monday}.txt`], activeTab: `${monday}.txt` },
      },
    });

    await page.locator("#stat-overdue").click();
    await expect(drawer(page)).toBeVisible();
    await expect(dueToggleInput(page)).toBeChecked();

    const groupHeadersMonday = drawer(page).locator(".modal-group-header:not(.modal-group-header-sticky)");
    await expect(groupHeadersMonday.nth(0)).toContainText("Overdue");
    await expect(groupHeadersMonday.nth(1)).toContainText("Today");
    await expect(groupHeadersMonday.nth(2)).toContainText("This week");
    await expect(groupHeadersMonday.nth(3)).toContainText("Later");

    // This week contains 2 items
    await expect(groupHeadersMonday.nth(2)).toContainText("2");

    // --- Scenario B: Today is Sunday 2026-09-13 (ISO week ends today, no days remaining in this week) ---
    const sunday = "2026-09-13";
    await seedApp(page, {
      now: new Date(`${sunday}T09:00:00`),
      seed: {
        notes: {
          [`${sunday}.txt`]: [
            `# overdue item by:2026-09-10`,
            `# today item by:${sunday}`,
            `# later item by:2026-09-14`,
          ].join("\n"),
        },
        session: { openTabs: [`${sunday}.txt`], activeTab: `${sunday}.txt` },
      },
    });

    await page.locator("#stat-overdue").click();
    await expect(drawer(page)).toBeVisible();

    const groupHeadersSunday = drawer(page).locator(".modal-group-header:not(.modal-group-header-sticky)");
    // 'This week' must be omitted! Only Overdue, Today, Later appear
    await expect(groupHeadersSunday).toHaveCount(3);
    await expect(groupHeadersSunday.nth(0)).toContainText("Overdue");
    await expect(groupHeadersSunday.nth(1)).toContainText("Today");
    await expect(groupHeadersSunday.nth(2)).toContainText("Later");
    await expect(drawer(page)).not.toContainText("This week");
  });

  test("due view filters, excludes undated actions, shows delegated only with '@', and restoring view keeps 'Only open' setting", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 950, height: 720 });
    const today = REFERENCE_TODAY;
    const old = "2026-09-01";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: [
            `# alpha action by:${today}`,
            `# beta action by:2026-09-20`,
            `# gamma undated action`,
            `v done action by:2026-09-01`,
            `=> @priya delegated action by:2026-09-01`,
          ].join("\n"),
          [`${old}.txt`]: `# overdue action by:${old}\n`,
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    // Open drawer via status bar overdue button
    await page.locator("#stat-overdue").click();
    await expect(drawer(page)).toBeVisible();
    await expect(dueToggleInput(page)).toBeChecked();

    // 1. Undated action is not in due view
    await expect(drawer(page)).not.toContainText("gamma undated action");
    // Completed action is not in due view
    await expect(drawer(page)).not.toContainText("done action");

    // 2. Delegated line does not appear without '@' in filter
    await expect(drawer(page)).not.toContainText("delegated action");

    // 3. Text filter narrows the view
    await filterInput(page).fill("alpha");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("alpha action");

    // 4. Delegated lines appear when filter contains '@'
    await filterInput(page).fill("@priya");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("delegated action");
    await expect(rows(page).first().locator(".item-breadcrumb")).toContainText(today);

    // Clear filter
    await filterInput(page).fill("");

    // 5. Uncheck "Only Open" toggle while in due view
    await expect(onlyOpenToggleInput(page)).toBeChecked();
    await onlyOpenToggleLabel(page).click();
    await expect(onlyOpenToggleInput(page)).not.toBeChecked();

    // 6. Switching due view off restores normal per-note grouping and preserves 'Only open' (unchecked)
    await dueToggleLabel(page).click();
    await expect(dueToggleInput(page)).not.toBeChecked();
    await expect(onlyOpenToggleInput(page)).not.toBeChecked();

    // With Only Open off in normal view, the completed action and undated action appear!
    await expect(drawer(page)).toContainText("done action");
    await expect(drawer(page)).toContainText("gamma undated action");

    // Check Only Open again
    await onlyOpenToggleLabel(page).click();
    await expect(onlyOpenToggleInput(page)).toBeChecked();
    await expect(drawer(page)).not.toContainText("done action");

    // Switch due view on and off again: Only Open remains checked
    await dueToggleLabel(page).click();
    await expect(dueToggleInput(page)).toBeChecked();
    await dueToggleLabel(page).click();
    await expect(dueToggleInput(page)).not.toBeChecked();
    await expect(onlyOpenToggleInput(page)).toBeChecked();
  });

  test("dialog mode (<1000px): Enter jumps and closes modal; Ctrl+Space closes row and it leaves the view while modal stays open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 950, height: 720 });
    const today = REFERENCE_TODAY;
    const old = "2026-09-01";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# today note task by:${today}\n`,
          [`${old}.txt`]: `# overdue row A by:${old}\n# overdue row B by:${old}\n`,
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    await page.locator("#stat-overdue").click();
    await expect(drawer(page)).toBeVisible();

    // 1. Enter jumps to line and closes modal
    await filterInput(page).fill("overdue row B");
    await filterInput(page).focus();
    await page.keyboard.press("Enter");

    await expect(drawer(page)).toBeHidden();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(old);
    await expect.poll(() => cursorLine(page)).toBe(2);

    // 2. Reopen drawer, Ctrl+Space closes row and it leaves the view, modal stays open
    await page.locator("#stat-overdue").click();
    await expect(drawer(page)).toBeVisible();

    await filterInput(page).fill("overdue row A");
    const rowA = rows(page).first();
    await expect(rowA).toContainText("overdue row A");

    // Press Ctrl+Space on the row
    await filterInput(page).focus();
    await page.keyboard.press("Control+Space");

    // Row leaves the view immediately (no matching option row remains)
    await expect(rows(page).filter({ hasText: "overdue row A" })).toHaveCount(0);
    // Modal is STILL open!
    await expect(drawer(page)).toBeVisible();

    // Old note on disk has row A completed as 'v'
    await expect.poll(() => mockNote(page, `${old}.txt`)).toContain(`v overdue row A by:${old}`);
  });

  test("docked pane mode (>=1000px): Enter jumps and keeps pane open; Ctrl+Space closes row and it leaves the view", async ({
    page,
  }) => {
    // Width 1200 ensures docked pane mode (.actions-pane)
    await page.setViewportSize({ width: 1200, height: 800 });
    const today = REFERENCE_TODAY;
    const old = "2026-09-01";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# today note task by:${today}\n`,
          [`${old}.txt`]: `# docked overdue A by:${old}\n# docked overdue B by:${old}\n`,
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    await page.locator("#stat-overdue").click();
    const pane = page.locator(".actions-pane");
    await expect(pane).toBeVisible();
    await expect(page.locator(".overlay")).toHaveCount(0); // Docked pane has no overlay

    // 1. Enter jumps to line in editor and keeps pane open
    const paneFilter = pane.locator(".modal-input");
    await paneFilter.fill("docked overdue B");
    await paneFilter.focus();
    await page.keyboard.press("Enter");

    await expect.poll(() => cursorLine(page)).toBe(2);
    await expect(pane).toBeVisible(); // Docked pane STAYS OPEN!
    expect(await currentModal(page)).toBe("actions");

    // 2. Ctrl+Space closes the item: item leaves the view, pane stays open
    await paneFilter.fill("docked overdue A");
    await expect(pane.locator('.modal-item[role="option"]').first()).toContainText("docked overdue A");
    await paneFilter.focus();
    await page.keyboard.press("Control+Space");

    // Row A leaves the view
    await expect(pane.locator('.modal-item[role="option"]').filter({ hasText: "docked overdue A" })).toHaveCount(0);
    await expect(pane).toBeVisible();

    // Disk contains 'v docked overdue A'
    await expect.poll(() => mockNote(page, `${old}.txt`)).toContain(`v docked overdue A by:${old}`);
  });

  test("empty states: empty due list displays due empty message; filter with no match displays filter empty message", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 950, height: 720 });
    const today = REFERENCE_TODAY;

    // Seed notes with actions that have NO due dates
    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# plain action 1\n# plain action 2\n`,
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    // Status bar overdue button is absent
    await expect(page.locator("#stat-overdue")).toHaveCount(0);

    // Open Action Drawer via keyboard shortcut Ctrl+Shift+A
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(drawer(page)).toBeVisible();

    // Toggle "By due date" ON
    await dueToggleLabel(page).click();
    await expect(dueToggleInput(page)).toBeChecked();

    // Empty state for due view without filter
    const emptyState = drawer(page).locator(".empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("No open actions with a due date");

    // Now type a filter that has no matches
    await filterInput(page).fill("xyz123noexist");
    await expect(emptyState).toContainText('No actions match "xyz123noexist"');
    await expect(emptyState).toContainText("Try a different keyword or clear the search filter");
  });
});
