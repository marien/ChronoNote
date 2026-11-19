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

test("foreign plain-text paste and drop convert tabs to two spaces, while own copies and existing note tabs stay intact", async ({
  page,
}) => {
  await seedApp(page, { seed: "empty" });
  // Tab already in the note stays untouched when pasting or dropping elsewhere.
  await setEditorText(page, "\texisting\n");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");

  // Paste foreign plain text with leading, nested, and inline tabs.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "\titem\n\t\t- sub\na\tb\n");
    document
      .querySelector(".cm-content")!
      .dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => activeTabContent(page)).toBe("\texisting\n  item\n    - sub\na  b\n");

  // External drop of text with tabs converts them to two spaces too.
  await page.evaluate(() => {
    const content = document.querySelector(".cm-content")!;
    const rect = content.getBoundingClientRect();
    const dt = new DataTransfer();
    dt.setData("text/plain", "\tdropped\tline");
    content.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: dt,
        clientX: rect.left + 10,
        clientY: rect.bottom - 5,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect.poll(() => activeTabContent(page)).toContain("  dropped  line");
  await expect.poll(() => activeTabContent(page)).toContain("\texisting\n");

  // Own ChronoNote list copy containing tabs keeps its tabs when pasted back.
  const ownTabbed = "\t- own\tlist\n";
  await setEditorText(page, ownTabbed);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+A");
  const copied = await page.evaluate(() => {
    const dt = new DataTransfer();
    document
      .querySelector(".cm-content")!
      .dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
    return { html: dt.getData("text/html"), plain: dt.getData("text/plain") };
  });
  expect(copied.plain).toBe(ownTabbed);
  expect(copied.html).toContain("data-chrononote");

  await page.keyboard.press("ControlOrMeta+End");
  await page.evaluate(({ html, plain }) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", plain);
    dt.setData("text/html", `<html><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`);
    document
      .querySelector(".cm-content")!
      .dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, copied);
  await expect.poll(() => activeTabContent(page)).toBe(ownTabbed + ownTabbed);
});
