import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  tab,
  activeTabLabel,
  cursorLine,
  mockNote,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
} from "./helpers";

test.describe("date links and navigation", () => {
  test("Ctrl+Click on date with section opens day, lands on section title, and Back/Forward navigate", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Today\n=====\nCheck (2026-09-03#Standup) for notes",
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
    const forwardBtn = page.locator("#stat-forward");
    await expect(backBtn).toBeVisible();
    await expect(backBtn).toContainText("2026-09-07");
    await expect(forwardBtn).toBeHidden();

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
    await expect(forwardBtn).toBeVisible();
    await expect(forwardBtn).toContainText("2026-09-03");

    // Forward with shortcut: Ctrl+Alt+Right or Cmd+]
    if (isMac) {
      await page.keyboard.press("Meta+BracketRight");
    } else {
      await page.keyboard.press("Control+Alt+ArrowRight");
    }

    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
    await expect.poll(() => cursorLine(page)).toBe(5);
    await expect(forwardBtn).toBeHidden();
    await expect(backBtn).toBeVisible();

    // Now test clicking the status bar buttons
    await backBtn.click();
    await expect(activeTabLabel(page)).toHaveText("2026-09-07");
    await expect.poll(() => cursorLine(page)).toBe(3);
    await expect(forwardBtn).toBeVisible();

    await forwardBtn.click();
    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
    await expect.poll(() => cursorLine(page)).toBe(5);
  });

  test("bare 2026-09-03#Standup links only to date (opens day at top); (2026-09-03#Standup) lands on section", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Today\n=====\n2026-09-03#Standup and (2026-09-03#Standup)",
          "2026-09-03.txt": "Intro\n=====\nSome intro text\n\nStandup\n=======\n# discuss roadmap",
        },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      },
    });

    const links = editor(page).locator(".cm-date-link");
    await expect(links).toHaveCount(2);

    // Bare link only covers date
    await expect(links.nth(0)).toHaveText("2026-09-03");
    // Bracketed link covers date and section
    await expect(links.nth(1)).toHaveText("2026-09-03#Standup");

    // Clicking bare link opens day at top (line 1)
    await links.nth(0).click({ modifiers: ["ControlOrMeta"] });
    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
    await expect.poll(() => cursorLine(page)).toBe(1);

    // Switch back to 2026-09-07
    await tab(page, "2026-09-07.txt").click();

    // Clicking bracketed link lands on Standup section (line 5)
    await links.nth(1).click({ modifiers: ["ControlOrMeta"] });
    await expect(activeTabLabel(page)).toHaveText("2026-09-03");
    await expect.poll(() => cursorLine(page)).toBe(5);
  });

  test("Shift+Enter in Actions forwards action with to-link on source and from-link on today", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Today\n=====\n- existing note",
          "2026-09-03.txt": "Standup\n=======\n# chase the release notes\n- note",
        },
        session: { openTabs: ["2026-09-03.txt", "2026-09-07.txt"], activeTab: "2026-09-03.txt" },
      },
    });

    await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const drawer = modalCard(page, MODAL_LABELS.actions);
    const filter = drawer.locator(".modal-input");
    await filter.fill("release notes");
    await filter.focus();
    await page.keyboard.press("Shift+Enter");

    // Source gets (>today) (today has no section at top, so date only)
    await expect
      .poll(() => mockNote(page, "2026-09-03.txt"))
      .toContain("> chase the release notes (>2026-09-07)");

    // Today gets (<source date#source section)
    await expect
      .poll(() => mockNote(page, "2026-09-07.txt"))
      .toContain("# chase the release notes (<2026-09-03#Standup)");
  });

  test("Ctrl+Shift+. (copy to next occurrence) adds to-link to source and from-link to copy", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-01.txt": "Weekly Sync\n============\n# test shortcut forwarding",
          "2026-09-08.txt": "Weekly Sync\n============\n- notes",
        },
        session: { openTabs: ["2026-09-01.txt", "2026-09-08.txt"], activeTab: "2026-09-01.txt" },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // line with action
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+Shift+Period");

    await expect
      .poll(() => mockNote(page, "2026-09-01.txt"))
      .toContain("> test shortcut forwarding (>2026-09-08#Weekly Sync)");
    await expect
      .poll(() => mockNote(page, "2026-09-08.txt"))
      .toContain("# test shortcut forwarding (<2026-09-01#Weekly Sync)");
  });

  test("pasting an open topic forwards it to skipped (',') without links, while action gets links", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Top priorities\n==============\n",
          "2026-09-03.txt": "Weekly\n======\no an open agenda topic\n# an open action",
        },
        session: { openTabs: ["2026-09-03.txt", "2026-09-07.txt"], activeTab: "2026-09-03.txt" },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // line 3: o an open agenda topic
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+C");

    await tab(page, "2026-09-07.txt").click();
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ControlOrMeta+V");

    // Source: topic deferred to ',' without link; action deferred to '>' with to-link
    await expect
      .poll(() => mockNote(page, "2026-09-03.txt"))
      .toBe("Weekly\n======\n, an open agenda topic\n> an open action (>2026-09-07#Top priorities)");

    // Target: topic pasted as 'o' without link; action pasted as '#' with from-link
    await expect
      .poll(() => mockNote(page, "2026-09-07.txt"))
      .toBe("Top priorities\n==============\no an open agenda topic\n# an open action (<2026-09-03#Weekly)");
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
