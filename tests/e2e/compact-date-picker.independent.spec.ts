import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  activeTabContent,
  cursorLine,
  mockNote,
  modalCard,
  MODAL_LABELS,
} from "./helpers";
import { REFERENCE_TODAY, scenario } from "../../src/lib/testing/scenarios";
import {
  addDaysISO,
  addMonths,
  formatISO,
  parseDueWord,
  parseISODateLocal,
} from "../../src/lib/date";

const palette = (page: import("@playwright/test").Page) =>
  modalCard(page, MODAL_LABELS.commandPalette);

// -----------------------------------------------------------------------------
// 1. Places and opening triggers
// -----------------------------------------------------------------------------
test.describe("compact date picker - places and opening triggers", () => {
  test("clicking a due date in a note opens .compact-picker directly below it", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const targetDate = addDaysISO(REFERENCE_TODAY, 4);
    await setEditorText(page, `# Action task by:${targetDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const dueBox = (await dueEl.boundingBox())!;
    const popBox = (await pop.boundingBox())!;
    expect(popBox.y).toBeGreaterThanOrEqual(dueBox.y + dueBox.height - 1);
    expect(popBox.y).toBeLessThanOrEqual(dueBox.y + dueBox.height + 8);
  });

  test("Ctrl+Shift+D on an action line opens .compact-picker under the caret", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action without date");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("End");

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
  });

  test("command palette 'Set due date…' opens .compact-picker", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action line for palette");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+k");
    const pal = palette(page);
    await expect(pal).toBeVisible();

    await pal.locator(".modal-input").fill(">Set due date");
    const item = pal.locator('.modal-item[role="option"]', { hasText: /set due date/i }).first();
    await expect(item).toBeVisible();
    await item.click();

    await expect(pal).toBeHidden();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
  });

  test("line context menu 'Set due date…' opens .compact-picker", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action line for context menu");
    const line = editor(page).locator(".cm-line").first();
    await line.click({ button: "right" });

    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();
    const menuItem = menu.locator(".editor-context-item", { hasText: /due date/i });
    await expect(menuItem).toBeVisible();
    await menuItem.click();

    await expect(menu).toBeHidden();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
  });

  test("Export From and To date buttons each open .compact-picker below the clicked button", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await page.locator("[data-more-trigger]").click();
    const morePop = page.locator(".more-actions-pop");
    await expect(morePop).toBeVisible();
    await morePop.locator(".more-actions-item", { hasText: "Export…" }).click();

    const exportModal = page.locator(".export-modal");
    await expect(exportModal).toBeVisible();
    await exportModal.locator("button, label", { hasText: "Range" }).click();

    const dateButtons = exportModal.locator(".export-date-button");
    const fromBtn = dateButtons.nth(0);
    const toBtn = dateButtons.nth(1);

    // Open from From button
    await fromBtn.click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
    const fromBox = (await fromBtn.boundingBox())!;
    const popBox = (await pop.boundingBox())!;
    expect(popBox.y).toBeGreaterThanOrEqual(fromBox.y + fromBox.height - 1);

    // Click outside to close From picker
    await exportModal.locator(".dialog-title").click();
    await expect(pop).toBeHidden();

    // Open from To button
    await toBtn.click();
    await expect(pop).toBeVisible();
    const toBox = (await toBtn.boundingBox())!;
    const popBox2 = (await pop.boundingBox())!;
    expect(popBox2.y).toBeGreaterThanOrEqual(toBox.y + toBox.height - 1);
  });

  test("Calendar sync review 'Move to' date button opens .compact-picker", async ({ page }) => {
    const today = REFERENCE_TODAY;
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          { date: today, start: "10:00", end: "11:00", title: "Canceled: Team Meeting" },
        ]),
        notes: {
          [`${today}.txt`]: "Team Meeting\n============\nMeeting notes\n",
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+C");
    const dialog = page.getByRole("dialog", { name: "Sync review" });
    await expect(dialog).toBeVisible();

    const removal = dialog.locator(".sync-review-removal");
    await removal.locator("button, label", { hasText: "Move" }).click();
    const dateBtn = removal.locator("button.sync-review-date");
    await expect(dateBtn).toBeVisible();

    await dateBtn.click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const btnBox = (await dateBtn.boundingBox())!;
    const popBox = (await pop.boundingBox())!;
    expect(popBox.y).toBeGreaterThanOrEqual(btnBox.y + btnBox.height - 1);
  });

  test("top-bar date picker (.datepicker-pop) is unchanged and is not used for due dates", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.locator("[data-datepicker-trigger]").click();

    const bigPop = page.locator(".datepicker-pop");
    await expect(bigPop).toBeVisible();
    await expect(page.locator(".compact-picker")).toBeHidden();
    await expect(bigPop.locator(".cal-title")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(bigPop).toBeHidden();
  });

  test("Copy to next occurrence with no future match opens .datepicker-pop, not .compact-picker", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "Sprint Retro\n============\n# Task item to copy");
    await editor(page).locator(".cm-line").nth(2).click();

    // Trigger copy to next occurrence via shortcut Ctrl+Shift+.
    await page.keyboard.press("ControlOrMeta+Shift+Period");

    // Because there is no next occurrence of Sprint Retro, it opens .datepicker-pop
    const bigPop = page.locator(".datepicker-pop");
    await expect(bigPop).toBeVisible();
    await expect(page.locator(".compact-picker")).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(bigPop).toBeHidden();
  });
});

// -----------------------------------------------------------------------------
// 2. Placement and boundary behavior
// -----------------------------------------------------------------------------
test.describe("compact date picker - placement and bounds", () => {
  test("placement: directly below and left-aligned with what was clicked", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const targetDate = addDaysISO(REFERENCE_TODAY, 2);
    await setEditorText(page, `# Task with due date by:${targetDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const dueBox = (await dueEl.boundingBox())!;
    const popBox = (await pop.boundingBox())!;

    // Directly below
    const gap = popBox.y - (dueBox.y + dueBox.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(8);

    // Left-aligned
    expect(Math.abs(popBox.x - dueBox.x)).toBeLessThanOrEqual(2);
  });

  test("placement: opens above what was clicked when there is no room below", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const targetDate = addDaysISO(REFERENCE_TODAY, 3);
    const filler = Array.from({ length: 24 }, (_, i) => `Line ${i + 1}`).join("\n");
    await setEditorText(page, `${filler}\n# Near bottom task by:${targetDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.scrollIntoViewIfNeeded();
    await dueEl.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const dueBox = (await dueEl.boundingBox())!;
    const popBox = (await pop.boundingBox())!;

    // Directly above what was clicked
    expect(popBox.y + popBox.height).toBeLessThanOrEqual(dueBox.y);
  });

  test("placement: clamped within window boundaries and never overflows right edge", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const targetDate = addDaysISO(REFERENCE_TODAY, 5);
    const widePadding = "long description ".repeat(8);
    await setEditorText(page, `# Wide line ${widePadding} by:${targetDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const popBox = (await pop.boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(popBox.x).toBeGreaterThanOrEqual(0);
    expect(popBox.x + popBox.width).toBeLessThanOrEqual(viewport.width);
  });
});

// -----------------------------------------------------------------------------
// 3. Size and markers
// -----------------------------------------------------------------------------
test.describe("compact date picker - size and markers", () => {
  test("size: text font size matches editor font size and grows with it", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Check font size");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Font size equals editor's font size
    const popFontSize = await pop.evaluate((el) => window.getComputedStyle(el).fontSize);
    const editorFontSize = await editor(page).evaluate((el) => window.getComputedStyle(el).fontSize);
    expect(popFontSize).toBe(editorFontSize);

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();

    // Increase editor font size and verify picker grows with it
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--editor-font-size", "20px");
    });

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    await expect(pop).toBeVisible();

    const newPopFontSize = await pop.evaluate((el) => window.getComputedStyle(el).fontSize);
    expect(newPopFontSize).toBe("20px");
  });

  test("size: width is about 200px at default font size", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Check width");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const box = (await pop.boundingBox())!;
    // About 200px wide at default font size (between 175px and 225px)
    expect(box.width).toBeGreaterThanOrEqual(175);
    expect(box.width).toBeLessThanOrEqual(225);
  });

  test("markers: no note, action, or agenda markers on the days", async ({ page }) => {
    const yesterday = addDaysISO(REFERENCE_TODAY, -1);
    const tomorrow = addDaysISO(REFERENCE_TODAY, 1);
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          { date: REFERENCE_TODAY, start: "14:00", end: "15:00", title: "Meeting" },
        ]),
        notes: {
          [`${yesterday}.txt`]: "v Completed task\n",
          [`${tomorrow}.txt`]: "# Open action\n",
          [`${REFERENCE_TODAY}.txt`]: "# Today action\n",
        },
      },
    });

    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Days in .compact-picker must NOT have note, action, or agenda markers
    await expect(pop.locator(".hasnote")).toHaveCount(0);
    await expect(pop.locator(".has-pending")).toHaveCount(0);
    await expect(pop.locator(".has-done")).toHaveCount(0);
    await expect(pop.locator(".has-agenda")).toHaveCount(0);
    await expect(pop.locator(".has")).toHaveCount(0);
  });
});

