import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  typeInEditor,
  activeTabContent,
  lastWrittenNote,
  mockNote,
  todayFilename,
  toast,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";
import { addDaysISO, parseDueWord } from "../../src/lib/date";

test.describe("due dates editor (slice 2)", () => {
  test("typing # call by:fri, then Enter, gives the ISO date in saved note; Ctrl+Z restores by:fri", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;

    await typeInEditor(page, "# call by:fri");
    await page.clock.fastForward(1000);
    await page.keyboard.press("Enter");

    await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedFriday}`);
    await expect.poll(async () => lastWrittenNote(page, todayFilename())).toContain(`by:${expectedFriday}`);

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => activeTabContent(page)).toContain("by:fri");
  });

  test("§421: the date stays text, by: becomes a flag, and both look the same on and off the caret line", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const futureDate = addDaysISO(REFERENCE_TODAY, 5);
    await setEditorText(page, `# first line by:${futureDate}\nsecond line`);
    const due = page.locator(".cm-line").first().locator(".cm-due");

    // Caret on the first line
    await editor(page).locator(".cm-line").first().click();
    await expect(due).toHaveCount(1);
    await expect(due).toHaveText(`by:${futureDate}`);
    await expect(due.locator(".cm-due-flag")).toHaveText("by:");

    // Caret on the second line: drawn the same way.
    await page.keyboard.press("ArrowDown");
    await expect(due).toHaveCount(1);
    await expect(due).toHaveText(`by:${futureDate}`);
    await expect(due.locator(".cm-due-flag")).toHaveText("by:");
  });

  test("§421: the caret never stops inside by:, and Backspace after the flag removes all of by:", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const futureDate = addDaysISO(REFERENCE_TODAY, 5);
    await setEditorText(page, `# call by:${futureDate}`);
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("End");
    // From the end: 10 digits/dashes left of the caret, then the flag counts as one step.
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Backspace");
    await expect.poll(async () => activeTabContent(page)).toBe(`# call ${futureDate}`);
  });

  test("pill classes for later / today / overdue / done line", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const laterDate = addDaysISO(REFERENCE_TODAY, 5);
    const todayDate = REFERENCE_TODAY;
    const overdueDate = addDaysISO(REFERENCE_TODAY, -3);

    await setEditorText(
      page,
      `# later by:${laterDate}\n# today by:${todayDate}\n# overdue by:${overdueDate}\nv done by:${overdueDate}\nend`,
    );
    await editor(page).locator(".cm-line").nth(4).click();

    const lines = page.locator(".cm-line");
    await expect(lines.nth(0).locator(".cm-due")).toHaveClass(/\bcm-due-later\b/);
    await expect(lines.nth(1).locator(".cm-due")).toHaveClass(/\bcm-due-today\b/);
    await expect(lines.nth(2).locator(".cm-due")).toHaveClass(/\bcm-due-overdue\b/);
    await expect(lines.nth(3).locator(".cm-due")).toHaveClass(/\bcm-due-resolved\b/);
    await expect(lines.nth(3).locator(".cm-due")).not.toHaveClass(/\bcm-due-overdue\b/);
  });

  test("unknown word gets cm-due-unknown on untouched line", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# task by:notarealdate\ncaret here");
    await editor(page).locator(".cm-line").nth(1).click();

    const mark = page.locator(".cm-line").first().locator(".cm-due-unknown");
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText("by:notarealdate");
    await expect(mark).toHaveAttribute("title", /Not a date/);
  });

  test("Ctrl+Shift+D opens picker, picking writes by:, picking again replaces it, No due date removes it", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# buy milk");
    await editor(page).locator(".cm-line").first().click();

    // 1. Open picker with shortcut
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
    await expect(pop).toHaveAttribute("aria-label", "Choose a date");

    // Pick a day
    const targetIso1 = addDaysISO(REFERENCE_TODAY, 1);
    await pop.locator(`.cp-day[data-iso="${targetIso1}"]`).click();
    await expect(pop).toBeHidden();
    await expect.poll(async () => activeTabContent(page)).toContain(`by:${targetIso1}`);

    // 2. Open picker again, pick another day to replace
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    await expect(pop).toBeVisible();

    const targetIso2 = addDaysISO(REFERENCE_TODAY, 3);
    await pop.locator(`.cp-day[data-iso="${targetIso2}"]`).click();
    await expect(pop).toBeHidden();
    await expect.poll(async () => activeTabContent(page)).toContain(`by:${targetIso2}`);
    await expect(await activeTabContent(page)).not.toContain(`by:${targetIso1}`);

    // 3. Open picker again and remove due date
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    await expect(pop).toBeVisible();
    await pop.locator(".cp-none").click();
    await expect(pop).toBeHidden();
    await expect.poll(async () => activeTabContent(page)).toBe("# buy milk");

    // 4. Open picker again, type a due word (e.g. "tomorrow") in jump input and press Enter
    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    await expect(pop).toBeVisible();
    await pop.locator("input").fill("tomorrow");
    await page.keyboard.press("Enter");
    await expect(pop).toBeHidden();
    const tomorrowIso = addDaysISO(REFERENCE_TODAY, 1);
    await expect.poll(async () => activeTabContent(page)).toBe(`# buy milk by:${tomorrowIso}`);
  });

  test("Ctrl+Shift+D on a plain line shows the toast", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "Just a plain line");
    await editor(page).locator(".cm-line").first().click();

    await page.keyboard.press("ControlOrMeta+Shift+KeyD");
    await expect(page.locator(".compact-picker")).toBeHidden();
    await expect(toast(page)).toHaveText("Put the cursor on an action to give it a due date");
  });

  test("clicking a pill opens the picker", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const futureDate = addDaysISO(REFERENCE_TODAY, 4);
    await setEditorText(page, `# plan sprint by:${futureDate}\nsecond line`);
    await editor(page).locator(".cm-line").nth(1).click();

    const pill = page.locator(".cm-line").first().locator(".cm-due-flag");
    await expect(pill).toBeVisible();
    await pill.click();

    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
    await expect(pop).toHaveAttribute("aria-label", "Choose a date");
  });

  test("a pill clicked after a line was inserted above it changes its own line", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const first = addDaysISO(REFERENCE_TODAY, 4);
    const second = addDaysISO(REFERENCE_TODAY, 5);
    await setEditorText(page, `top\n# a by:${first}\n# b by:${second}`);
    // A new line above both actions, typed: the pills stay drawn (same look) while their lines move down.
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");

    await page.locator(".cm-line").nth(2).locator(".cm-due-flag").click();
    const pop = page.locator(".compact-picker");
    await expect(pop).toBeVisible();
    const picked = addDaysISO(REFERENCE_TODAY, 6);
    await pop.locator(`.cp-day[data-iso="${picked}"]`).click();
    await expect(pop).toBeHidden();
    await expect.poll(async () => activeTabContent(page)).toBe(`\ntop\n# a by:${picked}\n# b by:${second}`);
  });

  test("paste of # x by:tomorrow gives the ISO date", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await editor(page).click();
    const expectedTomorrow = addDaysISO(REFERENCE_TODAY, 1);

    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "# x by:tomorrow");
      document
        .querySelector(".cm-content")!
        .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });

    await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedTomorrow}`);
  });

  test("a note loaded with by:fri in it is NOT changed on disk until the caret visits and leaves that line", async ({
    page,
  }) => {
    const noteContent = "# task by:fri\nsecond line\n";
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: noteContent,
        },
      },
    });

    // Check disk note is still verbatim by:fri
    expect(await mockNote(page, todayFilename())).toBe(noteContent);
    await page.waitForTimeout(600);
    expect(await mockNote(page, todayFilename())).toBe(noteContent);

    // Visit line and leave
    await editor(page).locator(".cm-line").first().click();
    await page.keyboard.press("ArrowDown");

    const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;
    await expect.poll(async () => mockNote(page, todayFilename())).toContain(`by:${expectedFriday}`);
  });
});
