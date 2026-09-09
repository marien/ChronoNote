import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, todayFilename, modalCard, MODAL_LABELS } from "./helpers";

test.describe("status bar — three zones (§100)", () => {
  test("left zone tracks cursor, word count and action counts", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "# open one\nv done two\nplain words here" } } });

    await expect(page.locator("#stat-words")).toHaveText("9 words");
    await expect(page.locator("#stat-open")).toHaveText("Open 1");
    await expect(page.locator("#stat-closed")).toHaveText("Closed 1");

    await setEditorText(page, "just three words");
    await expect(page.locator("#stat-words")).toHaveText("3 words");
    await setEditorText(page, "solo");
    await expect(page.locator("#stat-words")).toHaveText("1 word");
  });

  test("centre zone shows ambient save state for a real note", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "start" } } });
    const save = page.locator("#stat-save");

    await editor(page).click();
    await page.keyboard.type("x");
    await expect(save).toHaveAttribute("data-state", "saving");
    await expect(save).toContainText(/saving/i);

    // settles after the 400ms autosave debounce + the write resolving
    await expect(save).toHaveAttribute("data-state", "saved", { timeout: 3000 });
    await expect(save).toContainText(/all changes saved/i);
  });

  test("centre zone is honest that a scratchpad never hits disk", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await editor(page).click();
    await page.keyboard.press("Control+n"); // new scratchpad
    await expect(page.locator("#stat-save")).toContainText(/in memory only/i);
    await expect(page.locator("#stat-save")).toHaveAttribute("data-state", "mem");
  });

  test("right zone: version and the ? shortcut trigger", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, appVersion: "9.9.9" } });
    await expect(page.locator("#stat-version")).toHaveText("v9.9.9");

    await page.locator(".status-help").click();
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeVisible();
  });
});
