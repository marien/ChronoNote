import { test, expect } from "@playwright/test";
import { seedApp, editor, todayFilename, activeTabContent, toast } from "./helpers";

test.describe("find and replace (Ctrl/Cmd+H)", () => {
  test("opens on Ctrl/Cmd+H with replace row shown, focuses find input or replace input", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "apple banana apple" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+h");

    const bar = page.locator(".find-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator(".find-replace-row")).toBeVisible();
    await expect(bar.locator(".find-input").first()).toBeFocused();

    // When find input has text, pressing Ctrl+H again moves focus to the replace input
    await bar.locator(".find-input").first().fill("apple");
    await page.keyboard.press("ControlOrMeta+h");
    await expect(bar.locator(".find-replace-input")).toBeFocused();
  });

  test("chevron toggle button shows and hides replace row", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "hello world" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+f");

    const bar = page.locator(".find-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator(".find-replace-row")).toBeHidden();

    // Toggle button opens replace row
    await bar.locator(".find-toggle-btn").click();
    await expect(bar.locator(".find-replace-row")).toBeVisible();

    // Clicking again hides replace row
    await bar.locator(".find-toggle-btn").click();
    await expect(bar.locator(".find-replace-row")).toBeHidden();
  });

  test("replace one replaces current match and moves to the next", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "cat dog cat bird cat" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+h");

    const bar = page.locator(".find-bar");
    await bar.locator(".find-input").first().fill("cat");
    await bar.locator(".find-replace-input").fill("fish");

    // Click Replace button
    await bar.getByRole("button", { name: "Replace", exact: true }).click();
    expect(await activeTabContent(page)).toBe("fish dog cat bird cat");

    // Click Replace again
    await bar.getByRole("button", { name: "Replace", exact: true }).click();
    expect(await activeTabContent(page)).toBe("fish dog fish bird cat");
  });

  test("replace all in one transaction and one Ctrl+Z restores all", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "apple orange apple banana apple" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+h");

    const bar = page.locator(".find-bar");
    await bar.locator(".find-input").first().fill("apple");
    await bar.locator(".find-replace-input").fill("peach");

    await bar.getByRole("button", { name: "Replace all" }).click();
    expect(await activeTabContent(page)).toBe("peach orange peach banana peach");
    await expect(toast(page)).toContainText("Replaced 3");

    // One Ctrl+Z restores the entire document before replace all
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => activeTabContent(page)).toBe("apple orange apple banana apple");
  });

  test("match case and whole word toggle buttons change match count", async ({ page }) => {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "Word words word Word" } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+f");

    const bar = page.locator(".find-bar");
    await bar.locator(".find-input").first().fill("word");
    await expect(bar.locator(".find-count")).toHaveText("1 of 4");

    // Toggle match case: only "words" and "word" match
    const caseBtn = bar.getByRole("button", { name: "Match case" });
    await caseBtn.click();
    await expect(caseBtn).toHaveAttribute("aria-pressed", "true");
    await expect(bar.locator(".find-count")).toHaveText("1 of 2");

    // Toggle whole word: only exact "word" matches
    const wordBtn = bar.getByRole("button", { name: "Whole word" });
    await wordBtn.click();
    await expect(wordBtn).toHaveAttribute("aria-pressed", "true");
    await expect(bar.locator(".find-count")).toHaveText("1 of 1");

    // Toggle match case off: "Word", "word", "Word" match
    await caseBtn.click();
    await expect(caseBtn).toHaveAttribute("aria-pressed", "false");
    await expect(bar.locator(".find-count")).toHaveText("1 of 3");
  });
});
