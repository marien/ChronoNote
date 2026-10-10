import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  currentModal,
  todayFilename,
  cursorLine,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Actions docked pane (Proposal C1)", () => {
  const seedNotes = {
    [todayFilename()]: [
      "Weekly Sync",
      "===========",
      "# first action",
      "# second action",
      "# third action",
    ].join("\n"),
  };

  test("docks side-by-side with editor, Enter jumps and keeps pane open, shortcut toggles focus, updates on focus return, Escape closes, replaces History, dialog at 900px", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    // 1. Ctrl+Shift+A shows .actions-pane next to the editor (no .overlay)
    await page.keyboard.press("ControlOrMeta+Shift+A");
    const pane = page.locator(".actions-pane");
    await expect(pane).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(page.locator(".overlay")).toHaveCount(0);
    const filterInput = pane.locator(".modal-input");
    await expect(filterInput).toBeFocused();

    // 2. Enter on the second action moves the caret to that line in the note (status bar Ln) and pane stays open
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(() => cursorLine(page)).toBe(4);
    await expect(pane).toBeVisible();
    expect(await currentModal(page)).toBe("actions");
    await expect(editor(page)).toBeFocused();

    // 3. Ctrl+Shift+A from the note focuses the pane's filter input and again returns focus to the editor
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(filterInput).toBeFocused();
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(editor(page)).toBeFocused();

    // 4. Typing "# new thing" on a new line in the note and then moving focus back into the pane lists "new thing"
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("# new thing");
    await expect(editor(page)).toContainText("# new thing");
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(filterInput).toBeFocused();
    await expect(pane.locator('.modal-item[role="option"]', { hasText: "new thing" })).toBeVisible();

    // 5. Escape closes it and focuses the editor
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    expect(await currentModal(page)).toBe("none");
    await expect(editor(page)).toBeFocused();

    // 6. History and Actions never show at once (opening History while the Actions pane is open replaces it)
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(pane).toBeVisible();
    await expect(page.locator(".history-pane")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane")).toBeVisible();
    await expect(page.locator(".actions-pane")).toHaveCount(0);
    expect(await currentModal(page)).toBe("history");
    await page.keyboard.press("Escape");
    await expect(page.locator(".history-pane")).toHaveCount(0);

    // 7. At 900px wide Actions opens as the old dialog
    await page.setViewportSize({ width: 900, height: 800 });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+A");
    await expect(page.locator(".overlay")).toBeVisible();
    await expect(page.locator(".modal-card.modal-lg")).toBeVisible();
    await expect(page.locator(".actions-pane")).toHaveCount(0);
    expect(await currentModal(page)).toBe("actions");
    await page.keyboard.press("Escape");
    await expect(page.locator(".overlay")).toHaveCount(0);
  });
});

test.describe("Ctrl+/ from inside a drawer or pane (the footer's 'All keys' hint)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  for (const [label, combo, width] of [
    ["the docked Actions pane", "ControlOrMeta+Shift+A", 1280],
    ["the Actions dialog", "ControlOrMeta+Shift+A", 900],
    ["the docked History pane", "ControlOrMeta+Shift+H", 1280],
  ] as const) {
    test(`opens Shortcuts & symbols from ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await seedApp(page, {
        seed: {
          notes: { [todayFilename()]: ["Weekly Sync", "===========", "# one", "# two"].join("\n") },
          session: { openTabs: [todayFilename()], activeTab: todayFilename() },
        },
      });
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press(combo);
      await expect.poll(() => currentModal(page)).not.toBe("none");
      await page.keyboard.press("ControlOrMeta+Slash");
      await expect.poll(() => currentModal(page)).toBe("shortcuts");
    });
  }
});
