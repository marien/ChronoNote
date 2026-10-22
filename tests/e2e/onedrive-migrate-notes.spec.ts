import { test, expect, type Page } from "@playwright/test";
import { seedApp, mockNote, readMock, toast } from "./helpers";

const picker = (page: Page) => page.getByRole("dialog", { name: "Select OneDrive Folder" });
const migrateModal = (page: Page) => page.getByRole("dialog", { name: "Move Notes to OneDrive" });

async function openPicker(page: Page) {
  await page.locator("#stat-cloud").click();
  await expect(picker(page)).toBeVisible();
}

async function selectFolderAndUse(page: Page, folderName?: string) {
  const p = picker(page);
  if (folderName) {
    await p.locator(".onedrive-folder-row", { hasText: folderName }).click();
  }
  await p.getByRole("button", { name: "Use this folder" }).click();
}

test.describe("OneDrive migrate browser notes", () => {
  test.use({
    viewport: { width: 400, height: 800 },
    isMobile: false,
    hasTouch: false,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  });

  // --- 1. Prompting behavior ---

  test("prompts 'Move Notes to OneDrive?' naming the folder and stating '1 note' when 1 note is in browser storage", async ({ page }) => {
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { "2026-10-22.txt": "single browser note" },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");

    const modal = migrateModal(page);
    await expect(modal).toBeVisible();
    await expect(modal.locator(".dialog-title")).toHaveText("Move Notes to OneDrive?");
    await expect(modal.locator(".dialog-body")).toContainText("1 note");
    await expect(modal.locator(".dialog-body")).toContainText("/Notes");
    await expect(modal.locator(".dialog-body")).toContainText(
      "If a note with the same name already exists in OneDrive and the text differs, both versions are kept and you choose which to keep - nothing is overwritten. A safety backup of your browser notes will be saved.",
    );
  });

  test("prompts 'Move Notes to OneDrive?' stating 'N notes' when multiple notes are in browser storage", async ({ page }) => {
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: {
          "2026-10-20.txt": "first note",
          "2026-10-21.txt": "second note",
          "2026-10-22.txt": "third note",
        },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");

    const modal = migrateModal(page);
    await expect(modal).toBeVisible();
    await expect(modal.locator(".dialog-body")).toContainText("3 notes");
    await expect(modal.locator(".dialog-body")).toContainText("/Notes");
  });

  test("does not prompt to move notes when browser storage has no notes", async ({ page }) => {
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: {},
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");

    await expect(migrateModal(page)).toHaveCount(0);
    await expect(toast(page)).toContainText("Switched notes directory to /Notes", { timeout: 5000 });
  });

  // --- 2. 'Move notes to OneDrive' flow ---

  test("moving notes places browser notes in the OneDrive workspace and clears browser storage", async ({ page }) => {
    const NOTE = "2026-10-22.txt";
    const CONTENT = "my personal daily thoughts\n";
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { [NOTE]: CONTENT },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");
    await migrateModal(page).getByRole("button", { name: "Move notes to OneDrive" }).click();

    await expect(toast(page)).toContainText("Switched notes directory to /Notes", { timeout: 5000 });
    expect(await mockNote(page, NOTE)).toBe(CONTENT);

    const remainingBrowserNotes = await readMock(page, () => window.__CHRONO_MOCK__!.getBrowserNotes());
    expect(Object.keys(remainingBrowserNotes)).toHaveLength(0);
  });

  test("moving notes saves a safety backup of browser notes in the archive store", async ({ page }) => {
    const NOTE = "2026-10-22.txt";
    const CONTENT = "precious notes to safeguard\n";
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { [NOTE]: CONTENT },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");
    await migrateModal(page).getByRole("button", { name: "Move notes to OneDrive" }).click();

    await expect(toast(page)).toContainText("Switched notes directory to /Notes", { timeout: 5000 });
    const archive = await readMock(page, () => window.__CHRONO_MOCK__!.getArchiveNotes());
    expect(archive[NOTE]).toBe(CONTENT);
  });

  test("a note already existing in OneDrive with different text is preserved and held as a sync conflict", async ({ page }) => {
    const NOTE = "2026-10-22.txt";
    const BROWSER_CONTENT = "browser version\n";
    const CLOUD_CONTENT = "cloud version\n";

    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { [NOTE]: BROWSER_CONTENT },
        cloudNotes: { [NOTE]: CLOUD_CONTENT },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");
    await migrateModal(page).getByRole("button", { name: "Move notes to OneDrive" }).click();

    await expect(toast(page)).toContainText("Switched notes directory to /Notes", { timeout: 5000 });
    await expect(page.locator("#stat-conflicts")).toContainText("1 sync conflict", { timeout: 5000 });

    await page.locator("#stat-conflicts").click();
    const conflictDialog = page.getByRole("dialog", { name: "Sync conflicts" });
    await expect(conflictDialog).toBeVisible();
    await expect(page.getByTestId("conflict-local").locator(".conflict-line")).toHaveText(["browser version"]);
    await expect(page.getByTestId("conflict-remote").locator(".conflict-line")).toHaveText(["cloud version"]);
  });

  test("while moving notes, the button shows a spinner with 'Moving notes…' and buttons are disabled", async ({ page }) => {
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { "2026-10-22.txt": "test note" },
        delayCommands: { web_migrate_browser_notes: 1500 },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");

    const modal = migrateModal(page);
    const migrateBtn = modal.locator(".dialog-btn.accent");
    const separateBtn = modal.getByRole("button", { name: "Keep Browser storage separate" });
    const cancelBtn = modal.getByRole("button", { name: "Cancel" });

    await migrateBtn.click();

    await expect(migrateBtn).toContainText("Moving notes…");
    await expect(migrateBtn.locator(".modal-spinner")).toBeVisible();
    await expect(migrateBtn).toBeDisabled();
    await expect(separateBtn).toBeDisabled();
    await expect(cancelBtn).toBeDisabled();

    await expect(modal).toHaveCount(0, { timeout: 5000 });
  });

  // --- 3. 'Keep Browser storage separate' flow ---

  test("clicking 'Keep Browser storage separate' switches to OneDrive without moving browser notes", async ({ page }) => {
    const NOTE = "2026-10-22.txt";
    const CONTENT = "keep me local only\n";
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { [NOTE]: CONTENT },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");
    await migrateModal(page).getByRole("button", { name: "Keep Browser storage separate" }).click();

    await expect(toast(page)).toContainText("Switched notes directory to /Notes", { timeout: 5000 });

    // In OneDrive folder, the note was not moved across
    expect(await mockNote(page, NOTE)).toBeNull();

    // In browser storage, the note is still preserved
    const browserNotes = await readMock(page, () => window.__CHRONO_MOCK__!.getBrowserNotes());
    expect(browserNotes[NOTE]).toBe(CONTENT);

    // Archive backup was not created because notes were not migrated
    const archive = await readMock(page, () => window.__CHRONO_MOCK__!.getArchiveNotes());
    expect(Object.keys(archive)).toHaveLength(0);
  });

  // --- 4. Cancellation (Escape, outside click, Cancel button) ---

  test("pressing Escape cancels migration without moving notes", async ({ page }) => {
    const NOTE = "2026-10-22.txt";
    const CONTENT = "cancel via escape\n";
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { [NOTE]: CONTENT },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");
    const modal = migrateModal(page);
    await expect(modal).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);

    // Notes remain intact in browser storage
    const browserNotes = await readMock(page, () => window.__CHRONO_MOCK__!.getBrowserNotes());
    expect(browserNotes[NOTE]).toBe(CONTENT);

    // Observed behaviour regarding folder choice: on Escape, the keydown event is caught
    // by both MigrateNotesModal and OneDriveFolderPickerModal, closing both dialogs without
    // setting oneDriveFolder.
    const folder = await readMock(page, () => window.__CHRONO_MOCK__!.oneDriveFolder);
    expect(folder).toBeNull();
  });

  test("clicking outside the dialog cancels migration without moving notes", async ({ page }) => {
    const NOTE = "2026-10-22.txt";
    const CONTENT = "cancel via outside click\n";
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { [NOTE]: CONTENT },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");
    const modal = migrateModal(page);
    await expect(modal).toBeVisible();

    // Click on overlay outside dialog card (top-left corner)
    await page.locator(".overlay").last().click({ position: { x: 10, y: 10 } });
    await expect(modal).toHaveCount(0);

    // Notes remain intact in browser storage
    const browserNotes = await readMock(page, () => window.__CHRONO_MOCK__!.getBrowserNotes());
    expect(browserNotes[NOTE]).toBe(CONTENT);

    // Observed behaviour regarding folder choice: clicking outside leaves the OneDrive folder picker
    // open while closing MigrateNotesModal; oneDriveFolder remains unset until committed.
    await expect(picker(page)).toBeVisible();
    const folder = await readMock(page, () => window.__CHRONO_MOCK__!.oneDriveFolder);
    expect(folder).toBeNull();
  });

  test("clicking the Cancel button cancels migration without moving notes", async ({ page }) => {
    const NOTE = "2026-10-22.txt";
    const CONTENT = "cancel via button\n";
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { [NOTE]: CONTENT },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");
    const modal = migrateModal(page);
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toHaveCount(0);

    // Notes remain intact in browser storage
    const browserNotes = await readMock(page, () => window.__CHRONO_MOCK__!.getBrowserNotes());
    expect(browserNotes[NOTE]).toBe(CONTENT);

    // Observed behaviour regarding folder choice: clicking Cancel leaves the OneDrive folder picker
    // open while closing MigrateNotesModal; oneDriveFolder remains unset until committed.
    await expect(picker(page)).toBeVisible();
    const folder = await readMock(page, () => window.__CHRONO_MOCK__!.oneDriveFolder);
    expect(folder).toBeNull();
  });

  // --- 5. Dialog accessibility and focus management ---

  test("dialog has accessible name 'Move Notes to OneDrive' and initial focus on the primary action", async ({ page }) => {
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { "2026-10-22.txt": "focus test" },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");

    const modal = page.getByRole("dialog", { name: "Move Notes to OneDrive" });
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute("aria-modal", "true");

    const moveBtn = modal.getByRole("button", { name: "Move notes to OneDrive" });
    await expect(moveBtn).toBeFocused();
  });

  test("focus does not escape the dialog to the editor or background controls", async ({ page }) => {
    await seedApp(page, {
      seed: {
        backendKind: "web",
        oneDriveFolder: null,
        notes: { "2026-10-22.txt": "focus containment test" },
      },
    });

    await openPicker(page);
    await selectFolderAndUse(page, "Notes");

    const modal = migrateModal(page);
    await expect(modal).toBeVisible();

    // Tab press inside the dialog should never leak focus out to background elements
    await page.keyboard.press("Tab");

    const activeInModal = await page.evaluate(() => {
      const active = document.activeElement;
      const modalEl = document.querySelector('.modal-card[aria-label="Move Notes to OneDrive"]');
      return modalEl?.contains(active) ?? false;
    });
    expect(activeInModal).toBe(true);

    const activeInEditor = await page.evaluate(() => {
      return document.querySelector(".cm-editor")?.contains(document.activeElement) ?? false;
    });
    expect(activeInEditor).toBe(false);

    const activeInTopBar = await page.evaluate(() => {
      return document.querySelector("#top-bar")?.contains(document.activeElement) ?? false;
    });
    expect(activeInTopBar).toBe(false);
  });

  // --- Suspected bugs ---

  // §413: were suspected bugs (skipped) until the dialog's busy state and the nested focus trap were fixed.
  test.describe("busy state and Tab inside the dialog", () => {
    test("while moving notes, clicking outside does not dismiss the dialog", async ({ page }) => {
      // Documented behaviour:
      //   Brief §2: "While moving, the button says 'Moving notes…' and the dialog cannot be dismissed."
      // What the app does instead:
      //   In MigrateNotesModal.svelte line 50:
      //     <div class="overlay" role="presentation" use:closeOnOutsideClick={onCancel}>
      //   `closeOnOutsideClick` unconditionally invokes `onCancel` (`handleCancelMigration`)
      //   when the overlay receives a click, regardless of `migrating` state. This clears
      //   `pendingMigration` and unmounts the modal while the migration is in-flight.
      await seedApp(page, {
        seed: {
          backendKind: "web",
          oneDriveFolder: null,
          notes: { "2026-10-22.txt": "test note" },
          delayCommands: { web_migrate_browser_notes: 2500 },
        },
      });

      await openPicker(page);
      await selectFolderAndUse(page, "Notes");

      const modal = migrateModal(page);
      const migrateBtn = modal.locator(".dialog-btn.accent");
      await migrateBtn.click();
      await expect(migrateBtn).toContainText("Moving notes…");

      // Attempt to dismiss by clicking the overlay outside the dialog card
      await page.locator(".overlay").last().click({ position: { x: 10, y: 10 } });

      // Expected by brief: dialog cannot be dismissed while moving
      await expect(modal).toBeVisible();
    });

    test("while moving notes, pressing Escape does not dismiss the dialog", async ({ page }) => {
      // Documented behaviour:
      //   Brief §2: "While moving, the button says 'Moving notes…' and the dialog cannot be dismissed."
      // What the app does instead:
      //   Although MigrateNotesModal.svelte line 42 checks `!migrating && !skipping`,
      //   OneDriveFolderPickerModal.svelte line 188 has a window keydown listener:
      //     if (e.key === "Escape") { if (pendingMigration) { pendingMigration = null; } else { onClose(); } }
      //   which does not check whether a migration is in-flight. Pressing Escape dispatches
      //   to window and executes `pendingMigration = null;`, unmounting the modal while migrating.
      await seedApp(page, {
        seed: {
          backendKind: "web",
          oneDriveFolder: null,
          notes: { "2026-10-22.txt": "test note" },
          delayCommands: { web_migrate_browser_notes: 2500 },
        },
      });

      await openPicker(page);
      await selectFolderAndUse(page, "Notes");

      const modal = migrateModal(page);
      const migrateBtn = modal.locator(".dialog-btn.accent");
      await migrateBtn.click();

      await expect(migrateBtn).toContainText("Moving notes…");
      await page.keyboard.press("Escape");

      // Expected by brief: dialog cannot be dismissed while moving
      await expect(modal).toBeVisible();
    });

    test("focus trap allows Tab navigation to cycle between dialog buttons", async ({ page }) => {
      // Documented behaviour:
      //   Brief §5: "The dialog is a proper dialog: it has the name 'Move Notes to OneDrive', focus stays inside it."
      // What the app does instead:
      //   `focusTrap.ts` installs a capture-phase keydown listener on `document`. When MigrateNotesModal
      //   opens on top of OneDriveFolderPickerModal, the parent modal's focusTrap listener intercepts Tab
      //   before MigrateNotesModal. Because MigrateNotesModal's focused button is not a descendant of
      //   OneDriveFolderPickerModal's card, the parent trap detects focus outside its container and calls
      //   `e.preventDefault()`. As a result, pressing Tab never advances focus to "Keep Browser storage separate"
      //   or "Cancel", locking focus on the first button.
      await seedApp(page, {
        seed: {
          backendKind: "web",
          oneDriveFolder: null,
          notes: { "2026-10-22.txt": "focus tab cycle" },
        },
      });

      await openPicker(page);
      await selectFolderAndUse(page, "Notes");

      const modal = migrateModal(page);
      const moveBtn = modal.getByRole("button", { name: "Move notes to OneDrive" });
      const separateBtn = modal.getByRole("button", { name: "Keep Browser storage separate" });
      const cancelBtn = modal.getByRole("button", { name: "Cancel" });

      await expect(moveBtn).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(separateBtn).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(cancelBtn).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(moveBtn).toBeFocused();
    });

    test("focus trap allows Shift+Tab navigation to cycle backwards between dialog buttons", async ({ page }) => {
      // Documented behaviour:
      //   Brief §5: "The dialog is a proper dialog: it has the name 'Move Notes to OneDrive', focus stays inside it."
      // What the app does instead:
      //   As documented in the Tab test above, OneDriveFolderPickerModal's capture-phase focusTrap
      //   intercepts Shift+Tab and calls `e.preventDefault()`, preventing backward focus navigation
      //   to "Cancel" and "Keep Browser storage separate".
      await seedApp(page, {
        seed: {
          backendKind: "web",
          oneDriveFolder: null,
          notes: { "2026-10-22.txt": "focus shift-tab cycle" },
        },
      });

      await openPicker(page);
      await selectFolderAndUse(page, "Notes");

      const modal = migrateModal(page);
      const moveBtn = modal.getByRole("button", { name: "Move notes to OneDrive" });
      const separateBtn = modal.getByRole("button", { name: "Keep Browser storage separate" });
      const cancelBtn = modal.getByRole("button", { name: "Cancel" });

      await expect(moveBtn).toBeFocused();

      await page.keyboard.press("Shift+Tab");
      await expect(cancelBtn).toBeFocused();

      await page.keyboard.press("Shift+Tab");
      await expect(separateBtn).toBeFocused();

      await page.keyboard.press("Shift+Tab");
      await expect(moveBtn).toBeFocused();
    });
  });
});
