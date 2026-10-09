import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, openViaShortcut } from "./helpers";

test.describe("accessibility modes (reduced motion & contrast themes)", () => {
  test("reduced motion: modal card computed transition-duration is 1e-05s or 0s", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await page.emulateMedia({ reducedMotion: "reduce" });

    const card = await openViaShortcut(page, "ControlOrMeta+Comma", "settings");
    const duration = await card.evaluate((el) => window.getComputedStyle(el).transitionDuration);

    expect(["1e-05s", "0s"]).toContain(duration);
  });

  test("forced colors: open-action glyph computed colour matches system Highlight probe", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# an open action item");
    await page.emulateMedia({ forcedColors: "active" });

    const glyph = editor(page).locator(".glyph-open").first();
    await expect(glyph).toBeVisible();

    const { glyphColor, probeColor } = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.color = "Highlight";
      document.body.appendChild(probe);
      const probeColor = window.getComputedStyle(probe).color;
      probe.remove();

      const glyphEl = document.querySelector(".glyph-open");
      const glyphColor = glyphEl ? window.getComputedStyle(glyphEl).color : "";
      return { glyphColor, probeColor };
    });

    expect(probeColor).toBeTruthy();
    expect(glyphColor).toBe(probeColor);
  });
});