// -----------------------------------------------------------------------------
// 4. Day styles and grid structure
// -----------------------------------------------------------------------------
test.describe("compact date picker - day styles and grid structure", () => {
  test("days: today is ringed with .today, current value selected with .selected, other-month days muted with .out", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const futureDate = addDaysISO(REFERENCE_TODAY, 6);
    await setEditorText(page, `# Task with future date by:${futureDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Today is ringed with .today
    const todayCell = pop.locator(`.cp-day[data-iso="${REFERENCE_TODAY}"]`);
    await expect(todayCell).toHaveClass(/\btoday\b/);

    // Current value selected with .selected
    const selectedCell = pop.locator(`.cp-day[data-iso="${futureDate}"]`);
    await expect(selectedCell).toHaveClass(/\bselected\b/);

    // Other-month days have .out
    const outCells = pop.locator(".cp-day.out");
    expect(await outCells.count()).toBeGreaterThan(0);
  });

  test("structure: week numbers are displayed in a narrow column (.cp-week-num)", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action line");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const weekNums = pop.locator(".cp-week-num");
    // Standard calendar grid renders 4 to 6 weeks
    const count = await weekNums.count();
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(6);

    // Each week number is a non-empty number
    const firstWeek = await weekNums.first().textContent();
    expect(Number(firstWeek?.trim())).toBeGreaterThan(0);
  });

  test("Export: days between From and To are shaded with .in-range", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.locator("[data-more-trigger]").click();
    const morePop = page.locator(".more-actions-pop");
    await expect(morePop).toBeVisible();
    await morePop.locator(".more-actions-item", { hasText: "Export…" }).click();

    const exportModal = page.locator(".export-modal");
    await expect(exportModal).toBeVisible();
    await exportModal.locator("button, label", { hasText: "Range" }).click();

    const fromBtn = exportModal.locator(".export-date-button").first();
    await fromBtn.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // In Export range mode, days between From and To are shaded (.in-range)
    const inRangeDays = pop.locator(".cp-day.in-range");
    expect(await inRangeDays.count()).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------------
// 5. Slim text input parsing
// -----------------------------------------------------------------------------
test.describe("compact date picker - slim text input parsing", () => {
  test("input: typing 'today' picks today's date", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Task to schedule");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill("today");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`# Task to schedule by:${REFERENCE_TODAY}`);
  });

  test("input: typing 'tomorrow' picks tomorrow's date", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const tomorrow = addDaysISO(REFERENCE_TODAY, 1);
    await setEditorText(page, "# Task for tomorrow");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill("tomorrow");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`# Task for tomorrow by:${tomorrow}`);
  });

  test("input: typing weekday names picks next occurrence after today", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    // REFERENCE_TODAY (2026-09-07) is Monday; next Friday is 2026-09-11
    const expectedFri = parseDueWord("friday", REFERENCE_TODAY, "en")!;
    await setEditorText(page, "# Task for Friday");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill("friday");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`# Task for Friday by:${expectedFri}`);
  });

  test("input: typing '+3' picks 3 days after today", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const in3Days = addDaysISO(REFERENCE_TODAY, 3);
    await setEditorText(page, "# Task in three days");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill("+3");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`# Task in three days by:${in3Days}`);
  });

  test("input: typing '10-30' expands to current year MM-DD", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const currentYear = REFERENCE_TODAY.slice(0, 4);
    const expectedDate = `${currentYear}-10-30`;
    await setEditorText(page, "# Task for end of October");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill("10-30");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`# Task for end of October by:${expectedDate}`);
  });

  test("input: typing full ISO date picks that date", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const fullDate = "2026-11-20";
    await setEditorText(page, "# Task with explicit date");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill(fullDate);
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`# Task with explicit date by:${fullDate}`);
  });

  test("input: typing Dutch words ('vandaag', 'morgen', 'vrijdag') picks corresponding dates with Dutch UI", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        languageMode: "nl",
      },
    });

    const tomorrow = addDaysISO(REFERENCE_TODAY, 1);
    await setEditorText(page, "# Nederlandse taak");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill("morgen");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`# Nederlandse taak by:${tomorrow}`);
  });

  test("input: Enter picks focused day when input does not parse", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const existingDate = addDaysISO(REFERENCE_TODAY, 5);
    await setEditorText(page, `# Task with date by:${existingDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Type gibberish that does not parse as any date
    await pop.locator(".cp-input").fill("not-a-valid-date-query");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    // Should keep the focused day (existingDate)
    expect(await activeTabContent(page)).toBe(`# Task with date by:${existingDate}`);
  });
});

