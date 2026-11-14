import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent } from "./helpers";

/**
 * Independent E2E tests for the numbered-list fixes that require real browser clipboard events or
 * end-to-end latency checks (pure key/text cases live in the Vitest editing tables).
 */

/** Move caret to column 0 of a 0-based line index (avoids CM6 smart-Home on indented lines). */
async function caretAtLineStart(page: Page, line: number): Promise<void> {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
}

/** Move caret to the end of a 0-based line index. */
async function caretAtEndOfLine(page: Page, line: number): Promise<void> {
  await caretAtLineStart(page, line);
  await page.keyboard.press("End");
}

/** Dispatch a paste event with text/plain on .cm-content. */
async function pastePlain(page: Page, plain: string): Promise<void> {
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const target = document.querySelector(".cm-content");
    if (!target) throw new Error("Could not find .cm-content element");
    target.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, plain);
}

/** Dispatch a paste event with text/html (and fallback text/plain) on .cm-content. */
async function pasteHtml(page: Page, html: string, plain = "flat text"): Promise<void> {
  await page.evaluate(
    ({ html, plain }) => {
      const dt = new DataTransfer();
      dt.setData("text/html", html);
      dt.setData("text/plain", plain);
      const target = document.querySelector(".cm-content");
      if (!target) throw new Error("Could not find .cm-content element");
      target.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    },
    { html, plain },
  );
}

/** Dispatch a copy event on .cm-content and return the populated HTML and plain text. */
async function copySelection(page: Page): Promise<{ html: string; plain: string }> {
  return page.evaluate(() => {
    const dt = new DataTransfer();
    const target = document.querySelector(".cm-content");
    if (!target) throw new Error("Could not find .cm-content element");
    target.dispatchEvent(
      new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
    return {
      html: dt.getData("text/html"),
      plain: dt.getData("text/plain"),
    };
  });
}

test.describe("rule 4: splitting lists on clipboard paste", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("pasting text with a blank line splits the list and restarts the second part at 1", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b\n3. c");
    await caretAtEndOfLine(page, 0);
    await pastePlain(page, "\n");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n\n1. b\n2. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. b\n3. c");

    await setEditorText(page, "4. a\n5. b\n6. c");
    await caretAtEndOfLine(page, 0);
    await pastePlain(page, "\n");
    await expect.poll(() => activeTabContent(page)).toBe("4. a\n\n1. b\n2. c");
  });
});

test.describe("rule 12: paste onto an empty numbered item", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("pasting plain numbered items onto an empty numbered item replaces the marker and continues numbering", async ({ page }) => {
    await setEditorText(page, "1. a\n2. ");
    await caretAtEndOfLine(page, 1);
    await pastePlain(page, "1. x\n2. y");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n2. x\n3. y");

    await setEditorText(page, "1. a\n2. \n3. z");
    await caretAtEndOfLine(page, 1);
    await pastePlain(page, "1. x\n2. y");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n2. x\n3. y\n4. z");

    await setEditorText(page, "4. a\n5. ");
    await caretAtEndOfLine(page, 1);
    await pastePlain(page, "1. x\n2. y");
    await expect.poll(() => activeTabContent(page)).toBe("4. a\n5. x\n6. y");

    await setEditorText(page, "1) a\n2) ");
    await caretAtEndOfLine(page, 1);
    await pastePlain(page, "1) x\n2) y");
    await expect.poll(() => activeTabContent(page)).toBe("1) a\n2) x\n3) y");

    await setEditorText(page, "1. a\n   1.1. b\n   1.2. ");
    await caretAtEndOfLine(page, 2);
    await pastePlain(page, "   1.1. x\n   1.2. y");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n   1.1. b\n   1.2. x\n   1.3. y");
  });

  test("pasting an HTML <ol> onto an empty numbered item replaces the marker, continues numbering, and undoes in one step", async ({ page }) => {
    await setEditorText(page, "1. a\n2. \n3. z");
    await caretAtEndOfLine(page, 1);
    await pasteHtml(page, "<ol><li>x</li><li>y</li></ol>");
    await expect.poll(() => activeTabContent(page)).toBe("1. a\n2. x\n3. y\n4. z");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n2. \n3. z");
  });
});

