import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, todayFilename, modalCard, MODAL_LABELS } from "./helpers";

test.describe("status bar — three zones (§100/§110)", () => {
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

  test("#37/#38: left zone shows how many lines are selected", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "line one\nline two\nline three" } } });
    await editor(page).click();
    await expect(page.locator("#stat-selection")).toHaveCount(0);

    // select the whole document
    await page.keyboard.press("Control+A");
    await expect(page.locator("#stat-selection")).toHaveText("3 lines selected");

    // a within-line selection is still "1 line selected" — no character count
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.locator("#stat-selection")).toHaveText("1 line selected");

    // clearing the selection removes the readout
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#stat-selection")).toHaveCount(0);
  });

  test("centre zone is empty until a transient message appears", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "no actions here" } } });
    await expect(page.locator("#stat-message")).toHaveCount(0);

    await editor(page).click();
    await page.keyboard.press("F2"); // "No open actions in this note"
    await expect(page.locator("#stat-message")).toContainText(/no open actions/i);
  });

  test("a failed save surfaces as a red dot on the active tab, not a status readout", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "start" } } });
    await page.evaluate(() => {
      window.__CHRONO_MOCK__!.throwOnCommands = new Set(["write_note"]);
    });
    await editor(page).click();
    await page.keyboard.type("x");
    // debounced write (400ms) then it rejects
    const dot = page.locator("#tab-bar .tab.active .tab-status-dot.err");
    await expect(dot).toBeVisible({ timeout: 3000 });
    // no persistent text readout in the centre zone
    await expect(page.locator("#stat-save")).toHaveCount(0);
  });

  test("right zone: version and the ? shortcut trigger open the combined drawer", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, appVersion: "9.9.9" } });
    await expect(page.locator("#stat-version")).toHaveText("v9.9.9");

    await page.locator(".status-help").click();
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toBeVisible();
    await expect(modalCard(page, MODAL_LABELS.shortcuts)).toContainText("Symbols → glyphs");
  });
});
