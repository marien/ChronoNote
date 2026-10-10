import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  toast,
  tab,
  mockNote,
  type SeedApp,
} from "./helpers";

const settings = (page: Page) => page.locator(".settings-modal-card, .settings-page");

async function openSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  await expect(settings(page)).toBeVisible();
}

async function openSettingsTab(page: Page, label: "Appearance" | "Notes & Sync" | "About") {
  await settings(page).getByRole("tab", { name: label, exact: true }).click();
}

test.describe("recently deleted notes trash", () => {
  test("seed a dated note with text, delete, close tab -> Settings -> Recently deleted -> Restore puts it back", async ({ page }) => {
    const seed: SeedApp = {
      seed: {
        notes: {
          "2026-10-10.txt": "Meeting notes for planning\nSecond line here\n",
          "2026-10-11.txt": "Other open note\n",
        },
        session: {
          openTabs: ["2026-10-10.txt", "2026-10-11.txt"],
          activeTab: "2026-10-10.txt",
        },
      },
    };

    await seedApp(page, seed);

    // Select all and delete text
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");

    // Close the tab
    await tab(page, "2026-10-10.txt").click({ button: "middle" });
    await expect(tab(page, "2026-10-10.txt")).not.toBeVisible();
    await expect.poll(() => mockNote(page, "2026-10-10.txt")).toBeNull();

    // Settings -> Notes & Sync -> Recently deleted -> Show
    await openSettings(page);
    await openSettingsTab(page, "Notes & Sync");
    await settings(page).getByRole("button", { name: "Show" }).click();

    // Lists it with preview
    const trashRow = settings(page).locator(".trash-row");
    await expect(trashRow).toBeVisible();
    await expect(trashRow.locator(".trash-row-date")).toHaveText("2026-10-10");
    await expect(trashRow.locator(".trash-row-preview")).toHaveText("Meeting notes for planning");

    // Restore opens the note with the text back
    await trashRow.getByRole("button", { name: "Restore" }).click();
    await expect(toast(page)).toContainText("Restored 2026-10-10.txt");

    // Close Settings and verify note tab and content
    await page.keyboard.press("Escape");
    await expect(settings(page)).not.toBeVisible();
    await expect(tab(page, "2026-10-10.txt")).toBeVisible();
    await expect(editor(page)).toContainText("Meeting notes for planning");
  });

  test("restoring when a note with text exists for that date shows already has text message", async ({ page }) => {
    const seed: SeedApp = {
      seed: {
        notes: {
          "2026-10-10.txt": "Meeting notes for planning\nSecond line here\n",
          "2026-10-11.txt": "Other open note\n",
        },
        session: {
          openTabs: ["2026-10-10.txt", "2026-10-11.txt"],
          activeTab: "2026-10-10.txt",
        },
      },
    };

    await seedApp(page, seed);

    // Select all and delete text, then close tab
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await tab(page, "2026-10-10.txt").click({ button: "middle" });
    await expect(tab(page, "2026-10-10.txt")).not.toBeVisible();
    await expect.poll(() => mockNote(page, "2026-10-10.txt")).toBeNull();

    // Now write a note with text for that same date on disk
    await page.evaluate(() => {
      window.__CHRONO_MOCK__!.setNote("2026-10-10.txt", "New existing content\n");
    });

    // Settings -> Notes & Sync -> Show trash
    await openSettings(page);
    await openSettingsTab(page, "Notes & Sync");
    await settings(page).getByRole("button", { name: "Show" }).click();

    // Click Restore
    const trashRow = settings(page).locator(".trash-row");
    await expect(trashRow).toBeVisible();
    await trashRow.getByRole("button", { name: "Restore" }).click();

    // Shows already has text toast
    await expect(toast(page)).toContainText(/already has text/i);
  });
});
