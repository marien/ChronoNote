import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  tab,
  activeTabLabel,
  cursorLine,
  mockNote,
} from "./helpers";

test.describe("date links and navigation", () => {
  test("Ctrl+Click on date with section opens day, lands on section title, and Back returns to original note and line", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Today\n=====\nCheck 2026-09-03#Standup for notes",
          "2026-09-03.txt": "Intro\n=====\nSome intro text\n\nStandup\n=======\n# discuss roadmap",
        },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    // Place caret on line 3 where the date link is
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    expect(await cursorLine(page)).toBe(3);

    const link = editor(page).locator(".cm-date-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveText("2026-09-03#Standup");

    // Ctrl+Click (or Cmd+Click) opens that day and lands on the section title line
    await link.click({ modifiers: ["ControlOrMeta"] });
    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
    // "Standup" is on line 5 (1-based)
    await expect.poll(() => cursorLine(page)).toBe(5);

    // The Back button appears in the status bar
    const backBtn = page.locator("#stat-back");
    await expect(backBtn).toBeVisible();
    await expect(backBtn).toContainText("2026-09-07");

    // Ctrl+Alt+Left (or Cmd+[ on Mac) returns to the first note and line
    const isMac = await page.evaluate(() => /Mac|iPod|iPhone|iPad/.test(navigator.platform));
    if (isMac) {
      await page.keyboard.press("Meta+BracketLeft");
    } else {
      await page.keyboard.press("Control+Alt+ArrowLeft");
    }

    await expect(activeTabLabel(page)).toHaveText("2026-09-07");
    await expect.poll(() => cursorLine(page)).toBe(3);
    await expect(backBtn).toBeHidden();
  });

  test("copying open action under section and pasting into today under section creates to/from links, jumping and undo", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Target Section\n==============\n",
          "2026-09-03.txt": "Source Section\n==============\n# send report to client\n- other note",
        },
        session: { openTabs: ["2026-09-03.txt", "2026-09-07.txt"], activeTab: "2026-09-03.txt" },
      },
    });

    // In source tab (2026-09-03), select and copy "# send report to client"
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+C");

    // Switch to today (2026-09-07) and paste under Target Section
    await tab(page, "2026-09-07.txt").click();
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ControlOrMeta+V");

    // Source line ends with (>today#target section) and is deferred (> )
    await expect
      .poll(() => mockNote(page, "2026-09-03.txt"))
      .toContain("> send report to client (>2026-09-07#Target Section)");

    // Pasted line ends with (<past date#source section)
    await expect
      .poll(() => mockNote(page, "2026-09-07.txt"))
      .toContain("# send report to client (<2026-09-03#Source Section)");

    // Clicking the from-link jumps to the source line's note and section
    const fromLink = editor(page).locator(".cm-date-link");
    await expect(fromLink).toBeVisible();
    await expect(fromLink).toHaveText("2026-09-03#Source Section");
    await fromLink.click({ modifiers: ["ControlOrMeta"] });

    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
    // "Source Section" is line 1 (1-based)
    await expect.poll(() => cursorLine(page)).toBe(1);

    // Switch back to today and press Ctrl+Z to undo
    await tab(page, "2026-09-07.txt").click();
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+z");

    // Today's paste is undone
    await expect.poll(() => mockNote(page, "2026-09-07.txt")).not.toContain("send report to client");

    // Source is back to its original text exactly
    await expect
      .poll(() => mockNote(page, "2026-09-03.txt"))
      .toBe("Source Section\n==============\n# send report to client\n- other note");
  });
});
