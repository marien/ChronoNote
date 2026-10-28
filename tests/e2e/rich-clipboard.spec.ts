import { test, expect } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent } from "./helpers";

// #196 (§439): ChronoNote's own copies carry HTML lists for other apps, but pasting them back into ChronoNote must give
// exactly what was copied (spaces, `*` bullets, odd indentation), not a round trip through the HTML.
test("a list copied in ChronoNote pastes back exactly, not through its HTML", async ({ page }) => {
  await seedApp(page, { seed: "empty" });
  // Ends with a newline, so the caret can go on an empty last line (Enter after `# ` would start a new action).
  const text = "* star  bullet   with spaces\n   - three-space indent\n# call Dana\n";
  await setEditorText(page, text);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+A");
  const copied = await page.evaluate(() => {
    const dt = new DataTransfer();
    document.querySelector(".cm-content")!.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
    return { html: dt.getData("text/html"), plain: dt.getData("text/plain") };
  });
  expect(copied.plain).toBe(text);
  expect(copied.html).toContain("<ul");

  await page.keyboard.press("ControlOrMeta+End");
  // As the browser hands it back on paste: wrapped in its own fragment markup.
  await page.evaluate(({ html, plain }) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", plain);
    dt.setData("text/html", `<html><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`);
    document.querySelector(".cm-content")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, copied);
  await expect.poll(() => activeTabContent(page)).toBe(text + text);
});
