import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, modalCard, MODAL_LABELS } from "./helpers";

const settings = (page: Page) => modalCard(page, MODAL_LABELS.settings);
const LONG_LINE =
  "This is a deliberately very long single line of prose that will overflow the editor width many times over so we can tell wrapping apart from not wrapping without any ambiguity at all whatsoever indeed.";

async function openSettings(page: Page) {
  await editor(page).click();
  await page.keyboard.press("Control+Comma");
  await expect(settings(page)).toBeVisible();
}

/** Whether the CodeMirror scroller actually overflows horizontally. */
async function scrollsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const s = document.querySelector<HTMLElement>(".cm-scroller")!;
    return s.scrollWidth > s.clientWidth + 1;
  });
}

test.describe("word wrap (§80)", () => {
  test("off by default: a long line scrolls horizontally", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, LONG_LINE);
    expect(await scrollsHorizontally(page)).toBe(true);
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.wordWrap)).toBe(false);
  });

  test("toggling it on wraps the line, and it persists across a reload", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, LONG_LINE);

    await openSettings(page);
    // §127: "Word wrap" is now the "Wrap" segment of the Editor-width control.
    await settings(page).getByRole("radio", { name: "Wrap" }).click();
    await page.keyboard.press("Escape");

    // Wrapped now — no horizontal overflow, and the line occupies several rows.
    await expect.poll(() => scrollsHorizontally(page)).toBe(false);
    const lineHeight = await page.evaluate(
      () => document.querySelector(".cm-line")!.getBoundingClientRect().height,
    );
    expect(lineHeight).toBeGreaterThan(40); // > 2 rows

    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.wordWrap)).toBe(true);

    // Persisted: a fresh boot reads it back and the editor comes up wrapped.
    await page.reload();
    await expect(editor(page)).toBeVisible();
    await setEditorText(page, LONG_LINE);
    expect(await scrollsHorizontally(page)).toBe(false);
  });

  test("seeded on: the editor boots already wrapped", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, wordWrap: true } });
    await setEditorText(page, LONG_LINE);
    expect(await scrollsHorizontally(page)).toBe(false);
  });

  test("toggling wrap reconfigures in place — same editor element, document intact", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "line one\nline two\nline three");

    // Tag the current CodeMirror DOM node.
    await page.evaluate(() => {
      (document.querySelector(".cm-editor") as HTMLElement).dataset.wwProbe = "1";
    });

    await openSettings(page);
    // §127: "Word wrap" is now the "Wrap" segment of the Editor-width control.
    await settings(page).getByRole("radio", { name: "Wrap" }).click();
    await page.keyboard.press("Escape");

    // Same node (not remounted), same content.
    expect(await page.evaluate(() => document.querySelector(".cm-editor")!.getAttribute("data-ww-probe"))).toBe("1");
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.getEditorContent())).toBe(
      "line one\nline two\nline three",
    );
    expect(await scrollsHorizontally(page)).toBe(false); // wrapping is on
  });
});
