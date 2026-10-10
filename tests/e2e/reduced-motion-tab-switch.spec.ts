/** With Windows "Animation effects" off (prefers-reduced-motion: reduce), a tab switch must not show the new note in
 * the page's 14px text without padding for a frame or two (Marien, 2026-10-10: "the text appears larger very briefly
 * and then settles"). The reduced-motion rule used to give every element a 0.01ms transition. */
import { test, expect } from "@playwright/test";
import { seedApp } from "./helpers";

test.use({ viewport: { width: 1280, height: 760 }, reducedMotion: "reduce" });

test("every frame after a tab switch shows the editor at its own size and padding", async ({ page }) => {
  await seedApp(page, {
    seed: {
      notes: { "2026-09-04.txt": "sdsdas\n======\n# as\no aa\n", "2026-09-07.txt": "plain line\nsecond plain line\n" },
      session: { openTabs: ["2026-09-04.txt", "2026-09-07.txt"], activeTab: "2026-09-07.txt" },
    },
  });
  await page.evaluate(() => {
    (window as any).__frames = [];
    document.addEventListener("mousedown", (e) => {
      if (!(e.target as Element).closest?.("#tab-bar .tab")) return;
      let f = 0;
      const tick = () => {
        const ed = document.querySelector(".cm-editor");
        const line = [...document.querySelectorAll(".cm-line")].find((l) => l.textContent?.trim());
        if (ed && line) (window as any).__frames.push(`${getComputedStyle(ed).fontSize} ${getComputedStyle(line).fontSize} ${getComputedStyle(line).paddingLeft}`);
        if (++f < 15) requestAnimationFrame(tick);
      };
      tick();
    }, true);
  });
  for (const label of ["2026-09-04", "2026-09-07", "2026-09-04"]) {
    await page.locator("#tab-bar .tab", { hasText: label }).click();
    await page.waitForTimeout(400);
  }
  const frames: string[] = await page.evaluate(() => (window as any).__frames);
  expect(frames.length).toBeGreaterThan(20);
  // Editor and line at 13px (the default font size), and no plain line without its 6px padding.
  const odd = frames.filter((f) => !f.startsWith("13px 13px") || f.endsWith(" 0px"));
  expect(odd).toEqual([]);
});
