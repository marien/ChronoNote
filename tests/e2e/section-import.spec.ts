import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent, modalCard, MODAL_LABELS } from "./helpers";

const importModal = (page: import("@playwright/test").Page) => modalCard(page, MODAL_LABELS.sectionImport);

async function openImport(page: import("@playwright/test").Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Shift+I");
  await expect(importModal(page)).toBeVisible();
}

test.describe("section import (Ctrl+Shift+I)", () => {
  test("each pasted line becomes a setext header, appended with 2 blank lines", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "Existing note body.");
    await openImport(page);

    await importModal(page).locator("textarea").fill("Weekly Sync\nBudget review\n1:1 with Marco");
    await importModal(page).getByRole("button", { name: "Import" }).click();

    const content = await activeTabContent(page);
    expect(content).toBe(
      [
        "Existing note body.",
        "",
        "",
        "Weekly Sync",
        "===========",
        "",
        "",
        "Budget review",
        "=============",
        "",
        "",
        "1:1 with Marco",
        "==============",
        "",
      ].join("\n"),
    );
  });

  test("blank lines in the pasted text are ignored", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "");
    await openImport(page);

    await importModal(page).locator("textarea").fill("First\n\n\n  \nSecond\n");
    await importModal(page).getByRole("button", { name: "Import" }).click();

    const headers = (await activeTabContent(page)).match(/^=+$/gm) ?? [];
    expect(headers).toHaveLength(2);
  });

  test("closing without importing keeps the draft; reopening restores it", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await openImport(page);
    await importModal(page).locator("textarea").fill("Draft I did not submit");
    await page.keyboard.press("Escape");
    await expect(importModal(page)).toBeHidden();

    await openImport(page);
    await expect(importModal(page).locator("textarea")).toHaveValue("Draft I did not submit");

    // Cancel (not Escape) clears it.
    await importModal(page).getByRole("button", { name: "Cancel" }).click();
    await openImport(page);
    await expect(importModal(page).locator("textarea")).toHaveValue("");
  });
});
