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

test.describe("right-click menus", () => {
  // Marien, 2026-10-10: a right-click on a glyph showed the browser's menu (and toggled the glyph), and the browser
  // menu also showed wherever ChronoNote has no menu of its own.
  test("right-clicking a glyph opens the line menu and leaves the glyph as it is", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Action item");
    const glyph = editor(page).locator(".cm-line .glyph-cyclable").first();
    await page.evaluate(() => {
      window.addEventListener("contextmenu", (e) => ((window as any).__menuPrevented = e.defaultPrevented), { once: true });
    });
    await glyph.click({ button: "right" });
    await expect(page.locator(".editor-context-menu")).toBeVisible();
    expect(await page.evaluate(() => (window as any).__menuPrevented)).toBe(true);
    expect(await activeTabContent(page)).toBe("# Action item");
  });

  test("the browser's own menu does not show outside text fields", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    const prevented = (selector: string) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        const r = el.getBoundingClientRect();
        const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 2, clientY: r.top + 2 });
        el.dispatchEvent(e);
        return e.defaultPrevented;
      }, selector);
    expect(await prevented("#top-bar .titlebar-drag-gutter")).toBe(true);
    expect(await prevented("#status-bar")).toBe(true);
    expect(await prevented(".cm-scroller")).toBe(true);
    // Text fields keep it, for cut/copy/paste.
    await page.keyboard.press("Control+f");
    expect(await prevented(".find-bar input")).toBe(false);
  });

  // Marien, 2026-10-10: the menu offered action/topic states, Copy to next and Make section on a section title, and
  // Section history, Copy to next occurrence and Peek above the first section.
  test("the menu follows where the line sits: section title, inside a section, above the first section", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, ["loose line", "", "Weekly Sync", "===========", "# task"].join(String.fromCharCode(10)));
    const menu = page.locator(".editor-context-menu");
    const items = async (text: string) => {
      await editor(page).locator(".cm-line", { hasText: text }).first().click({ button: "right" });
      await expect(menu).toBeVisible();
      const list = await menu.locator(".editor-context-item").evaluateAll((els) =>
        els.map((el) => `${(el as HTMLButtonElement).disabled ? "-" : "+"}${el.querySelector(".editor-context-label")?.textContent?.trim()}`),
      );
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      return list;
    };
    const title = await items("Weekly Sync");
    expect(title).toEqual(["+Section history", "+Peek at this section"]);
    expect(await items("=====")).toEqual(title);
    const body = await items("task");
    expect(body.length).toBeGreaterThan(4);
    expect(body).toContain("+Peek at this section");
    const outside = await items("loose line");
    expect(outside).toContain("-Peek at this section");
    expect(outside).toContain("-Section history");
    expect(outside).toContain("-Copy to next occurrence");
    expect(outside).toContain("+Make section header");
  });
});