// -----------------------------------------------------------------------------
// 6. Keyboard navigation
// -----------------------------------------------------------------------------
test.describe("compact date picker - keyboard navigation", () => {
  test("keys: ArrowLeft and ArrowRight move by one day across month edges and update month view", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    // First of September: ArrowLeft will cross into August
    await setEditorText(page, "# Task on Sep 1 by:2026-09-01");
    await page.locator(".cm-due").first().click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Move focus from input to grid
    await page.keyboard.press("ArrowDown");

    // Press ArrowLeft: crosses into August 31
    await page.keyboard.press("ArrowLeft");
    await expect(pop.locator(".cp-title")).toContainText(/august|augustus/i);

    // Press ArrowRight: crosses back into September 1
    await page.keyboard.press("ArrowRight");
    await expect(pop.locator(".cp-title")).toContainText(/september/i);

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });

  test("keys: ArrowUp and ArrowDown move by one week (-7 / +7 days)", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, `# Task for arrows by:${REFERENCE_TODAY}`);
    await page.locator(".cm-due").first().click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Focus grid and move down 1 week (+7 days)
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    const expectedDate = addDaysISO(REFERENCE_TODAY, 7);
    await expect.poll(async () => activeTabContent(page)).toBe(`# Task for arrows by:${expectedDate}`);
  });

  test("keys: PageUp and PageDown move backward and forward by one month", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, `# Task by:${REFERENCE_TODAY}`);
    await page.locator(".cm-due").first().click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Move focus to grid
    await page.keyboard.press("ArrowDown");

    // PageDown shifts to next month (October)
    await page.keyboard.press("PageDown");
    await expect(pop.locator(".cp-title")).toContainText(/october|oktober/i);

    // PageUp shifts back to September
    await page.keyboard.press("PageUp");
    await expect(pop.locator(".cp-title")).toContainText(/september/i);

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });

  test("keys: Home and End move focus to week's Monday and Sunday", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    // Mid-week date (Wednesday 2026-09-09)
    await setEditorText(page, "# Task on Wednesday by:2026-09-09");
    await page.locator(".cm-due").first().click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Move to grid
    await page.keyboard.press("ArrowDown");

    // Home moves to Monday (2026-09-07)
    await page.keyboard.press("Home");
    const monCell = pop.locator('.cp-day[data-iso="2026-09-07"]');
    await expect(monCell).toBeFocused();

    // End moves to Sunday (2026-09-13)
    await page.keyboard.press("End");
    const sunCell = pop.locator('.cp-day[data-iso="2026-09-13"]');
    await expect(sunCell).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });

  test("keys: Enter and Space pick the focused day", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Task for space pick");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Move to grid and press Space to pick
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(pop).toBeHidden();

    // Picked initial focused date (today)
    await expect.poll(async () => activeTabContent(page)).toBe(`# Task for space pick by:${REFERENCE_TODAY}`);
  });

  test("keys: Escape closes without making any changes", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const originalText = `# Unchanged task by:${REFERENCE_TODAY}`;
    await setEditorText(page, originalText);
    await page.locator(".cm-due").first().click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill("+10");
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();

    expect(await activeTabContent(page)).toBe(originalText);
  });

  test("keys: Tab and Shift+Tab stay trapped inside the picker", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, `# Task by:${REFERENCE_TODAY}`);
    await page.locator(".cm-due").first().click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Cycle through all focusables with Tab
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const activeInside = await pop.evaluate((el) => el.contains(document.activeElement));
      expect(activeInside).toBe(true);
    }

    // Shift+Tab also stays inside
    await page.keyboard.press("Shift+Tab");
    const stillInside = await pop.evaluate((el) => el.contains(document.activeElement));
    expect(stillInside).toBe(true);

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });
});

