import { test, expect } from "@playwright/test";
import { seedApp, setEditorText, activeTabContent, editor, todayFilename } from "./helpers";
import { formatShortcut } from "../../src/lib/shortcuts";

test.describe("editor context menu (proposal B5)", () => {
  test("right-click an action line shows line states and converts # to v on done", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action item");

    const line = page.locator(".cm-content .cm-line").first();
    await line.click({ button: "right" });

    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    const doneShortcut = formatShortcut("setActionDone");
    const doneItem = menu.locator(".editor-context-item", { hasText: "Set line/selection to Done" });
    await expect(doneItem).toBeVisible();
    await expect(doneItem.locator(".editor-context-key")).toHaveText(doneShortcut);

    await doneItem.click();
    await expect(menu).toBeHidden();

    const content = await activeTabContent(page);
    expect(content).toBe("v Action item");
  });

  test("Escape closes the menu", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action item");

    const line = page.locator(".cm-content .cm-line").first();
    await line.click({ button: "right" });

    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("right-click a topic line shows the topic states", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "o Topic item");

    const line = page.locator(".cm-content .cm-line").first();
    await line.click({ button: "right" });

    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to To Discuss" })).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Discussed" })).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Not Discussed" })).toBeVisible();
  });

  test("Copy is disabled when there is no selection", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "Plain text line");

    const line = page.locator(".cm-content .cm-line").first();
    await line.click({ button: "right" });

    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    const copyBtn = menu.locator('.editor-context-icon-btn[aria-label="Copy"]');
    await expect(copyBtn).toBeDisabled();
  });

  test("Escape closes the menu first: in Zen mode the app stays in Zen", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action item");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Shift+F11");
    await expect(page.locator("body")).toHaveClass(/zen-mode/);

    await page.locator(".cm-content .cm-line").first().click({ button: "right" });
    await expect(page.locator(".editor-context-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".editor-context-menu")).toHaveCount(0);
    await expect(page.locator("body")).toHaveClass(/zen-mode/);
  });
});

test("no menu label is cut off, in the longest language (Marien, 2026-10-10)", async ({ page }) => {
  for (const lang of ["en", "nl", "de", "fr", "pl", "es", "it"]) {
    await seedApp(page, { seed: { notes: { [todayFilename()]: "Weekly Sync\n===========\n# an action\n" }, languageMode: lang } as never });
    await editor(page).locator(".cm-line", { hasText: "an action" }).click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();
    const cut = await menu.evaluate((m) =>
      [...m.querySelectorAll<HTMLElement>(".editor-context-label")].filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent),
    );
    expect(cut, lang).toEqual([]);
    const box = (await menu.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press("Escape");
  }
});