test.describe("rule 13: copying a list with continuation lines as HTML", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("copying a numbered list with continuation lines produces one <ol> with <br> in the first <li>, and pasting the HTML back restores it", async ({ page }) => {
    const text = "1. a\n   cont\n2. b";
    await setEditorText(page, text);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+a");

    const clip = await copySelection(page);
    expect(clip.plain).toBe(text);

    const parsed = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const ols = Array.from(doc.body.querySelectorAll("ol"));
      if (ols.length !== 1) return { error: `Expected 1 <ol>, got ${ols.length}` };
      const lis = Array.from(ols[0].children).filter((c) => c.tagName === "LI");
      if (lis.length !== 2) return { error: `Expected 2 <li>, got ${lis.length}` };
      const br = lis[0].querySelector("br");
      if (!br) return { error: "First <li> missing <br>" };
      // The text between <br> elements, read from the DOM (no regex tag stripping).
      const parts = [""];
      for (const node of Array.from(lis[0].childNodes)) {
        if (node.nodeName === "BR") parts.push("");
        else parts[parts.length - 1] += node.textContent ?? "";
      }
      for (let i = 0; i < parts.length; i++) parts[i] = parts[i].trim();
      return {
        error: null,
        olCount: ols.length,
        liCount: lis.length,
        firstParts: parts,
        secondText: lis[1].textContent?.trim(),
      };
    }, clip.html);

    expect(parsed.error).toBeNull();
    expect(parsed.olCount).toBe(1);
    expect(parsed.liCount).toBe(2);
    expect(parsed.firstParts).toEqual(["a", "cont"]);
    expect(parsed.secondText).toBe("b");

    // Paste the HTML (without ChronoNote's own-copy marker, as another app would hand it over) into an empty editor.
    await setEditorText(page, "");
    await editor(page).click();
    await pasteHtml(page, clip.html.replace(/\s*data-chrononote=""/g, ""));
    await expect.poll(() => activeTabContent(page)).toBe(text);

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("");
  });

  test("copying and pasting HTML with multiple continuation lines and a list starting at 10 round-trips", async ({ page }) => {
    const text = "10. a\n    cont1\n    cont2\n11. b";
    await setEditorText(page, text);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+a");

    const clip = await copySelection(page);
    expect(clip.plain).toBe(text);

    const olInfo = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const ols = doc.body.querySelectorAll("ol");
      const lis = ols.length === 1 ? Array.from(ols[0].children).filter((c) => c.tagName === "LI") : [];
      return {
        olCount: ols.length,
        liCount: lis.length,
        brCount: lis[0]?.querySelectorAll("br").length ?? 0,
      };
    }, clip.html);
    expect(olInfo).toEqual({ olCount: 1, liCount: 2, brCount: 2 });

    await setEditorText(page, "");
    await editor(page).click();
    await pasteHtml(page, clip.html.replace(/\s*data-chrononote=""/g, ""));
    await expect.poll(() => activeTabContent(page)).toBe(text);
  });
});

test.describe("rule 15: speed on 3,000-line notes", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Tab on item 2 of a 3,000-item list finishes with correct text within 1 second", async ({ page }) => {
    const lines = Array.from({ length: 3000 }, (_, i) => `${i + 1}. item ${i + 1}`);
    await setEditorText(page, lines.join("\n"));
    await caretAtEndOfLine(page, 1);

    const start = Date.now();
    await page.keyboard.press("Tab");
    await expect.poll(async () => {
      const content = await activeTabContent(page);
      const outLines = content.split("\n");
      return (
        outLines.length === 3000 &&
        outLines[0] === "1. item 1" &&
        outLines[1] === "   1. item 2" &&
        outLines[2] === "2. item 3" &&
        outLines[2999] === "2999. item 3000"
      );
    }, { timeout: 1000 }).toBe(true);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  test("typing on a blank line of a 3,000-line note finishes with correct text within 1 second", async ({ page }) => {
    const lines = Array.from({ length: 3000 }, (_, i) => (i === 1500 ? "" : `line ${i + 1}`));
    await setEditorText(page, lines.join("\n"));
    await caretAtLineStart(page, 1500);

    const start = Date.now();
    await page.keyboard.type("z");
    await expect.poll(async () => {
      const content = await activeTabContent(page);
      const outLines = content.split("\n");
      return outLines.length === 3000 && outLines[1500] === "z" && outLines[2999] === "line 3000";
    }, { timeout: 1000 }).toBe(true);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });
});
