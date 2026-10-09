import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  currentModal,
  todayFilename,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Section History docked pane (Proposal C1)", () => {
  const seedNotes = {
    "2026-09-01.txt": [
      "Weekly Sync",
      "===========",
      "# previous week sync action",
    ].join("\n"),
    [todayFilename()]: [
      "Weekly Sync",
      "===========",
      "# first open action",
      "v done action",
      "# second open action",
      "",
      "Project Apollo",
      "==============",
      "# apollo discussion",
    ].join("\n"),
  };

  test("docks side-by-side with editor, F6 switches focus, note editable, Ctrl+J works, follows caret, Escape closes, and dialog at 900px", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    // Place cursor in first section "Weekly Sync"
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    // 1. Ctrl+Shift+H shows .history-pane next to the editor (both visible, no .overlay)
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const pane = page.locator(".history-pane");
    await expect(pane).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(page.locator(".overlay")).toHaveCount(0);
    await expect(pane.locator(".modal-title")).toContainText("Weekly Sync");

    // 2. F6 moves focus to the editor
    await page.keyboard.press("F6");
    await expect(editor(page)).toBeFocused();

    // 3. Typing then changes the note (pane stays open)
    await page.keyboard.type("Note edit test. ");
    await expect(editor(page)).toContainText("Note edit test.");
    await expect(pane).toBeVisible();
    expect(await currentModal(page)).toBe("history");

    // 4. Ctrl+J still works with the pane open
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+j");
    await expect(pane).toBeVisible();
    expect(await currentModal(page)).toBe("history");

    // 5. Moving the caret into another section updates the pane title
    const apolloLine = editor(page).locator(".cm-line", { hasText: "apollo discussion" });
    await apolloLine.click();
    await expect(pane.locator(".modal-title")).toContainText("Project Apollo");

    // 6. Escape in the pane closes it and focuses the editor
    await page.keyboard.press("F6");
    await expect(pane).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    expect(await currentModal(page)).toBe("none");
    await expect(editor(page)).toBeFocused();

    // 7. At 900px wide History opens as the old dialog
    await page.setViewportSize({ width: 900, height: 800 });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".overlay")).toBeVisible();
    await expect(page.locator(".modal-card.history-modal-card")).toBeVisible();
    await expect(page.locator(".history-pane")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".overlay")).toHaveCount(0);
  });

  test("narrowing window below 1000px while docked closes the pane", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane")).toBeVisible();

    await page.setViewportSize({ width: 950, height: 800 });
    await expect(page.locator(".history-pane")).toHaveCount(0);
    expect(await currentModal(page)).toBe("none");
  });

  test("pressing Ctrl+Shift+H in the note while pane is open moves focus to the pane", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane")).toBeVisible();

    // Switch focus to editor with F6
    await page.keyboard.press("F6");
    await expect(editor(page)).toBeFocused();

    // Pressing Ctrl+Shift+H while in note moves focus to pane
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane .history-body")).toBeFocused();
  });
});
