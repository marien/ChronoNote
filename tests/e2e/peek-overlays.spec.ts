import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor } from "./helpers";

/** §448: things drawn over the note must respect the small Peek window (Marien, 2026-11-07). In Peek the top bar is
 * folded to height 0, so Alt must not draw its key tips on the note's top edge; and the line menu (with spelling
 * suggestions) must stay inside the window, scrolling when it is taller. */
const NOTE = ["Weekly sync", "===========", "o budget wrods here", "- today", ""].join("\n");

async function enterPeek(page: Page) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ControlOrMeta+Shift+KeyP");
  await expect(page.locator("body.peek-mode")).toBeVisible();
}

test.describe("overlays in the Peek window", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: { "2026-09-07.txt": NOTE },
        session: { openTabs: ["2026-09-07.txt"], activeTab: "2026-09-07.txt" },
        peek: {},
        spellCheck: true,
      },
    });
  });

  test("Alt shows no key tips while the top bar is folded away, and the next letter is not swallowed", async ({ page }) => {
    await enterPeek(page);
    await page.keyboard.press("Alt");
    // Give the keyup handler a frame to draw anything it would draw.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(page.locator(".keytip")).toHaveCount(0);

    await page.keyboard.press("End");
    await page.keyboard.type("a");
    await expect(page.locator(".cm-content")).toContainText("wrods herea");
  });

  test("the line menu with spelling suggestions stays inside a small window and scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 240 });
    await enterPeek(page);

    const mark = page.locator(".cm-misspelled", { hasText: "wrods" });
    await expect(mark).toBeVisible();
    await mark.click({ button: "right" });

    const menu = page.locator(".editor-context-menu");
    await expect(menu.locator("button.editor-context-item").first()).toHaveText("words");

    await expect
      .poll(async () => {
        const box = await menu.boundingBox();
        return box ? box.y >= 0 && box.y + box.height <= 240 && box.x >= 0 && box.x + box.width <= 520 : false;
      })
      .toBe(true);
    const scrolls = await menu.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);

    // The last item can still be reached.
    const last = menu.locator("button.editor-context-item:not(:disabled)").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
});
