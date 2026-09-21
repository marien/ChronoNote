import { test, expect } from "@playwright/test";
import { lastWrittenNote, mockNote, seedApp, toast } from "./helpers";

test.describe("Drag-and-drop import (Area 4)", () => {
  test("shows drop overlay on dragenter with files and hides on dragleave", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web" } });

    await expect(page.locator("#drop-overlay")).toHaveCount(0);

    // Simulate dragenter with Files
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["test"], "2026-09-20.txt", { type: "text/plain" }));
      window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt }));
    });

    await expect(page.locator("#drop-overlay")).toBeVisible();
    await expect(page.locator(".drop-banner")).toContainText("Drop .json export bundle or .txt notes to import");

    // Simulate dragleave
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["test"], "2026-09-20.txt", { type: "text/plain" }));
      window.dispatchEvent(new DragEvent("dragleave", { dataTransfer: dt }));
    });

    await expect(page.locator("#drop-overlay")).toHaveCount(0);
  });

  test("unsupported file drop shows informative toast", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web" } });

    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["something"], "image.png", { type: "image/png" }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt }));
    });

    await expect(toast(page)).toContainText("Unsupported file. Drop a .json export bundle or YYYY-MM-DD.txt note.");
  });

  test("dropping a dated .txt note writes the note to storage", async ({ page }) => {
    await seedApp(page, { seed: { backendKind: "web" } });

    const noteContent = "Morning planning\n================\n# Project kick-off\n";
    await page.evaluate((content) => {
      const dt = new DataTransfer();
      const file = new File([content], "2026-09-20.txt", { type: "text/plain" });
      dt.items.add(file);
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt }));
    }, noteContent);

    await expect(toast(page)).toContainText("Imported 1 note");

    // Verify storage has the imported file
    const written = await lastWrittenNote(page, "2026-09-20.txt");
    expect(written).toBe(noteContent);
  });
});

test.describe("Dropped notes that differ from an existing note (Decision 6)", () => {
  const NAME = "2026-09-20.txt";
  const EXISTING = "my own note\n# keep me\n";
  const DROPPED = "the dropped version\n# from elsewhere\n";

  const drop = (page: import("@playwright/test").Page, name = NAME, content = DROPPED) =>
    page.evaluate(
      ({ name, content }) => {
        const dt = new DataTransfer();
        dt.items.add(new File([content], name, { type: "text/plain" }));
        window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt }));
      },
      { name, content },
    );


  async function seed(page: import("@playwright/test").Page) {
    await seedApp(page, { seed: { backendKind: "web", notes: { [NAME]: EXISTING } } });
  }

  test("a differing note is not written: a review dialog opens showing both versions", async ({ page }) => {
    await seed(page);
    await drop(page);

    const dialog = page.getByRole("dialog", { name: "Dropped notes differ" });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("dropped-existing")).toContainText("my own note");
    await expect(page.getByTestId("dropped-new")).toContainText("the dropped version");
    await expect(toast(page)).toContainText("differs from what you have");
    // Nothing was written yet.
    expect(await mockNote(page, NAME)).toBe(EXISTING);
  });

  test("Use the dropped file replaces the note", async ({ page }) => {
    await seed(page);
    await drop(page);
    await page.getByRole("button", { name: "Use the dropped file" }).click();
    await expect(page.getByRole("dialog", { name: "Dropped notes differ" })).toHaveCount(0);
    expect(await lastWrittenNote(page, NAME)).toBe(DROPPED);
  });

  test("Keep both appends the dropped text under a marker", async ({ page }) => {
    await seed(page);
    await drop(page);
    await page.getByRole("button", { name: "Keep both" }).click();
    const written = await lastWrittenNote(page, NAME);
    expect(written).toContain(EXISTING.trimEnd());
    expect(written).toContain("# Dropped copy");
    expect(written).toContain("the dropped version");
  });

  test("Keep my note and closing the dialog both leave the note untouched", async ({ page }) => {
    await seed(page);
    await drop(page);
    await page.getByRole("button", { name: "Keep my note" }).click();
    await expect(page.getByRole("dialog", { name: "Dropped notes differ" })).toHaveCount(0);
    expect(await mockNote(page, NAME)).toBe(EXISTING);

    await drop(page);
    await expect(page.getByRole("dialog", { name: "Dropped notes differ" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Dropped notes differ" })).toHaveCount(0);
    expect(await mockNote(page, NAME)).toBe(EXISTING);
  });

  test("an identical dropped note is skipped without a dialog", async ({ page }) => {
    await seed(page);
    await drop(page, NAME, EXISTING);
    await expect(toast(page)).toContainText("skipped 1");
    await expect(page.getByRole("dialog", { name: "Dropped notes differ" })).toHaveCount(0);
  });

  test("dropping a .json export bundle opens the import preview in Settings", async ({ page }) => {
    await seed(page);
    const bundle = JSON.stringify({
      chrononoteExport: 1,
      exportedAt: "2026-09-20T10:00:00.000Z",
      notes: { "2026-09-19.txt": "from the bundle" },
    });
    await drop(page, "export.json", bundle);
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  });
});
