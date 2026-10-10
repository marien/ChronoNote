/** Real-phone feedback (Marien, 2026-10-10): the keyboard kept popping up, the bottom bar was hard to get back to,
 * swipe-down stopped after a few pixels, a long-press menu flashed and vanished, and the date picker said "Esc to
 * close". These cover what a touch emulation can show; the browser's own long-press is not emulated. */
import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

const focusInEditor = (page: Page) => page.evaluate(() => !!document.activeElement?.closest(".cm-editor"));
const focusInTextField = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.closest(".cm-editor") !== null);
  });

for (const width of [390, 360]) {
  test.describe(`phone ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });

    async function seed(page: Page) {
      await seedApp(page, {
        seed: {
          notes: { [todayFilename()]: ["Weekly Sync", "===========", "# task one", "# task two", "o a topic"].join("\n") },
          session: { openTabs: [todayFilename()], activeTab: todayFilename() },
        },
      });
    }

    test("opening Actions from the bottom bar, and closing it, never focuses a text field (no keyboard)", async ({ page }) => {
      await seed(page);
      await page.locator(".mobile-nav-bar .mobile-nav-dest", { hasText: "Actions" }).click();
      const drawer = page.getByRole("dialog", { name: "Actions" });
      await expect(drawer).toBeVisible();
      await page.waitForTimeout(300);
      expect(await focusInTextField(page)).toBe(false);
      await drawer.locator(".modal-close-btn").click();
      await expect(drawer).toHaveCount(0);
      expect(await focusInEditor(page)).toBe(false);
      await expect(page.locator(".mobile-nav-bar")).toBeVisible();
    });

    test("jumping to an action places the caret without focusing the note", async ({ page }) => {
      await seed(page);
      await page.locator(".mobile-nav-bar .mobile-nav-dest", { hasText: "Actions" }).click();
      await page.getByRole("dialog", { name: "Actions" }).locator('.modal-item[role="option"]', { hasText: "task two" }).click();
      await expect(page.getByRole("dialog", { name: "Actions" })).toHaveCount(0);
      expect(await focusInEditor(page)).toBe(false);
      await expect(page.locator(".mobile-nav-bar")).toBeVisible();
    });

    test("the symbols bar's hide-keyboard button brings the bottom bar back", async ({ page }) => {
      await seed(page);
      await editor(page).click();
      await expect(page.locator(".mobile-nav-bar")).toHaveCount(0);
      const hide = page.locator(".mobile-accessory-bar .accessory-hide-keyboard");
      await expect(hide).toBeVisible();
      // The bar still fits the screen with the extra button.
      const bar = (await page.locator(".mobile-accessory-bar").boundingBox())!;
      const btn = (await hide.boundingBox())!;
      expect(btn.x + btn.width).toBeLessThanOrEqual(bar.x + bar.width + 1);
      await hide.click();
      await expect(page.locator(".mobile-nav-bar")).toBeVisible();
      expect(await focusInEditor(page)).toBe(false);
    });

    test("the date picker shows no 'Esc to close' on a touch phone", async ({ page }) => {
      await seed(page);
      await page.locator(".mobile-title-btn").click();
      await expect(page.locator(".datepicker-pop")).toBeVisible();
      await expect(page.locator(".datepicker-pop .cal-hint")).toHaveCount(0);
      expect(await focusInTextField(page)).toBe(false);
    });

    test("a swipe that starts on a sheet's header is not turned into a scroll", async ({ page }) => {
      await seed(page);
      await page.locator(".mobile-nav-bar .mobile-nav-dest", { hasText: "Actions" }).click();
      const card = page.getByRole("dialog", { name: "Actions" });
      await expect(card).toBeVisible();
      await card.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const prevented = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + 20;
        el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
        const touch = new Touch({ identifier: 7, target: el, clientX: x, clientY: y + 30 });
        const move = new TouchEvent("touchmove", { touches: [touch], changedTouches: [touch], cancelable: true, bubbles: true });
        el.dispatchEvent(move);
        el.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 7, pointerType: "touch", bubbles: true }));
        return move.defaultPrevented;
      });
      expect(prevented).toBe(true);
    });

    test("a long-press menu survives the scroll and focus changes right after it opens", async ({ page }) => {
      await seed(page);
      const glyph = editor(page).locator(".cm-line .glyph-open").first();
      await glyph.evaluate(async (el) => {
        const r = el.getBoundingClientRect();
        const touch = new Touch({ identifier: 1, target: el, clientX: r.left + 3, clientY: r.top + 3 });
        el.dispatchEvent(new TouchEvent("touchstart", { touches: [touch], changedTouches: [touch], cancelable: true, bubbles: true }));
        await new Promise((res) => setTimeout(res, 600));
        el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [touch], cancelable: true, bubbles: true }));
      });
      const menu = page.locator(".editor-context-menu");
      await expect(menu).toBeVisible();
      // What a real phone does next: the note scrolls (keyboard / viewport) and focus moves.
      await page.evaluate(() => {
        document.querySelector(".cm-scroller")?.dispatchEvent(new Event("scroll"));
        (document.activeElement as HTMLElement | null)?.blur();
      });
      await page.waitForTimeout(100);
      await expect(menu).toBeVisible();
      // The line was not toggled by the long-press.
      await expect(editor(page).locator(".cm-line .glyph-open").first()).toBeVisible();
    });
  });
}
