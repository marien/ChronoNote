import { test, expect } from "@playwright/test";
import { lastWrittenNote, seedApp, toast } from "./helpers";

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