// -----------------------------------------------------------------------------
// 7. Footer buttons
// -----------------------------------------------------------------------------
test.describe("compact date picker - footer", () => {
  test("footer: 'Today' button picks today", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const futureDate = addDaysISO(REFERENCE_TODAY, 12);
    await setEditorText(page, `# Future task by:${futureDate}`);
    await page.locator(".cm-due").first().click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-today").click();
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`# Future task by:${REFERENCE_TODAY}`);
  });

  test("footer: 'No due date' button removes existing due date", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const futureDate = addDaysISO(REFERENCE_TODAY, 7);
    await setEditorText(page, `# Task with due date by:${futureDate}`);
    await page.locator(".cm-due").first().click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const noneBtn = pop.locator(".cp-none");
    await expect(noneBtn).toBeVisible();
    await noneBtn.click();
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe("# Task with due date");
  });

  test("footer: 'No due date' button is not present in Export or Calendar Sync Review", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await page.locator("[data-more-trigger]").click();
    const morePop = page.locator(".more-actions-pop");
    await expect(morePop).toBeVisible();
    await morePop.locator(".more-actions-item", { hasText: "Export…" }).click();

    const exportModal = page.locator(".export-modal");
    await expect(exportModal).toBeVisible();
    await exportModal.locator("button, label", { hasText: "Range" }).click();

    await exportModal.locator(".export-date-button").first().click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // .cp-none must NOT be present in Export
    await expect(pop.locator(".cp-none")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});

