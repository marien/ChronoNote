import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, mockNote } from "./helpers";

const TODAY = "2026-09-07.txt";

const agenda = (...rows: [string, string, string][]) =>
  JSON.stringify(rows.map(([start, end, title]) => ({ date: "2026-09-07", start, end, title })));

async function seed(
  page: Page,
  opts: { agendaJson?: string; notes?: Record<string, string>; now?: Date } = {},
) {
  await seedApp(page, {
    seed: {
      notes: opts.notes ?? { [TODAY]: "" },
      session: { openTabs: [TODAY], activeTab: TODAY },
      agendaJson: opts.agendaJson ?? "",
    },
    now: opts.now,
  });
}

/** Triggers the existing "notes for the meeting that is on now" action via the palette. */
async function runCallShortcutFromPalette(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("notes for the meeting");
  await page.keyboard.press("Enter");
}

/** Triggers the new palette item "New call". */
async function runNewCallFromPalette(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("New call");
  await page.keyboard.press("Enter");
}

test.describe("Peek switcher and new call", () => {
  test("two overlapping meetings on now: chip shows i/n, opening list by click and Ctrl+G lists both plus New call, choosing switches section", async ({ page }) => {
    const note = [
      "Standup",
      "=======",
      "o standup notes",
      "",
      "Design review",
      "=============",
      "o design notes",
    ].join("\n");

    // Two meetings running at 09:00; Design review started at 09:00 (latest-starting), Standup at 08:30.
    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(
        ["08:30", "09:30", "Standup"],
        ["09:00", "10:00", "Design review"],
      ),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("Design review");
    expect(await editor(page).innerText()).toContain("design notes");

    // Chip is visible in #peek-bar. Sorted by time: 1 = Standup (08:30), 2 = Design review (09:00).
    // Design review is at position 2 of 2.
    const chip = page.locator('#peek-bar [data-testid="peek-switch"]');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText("2/2");

    // 1. Opening the list by click on the chip
    await chip.click();
    const switcher = page.locator("#peek-switcher");
    await expect(switcher).toBeVisible();
    await expect(switcher).toHaveAttribute("role", "listbox");

    let options = switcher.locator('[role="option"]');
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toContainText("Standup");
    await expect(options.nth(1)).toContainText("Design review");
    await expect(page.locator('#peek-switcher [data-testid="peek-switch-new-call"]')).toBeVisible();

    // Close switcher with Esc
    await page.keyboard.press("Escape");
    await expect(switcher).toBeHidden();

    // 2. Opening the list by Ctrl+G while in Peek
    await page.keyboard.press("ControlOrMeta+KeyG");
    await expect(switcher).toBeVisible();
    options = switcher.locator('[role="option"]');
    await expect(options).toHaveCount(3);

    // 3. Choosing the other meeting switches Peek without leaving Peek
    await options.filter({ hasText: "Standup" }).click();
    await expect(switcher).toBeHidden();
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("Standup");
    expect(await editor(page).innerText()).toContain("standup notes");
    expect(await editor(page).innerText()).not.toContain("design notes");

    // The chip's i/n follows: Standup is 1/2
    await expect(chip).toHaveText("1/2");
  });

  test("arrow keys navigate switcher highlight and Enter chooses an option", async ({ page }) => {
    const note = [
      "Standup",
      "=======",
      "o standup notes",
      "",
      "Design review",
      "=============",
      "o design notes",
    ].join("\n");

    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(
        ["08:30", "09:30", "Standup"],
        ["09:00", "10:00", "Design review"],
      ),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();

    // Open switcher via Ctrl+G
    await page.keyboard.press("ControlOrMeta+KeyG");
    const switcher = page.locator("#peek-switcher");
    await expect(switcher).toBeVisible();

    const options = switcher.locator('[role="option"]');
    // Navigate with ArrowDown
    await page.keyboard.press("ArrowDown");
    // One of the options has aria-selected="true"
    await expect(options.filter({ has: page.locator('[aria-selected="true"]') })).toHaveCount(1);

    // Select the first option (Standup) using keyboard
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");

    await expect(switcher).toBeHidden();
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("Standup");
  });

  test("Esc closes the switcher list and Peek stays open", async ({ page }) => {
    await seed(page, {
      agendaJson: agenda(
        ["08:30", "09:30", "Standup"],
        ["09:00", "10:00", "Design review"],
      ),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();

    // Open switcher via chip
    await page.locator('#peek-bar [data-testid="peek-switch"]').click();
    const switcher = page.locator("#peek-switcher");
    await expect(switcher).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");
    await expect(switcher).toBeHidden();

    // Peek is still active
    await expect(page.locator("body.peek-mode")).toBeVisible();
  });

  test("a meeting on now plus Ctrl+Shift+M creates and shows a new 'Call 09:00 section, renames it, and leaves meeting section intact", async ({ page }) => {
    const note = ["Design review", "=============", "o slides", "- notes"].join("\n");

    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(["09:00", "10:00", "Design review"]),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("Design review");

    // Press Ctrl+Shift+M while in Peek
    await page.keyboard.press("ControlOrMeta+Shift+KeyM");

    // Enters rename on the new call section
    const titleInput = page.locator(".peek-title-input");
    await expect(titleInput).toBeFocused();
    await expect(titleInput).toHaveValue("Call 09:00");

    // Type new subject over selected "Call" and press Enter
    await page.keyboard.type("Quick Chat");
    await page.keyboard.press("Enter");

    await expect(titleInput).toHaveCount(0);
    await expect(page.locator("#peek-bar")).toContainText("'Quick Chat 09:00");
    await expect(page.locator("body.peek-mode")).toBeVisible();

    // Note in mock storage contains both sections: Design review unchanged, and 'Quick Chat 09:00
    await expect
      .poll(async () => {
        const saved = (await mockNote(page, TODAY)) ?? "";
        return (
          saved.includes("Design review") &&
          saved.includes("o slides") &&
          saved.includes("'Quick Chat 09:00")
        );
      })
      .toBe(true);
  });

  test("the '+' button in Peek bar adds a new call and starts renaming", async ({ page }) => {
    const note = ["Standup", "=======", "o notes"].join("\n");
    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(["09:00", "09:30", "Standup"]),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();

    // Click the "+" button in #peek-bar
    const newCallBtn = page.locator('#peek-bar [data-testid="peek-new-call"]');
    await expect(newCallBtn).toBeVisible();
    await newCallBtn.click();

    // Opens rename input with "Call 09:00"
    const titleInput = page.locator(".peek-title-input");
    await expect(titleInput).toBeFocused();
    await expect(titleInput).toHaveValue("Call 09:00");

    // Press Enter to confirm default name
    await page.keyboard.press("Enter");
    await expect(titleInput).toHaveCount(0);
    await expect(page.locator("#peek-bar")).toContainText("'Call 09:00");

    await expect.poll(() => mockNote(page, TODAY)).toContain("'Call 09:00");
  });

  test("command palette item 'New call' adds a new call and enters Peek", async ({ page }) => {
    const note = ["Standup", "=======", "o notes"].join("\n");
    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(["09:00", "09:30", "Standup"]),
    });

    // Run "New call" from command palette outside Peek
    await runNewCallFromPalette(page);

    await expect(page.locator("body.peek-mode")).toBeVisible();
    const titleInput = page.locator(".peek-title-input");
    await expect(titleInput).toBeFocused();
    await expect(titleInput).toHaveValue("Call 09:00");

    await page.keyboard.press("Enter");
    await expect(titleInput).toHaveCount(0);
    await expect(page.locator("#peek-bar")).toContainText("'Call 09:00");
    await expect.poll(() => mockNote(page, TODAY)).toContain("'Call 09:00");
  });

  test("a second new call in the same minute gets suffix (2)", async ({ page }) => {
    const note = [
      "Standup",
      "=======",
      "o notes",
      "",
      "'Call 09:00",
      "===========",
      "o call notes",
    ].join("\n");

    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(["09:00", "09:30", "Standup"]),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();

    // Trigger second new call via Ctrl+Shift+M
    await page.keyboard.press("ControlOrMeta+Shift+KeyM");

    const titleInput = page.locator(".peek-title-input");
    await expect(titleInput).toBeFocused();
    await expect(titleInput).toHaveValue("Call 09:00 (2)");

    await page.keyboard.press("Enter");
    await expect(titleInput).toHaveCount(0);
    await expect(page.locator("#peek-bar")).toContainText("'Call 09:00 (2)");

    await expect
      .poll(async () => {
        const saved = (await mockNote(page, TODAY)) ?? "";
        return saved.includes("'Call 09:00") && saved.includes("'Call 09:00 (2)");
      })
      .toBe(true);
  });

  test("one meeting on now: no chip; Ctrl+G in Peek shows only 'New call'", async ({ page }) => {
    const note = ["Standup", "=======", "o notes"].join("\n");
    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(["09:00", "09:30", "Standup"]),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("Standup");

    // Fewer than 2 sections on now: chip is hidden
    const chip = page.locator('#peek-bar [data-testid="peek-switch"]');
    await expect(chip).toBeHidden();

    // Press Ctrl+G in Peek: opens switcher with only "New call"
    await page.keyboard.press("ControlOrMeta+KeyG");
    const switcher = page.locator("#peek-switcher");
    await expect(switcher).toBeVisible();

    const options = switcher.locator('[role="option"]');
    await expect(options).toHaveCount(1);
    await expect(page.locator('#peek-switcher [data-testid="peek-switch-new-call"]')).toBeVisible();
  });

  test("outside Peek, Ctrl+Shift+M enters Peek on a new call", async ({ page }) => {
    const note = ["Notes", "=====", "Just notes"].join("\n");
    await seed(page, { notes: { [TODAY]: note } });

    // Not in Peek mode initially
    await expect(page.locator("body.peek-mode")).toHaveCount(0);

    // Press Ctrl+Shift+M outside Peek
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyM");

    // Enters Peek mode on a new call
    await expect(page.locator("body.peek-mode")).toBeVisible();
    const titleInput = page.locator(".peek-title-input");
    await expect(titleInput).toBeFocused();
    await expect(titleInput).toHaveValue("Call 09:00");

    await page.keyboard.press("Enter");
    await expect(page.locator("#peek-bar")).toContainText("'Call 09:00");
  });

  test("selecting 'New call' in switcher list creates a new call and starts renaming", async ({ page }) => {
    await seed(page, {
      agendaJson: agenda(
        ["08:30", "09:30", "Standup"],
        ["09:00", "10:00", "Design review"],
      ),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();

    // Open switcher and click "New call" item
    await page.keyboard.press("ControlOrMeta+KeyG");
    const newCallItem = page.locator('#peek-switcher [data-testid="peek-switch-new-call"]');
    await expect(newCallItem).toBeVisible();
    await newCallItem.click();

    // Creates new call section and focuses rename
    const titleInput = page.locator(".peek-title-input");
    await expect(titleInput).toBeFocused();
    await expect(titleInput).toHaveValue("Call 09:00");

    await page.keyboard.press("Enter");
    await expect(page.locator("#peek-bar")).toContainText("'Call 09:00");
  });

  test("choosing a meeting missing from today's note creates its section in time order", async ({ page }) => {
    const note = [
      "Standup",
      "=======",
      "o standup",
      "",
      "Retro",
      "=====",
      "o retro",
    ].join("\n");

    // Standup (08:00), Planning (09:00 - missing from note), Retro (11:00)
    // Plus Design review (08:30) so there are multiple on now at 09:00
    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(
        ["08:00", "08:30", "Standup"],
        ["08:30", "09:30", "Design review"],
        ["09:00", "10:00", "Planning"],
        ["11:00", "12:00", "Retro"],
      ),
    });

    // Opens on Planning (latest running)
    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();

    // Open switcher and choose Design review
    await page.keyboard.press("ControlOrMeta+KeyG");
    const switcher = page.locator("#peek-switcher");
    await expect(switcher).toBeVisible();
    await switcher.locator('[role="option"]', { hasText: "Design review" }).click();

    await expect(page.locator("#peek-bar")).toContainText("Design review");

    // In note, Design review is inserted between Standup and Retro
    await expect
      .poll(async () => {
        const saved = (await mockNote(page, TODAY)) ?? "";
        const s = saved.indexOf("Standup");
        const d = saved.indexOf("Design review");
        const r = saved.indexOf("Retro");
        return s >= 0 && s < d && d < r;
      })
      .toBe(true);
  });

  test("switcher list is recomputed each time it opens (reflects advanced clock)", async ({ page }) => {
    await seed(page, {
      agendaJson: agenda(
        ["09:00", "09:30", "Morning Sync"],
        ["09:30", "10:30", "Late Sync"],
      ),
    });

    await runCallShortcutFromPalette(page);
    await expect(page.locator("body.peek-mode")).toBeVisible();

    // At 09:00: only Morning Sync is running, so chip is hidden
    await expect(page.locator('#peek-bar [data-testid="peek-switch"]')).toBeHidden();

    // Advance clock to 09:30: now Late Sync is running
    await page.clock.setFixedTime(new Date("2026-09-07T09:30:00"));

    // Open switcher via Ctrl+G
    await page.keyboard.press("ControlOrMeta+KeyG");
    const switcher = page.locator("#peek-switcher");
    await expect(switcher).toBeVisible();

    // Switcher list recomputed: Late Sync is listed
    const options = switcher.locator('[role="option"]');
    await expect(options.filter({ hasText: "Late Sync" })).toHaveCount(1);
  });

  test("outside Peek, Ctrl+G still opens section search, not #peek-switcher", async ({ page }) => {
    const note = ["Standup", "=======", "o notes"].join("\n");
    await seed(page, { notes: { [TODAY]: note } });

    await expect(page.locator("body.peek-mode")).toHaveCount(0);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+KeyG");

    // #peek-switcher does not open
    await expect(page.locator("#peek-switcher")).toHaveCount(0);
    // Command palette or section search is open
    await expect(page.locator(".command-palette-card, .modal-card")).toBeVisible();
  });

  test("chip text shows just 'n' when the section shown in Peek is not in the on-now list", async ({ page }) => {
    const note = [
      "Standup",
      "=======",
      "o standup",
      "",
      "Design review",
      "=============",
      "o design",
      "",
      "General Notes",
      "=============",
      "o loose thoughts",
    ].join("\n");

    // Two meetings on now at 09:00
    await seed(page, {
      notes: { [TODAY]: note },
      agendaJson: agenda(
        ["08:30", "09:30", "Standup"],
        ["09:00", "10:00", "Design review"],
      ),
    });

    // Enter Peek directly on General Notes via shortcut (Ctrl+Shift+P on cursor)
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    // Move caret down to General Notes
    for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");

    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator("#peek-bar")).toContainText("General Notes");

    // 2 sections are on now (Standup and Design review), but shown section is General Notes (not in the list).
    // Chip should show just "2" (n), not "i/n".
    const chip = page.locator('#peek-bar [data-testid="peek-switch"]');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText("2");
  });
});
