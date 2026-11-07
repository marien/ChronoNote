import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  openViaShortcut,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

const drawer = (page: Page): Locator => modalCard(page, MODAL_LABELS.actions);
const rows = (page: Page): Locator => drawer(page).locator('.modal-item[role="option"]');
const filterInput = (page: Page): Locator => drawer(page).locator(".modal-input");
const chips = (page: Page): Locator => drawer(page).locator(".search-chip");
const dueToggleLabel = (page: Page): Locator =>
  drawer(page).locator(".toggle-switch").filter({ hasText: "By due date" });
const dueToggleInput = (page: Page): Locator => dueToggleLabel(page).locator("input");
const statDue = (page: Page): Locator => page.locator("#stat-due");
const statDueOverdue = (page: Page): Locator => statDue(page).locator(".stat-due-overdue");
const statDueUpcoming = (page: Page): Locator => statDue(page).locator(".stat-due-upcoming");
const groupHeaders = (page: Page): Locator =>
  drawer(page).locator(".modal-group-header:not(.modal-group-header-sticky)");

test.describe("due dates upcoming, due: filter, and per-day headings", () => {
  test.beforeEach(async ({ page }) => {
    // Width < 1000 ensures dialog modal mode rather than docked pane
    await page.setViewportSize({ width: 950, height: 720 });
  });

  test("status bar #stat-due displays overdue and upcoming parts, aria-label, and has-today when an item is due today", async ({
    page,
  }) => {
    // REFERENCE_TODAY is Monday 2026-09-07
    const today = REFERENCE_TODAY;
    const past1 = "2026-09-03";
    const past2 = "2026-09-05";
    const tomorrow = "2026-09-08";
    const thursday = "2026-09-10";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: [
            `# today task by:${today}`,
            `# tomorrow task by:${tomorrow}`,
            `v done task by:${tomorrow}`,
            `=> @dana delegated by:${tomorrow}`,
          ].join("\n"),
          [`${past1}.txt`]: `# overdue 1 by:${past1}\n# future beyond window by:2026-09-25`,
          [`${past2}.txt`]: `# overdue 2 by:${past2}\n# thursday task by:${thursday}`,
        },
        session: {
          openTabs: [`${today}.txt`, `${past1}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    const button = statDue(page);
    await expect(button).toBeVisible();

    // 2 overdue (past1, past2)
    const overdueEl = statDueOverdue(page);
    await expect(overdueEl).toBeVisible();
    await expect(overdueEl).toContainText("2 overdue");

    // 3 upcoming (today, tomorrow, thursday); done, delegated, and far future excluded
    const upcomingEl = statDueUpcoming(page);
    await expect(upcomingEl).toBeVisible();
    await expect(upcomingEl).toContainText("3 upcoming");

    // Has-today class is present because one upcoming item is due today
    await expect(upcomingEl).toHaveClass(/has-today/);

    // aria-label holds full text
    await expect(button).toHaveAttribute("aria-label", /2 overdue, 3 upcoming/);
  });

  test("status bar .stat-due-upcoming does not have has-today class when items are upcoming but none are due today", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY;
    const tomorrow = "2026-09-08";
    const wednesday = "2026-09-09";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: [
            `# action tomorrow by:${tomorrow}`,
            `# action wednesday by:${wednesday}`,
          ].join("\n"),
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    const button = statDue(page);
    await expect(button).toBeVisible();

    // No overdue items -> overdue part is absent / not visible
    await expect(statDueOverdue(page)).toHaveCount(0);

    const upcomingEl = statDueUpcoming(page);
    await expect(upcomingEl).toBeVisible();
    await expect(upcomingEl).toContainText("2 upcoming");

    // Exactly no items due today -> has-today must NOT be present
    await expect(upcomingEl).not.toHaveClass(/has-today/);
    await expect(button).toHaveAttribute("aria-label", /2 upcoming/);
  });

  test("status bar #stat-due is hidden when there are neither overdue nor upcoming items", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY;

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: [
            "v past done by:2026-09-01",
            "x past cancelled by:2026-09-01",
            "# far future action by:2026-09-28",
            "# plain action without due date",
            "=> @dana delegated action by:2026-09-08",
          ].join("\n"),
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    // Hidden when neither overdue nor upcoming
    await expect(statDue(page)).toBeHidden();
  });

  test("status bar tooltip lists up to 8 items soonest first with section titles and '+N more' for 10 items", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY;

    // Seed exactly 10 due items across notes (2 overdue + 8 upcoming)
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-03.txt": "# fix legacy bug by:2026-09-03",
          "2026-09-05.txt": "# update staging certs by:2026-09-05",
          [`${today}.txt`]: [
            "Project Road",
            "===",
            `# buy gravel by:${today}`,
            "# order cement by:2026-09-08",
            "# hire mixer by:2026-09-09",
            "# lay foundation by:2026-09-10",
            "# build frames by:2026-09-11",
            "# pour concrete by:2026-09-12",
            "# install pipes by:2026-09-13",
            "# wire electrics by:2026-09-13",
          ].join("\n"),
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    const button = statDue(page);
    await expect(button).toBeVisible();
    // The closed notes are read after the first render: wait until all 10 items are in.
    await expect(button).toHaveAttribute("title", /\+2 more$/);

    const title = await button.getAttribute("title");
    expect(title).toBeTruthy();
    const lines = title!.split("\n");

    // Title starts with description line, lists at most 8 items, then "+2 more" (1 + 8 + 1 = 10 lines)
    expect(lines.length).toBe(10);
    expect(lines[lines.length - 1]).toBe("+2 more");

    // Soonest first: earliest overdue item appears in the first item line (line index 1)
    expect(lines[1]).toContain("fix legacy bug");
    expect(lines[2]).toContain("update staging certs");

    // Section title included as (<section title>) for items in a section
    // and text without '# ' and without 'by:...'
    const gravelLine = lines.find((l) => l.includes("buy gravel"));
    expect(gravelLine).toBeDefined();
    expect(gravelLine).toContain("· buy gravel (Project Road)");
    expect(gravelLine).not.toContain("#");
    expect(gravelLine).not.toContain("by:");

    // Items outside a section have no section in parentheses (the 2026-09-03 note has no section)
    const legacyLine = lines.find((l) => l.includes("fix legacy bug"));
    expect(legacyLine).toBeDefined();
    expect(legacyLine).toContain("· fix legacy bug");
    expect(legacyLine).not.toContain("(");

    // 8th item is pour concrete
    expect(lines[8]).toContain("pour concrete");

    // Items 9 and 10 (install pipes, wire electrics) are overflowed into "+2 more"
    expect(lines.some((l) => l.includes("install pipes"))).toBe(false);
    expect(lines.some((l) => l.includes("wire electrics"))).toBe(false);
  });

  test("clicking #stat-due opens Actions drawer in due-date mode", async ({ page }) => {
    const today = REFERENCE_TODAY;

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# action due today by:${today}`,
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    await statDue(page).click();

    // Opens Actions drawer with "By due date" checked
    await expect(drawer(page)).toBeVisible();
    await expect(dueToggleInput(page)).toBeChecked();
  });

  test("live update: typing a new upcoming action in open note updates count without reload", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY;
    const tomorrow = "2026-09-08";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# initial task by:${tomorrow}`,
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    const upcomingEl = statDueUpcoming(page);
    await expect(upcomingEl).toContainText("1 upcoming");

    // Focus editor and type a new upcoming task line
    const content = editor(page);
    await content.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(`# call Anna by:${tomorrow}`);

    // Count updates to 2 upcoming without reload
    await expect(upcomingEl).toContainText("2 upcoming");

    // Tooltip also includes the new task
    await expect(statDue(page)).toHaveAttribute("title", /call Anna/);
  });

  test("due: filter word in Actions drawer supports ISO date and day word (due:tomorrow), and removal", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY; // 2026-09-07 (Monday)
    const tomorrow = "2026-09-08";
    const targetDay = "2026-09-10";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: [
            `# task today by:${today}`,
            `# task tomorrow note 1 by:${tomorrow}`,
            `# task target day note 1 by:${targetDay}`,
          ].join("\n"),
          "2026-09-05.txt": [
            `# task tomorrow note 2 by:${tomorrow}`,
            `# task target day note 2 by:${targetDay}`,
            `v task done tomorrow by:${tomorrow}`,
            `=> @dana delegated tomorrow by:${tomorrow}`,
          ].join("\n"),
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    // Open Actions drawer
    const d = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const allFilesRadio = d.getByRole("radio", { name: "All Files" });
    await allFilesRadio.click();

    const input = filterInput(page);

    // 1. Filter by explicit ISO date due:2026-09-10
    await input.fill(`due:${targetDay}`);

    // Removable chip appears labelled due:2026-09-10
    const chipList = chips(page);
    await expect(chipList).toHaveCount(1);
    await expect(chipList.first()).toContainText(`due:${targetDay}`);

    // Only open own actions due on 2026-09-10 are shown
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: "task target day note 1" })).toBeVisible();
    await expect(rows(page).filter({ hasText: "task target day note 2" })).toBeVisible();
    await expect(drawer(page)).not.toContainText("task today");
    await expect(drawer(page)).not.toContainText("task tomorrow");

    // 2. Remove chip restores full list
    const removeBtn = chipList.first().locator(".chip-remove-btn");
    await removeBtn.click();
    await expect(chipList).toHaveCount(0);
    // All 5 open actions across notes are restored
    await expect(rows(page)).toHaveCount(5);

    // 3. Filter by day word due:tomorrow
    await input.fill("due:tomorrow");

    // Chip resolves tomorrow from today (2026-09-07 -> 2026-09-08) and displays ISO date
    await expect(chipList).toHaveCount(1);
    await expect(chipList.first()).toContainText(`due:${tomorrow}`);

    // Shows only open own actions due tomorrow (done and delegated are excluded)
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: "task tomorrow note 1" })).toBeVisible();
    await expect(rows(page).filter({ hasText: "task tomorrow note 2" })).toBeVisible();
    await expect(drawer(page)).not.toContainText("task done tomorrow");
    await expect(drawer(page)).not.toContainText("delegated tomorrow");

    // 4. Later due: replaces earlier due:
    await input.fill(`due:${targetDay}`);
    await expect(chipList).toHaveCount(1);
    await expect(chipList.first()).toContainText(`due:${targetDay}`);
    await expect(rows(page)).toHaveCount(2);
  });

  test("due view displays per-day headings in date order with 'Tomorrow', 'Later', and no 'This week'", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY; // 2026-09-07 (Monday)
    const past = "2026-09-04";
    const tomorrow = "2026-09-08";
    const thursday = "2026-09-10";
    const nextWeek = "2026-09-20";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: [
            `# action today by:${today}`,
            `# action tomorrow by:${tomorrow}`,
            `# action thursday by:${thursday}`,
            `# action later by:${nextWeek}`,
          ].join("\n"),
          [`${past}.txt`]: `# action overdue by:${past}`,
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    // Open via stat button or shortcut, ensure due view and All Files
    await statDue(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect(dueToggleInput(page)).toBeChecked();

    const allFilesRadio = drawer(page).getByRole("radio", { name: "All Files" });
    await expect(allFilesRadio).toBeChecked();

    const headers = groupHeaders(page);
    // Headings expected in date order:
    // 0: Overdue
    // 1: Today
    // 2: Tomorrow
    // 3: Thursday (short weekday + date in user's date format, e.g. Thu 10 Sep / Thu 10 Sept)
    // 4: Later
    await expect(headers).toHaveCount(5);
    await expect(headers.nth(0)).toContainText("Overdue");
    await expect(headers.nth(1)).toContainText("Today");
    await expect(headers.nth(2)).toContainText("Tomorrow");
    // Flexible check for Thursday 10 Sep heading without hardcoding exact format
    await expect(headers.nth(3)).toContainText(/10/);
    await expect(headers.nth(3)).toContainText(/Thu|Sep/i);
    await expect(headers.nth(4)).toContainText("Later");

    // Crucially: no "This week" heading anywhere in the due view
    await expect(headers.filter({ hasText: "This week" })).toHaveCount(0);
    await expect(drawer(page)).not.toContainText("This week");
  });
});
