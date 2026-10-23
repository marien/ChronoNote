import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  activeTabContent,
  cursorLine,
} from "./helpers";
import { REFERENCE_TODAY, scenario } from "../../src/lib/testing/scenarios";
import {
  addDaysISO,
  addMonths,
  formatISO,
  parseDueWord,
  parseISODateLocal,
} from "../../src/lib/date";

test.describe("compact date picker", () => {
  test("clicking a due date opens .compact-picker right below it, with .selected and .today; picking writes; .cp-none removes; Escape and outside click close and restore caret", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const futureDate = addDaysISO(REFERENCE_TODAY, 5);
    await setEditorText(page, `# task by:${futureDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const dueBox = (await dueEl.boundingBox())!;
    const popBox = (await pop.boundingBox())!;

    const topDiff = popBox.y - (dueBox.y + dueBox.height);
    expect(topDiff).toBeGreaterThanOrEqual(0);
    expect(topDiff).toBeLessThanOrEqual(8);

    const leftDiff = Math.abs(popBox.x - dueBox.x);
    expect(leftDiff).toBeLessThanOrEqual(2);

    await expect(pop.locator(`.cp-day[data-iso="${futureDate}"]`)).toHaveClass(/\bselected\b/);
    await expect(pop.locator(`.cp-day[data-iso="${REFERENCE_TODAY}"]`)).toHaveClass(/\btoday\b/);

    // Picking a day writes it
    const pickDate = addDaysISO(REFERENCE_TODAY, 2);
    await pop.locator(`.cp-day[data-iso="${pickDate}"]`).click();
    await expect(pop).toBeHidden();
    await expect.poll(async () => activeTabContent(page)).toBe(`# task by:${pickDate}`);

    // .cp-none removes it
    await page.locator(".cm-due").first().click();
    await expect(pop).toBeVisible();
    await pop.locator(".cp-none").click();
    await expect(pop).toBeHidden();
    await expect.poll(async () => activeTabContent(page)).toBe("# task");

    // Escape closes without a change and caret is back in the editor where it was
    await setEditorText(page, `# task by:${futureDate}\nsecond line`);
    await editor(page).locator(".cm-line").nth(1).click();
    await expect.poll(() => cursorLine(page)).toBe(2);

    await page.locator(".cm-due").first().click();
    await expect(pop).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
    expect(await activeTabContent(page)).toBe(`# task by:${futureDate}\nsecond line`);
    await expect.poll(() => cursorLine(page)).toBe(2);

    // Outside click closes without a change and caret is back in the editor
    await page.locator(".cm-due").first().click();
    await expect(pop).toBeVisible();
    await editor(page).locator(".cm-line").nth(1).click();
    await expect(pop).toBeHidden();
    expect(await activeTabContent(page)).toBe(`# task by:${futureDate}\nsecond line`);
    await expect.poll(() => cursorLine(page)).toBe(2);
  });

  test("Ctrl+Shift+D on an action without a date opens under the caret; on a line near bottom opens above", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# action without date");
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("End");

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const popBox = (await pop.boundingBox())!;
    const editorBox = (await editor(page).boundingBox())!;
    expect(popBox.y).toBeGreaterThanOrEqual(editorBox.y);
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();

    // On a line near bottom of window, it opens above
    const futureDate = addDaysISO(REFERENCE_TODAY, 4);
    const filler = Array.from({ length: 22 }, (_, i) => `line ${i + 1}`).join("\n");
    await setEditorText(page, `${filler}\n# bottom action by:${futureDate}`);

    const dueEl = page.locator(".cm-due").first();
    await dueEl.click();
    await expect(pop).toBeVisible();

    const dueBox = (await dueEl.boundingBox())!;
    const popAboveBox = (await pop.boundingBox())!;
    expect(popAboveBox.y + popAboveBox.height).toBeLessThanOrEqual(dueBox.y);
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });

  test("typing fri + Enter picks next Friday; arrow keys, PageDown and Enter pick by keyboard", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# buy groceries");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await pop.locator("input").fill("fri");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    const expectedFri = parseDueWord("fri", REFERENCE_TODAY, "en")!;
    await expect.poll(async () => activeTabContent(page)).toBe(`# buy groceries by:${expectedFri}`);

    // Keyboard navigation: arrows, PageDown, Enter
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    await expect(pop).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("PageDown");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();

    const d = parseISODateLocal(expectedFri);
    const nextMonth = addMonths(d.getFullYear(), d.getMonth(), 1);
    const expectedPicked = formatISO(new Date(nextMonth.year, nextMonth.month, d.getDate() + 1));
    await expect.poll(async () => activeTabContent(page)).toBe(`# buy groceries by:${expectedPicked}`);
  });

  test("the picker has no note/action markers (no .has-pending, .has-done, .hasnote classes inside it)", async ({
    page,
  }) => {
    const yesterday = addDaysISO(REFERENCE_TODAY, -1);
    const tomorrow = addDaysISO(REFERENCE_TODAY, 1);
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        notes: {
          [`${yesterday}.txt`]: "v done task\n",
          [`${tomorrow}.txt`]: "# open task\n",
          [`${REFERENCE_TODAY}.txt`]: "# today action\n",
        },
      },
    });
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    await expect(pop.locator(".has-pending")).toHaveCount(0);
    await expect(pop.locator(".has-done")).toHaveCount(0);
    await expect(pop.locator(".hasnote")).toHaveCount(0);
    await expect(pop.locator(".has")).toHaveCount(0);
    await expect(pop.locator(".has-agenda")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });

  test("its width is under 230px at default font size, and font size equals editor's", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# check size");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const box = (await pop.boundingBox())!;
    expect(box.width).toBeLessThan(230);

    const popFontSize = await pop.evaluate((el) => window.getComputedStyle(el).fontSize);
    const editorFontSize = await editor(page).evaluate((el) => window.getComputedStyle(el).fontSize);
    expect(popFontSize).toBe(editorFontSize);

    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
  });

  test("Export: both date buttons open it below, range is shaded, picking updates button text and export range", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const from = addDaysISO(REFERENCE_TODAY, 1);
    const to = addDaysISO(REFERENCE_TODAY, 3);
    const outsideDate = addDaysISO(REFERENCE_TODAY, 10);

    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        notes: {
          [`${from}.txt`]: "# In range task from\n",
          [`${to}.txt`]: "# In range task to\n",
          [`${outsideDate}.txt`]: "# Outside range task\n",
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
    await expect(dateButtons).toHaveCount(2);
    const fromBtn = dateButtons.nth(0);
    const toBtn = dateButtons.nth(1);

    // Open From picker
    await fromBtn.click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const fromBox = (await fromBtn.boundingBox())!;
    const popBox = (await pop.boundingBox())!;
    expect(popBox.y).toBeGreaterThanOrEqual(fromBox.y + fromBox.height);
    expect(await pop.locator(".cp-day.in-range").count()).toBeGreaterThan(0);

    await pop.locator(`.cp-day[data-iso="${from}"]`).click();
    await expect(pop).toBeHidden();
    await expect(fromBtn).toContainText(from);

    // Open To picker
    await toBtn.click();
    await expect(pop).toBeVisible();

    const toBox = (await toBtn.boundingBox())!;
    const popBox2 = (await pop.boundingBox())!;
    expect(popBox2.y).toBeGreaterThanOrEqual(toBox.y + toBox.height);

    await pop.locator(`.cp-day[data-iso="${to}"]`).click();
    await expect(pop).toBeHidden();
    await expect(toBtn).toContainText(to);

    // Export and check clipboard
    await exportModal.locator("button", { hasText: "Copy as Markdown" }).click();
    await expect(exportModal).toBeHidden();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("- [ ] In range task from");
    expect(clip).toContain("- [ ] In range task to");
    expect(clip).not.toContain("- [ ] Outside range task");
  });

  test("calendar sync review: Move to opens it and the picked date is used", async ({
    page,
  }) => {
    const today = REFERENCE_TODAY;
    await seedApp(page, {
      seed: {
        ...scenario("empty"),
        calendarSyncEnabled: true,
        agendaJson: JSON.stringify([
          { date: today, start: "11:00", end: "12:00", title: "Canceled: Old sync" },
        ]),
        notes: {
          [`${today}.txt`]: "Old sync\n========\nnotes I took\n",
        },
        session: { openTabs: [`${today}.txt`], activeTab: `${today}.txt` },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+C");
    const dialog = page.getByRole("dialog", { name: "Sync review" });
    await expect(dialog).toBeVisible();

    const removal = dialog.locator(".sync-review-removal");
    await expect(removal).toContainText("Old sync");

    await removal.locator("button, label", { hasText: "Move" }).click();
    const dateBtn = removal.locator("button.sync-review-date");
    await expect(dateBtn).toBeVisible();

    await dateBtn.click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();

    const moveTarget = addDaysISO(REFERENCE_TODAY, 7);
    await pop.locator(`.cp-day[data-iso="${moveTarget}"]`).click();
    await expect(pop).toBeHidden();
    await expect(dateBtn).toContainText(moveTarget);

    await dialog.locator('button:has-text("Sync")').click();
    await expect(dialog).toBeHidden();
  });

  test("top-bar date picker still opens as before, with its markers", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.locator("[data-datepicker-trigger]").click();

    const bigPop = page.locator(".datepicker-pop");
    await expect(bigPop).toBeVisible();
    await expect(bigPop.locator(".cal-title")).toBeVisible();

    const markers = bigPop.locator(".cal-day.hasnote");
    expect(await markers.count()).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(bigPop).toBeHidden();
  });
});
