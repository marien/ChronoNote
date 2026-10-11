import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  tab,
  mockNote,
  typeInEditor,
  toast,
  type SeedApp,
} from "./helpers";

test.describe("earlier versions of a note", () => {
  test("seed note, edit in editor, open tab menu -> Earlier versions..., view diff, restore", async ({ page }) => {
    const filename = "2026-10-10.txt";
    const initialContent = "Initial morning notes\nTasks to complete today\n";
    const seed: SeedApp = {
      seed: {
        notes: {
          [filename]: initialContent,
        },
        session: {
          openTabs: [filename],
          activeTab: filename,
        },
      },
    };

    await seedApp(page, seed);

    // Initial content is in editor
    await expect(editor(page)).toContainText("Initial morning notes");

    // Edit the note (type more content). This triggers an autosave.
    // The first save of the day on an existing note keeps the seeded content as an earlier version.
    await typeInEditor(page, "\nAdded afternoon follow-up\n");

    // Wait for autosave debounce (400ms) to persist
    await expect.poll(() => mockNote(page, filename)).toContain("Added afternoon follow-up");

    // Right-click the tab to open tab context menu
    const targetTab = tab(page, "2026-10-10");
    await targetTab.click({ button: "right" });

    const menu = page.locator(".tab-context-menu");
    await expect(menu).toBeVisible();

    // Click "Earlier versions…"
    const menuItem = menu.getByRole("menuitem", { name: "Earlier versions…" });
    await expect(menuItem).toBeVisible();
    await menuItem.click();

    // Earlier versions modal opens with expected title
    const modal = page.locator(".modal-card[role='dialog']");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-title")).toContainText("Earlier versions · 2026-10-10");

    // Shows at least one version entry
    const versionEntries = modal.locator('[data-testid="version-entry"]');
    await expect(versionEntries.first()).toBeVisible();

    // Selecting the version shows diff against current content
    await versionEntries.first().click();
    const leftDiff = modal.locator('[data-testid="version-diff-left"]');
    const rightDiff = modal.locator('[data-testid="version-diff-right"]');
    await expect(leftDiff).toBeVisible();
    await expect(rightDiff).toBeVisible();
    await expect(leftDiff).toContainText("Initial morning notes");
    await expect(rightDiff).toContainText("Added afternoon follow-up");

    // Click "Restore this version"
    const restoreBtn = modal.getByRole("button", { name: "Restore this version" });
    await expect(restoreBtn).toBeEnabled();
    await restoreBtn.click();

    // Modal closes
    await expect(modal).not.toBeVisible();

    // Toast message confirms restoration
    await expect(toast(page)).toContainText("Version restored");

    // Editor content is restored to initial content
    await expect(editor(page)).toContainText("Initial morning notes");
    await expect(editor(page)).not.toContainText("Added afternoon follow-up");

    // Persisted note on disk is restored
    await expect.poll(() => mockNote(page, filename)).toBe("Initial morning notes\nTasks to complete today\n");
  });

  test("Escape key closes earlier versions modal", async ({ page }) => {
    const filename = "2026-10-10.txt";
    const seed: SeedApp = {
      seed: {
        notes: {
          [filename]: "Some note content\n",
        },
        session: {
          openTabs: [filename],
          activeTab: filename,
        },
      },
    };

    await seedApp(page, seed);

    const targetTab = tab(page, "2026-10-10");
    await targetTab.click({ button: "right" });

    const menu = page.locator(".tab-context-menu");
    await menu.getByRole("menuitem", { name: "Earlier versions…" }).click();

    const modal = page.locator(".modal-card[role='dialog']");
    await expect(modal).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });
});
