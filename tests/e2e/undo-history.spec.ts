import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, tab, typeInEditor, activeTabContent, mockNote, toast } from "./helpers";
import type { SeedApp } from "./helpers";

/** §86 (#9): CodeMirror is fully remounted on every tab switch, so its
 * undo history used to restart empty each time. It's now serialized per
 * tab and restored on return — and undoing a paste-forward in the target
 * tab also flips the source tab's deferred actions back to open. */
test.describe("per-tab undo history (§86 / #9)", () => {
  const twoTabs = {
    seed: {
      notes: {
        "2026-09-07.txt": "Today\n=====\n",
        "2026-09-03.txt": "Older\n=====\n",
      },
      session: { openTabs: ["2026-09-03.txt", "2026-09-07.txt"], activeTab: "2026-09-07.txt" },
    },
  } satisfies SeedApp;

  async function undo(page: Page) {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+z");
  }
  async function redo(page: Page) {
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+z");
  }

  test("undo history survives a tab switch and is restored on return", async ({ page }) => {
    await seedApp(page, twoTabs);

    // Type in today's tab.
    await typeInEditor(page, "\nfirst edit here");
    expect(await activeTabContent(page)).toContain("first edit here");

    // Switch to the older tab, type something there.
    await tab(page, "2026-09-03.txt").click();
    await typeInEditor(page, "\nedit on the old tab");
    expect(await activeTabContent(page)).toContain("edit on the old tab");

    // Back to today's tab — its history should still know about "first edit here".
    await tab(page, "2026-09-07.txt").click();
    await undo(page);
    await expect.poll(() => activeTabContent(page)).not.toContain("first edit here");

    // Redo brings it back — the redo stack persisted too.
    await redo(page);
    await expect.poll(() => activeTabContent(page)).toContain("first edit here");
  });

  test("each tab's history is independent — undo in one never touches the other", async ({ page }) => {
    await seedApp(page, twoTabs);

    await typeInEditor(page, "\nAAA today");
    await tab(page, "2026-09-03.txt").click();
    await typeInEditor(page, "\nBBB older");
    await tab(page, "2026-09-07.txt").click();

    // Undo in today's tab removes today's edit only.
    await undo(page);
    await expect.poll(() => activeTabContent(page)).not.toContain("AAA today");

    await tab(page, "2026-09-03.txt").click();
    expect(await activeTabContent(page)).toContain("BBB older");
  });

  test("a tab whose text changed while inactive gets a fresh, safe undo baseline (no crash)", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          "2026-09-07.txt": "Today\n=====\n",
          "2026-09-03.txt": "Older\n=====\n# ship the thing",
        },
        session: { openTabs: ["2026-09-03.txt", "2026-09-07.txt"], activeTab: "2026-09-03.txt" },
      },
    });

    // Copy the open action from the old tab.
    await editor(page).click();
    await page.keyboard.press("Control+Home");
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+C");

    // Paste into today — defers the old tab's "# " to "> " while it's inactive.
    await tab(page, "2026-09-07.txt").click();
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("ControlOrMeta+V");
    await expect.poll(() => mockNote(page, "2026-09-03.txt")).toContain("> ship the thing");

    // Return to the old tab and hit undo: its saved history no longer lines
    // up with the deferred text, so it's a clean no-op, not a broken edit.
    await tab(page, "2026-09-03.txt").click();
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(200);
    expect(await activeTabContent(page)).toContain("> ship the thing");
    expect(await activeTabContent(page)).not.toContain("# ship the thing");
  });
});

test.describe("undo a paste-forward un-defers the source (§86 / #9)", () => {
  const seed = {
    seed: {
      notes: {
        "2026-09-07.txt": "Today\n=====\n",
        "2026-09-03.txt": "Standup\n=======\n# call the vendor back\n- other stuff",
      },
      session: { openTabs: ["2026-09-03.txt", "2026-09-07.txt"], activeTab: "2026-09-03.txt" },
    },
  } satisfies SeedApp;

  async function copyTheActionThenPasteIntoToday(page: Page) {
    await editor(page).click();
    await page.keyboard.press("Control+Home");
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("ControlOrMeta+C");

    await tab(page, "2026-09-07.txt").click();
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("ControlOrMeta+V");
  }

  test("Ctrl+Z in the target tab removes the paste AND restores the source to '# '", async ({ page }) => {
    await seedApp(page, seed);
    await copyTheActionThenPasteIntoToday(page);

    await expect.poll(() => mockNote(page, "2026-09-03.txt")).toContain("> call the vendor back");

    // Undo the paste in today's tab.
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+z");

    await expect.poll(() => activeTabContent(page)).not.toContain("call the vendor back");
    await expect.poll(() => mockNote(page, "2026-09-03.txt")).toContain("# call the vendor back");
    await expect.poll(() => mockNote(page, "2026-09-03.txt")).not.toContain("> call the vendor back");
    await expect(toast(page)).toContainText(/restored to open/i);
  });

  test("redo re-applies both the paste and the defer", async ({ page }) => {
    await seedApp(page, seed);
    await copyTheActionThenPasteIntoToday(page);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => mockNote(page, "2026-09-03.txt")).toContain("# call the vendor back");

    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => activeTabContent(page)).toContain("call the vendor back");
    await expect.poll(() => mockNote(page, "2026-09-03.txt")).toContain("> call the vendor back");
  });

  test("edits made after the paste are undone first; the source flips only when the paste itself is undone", async ({
    page,
  }) => {
    await seedApp(page, seed);
    await copyTheActionThenPasteIntoToday(page);
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await typeInEditor(page, "\ntrailing note");

    // First undo: removes "trailing note", source stays deferred.
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => activeTabContent(page)).not.toContain("trailing note");
    await expect.poll(() => mockNote(page, "2026-09-03.txt")).toContain("> call the vendor back");

    // Second undo: removes the paste, source flips back to open.
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => mockNote(page, "2026-09-03.txt")).toContain("# call the vendor back");
  });
});
