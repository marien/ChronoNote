import { test, expect } from "@playwright/test";
import {
  seedApp,
  todayFilename,
  openViaShortcut,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";
import { addDaysISO } from "../../src/lib/date";

test.describe("Action Drawer due date and topic pills (§426-T)", () => {
  const yesterday = addDaysISO(REFERENCE_TODAY, -1);
  const tomorrow = addDaysISO(REFERENCE_TODAY, 1);

  test("draws topic pills and overdue/later due pills while maintaining 36px row height", async ({ page }) => {
    const noteContent = [
      `# (budget) review the plan by:${yesterday}`,
      `# call Dana by:${tomorrow}`,
      `# plain action`,
    ].join("\n");

    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: noteContent,
        },
      },
    });

    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const rows = drawer.locator('.modal-item[role="option"]');
    await expect(rows).toHaveCount(3);

    // Row 0: # (budget) review the plan by:<yesterday>
    const row0 = rows.nth(0);
    await expect(row0).toContainText("review the plan");

    // The first row contains an element with class glyph-topic whose text includes budget
    const topic0 = row0.locator(".glyph-topic");
    await expect(topic0).toBeVisible();
    await expect(topic0).toContainText("budget");

    // The row contains an element .cm-due.cm-due-overdue containing .cm-due-flag
    const due0 = row0.locator(".cm-due.cm-due-overdue");
    await expect(due0).toBeVisible();
    await expect(due0.locator(".cm-due-flag")).toBeVisible();

    // The row's text with (topic) still reads budget in it (textContent)
    const text0 = await row0.textContent();
    expect(text0).toContain("budget");

    // Row 1: # call Dana by:<tomorrow>
    const row1 = rows.nth(1);
    await expect(row1).toContainText("call Dana");

    // The second row contains .cm-due.cm-due-later
    const due1 = row1.locator(".cm-due.cm-due-later");
    await expect(due1).toBeVisible();
    await expect(due1.locator(".cm-due-flag")).toBeVisible();
    await expect(row1.locator(".glyph-topic")).toHaveCount(0);

    // Row 2: # plain action
    const row2 = rows.nth(2);
    await expect(row2).toContainText("plain action");

    // The plain row has neither topic nor due pill
    await expect(row2.locator(".glyph-topic")).toHaveCount(0);
    await expect(row2.locator(".cm-due")).toHaveCount(0);

    // Every row is still 36px tall
    for (let i = 0; i < 3; i++) {
      const box = await rows.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeCloseTo(36, 0);
    }
  });

  test("draws due-today and resolved due pills when actions are completed or cancelled", async ({ page }) => {
    const noteContent = [
      `# task due today by:${REFERENCE_TODAY}`,
      `v finished task by:${yesterday}`,
      `x cancelled task by:${tomorrow}`,
    ].join("\n");

    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: noteContent,
        },
      },
    });

    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");

    // Uncheck "Only Open" so resolved tasks (v and x) are listed
    await drawer.getByText("Only Open", { exact: false }).click();

    const rows = drawer.locator('.modal-item[role="option"]');
    await expect(rows).toHaveCount(3);

    // Row 0: open task due today
    const row0 = rows.nth(0);
    const dueToday = row0.locator(".cm-due.cm-due-today");
    await expect(dueToday).toBeVisible();
    await expect(dueToday.locator(".cm-due-flag")).toBeVisible();

    // Row 1: finished task (v) -> resolved due date
    const row1 = rows.nth(1);
    const dueResolved1 = row1.locator(".cm-due.cm-due-resolved");
    await expect(dueResolved1).toBeVisible();
    await expect(dueResolved1.locator(".cm-due-flag")).toBeVisible();

    // Row 2: cancelled task (x) -> resolved due date
    const row2 = rows.nth(2);
    const dueResolved2 = row2.locator(".cm-due.cm-due-resolved");
    await expect(dueResolved2).toBeVisible();
    await expect(dueResolved2.locator(".cm-due-flag")).toBeVisible();

    // Row heights still 36px
    for (let i = 0; i < 3; i++) {
      const box = await rows.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeCloseTo(36, 0);
    }
  });
});