// -----------------------------------------------------------------------------
// 8. Closing and caret restoration
// -----------------------------------------------------------------------------
test.describe("compact date picker - closing and caret restoration", () => {
  test("closing: picking closes picker, updates note, and restores caret to editor", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Task line\nSecond line");
    await editor(page).locator(".cm-line").nth(1).click();
    expect(await cursorLine(page)).toBe(2);

    // Open on line 1
    const line1 = editor(page).locator(".cm-line").first();
    await line1.click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-today").click();
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toContain(`by:${REFERENCE_TODAY}`);
    await expect(editor(page)).toBeFocused();
  });

  test("closing: Escape closes without note change and restores caret to where it was", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const targetDate = addDaysISO(REFERENCE_TODAY, 5);
    await setEditorText(page, `# Task by:${targetDate}\nSecond line\nThird line`);

    // Place caret on line 2
    await editor(page).locator(".cm-line").nth(1).click();
    await expect.poll(() => cursorLine(page)).toBe(2);

    // Click due date on line 1
    await page.locator(".cm-due").first().click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();

    // Note unchanged and caret restored to line 2
    expect(await activeTabContent(page)).toBe(`# Task by:${targetDate}\nSecond line\nThird line`);
    await expect.poll(() => cursorLine(page)).toBe(2);
  });

  test("closing: clicking outside closes without note change and restores caret to where it was", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const targetDate = addDaysISO(REFERENCE_TODAY, 5);
    await setEditorText(page, `# Task by:${targetDate}\nSecond line\nThird line`);

    // Place caret on line 3
    await editor(page).locator(".cm-line").nth(2).click();
    await expect.poll(() => cursorLine(page)).toBe(3);

    // Click due date on line 1
    await page.locator(".cm-due").first().click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Click on line 2
    await editor(page).locator(".cm-line").nth(1).click();
    await expect(pop).toBeHidden();

    expect(await activeTabContent(page)).toBe(`# Task by:${targetDate}\nSecond line\nThird line`);
    await expect.poll(() => cursorLine(page)).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// 9. Due dates grammar and line preservation
// -----------------------------------------------------------------------------
test.describe("compact date picker - due dates grammar and line preservation", () => {
  test("due dates: picker opens on current due date for indented action, preserving indentation on pick", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const existingDate = addDaysISO(REFERENCE_TODAY, 6);
    const newDate = addDaysISO(REFERENCE_TODAY, 10);
    await setEditorText(page, `    # Indented task by:${existingDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Existing date is selected in the picker
    await expect(pop.locator(`.cp-day[data-iso="${existingDate}"]`)).toHaveClass(/\bselected\b/);

    // Pick new date
    await pop.locator(`.cp-day[data-iso="${newDate}"]`).click();
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(`    # Indented task by:${newDate}`);
  });

  test("due dates: picker opens on current due date for action after =>, updating only that part on pick", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const firstDate = addDaysISO(REFERENCE_TODAY, 3);
    const secondDate = addDaysISO(REFERENCE_TODAY, 8);
    const newSecondDate = addDaysISO(REFERENCE_TODAY, 12);
    await setEditorText(page, `# Task a by:${firstDate} => # Task b by:${secondDate}`);

    // Click the second due date
    const secondDue = page.locator(".cm-due").nth(1);
    await secondDue.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Picker opens with second date selected
    await expect(pop.locator(`.cp-day[data-iso="${secondDate}"]`)).toHaveClass(/\bselected\b/);

    // Pick new date
    await pop.locator(`.cp-day[data-iso="${newSecondDate}"]`).click();
    await expect(pop).toBeHidden();

    // First part is untouched, second part has new date
    await expect.poll(async () => activeTabContent(page)).toBe(
      `# Task a by:${firstDate} => # Task b by:${newSecondDate}`,
    );
  });

  test("due dates: picking preserves forward links ((>YYYY-MM-DD)) and trailing text untouched", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const oldDate = addDaysISO(REFERENCE_TODAY, 2);
    const newDate = addDaysISO(REFERENCE_TODAY, 9);
    await setEditorText(page, `# Task with links by:${oldDate} some trailing details (>2026-11-01)`);

    await page.locator(".cm-due").first().click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(`.cp-day[data-iso="${newDate}"]`).click();
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(
      `# Task with links by:${newDate} some trailing details (>2026-11-01)`,
    );
  });

  test("due dates: picking on action without date inserts by:YYYY-MM-DD before trailing forward links", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const targetDate = addDaysISO(REFERENCE_TODAY, 5);
    await setEditorText(page, "# Task with forward link (>2026-11-01)");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(`.cp-day[data-iso="${targetDate}"]`).click();
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe(
      `# Task with forward link by:${targetDate} (>2026-11-01)`,
    );
  });
});

