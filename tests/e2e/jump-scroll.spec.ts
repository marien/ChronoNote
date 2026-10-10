/** Ctrl+J (and every jump to a line) brings the target well into view, not onto the last visible line
 * (Marien, 2026-10-10: "the scrollbar does not follow consistently"). */
import { test, expect } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

test.use({ viewport: { width: 1280, height: 720 } });

for (const wordWrap of [false, true]) {
  test(`Ctrl+J centres an off-screen action (word wrap ${wordWrap ? "on" : "off"})`, async ({ page }) => {
    const lines: string[] = ["Notes", "====="];
    for (let i = 0; i < 400; i++) {
      if (i % 37 === 5) lines.push(`# open action ${i}`);
      else if (wordWrap && i % 9 === 0) lines.push(`a long line ${i} `.repeat(30));
      else lines.push(`filler line ${i}`);
    }
    await seedApp(page, {
      seed: { notes: { [todayFilename()]: lines.join("\n") }, session: { openTabs: [todayFilename()], activeTab: todayFilename() }, wordWrap } as never,
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let k = 0; k < 6; k++) {
      await page.keyboard.press("Control+KeyJ");
      await expect
        .poll(() =>
          page.evaluate(() => {
            const area = document.querySelector(".cm-scroller")!.getBoundingClientRect();
            const c = document.querySelector(".cm-cursor")!.getBoundingClientRect();
            // Between 15% and 85% of the visible note: not on the edge.
            return c.top >= area.top + area.height * 0.15 && c.bottom <= area.bottom - area.height * 0.15;
          }),
        )
        .toBe(true);
    }
  });
}
