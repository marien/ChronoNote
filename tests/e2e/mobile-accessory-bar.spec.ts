import { test, expect } from "@playwright/test";
import { seedApp, activeTabContent, setEditorText } from "./helpers";

/** The Mobile Accessory Bar (shown on narrow / touch viewports) inserts
 * tokens through `EditorApi.applyToken`. Found testing on a real Android
 * emulator: tapping ☐ then typing put the text *before* the inserted `# `
 * (`x#`) — replacing a whole line with no explicit selection made
 * CodeMirror collapse the caret to the line start. The caret has to end up
 * after the inserted token so the next keystroke continues the line. */
test.describe("mobile accessory bar — caret after token insertion", () => {
  // Mobile mode is touch-first (`(pointer: coarse)`), not width-based — a
  // narrow *desktop* window must keep the desktop layout (#56).
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await expect(page.locator(".mobile-accessory-bar")).toBeVisible();
  });

  test("☐ on an empty line: the next typed text follows `# `", async ({ page }) => {
    await page.getByRole("button", { name: "Open task (box)" }).click();
    await page.keyboard.type("buy milk");

    expect(await activeTabContent(page)).toBe("# buy milk");
  });

  test("☐ on a line that already has text keeps the caret where it was relative to the text", async ({ page }) => {
    await setEditorText(page, "call Sam");
    await page.keyboard.press("End");
    await page.getByRole("button", { name: "Open task (box)" }).click();
    await page.keyboard.type("!");

    // Caret was at the end of the line, so it stays at the end.
    expect(await activeTabContent(page)).toBe("# call Sam!");
  });

  test("➔ appends a follow-up and leaves the caret after it", async ({ page }) => {
    await setEditorText(page, "call Sam");
    await page.keyboard.press("Home");
    await page.getByRole("button", { name: "Follow-up arrow" }).click();
    await page.keyboard.type("book room");

    expect(await activeTabContent(page)).toBe("call Sam => book room");
  });

  test("single tap on the editor focuses and allows immediate typing without inputmode=none or double-tap", async ({ page }) => {
    const cmContent = page.locator(".cm-content");
    // Verify inputmode is not "none"
    expect(await cmContent.getAttribute("inputmode")).not.toBe("none");

    // Single tap focuses the editor
    await cmContent.click();
    await expect(cmContent).toBeFocused();
    expect(await cmContent.getAttribute("inputmode")).not.toBe("none");

    // Immediately typing works on first tap without requiring a second tap
    await page.keyboard.type("hello from first tap");
    expect(await activeTabContent(page)).toBe("hello from first tap");
  });

  test("all token buttons in the mobile accessory bar share the same vertical centerline", async ({ page }) => {
    const glyphs = page.locator(".accessory-btn.token-btn .token-glyph");
    const count = await glyphs.count();
    expect(count).toBe(9);

    const midpoints: number[] = [];
    for (let i = 0; i < count; i++) {
      const box = await glyphs.nth(i).boundingBox();
      expect(box).not.toBeNull();
      midpoints.push(box!.y + box!.height / 2);
    }

    const baseline = midpoints[0];
    for (let i = 1; i < count; i++) {
      // All glyph centerlines must align within 1.5px
      expect(Math.abs(midpoints[i] - baseline)).toBeLessThanOrEqual(1.5);
    }
  });
});

test.describe("mobile mode is touch-first, not width-based", () => {
  test("a narrow desktop window keeps the desktop layout (no accessory bar, top bar collapses into More)", async ({
    page,
  }) => {
    await seedApp(page, { seed: "busy-week" });
    await page.setViewportSize({ width: 480, height: 720 });

    await expect(page.getByTitle("More actions")).toBeVisible();
    await expect(page.locator(".mobile-accessory-bar")).toHaveCount(0);
  });
});