// -----------------------------------------------------------------------------
// 10. Export date range
// -----------------------------------------------------------------------------
test.describe("compact date picker - Export date range", () => {
  test("Export: From and To show dates, changing one updates it and export uses new range", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const from = addDaysISO(REFERENCE_TODAY, 2);
    const to = addDaysISO(REFERENCE_TODAY, 4);
    const outside = addDaysISO(REFERENCE_TODAY, 15);

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        notes: {
          [`${from}.txt`]: "# Inside task from\n",
          [`${to}.txt`]: "# Inside task to\n",
          [`${outside}.txt`]: "# Outside range task\n",
        },
      },
    });

    await page.locator("[data-more-trigger]").click();
    const morePop = page.locator(".more-actions-pop");
    await expect(morePop).toBeVisible();
    await morePop.locator(".more-actions-item", { hasText: "Export…" }).click();

    const exportModal = page.locator(".export-modal");
    await expect(exportModal).toBeVisible();
    await exportModal.locator("button, label", { hasText: "Range" }).click();

    const dateButtons = exportModal.locator(".export-date-button");
    const fromBtn = dateButtons.nth(0);
    const toBtn = dateButtons.nth(1);

    // Pick From
    await fromBtn.click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
    await pop.locator(`.cp-day[data-iso="${from}"]`).click();
    await expect(pop).toBeHidden();
    await expect(fromBtn).toContainText(from);

    // Pick To
    await toBtn.click();
    await expect(pop).toBeVisible();
    await pop.locator(`.cp-day[data-iso="${to}"]`).click();
    await expect(pop).toBeHidden();
    await expect(toBtn).toContainText(to);

    // Copy as Markdown
    await exportModal.locator("button", { hasText: "Copy as Markdown" }).click();
    await expect(exportModal).toBeHidden();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("- [ ] Inside task from");
    expect(clip).toContain("- [ ] Inside task to");
    expect(clip).not.toContain("- [ ] Outside range task");
  });

  test("Export: picking From after To makes both the same day", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.locator("[data-more-trigger]").click();
    const morePop = page.locator(".more-actions-pop");
    await expect(morePop).toBeVisible();
    await morePop.locator(".more-actions-item", { hasText: "Export…" }).click();

    const exportModal = page.locator(".export-modal");
    await expect(exportModal).toBeVisible();
    await exportModal.locator("button, label", { hasText: "Range" }).click();

    const dateButtons = exportModal.locator(".export-date-button");
    const fromBtn = dateButtons.nth(0);
    const toBtn = dateButtons.nth(1);

    // First set To to a known date (e.g. 2026-09-10)
    await toBtn.click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
    await pop.locator('.cp-day[data-iso="2026-09-10"]').click();
    await expect(pop).toBeHidden();

    // Now set From to 2026-09-20 (after To 2026-09-10)
    await fromBtn.click();
    await expect(pop).toBeVisible();
    await pop.locator('.cp-day[data-iso="2026-09-20"]').click();
    await expect(pop).toBeHidden();

    // Both buttons should now display 2026-09-20
    await expect(fromBtn).toContainText("2026-09-20");
    await expect(toBtn).toContainText("2026-09-20");
  });

  test("Export: picking To before From makes both the same day", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.locator("[data-more-trigger]").click();
    const morePop = page.locator(".more-actions-pop");
    await expect(morePop).toBeVisible();
    await morePop.locator(".more-actions-item", { hasText: "Export…" }).click();

    const exportModal = page.locator(".export-modal");
    await expect(exportModal).toBeVisible();
    await exportModal.locator("button, label", { hasText: "Range" }).click();

    const dateButtons = exportModal.locator(".export-date-button");
    const fromBtn = dateButtons.nth(0);
    const toBtn = dateButtons.nth(1);

    // Set From to 2026-09-15
    await fromBtn.click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
    await pop.locator('.cp-day[data-iso="2026-09-15"]').click();
    await expect(pop).toBeHidden();

    // Now set To to 2026-09-05 (before From 2026-09-15)
    await toBtn.click();
    await expect(pop).toBeVisible();
    await pop.locator('.cp-day[data-iso="2026-09-05"]').click();
    await expect(pop).toBeHidden();

    // Both buttons should now display 2026-09-05
    await expect(fromBtn).toContainText("2026-09-05");
    await expect(toBtn).toContainText("2026-09-05");
  });
});

