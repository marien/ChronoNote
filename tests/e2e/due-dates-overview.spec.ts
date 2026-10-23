import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  currentModal,
  mockNote,
  activeTabLabel,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

const drawer = (page: Page): Locator => modalCard(page, MODAL_LABELS.actions);
const rows = (page: Page): Locator => drawer(page).locator('.modal-item[role="option"]');
const filterInput = (page: Page): Locator => drawer(page).locator(".modal-input");
const dueToggleLabel = (page: Page): Locator =>
  drawer(page).locator(".toggle-switch").filter({ hasText: "By due date" });
const dueToggleInput = (page: Page): Locator => dueToggleLabel(page).locator("input");

test.describe("due dates slice 3: status bar and Action Drawer due view", () => {
  test.beforeEach(async ({ page }) => {
    // Width < 1000 ensures dialog modal mode rather than docked pane
    await page.setViewportSize({ width: 950, height: 720 });
  });

  test("status bar overdue item appears when overdue > 0, absent at 0, lowers on close in editor", async ({
    page,
  }) => {
    // REFERENCE_TODAY is 2026-09-07 (Monday)
    const today = REFERENCE_TODAY;
    const past1 = "2026-09-05";
    const past2 = "2026-09-03";
    const delegatedPast = "2026-09-04";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# today task by:${today}\n# later task by:2026-09-20`,
          [`${past1}.txt`]: `# action overdue in tab by:${past1}\n=> @dana delegated overdue by:${delegatedPast}`,
          [`${past2}.txt`]: `# overdue in closed note by:${past2}\n# this week task by:2026-09-10`,
        },
        session: {
          openTabs: [`${today}.txt`, `${past1}.txt`],
          activeTab: `${past1}.txt`,
        },
      },
    });

    const statOverdue = page.locator("#stat-overdue");
    // 2 overdue actions: past1 in open tab and past2 in closed note (delegated is not counted)
    await expect(statOverdue).toBeVisible();
    await expect(statOverdue.locator(".stat-full")).toHaveText("2 overdue");
    await expect(statOverdue.locator(".stat-compact")).toHaveText("2");
    await expect(statOverdue.locator(".stat-glyph")).toHaveText("!");

    // Close the overdue action in the active editor (past1)
    const actionLine = editor(page).locator(".cm-line").filter({ hasText: "action overdue in tab" });
    await actionLine.click();
    await page.keyboard.press("Control+Space");

    // Overdue count lowers to 1 (only past2 in closed note remains)
    await expect(statOverdue.locator(".stat-full")).toHaveText("1 overdue");
    await expect(statOverdue.locator(".stat-compact")).toHaveText("1");
  });

  test("status bar overdue item is absent when overdue count is zero", async ({ page }) => {
    const today = REFERENCE_TODAY;
    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# today task by:${today}\n# future task by:2026-09-20\nv past done by:2026-09-01`,
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    // Absent at zero
    await expect(page.locator("#stat-overdue")).toHaveCount(0);
  });

  test("clicking overdue item opens drawer in due view on All files with groups, order, and toggle", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY; // 2026-09-07 (Monday), week ends Sunday 2026-09-13
    const past1 = "2026-09-05";
    const past2 = "2026-09-03";
    const delegatedPast = "2026-09-04";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# action due today by:${today}\n# action due later by:2026-09-20`,
          [`${past1}.txt`]: `# action overdue in tab by:${past1}\n=> @dana delegated overdue by:${delegatedPast}`,
          [`${past2}.txt`]: `# action overdue in closed by:${past2}\n# action due this week by:2026-09-10`,
        },
        session: {
          openTabs: [`${today}.txt`, `${past1}.txt`],
          activeTab: `${past1}.txt`,
        },
      },
    });

    // Click overdue button
    await page.locator("#stat-overdue").click();

    // Drawer opens in All files scope with due view enabled
    await expect(drawer(page)).toBeVisible();
    await expect(dueToggleInput(page)).toBeChecked();

    const allFilesRadio = drawer(page).getByRole("radio", { name: "All Files" });
    await expect(allFilesRadio).toBeChecked();

    // Verify the groups appear in order: Overdue, Today, This week, Later
    const groupHeaders = drawer(page).locator(".modal-group-header:not(.modal-group-header-sticky)");
    await expect(groupHeaders.nth(0)).toContainText("Overdue");
    await expect(groupHeaders.nth(1)).toContainText("Today");
    await expect(groupHeaders.nth(2)).toContainText("This week");
    await expect(groupHeaders.nth(3)).toContainText("Later");

    // Overdue items inside the group are ordered by due date ascending: past2 (09-03) before past1 (09-05)
    const overdueFirst = rows(page).filter({ hasText: "action overdue in closed" });
    const overdueSecond = rows(page).filter({ hasText: "action overdue in tab" });
    await expect(overdueFirst).toBeVisible();
    await expect(overdueSecond).toBeVisible();

    // Rows show note context (note date in breadcrumb)
    await expect(overdueFirst.locator(".item-breadcrumb")).toContainText(past2);
    await expect(overdueSecond.locator(".item-breadcrumb")).toContainText(past1);

    // Delegated line does not appear without @ in filter
    await expect(drawer(page)).not.toContainText("delegated overdue");

    // Delegated line appears when filter has @
    await filterInput(page).fill("@");
    await expect(drawer(page)).toContainText("delegated overdue");

    // Clear filter
    await filterInput(page).fill("");
    await expect(drawer(page)).not.toContainText("delegated overdue");

    // Toggle switches back to normal view
    await dueToggleLabel(page).click();
    await expect(dueToggleInput(page)).not.toBeChecked();
    // Normal view groups by file (top group is today's note)
    await expect(groupHeaders.first()).toContainText(today);
  });

  test("Enter jumps to line from due view, Shift+Enter forwards with by: intact", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY;
    const past = "2026-09-03";

    await seedApp(page, {
      seed: {
        notes: {
          [`${today}.txt`]: `# today note task by:${today}`,
          [`${past}.txt`]: `# closed task to forward by:${past}`,
        },
        session: {
          openTabs: [`${today}.txt`],
          activeTab: `${today}.txt`,
        },
      },
    });

    // Open via overdue button
    await page.locator("#stat-overdue").click();
    await expect(drawer(page)).toBeVisible();

    // Filter to closed task
    await filterInput(page).fill("closed task to forward");
    const targetRow = rows(page).first();
    await expect(targetRow).toContainText("closed task to forward");

    // Enter jumps to the line
    await filterInput(page).focus();
    await page.keyboard.press("Enter");

    await expect(drawer(page)).toBeHidden();
    expect(await currentModal(page)).toBe("none");
    await expect(activeTabLabel(page)).toHaveText(past);
    await expect(editor(page)).toContainText(`closed task to forward by:${past}`);

    // Reopen drawer
    await page.locator("#stat-overdue").click();
    await expect(drawer(page)).toBeVisible();

    // Shift+Enter forwards it to today
    await filterInput(page).fill("closed task to forward");
    await filterInput(page).focus();
    await page.keyboard.press("Shift+Enter");

    // Source note gets '>' and keeps by:
    await expect.poll(() => mockNote(page, `${past}.txt`)).toContain(`> closed task to forward by:${past}`);
    // Today's note gets '#' on top with from-link and keeps by:
    await expect.poll(() => mockNote(page, `${today}.txt`)).toContain(`# closed task to forward by:${past}`);
  });
});
