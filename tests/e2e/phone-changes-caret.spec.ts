import { test, expect } from "@playwright/test";
import { seedApp, editor, toast, activeTabContent, cursorLine } from "./helpers";
import { REFERENCE_TODAY } from "../../src/lib/testing/scenarios";

// Applying phone changes to the open note keeps the caret and the scroll position (it used to jump to the top).
const filler = Array.from({ length: 80 }, (_, i) => `- line ${i + 1}`);
const NOTE_CONTENT = ["Planning", "========", "# call the venue", ...filler, "# book the room", ""].join("\n");

const INBOX_CONTENT = JSON.stringify({
  format: 1,
  writer: "test",
  requests: [
    { id: "r1", type: "setState", date: REFERENCE_TODAY, section: "Planning", line: "# call the venue", n: 3, state: "done" },
    { id: "r2", type: "addLine", date: REFERENCE_TODAY, section: "Planning", text: "# from the phone" },
  ],
});

test("applying phone changes keeps the caret and the scroll position", async ({ page }) => {
  await seedApp(page, {
    seed: { phoneCompanion: true, notes: { [`${REFERENCE_TODAY}.txt`]: NOTE_CONTENT }, phoneInbox: INBOX_CONTENT },
  });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("ArrowUp");
  const scroller = page.locator(".cm-scroller");
  await expect.poll(() => cursorLine(page)).toBe(84);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  const scrollBefore = await scroller.evaluate((el) => el.scrollTop);

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.locator('.modal-card[role="dialog"]');
  await palette.locator(".modal-input").fill("apply phone");
  await palette.locator('.modal-item[role="option"]', { hasText: /apply phone changes/i }).first().click();
  await expect(toast(page)).toContainText("2 changes from your phone applied.");
  await expect.poll(() => activeTabContent(page)).toContain("v call the venue");

  // The line was set to done above the caret and a line added below it: the caret stays on "# book the room".
  await expect.poll(() => cursorLine(page)).toBe(84);
  const scrollAfter = await scroller.evaluate((el) => el.scrollTop);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(40);
});