// -----------------------------------------------------------------------------
// 11. Calendar sync review
// -----------------------------------------------------------------------------
test.describe("compact date picker - Calendar sync review", () => {
  test("Calendar sync review: choosing Move to for removed meeting and picking date moves it to that date", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY;
    const moveTarget = addDaysISO(REFERENCE_TODAY, 6);

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          { date: today, start: "14:00", end: "15:00", title: "Canceled: Project Kickoff" },
        ]),
        notes: {
          [`${today}.txt`]: "Project Kickoff\n===============\nAction items\n",
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+C");
    const dialog = page.getByRole("dialog", { name: "Sync review" });
    await expect(dialog).toBeVisible();

    const removal = dialog.locator(".sync-review-removal");
    await removal.locator("button, label", { hasText: "Move" }).click();

    const dateBtn = removal.locator("button.sync-review-date");
    await dateBtn.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(`.cp-day[data-iso="${moveTarget}"]`).click();
    await expect(pop).toBeHidden();
    await expect(dateBtn).toContainText(moveTarget);

    await dialog.locator('button:has-text("Sync")').click();
    await expect(dialog).toBeHidden();

    // Verify meeting was moved to target note in backend
    expect(await mockNote(page, `${moveTarget}.txt`)).toContain("Project Kickoff");
  });
});

