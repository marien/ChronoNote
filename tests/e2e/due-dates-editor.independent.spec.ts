import { test, expect } from "@playwright/test";
import {
  cursorLine,
  seedApp,
  editor,
  setEditorText,
  typeInEditor,
  activeTabContent,
  mockNote,
  todayFilename,
  toast,
  activeTabLabel,
  tab,
} from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";
import { addDaysISO, parseDueWord } from "../../src/lib/date";

test.describe("due dates editor — independent tests (slice 2)", () => {
  test.describe("1. Rewrite on leaving the line", () => {
    test("leaving the line by Enter rewrites by:fri to ISO date", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;

      await typeInEditor(page, "# call client by:fri");
      await page.keyboard.press("Enter");

      await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedFriday}`);
      await expect.poll(async () => mockNote(page, todayFilename())).toContain(`by:${expectedFriday}`);
    });

    test("leaving the line by ArrowDown rewrites the line", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;

      await setEditorText(page, "# call client by:fri\nsecond line");
      await editor(page).locator(".cm-line").first().click();
      await page.keyboard.press("ArrowDown");

      await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedFriday}`);
    });

    test("leaving the line by ArrowUp rewrites the line", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const expectedTomorrow = addDaysISO(REFERENCE_TODAY, 1);

      await setEditorText(page, "first line\n# task by:tomorrow");
      await editor(page).locator(".cm-line").nth(1).click();
      await page.keyboard.press("ArrowUp");

      await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedTomorrow}`);
    });

    test("leaving the line by mouse click on another line rewrites the line", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;

      await setEditorText(page, "# draft spec by:fri\nother line");
      await editor(page).locator(".cm-line").first().click();
      await editor(page).locator(".cm-line").nth(1).click();

      await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedFriday}`);
    });

    test("leaving the line by Ctrl+End rewrites the line", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;

      await setEditorText(page, "# top priority by:fri\nsecond line\nthird line");
      await editor(page).locator(".cm-line").first().click();
      await page.keyboard.press("ControlOrMeta+End");

      await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedFriday}`);
    });

    test("state-first rewrite combined with due date in one step; Ctrl+Z restores what was typed; Ctrl+Y redoes it", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;

      await typeInEditor(page, "- # task by:fri");
      await page.keyboard.press("Enter");

      await expect.poll(async () => activeTabContent(page)).toContain(`# - task by:${expectedFriday}`);

      // Single undo restores verbatim typed text
      await page.keyboard.press("ControlOrMeta+z");
      await expect.poll(async () => activeTabContent(page)).toContain("- # task by:fri");

      // Redo restores rewrite
      await page.keyboard.press("ControlOrMeta+y");
      await expect.poll(async () => activeTabContent(page)).toContain(`# - task by:${expectedFriday}`);
    });

    test("not rewritten while the caret stays on the line (typing more, moving left/right)", async ({ page }) => {
      await seedApp(page, { seed: "empty" });

      await typeInEditor(page, "# task by:fri");
      await page.keyboard.type(" more words");
      expect(await activeTabContent(page)).toBe("# task by:fri more words");

      // Moving left and right within the line
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      expect(await activeTabContent(page)).toBe("# task by:fri more words");
    });

    test("a note opened with by:tomorrow is untouched until visited and left; other lines never rewritten", async ({
      page,
    }) => {
      const noteContent = `# line 1 by:tomorrow\n# line 2 by:tomorrow\n# line 3 by:tomorrow\n`;
      await seedApp(page, {
        seed: {
          notes: {
            [todayFilename()]: noteContent,
          },
        },
      });

      // Verify note remains verbatim on disk initially
      expect(await mockNote(page, todayFilename())).toBe(noteContent);
      await page.waitForTimeout(500);
      expect(await mockNote(page, todayFilename())).toBe(noteContent);

      // Visit line 1, then leave to line 2
      await editor(page).locator(".cm-line").first().click();
      await page.keyboard.press("ArrowDown");

      const expectedTomorrow = addDaysISO(REFERENCE_TODAY, 1);
      await expect.poll(async () => mockNote(page, todayFilename())).toContain(`# line 1 by:${expectedTomorrow}`);
      // Line 3 was never visited and must remain untouched
      expect(await mockNote(page, todayFilename())).toContain(`# line 3 by:tomorrow`);
    });

    test("an unreadable word stays exactly as typed and marked with cm-due-unknown", async ({ page }) => {
      await seedApp(page, { seed: "empty" });

      await setEditorText(page, "# task by:notadate\nsecond line");
      await editor(page).locator(".cm-line").first().click();
      await page.keyboard.press("ArrowDown");

      expect(await activeTabContent(page)).toContain("# task by:notadate");
      const mark = page.locator(".cm-line").first().locator(".cm-due-unknown");
      await expect(mark).toBeVisible();
      await expect(mark).toHaveText("by:notadate");
      await expect(mark).toHaveAttribute("title", /Not a date/i);
    });
  });

  test.describe("2. Words in Dutch with UI language set to Dutch", () => {
    test("rewrites by:vr and by:morgen when UI language is Dutch", async ({ page }) => {
      await seedApp(page, {
        seed: {
          notes: {},
          languageMode: "nl",
        },
      });
      const expectedFriday = parseDueWord("vr", REFERENCE_TODAY, "nl")!;
      const expectedTomorrow = addDaysISO(REFERENCE_TODAY, 1);

      await typeInEditor(page, "# taak een by:vr");
      await page.keyboard.press("Enter");
      await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedFriday}`);

      await typeInEditor(page, "# taak twee by:morgen");
      await page.keyboard.press("Enter");
      await expect.poll(async () => activeTabContent(page)).toContain(`by:${expectedTomorrow}`);
    });

    test("a date due today is marked today, with the Dutch tooltip, and keeps its digits (§421)", async ({ page }) => {
      await seedApp(page, {
        seed: {
          notes: {},
          languageMode: "nl",
        },
      });
      await setEditorText(page, `# taak vandaag by:${REFERENCE_TODAY}\nsecond line`);
      await editor(page).locator(".cm-line").nth(1).click();

      const due = page.locator(".cm-line").first().locator(".cm-due");
      await expect(due).toBeVisible();
      await expect(due).toHaveClass(/\bcm-due-today\b/);
      await expect(due).toHaveText(`by:${REFERENCE_TODAY}`);
      await expect(due).toHaveAttribute("title", /Vandaag te doen/);
    });
  });

  test.describe("3. Paste behaviour", () => {
    test("pasted # x by:tomorrow gets the ISO date", async ({ page }) => {
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

    test("pasted block with several lines rewrites each action line while keeping prose and ISO untouched", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      await editor(page).click();

      const expectedTomorrow = addDaysISO(REFERENCE_TODAY, 1);
      const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;
      const fixedIso = addDaysISO(REFERENCE_TODAY, 15);

      const pastedBlock = [
        "# task one by:tomorrow",
        "- bullet item by:tomorrow",
        "# task two by:fri",
        `# task three by:${fixedIso}`,
        "just prose by:tomorrow",
      ].join("\n");

      await page.evaluate((text) => {
        const data = new DataTransfer();
        data.setData("text/plain", text);
        document
          .querySelector(".cm-content")!
          .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      }, pastedBlock);

      await expect.poll(async () => activeTabContent(page)).toContain(`# task one by:${expectedTomorrow}`);
      await expect.poll(async () => activeTabContent(page)).toContain("- bullet item by:tomorrow");
      await expect.poll(async () => activeTabContent(page)).toContain(`# task two by:${expectedFriday}`);
      await expect.poll(async () => activeTabContent(page)).toContain(`# task three by:${fixedIso}`);
      await expect.poll(async () => activeTabContent(page)).toContain("just prose by:tomorrow");
    });

    test("paste-forward of an action with a due date into today keeps the date and adds forward links", async ({
      page,
    }) => {
      const yesterday = addDaysISO(REFERENCE_TODAY, -1);
      const futureDue = addDaysISO(REFERENCE_TODAY, 5);

      await seedApp(page, {
        seed: {
          notes: {
            [`${yesterday}.txt`]: `Priorities\n==========\n# finish roadmap by:${futureDue}\n`,
            [todayFilename()]: `Today\n=====\n`,
          },
          session: {
            openTabs: [`${yesterday}.txt`, todayFilename()],
            activeTab: `${yesterday}.txt`,
          },
        },
      });

      // Select line in yesterday's note and copy
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
      await page.keyboard.press("ControlOrMeta+c");

      // Switch to today's note and paste
      await tab(page, todayFilename()).click();
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("ControlOrMeta+v");

      // The pasted line keeps its due date and gains (<yesterday#Priorities) link
      await expect.poll(async () => activeTabContent(page)).toContain(`by:${futureDue}`);
      const todayText = await activeTabContent(page);
      expect(todayText).toMatch(new RegExp(`by:${futureDue}\\s*\\(<${yesterday}#Priorities\\)`));

      // The source line in yesterday's note becomes deferred (>) and keeps the due date with (>today#Today) link
      await expect.poll(async () => mockNote(page, `${yesterday}.txt`)).toContain(`> finish roadmap by:${futureDue}`);
      const yesterdayText = await mockNote(page, `${yesterday}.txt`);
      expect(yesterdayText).toMatch(new RegExp(`by:${futureDue}\\s*\\(>${REFERENCE_TODAY}#Today\\)`));
    });
  });

  test.describe("4. Pill appearance, states, and midnight rollover", () => {
    test("the flag and outline look the same on and off the caret line (§421)", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const futureDate = addDaysISO(REFERENCE_TODAY, 4);
      await setEditorText(page, `# my task by:${futureDate}\nsecond line`);
      const due = page.locator(".cm-line").first().locator(".cm-due");

      // Caret on first line
      await editor(page).locator(".cm-line").first().click();
      await expect(due.locator(".cm-due-flag")).toBeVisible();
      await expect(due).toHaveText(`by:${futureDate}`);

      // Move caret to second line
      await page.keyboard.press("ArrowDown");
      await expect(due.locator(".cm-due-flag")).toBeVisible();
      await expect(due).toHaveText(`by:${futureDate}`);
    });

    test("colours and classes for later / today / overdue / resolved states", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const laterDate = addDaysISO(REFERENCE_TODAY, 5);
      const todayDate = REFERENCE_TODAY;
      const overdueDate = addDaysISO(REFERENCE_TODAY, -3);

      await setEditorText(
        page,
        [
          `# later task by:${laterDate}`,
          `# today task by:${todayDate}`,
          `# overdue task by:${overdueDate}`,
          `v done task by:${overdueDate}`,
          `> deferred task by:${overdueDate}`,
          `x wontdo task by:${overdueDate}`,
          `caret line`,
        ].join("\n"),
      );
      await editor(page).locator(".cm-line").nth(6).click();

      const lines = page.locator(".cm-line");
      await expect(lines.nth(0).locator(".cm-due")).toHaveClass(/\bcm-due-later\b/);
      await expect(lines.nth(1).locator(".cm-due")).toHaveClass(/\bcm-due-today\b/);
      await expect(lines.nth(2).locator(".cm-due")).toHaveClass(/\bcm-due-overdue\b/);
      // Resolved lines (v, >, x) must all have cm-due-resolved
      await expect(lines.nth(3).locator(".cm-due")).toHaveClass(/\bcm-due-resolved\b/);
      await expect(lines.nth(4).locator(".cm-due")).toHaveClass(/\bcm-due-resolved\b/);
      await expect(lines.nth(5).locator(".cm-due")).toHaveClass(/\bcm-due-resolved\b/);
    });

    test("overdue tooltip shows days late", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const overdueDate = addDaysISO(REFERENCE_TODAY, -3);
      await setEditorText(page, `# late action by:${overdueDate}\ncaret line`);
      await editor(page).locator(".cm-line").nth(1).click();

      const pill = page.locator(".cm-line").first().locator(".cm-due");
      await expect(pill).toBeVisible();
      await expect(pill).toHaveAttribute("title", /3 days late/i);
    });

    test("delegated line => @dana ... by: gets a pill", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const futureDate = addDaysISO(REFERENCE_TODAY, 3);
      await setEditorText(page, `=> @dana send the slides by:${futureDate}\nsecond line`);
      await editor(page).locator(".cm-line").nth(1).click();

      const pill = page.locator(".cm-line").first().locator(".cm-due");
      await expect(pill).toBeVisible();
      await expect(pill).toHaveClass(/\bcm-due-later\b/);
    });

    test("topic, bullet, and prose lines do not get pills", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const futureDate = addDaysISO(REFERENCE_TODAY, 3);
      await setEditorText(
        page,
        [
          `o topic by:${futureDate}`,
          `. discussed by:${futureDate}`,
          `- bullet by:${futureDate}`,
          `prose line by:${futureDate}`,
          `! bold line by:${futureDate}`,
          `# real action by:${futureDate}`,
          `caret line`,
        ].join("\n"),
      );
      await editor(page).locator(".cm-line").nth(6).click();

      const lines = page.locator(".cm-line");
      for (let i = 0; i < 5; i++) {
        await expect(lines.nth(i).locator(".cm-due")).toHaveCount(0);
      }
      await expect(lines.nth(5).locator(".cm-due")).toBeVisible();
    });

    test("the date is shown as written, in this year and the next (§421: nothing is replaced but by:)", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const thisYearDate = addDaysISO(REFERENCE_TODAY, 5);
      const nextYearDate = addDaysISO(REFERENCE_TODAY, 400);

      await setEditorText(page, `# this year by:${thisYearDate}\n# next year by:${nextYearDate}\ncaret line`);
      await editor(page).locator(".cm-line").nth(2).click();

      await expect(page.locator(".cm-line").nth(0).locator(".cm-due")).toHaveText(`by:${thisYearDate}`);
      await expect(page.locator(".cm-line").nth(1).locator(".cm-due")).toHaveText(`by:${nextYearDate}`);
    });

    test("the line's text length on disk is unchanged by the pill (display only)", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const futureDate = addDaysISO(REFERENCE_TODAY, 5);
      const expectedText = `# task by:${futureDate}`;
      await setEditorText(page, `${expectedText}\ncaret line`);
      await editor(page).locator(".cm-line").nth(1).click();

      await expect(page.locator(".cm-line").first().locator(".cm-due")).toBeVisible();
      await expect.poll(async () => mockNote(page, todayFilename())).toContain(expectedText);
      const note = await mockNote(page, todayFilename());
      expect(note?.split("\n")[0]).toBe(expectedText);
    });

    test("after simulated midnight rollover, a due-today pill becomes overdue", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, `# task by:${REFERENCE_TODAY}\ncaret line`);
      await editor(page).locator(".cm-line").nth(1).click();

      const pill = page.locator(".cm-line").first().locator(".cm-due");
      await expect(pill).toBeVisible();
      await expect(pill).toHaveClass(/\bcm-due-today\b/);

      // Advance clock past midnight (next day)
      const nextDay = new Date(`${REFERENCE_TODAY}T09:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      await page.clock.setFixedTime(nextDay);
      // Window focus triggers refreshCurrentDate()
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));

      await expect(pill).toHaveClass(/\bcm-due-overdue\b/);
    });
  });

  test.describe("5. Set due date command, modal, and shortcuts", () => {
    test("Ctrl+Shift+D on an action without date adds one at the end of the action part", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# prepare release");
      await editor(page).locator(".cm-line").first().click();

      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();
      await expect(pop).toHaveAttribute("aria-label", "Choose a date");

      const targetDate = addDaysISO(REFERENCE_TODAY, 2);
      await pop.locator(`.cp-day[data-iso="${targetDate}"]`).click();
      await expect(pop).toBeHidden();

      await expect.poll(async () => activeTabContent(page)).toBe(`# prepare release by:${targetDate}`);
    });

    test("multi-part line (# a => # b) with caret in second part changes only that part", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# discuss project => # finalize spec");
      await editor(page).locator(".cm-line").first().click();

      // Move caret into the second part ("finalize spec")
      await page.keyboard.press("End");
      for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");

      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();

      const targetDate = addDaysISO(REFERENCE_TODAY, 3);
      await pop.locator(`.cp-day[data-iso="${targetDate}"]`).click();
      await expect(pop).toBeHidden();

      await expect.poll(async () => activeTabContent(page)).toBe(
        `# discuss project => # finalize spec by:${targetDate}`,
      );
    });

    test("on a line with forward links, due date goes BEFORE the links", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# task with link (>2026-11-01#Sync)");
      await editor(page).locator(".cm-line").first().click();

      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();

      const targetDate = addDaysISO(REFERENCE_TODAY, 4);
      await pop.locator(`.cp-day[data-iso="${targetDate}"]`).click();
      await expect(pop).toBeHidden();

      await expect.poll(async () => activeTabContent(page)).toBe(
        `# task with link by:${targetDate} (>2026-11-01#Sync)`,
      );
    });

    test("picking again replaces existing due date; No due date button removes it and space", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const initialDate = addDaysISO(REFERENCE_TODAY, 2);
      const replacementDate = addDaysISO(REFERENCE_TODAY, 5);

      await setEditorText(page, `# clean garage by:${initialDate}`);
      await editor(page).locator(".cm-line").first().click();

      // Replace date
      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();
      await pop.locator(`.cp-day[data-iso="${replacementDate}"]`).click();
      await expect(pop).toBeHidden();
      await expect.poll(async () => activeTabContent(page)).toBe(`# clean garage by:${replacementDate}`);

      // Remove date
      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      await expect(pop).toBeVisible();
      await pop.locator(".cp-none").click();
      await expect(pop).toBeHidden();
      await expect.poll(async () => activeTabContent(page)).toBe("# clean garage");
    });

    test("on a plain line, Ctrl+Shift+D shows toast message and does nothing", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "Just plain text without action");
      await editor(page).locator(".cm-line").first().click();

      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      await expect(page.locator(".compact-picker")).toBeHidden();
      await expect(toast(page)).toHaveText("Put the cursor on an action to give it a due date");
    });

    test("Escape closes the picker without making changes", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# buy milk");
      await editor(page).locator(".cm-line").first().click();

      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(pop).toBeHidden();
      expect(await activeTabContent(page)).toBe("# buy milk");
    });

    test("picker's jump field understands relative words like 'fri' or 'tomorrow'", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# write tests");
      await editor(page).locator(".cm-line").first().click();

      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();

      const expectedFriday = parseDueWord("fri", REFERENCE_TODAY, "en")!;
      await pop.locator("input").fill("fri");
      await page.keyboard.press("Enter");
      await expect(pop).toBeHidden();

      await expect.poll(async () => activeTabContent(page)).toBe(`# write tests by:${expectedFriday}`);
    });

    test("open Set due date through command palette", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# action for palette");
      await editor(page).locator(".cm-line").first().click();

      // Open command palette
      await page.keyboard.press("ControlOrMeta+k");
      const palette = page.locator('.modal-card[aria-label="Command palette"]');
      await expect(palette).toBeVisible();

      await palette.locator(".modal-input").fill("Set due date");
      const item = palette.locator('.modal-item[role="option"]', { hasText: "Set due date…" }).first();
      await expect(item).toBeVisible();
      await item.click();

      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();
      await expect(pop).toHaveAttribute("aria-label", "Choose a date");
    });

    test.describe("mobile accessory bar", () => {
      test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

      test("phone accessory bar has Set due date button which opens date picker", async ({ page }) => {
        await seedApp(page, { seed: "empty" });
        await setEditorText(page, "# mobile task");
        await editor(page).click();

        const accessoryBar = page.locator(".mobile-accessory-bar");
        await expect(accessoryBar).toBeVisible();

        // Open the overflow 'More' panel
        await accessoryBar.locator('button[aria-label="More"]').click();
        const setDueDateBtn = page.locator('.accessory-more-panel button[aria-label="Set due date…"]');
        await expect(setDueDateBtn).toBeVisible();
        await setDueDateBtn.click();

        const pop = page.locator(".compact-picker");
        await expect(pop).toBeVisible();
        await expect(pop).toHaveAttribute("aria-label", "Choose a date");
      });
    });
  });

  test.describe("6. Pill clicks and navigation", () => {
    test("Ctrl+Click on a pill opens that day's note", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const targetDate = addDaysISO(REFERENCE_TODAY, 4);
      await setEditorText(page, `# plan trip by:${targetDate}\nsecond line`);
      await editor(page).locator(".cm-line").nth(1).click();

      const pill = page.locator(".cm-line").first().locator(".cm-due-flag");
      await expect(pill).toBeVisible();

      // Ctrl+Click (or Meta+Click on Mac) opens that day's note
      await pill.click({ modifiers: ["ControlOrMeta"] });

      await expect(activeTabLabel(page)).toHaveText(targetDate);
    });

    test("plain click on a pill opens the date picker", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const targetDate = addDaysISO(REFERENCE_TODAY, 4);
      await setEditorText(page, `# plan trip by:${targetDate}\nsecond line`);
      await editor(page).locator(".cm-line").nth(1).click();

      const pill = page.locator(".cm-line").first().locator(".cm-due-flag");
      await expect(pill).toBeVisible();

      await pill.click();
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();
      await expect(pop).toHaveAttribute("aria-label", "Choose a date");
    });

    test("a click on the date digits opens the date picker too, and leaves the caret where it was (§422)", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const targetDate = addDaysISO(REFERENCE_TODAY, 4);
      await setEditorText(page, `# plan trip by:${targetDate}\nsecond line`);
      await editor(page).locator(".cm-line").nth(1).click();

      await page.locator(".cm-line").first().locator(".cm-due .cm-date-link").click();
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();
      await expect(pop.locator(`.cp-day[data-iso="${targetDate}"]`)).toHaveClass(/\bselected\b/);
      await page.keyboard.press("Escape");
      await expect.poll(() => cursorLine(page)).toBe(2);
    });

    test("Ctrl+Click on the date digits opens that day, not the picker", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      const targetDate = addDaysISO(REFERENCE_TODAY, 4);
      await setEditorText(page, `# plan trip by:${targetDate}\nsecond line`);
      await editor(page).locator(".cm-line").nth(1).click();

      await page.locator(".cm-line").first().locator(".cm-due .cm-date-link").click({ modifiers: ["ControlOrMeta"] });
      await expect(activeTabLabel(page)).toHaveText(targetDate);
      await expect(page.locator(".compact-picker")).toBeHidden();
    });
  });

  test.describe("fixed suspected bugs", () => {
    // Documented behaviour:
    // docs/design/due-dates-design.md Slice 2:
    // "- 'Set due date…': command in src/lib/shortcuts.ts (Ctrl+Shift+D, checked free) and the palette, an entry in
    // EditorContextMenu.svelte, a button in MobileAccessoryBar.svelte; opens DatePickerModal.svelte in a 'pick a due date'
    // mode with a 'No due date' button; clicking a pill opens the same."
    // Brief line 53: "Through the palette and the line menu too."
    // What the code does instead:
    // In src/lib/components/EditorContextMenu.svelte, getLineActionParts was imported and otherItemCount was updated to
    // include hasActionPart, but no menu item button for "Set due date…" was added to the Svelte template.
    // Right-clicking an action line displays the context menu without a "Set due date…" button.
    test("right-clicking an action line offers Set due date… in the line context menu", async ({ page }) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, "# Action task");
      const line = page.locator(".cm-content .cm-line").first();
      await line.click({ button: "right" });

      const menu = page.locator(".editor-context-menu");
      await expect(menu).toBeVisible();
      const dueItem = menu.locator(".editor-context-item", { hasText: /due date/i });
      await expect(dueItem).toBeVisible();
      await dueItem.click();

      await expect(page.locator(".compact-picker")).toBeVisible();
    });

    // Documented behaviour:
    // docs/design/due-dates-design.md line 71:
    // "'Set due date…' command (Ctrl+Shift+D, free; palette; line menu; the phone's accessory bar) opens the date picker
    // on the action under the caret and writes or replaces its by:, with a 'No due date' button to remove it. Clicking a pill does the same."
    // What the code does instead:
    // When Ctrl+Shift+D is pressed on a consequence action with an existing due date (# a => # b by:DATE), openDueDatePicker
    // records partFrom as the consequence symbol's offset (symIdx, e.g. 8), but DatePickerModal.svelte line 80 attempts
    // to find the action part using strict equality `parts.find((p) => p.from === pending.partFrom)` where part.from is the arrow
    // offset (e.g. 5). The part is not found, so getInitialIso falls back to today's date instead of the existing due date.
    test("Ctrl+Shift+D on a consequence action with an existing due date focuses the existing date in the picker", async ({
      page,
    }) => {
      await seedApp(page, { seed: "empty" });
      const existingDate = addDaysISO(REFERENCE_TODAY, 10);
      await setEditorText(page, `# task a => # task b by:${existingDate}`);

      // Place caret in second part ("# task b")
      await editor(page).locator(".cm-line").first().click();
      await page.keyboard.press("End");
      for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowLeft");

      await page.keyboard.press("ControlOrMeta+Shift+KeyD");
      const pop = page.locator(".compact-picker");
      await expect(pop).toBeVisible();

      // The existing date cell should be focused / marked as selected in the calendar
      const dayBtn = pop.locator(`.cp-day[data-iso="${existingDate}"]`);
      await expect(dayBtn).toHaveClass(/\bselected\b/);
    });
  });
});
