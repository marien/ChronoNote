/** Switching between a long and a short note keeps the text width (Marien, 2026-10-10: the content briefly resized
 * after a tab switch). Real scrollbars are needed to see it: Playwright hides them by default. */
import { test, expect } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

test.use({ viewport: { width: 1280, height: 720 }, launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("the note's text width is the same for a note with and one without a scrollbar", async ({ page }) => {
  const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
  await seedApp(page, {
    seed: {
      notes: { "2026-09-04.txt": long, [todayFilename()]: "a short note" },
      session: { openTabs: ["2026-09-04.txt", todayFilename()], activeTab: todayFilename() },
    },
  });
  const width = () => editor(page).evaluate((el) => el.getBoundingClientRect().width);
  await expect(editor(page)).toContainText("a short note");
  const shortWidth = await width();
  await page.locator("#tab-bar .tab", { hasText: "2026-09-04" }).click();
  await expect(editor(page)).toContainText("line 0");
  expect(await width()).toBe(shortWidth);
});