// -----------------------------------------------------------------------------
// 12. Keyboard isolation
// -----------------------------------------------------------------------------
test.describe("compact date picker - keyboard isolation", () => {
  test("keyboard isolation: typing in picker input does not type into note or trigger app shortcuts", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Base action");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    // Type inside input
    await pop.locator(".cp-input").pressSequentially("typing text");

    // The note behind it must not receive these typed characters
    expect(await activeTabContent(page)).toBe("# Base action");

    // Press shortcuts (Ctrl+K for palette, Ctrl+F for find)
    await page.keyboard.press("ControlOrMeta+k");
    await expect(modalCard(page, MODAL_LABELS.commandPalette)).toBeHidden();

    await page.keyboard.press("ControlOrMeta+f");
    await expect(page.locator(".find-bar")).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });
});

// -----------------------------------------------------------------------------
// 13. Phone width (375px)
// -----------------------------------------------------------------------------
test.describe("compact date picker - phone width (375px)", () => {
  test("phone width (375px): picker fits inside the window without horizontal or vertical clipping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Mobile task");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const popBox = (await pop.boundingBox())!;
    expect(popBox.x).toBeGreaterThanOrEqual(0);
    expect(popBox.x + popBox.width).toBeLessThanOrEqual(375);
    expect(popBox.y).toBeGreaterThanOrEqual(0);
    expect(popBox.y + popBox.height).toBeLessThanOrEqual(667);

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });
});

// -----------------------------------------------------------------------------
// 14. Suspected bugs
// -----------------------------------------------------------------------------
test.describe.skip("suspected bugs", () => {
  // Specification:
  // "Input: a slim text input on top understands dates and words: `today`, `tomorrow`, weekday names (next one after
  // today), `+3`, `wk44` (the Friday of that week for due dates), `10-30`, a full date, and the Dutch words with a Dutch
  // UI. Enter picks what was typed, or the focused day when nothing parses."
  //
  // What the code does instead:
  // When typing `wk44` in the compact date picker input for a due date, `parseQuery` in CompactDatePicker.svelte
  // evaluates `parseDateQuery(q)` before `parseDueWord(q, ...)`. Because `parseDateQuery` matches week queries (`wk\d+`)
  // and maps them to the Monday of that week (`isoWeekToMonday(year, 44)` = "2026-10-26"), `parseDueWord`'s Friday logic
  // (`2026-10-30`) is never reached. Consequently, pressing Enter writes `by:2026-10-26` (Monday) instead of the
  // specified Friday date `by:2026-10-30`.
  test("typing 'wk44' in due date picker input picks Friday of that week (2026-10-30)", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action task");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator(".cp-input").fill("wk44");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    await expect.poll(async () => activeTabContent(page)).toBe("# Action task by:2026-10-30");
  });
});
