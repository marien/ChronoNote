import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent } from "./helpers";

/**
 * Spec for #196: keep bullets, numbers and indentation when pasting lists,
 * and when copying out.
 */

/** Simulate clipboard paste event in the page via .cm-content. */
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

/** Simulate clipboard copy event on .cm-content with empty DataTransfer and read back populated data. */
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

/** Simulate clipboard cut event on .cm-content with empty DataTransfer and read back populated data. */
async function cutSelection(page: Page): Promise<{ html: string; plain: string }> {
  return page.evaluate(() => {
    const dt = new DataTransfer();
    const target = document.querySelector(".cm-content");
    if (!target) throw new Error("Could not find .cm-content element");
    target.dispatchEvent(
      new ClipboardEvent("cut", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
    return {
      html: dt.getData("text/html"),
      plain: dt.getData("text/plain"),
    };
  });
}

/** Move caret to the end of a given 0-based line index. */
async function caretAtEndOfLine(page: Page, line: number): Promise<void> {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("End");
}

/** Select all content in the editor. */
async function selectAllInEditor(page: Page): Promise<void> {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+A");
}

test.describe("rich-clipboard: pasting lists and copying out (#196)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("1. Teams-style HTML list pastes into empty line as ChronoNote bullet list syntax", async ({ page }) => {
    await editor(page).click();
    const html = "<ul><li>One<ul><li>Sub A</li><li>Sub B</li></ul></li><li>Two</li></ul>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("- One\n  - Sub A\n  - Sub B\n- Two");
  });

  test("2. nested <ol> gives numbered items indented two spaces per level, numbered from 1 within list", async ({ page }) => {
    await editor(page).click();
    const html = "<ol><li>First</li><li>Second<ol><li>Inner</li></ol></li></ol>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("1. First\n2. Second\n  1. Inner");
  });

  test("3. <ol start='4'> starts numbering at 4", async ({ page }) => {
    await editor(page).click();
    const html = '<ol start="4"><li>Four</li><li>Five</li></ol>';
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("4. Four\n5. Five");
  });

  test("4. bullet under a numbered item (<ol><li>Step<ul><li>detail</li></ul></li></ol>)", async ({ page }) => {
    await editor(page).click();
    const html = "<ol><li>Step<ul><li>detail</li></ul></li></ol>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("1. Step\n  - detail");
  });

  test("5. <br> inside an item continues on next line lined up under item text", async ({ page }) => {
    await editor(page).click();
    const html = "<ul><li>one<br>more</li></ul>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("- one\n  more");
  });

  test("6a. Word/Outlook HTML (paragraphs with mso-list) with bullet markers gives bullets", async ({ page }) => {
    await editor(page).click();
    const html =
      "<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>·<span>&nbsp;&nbsp;</span></span><![endif]>Alpha</p><p class=MsoListParagraphCxSpLast style='mso-list:l0 level2 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>o<span>&nbsp;</span></span><![endif]>Beta</p>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("- Alpha\n  - Beta");
  });

  test("6b. Word/Outlook HTML (paragraphs with mso-list) with markers 1. and a. gives numbered items", async ({ page }) => {
    await editor(page).click();
    const html =
      "<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;&nbsp;</span></span><![endif]>Alpha</p><p class=MsoListParagraphCxSpLast style='mso-list:l0 level2 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>a.<span>&nbsp;</span></span><![endif]>Beta</p>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("1. Alpha\n  1. Beta");
  });

  test("7. HTML with no list pastes the text/plain text unchanged", async ({ page }) => {
    await editor(page).click();
    const html = "<p>Hello <b>world</b></p>";
    await pasteHtml(page, html, "Hello world");
    await expect.poll(async () => activeTabContent(page)).toBe("Hello world");
  });

  test("8. text and a list together (<p>Notes</p><ul><li>x</li></ul>) gives text followed by bullet", async ({ page }) => {
    await editor(page).click();
    const html = "<p>Notes</p><ul><li>x</li></ul>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("Notes\n- x");
  });

  test("9. after a list paste, Ctrl+Z removes the whole pasted block in one step", async ({ page }) => {
    await setEditorText(page, "Initial line\n");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");

    const html = "<ul><li>One</li><li>Two</li></ul>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("Initial line\n- One\n- Two");

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => activeTabContent(page)).toBe("Initial line\n");
  });

  test("10. pasted list lines render as real bullets, and Enter at end of nested line continues with same indentation", async ({ page }) => {
    // 10a. Verify what a typed bullet line renders
    await setEditorText(page, "- typed");
    const typedBullet = editor(page).locator(".glyph-bullet").first();
    await expect(typedBullet).toBeVisible();
    const typedClass = await typedBullet.getAttribute("class");
    const typedText = await typedBullet.textContent();

    // 10b. Clear and paste the Teams-style list
    await setEditorText(page, "");
    await editor(page).click();
    const html = "<ul><li>One<ul><li>Sub A</li><li>Sub B</li></ul></li><li>Two</li></ul>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("- One\n  - Sub A\n  - Sub B\n- Two");

    // 10c. All four bullet lines render glyph-bullet with matching class and glyph text
    const pastedBullets = editor(page).locator(".glyph-bullet");
    await expect(pastedBullets).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(pastedBullets.nth(i)).toHaveClass(typedClass!);
      await expect(pastedBullets.nth(i)).toHaveText(typedText!);
    }

    // 10d. Move caret to end of "  - Sub B" (line index 2) and press Enter
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");

    // Enter continues with "  - " at the same indentation
    await expect.poll(async () => activeTabContent(page)).toBe("- One\n  - Sub A\n  - Sub B\n  - \n- Two");

    // Typing immediately populates the continued bullet line
    await page.keyboard.type("Sub C");
    await expect.poll(async () => activeTabContent(page)).toBe("- One\n  - Sub A\n  - Sub B\n  - Sub C\n- Two");
  });

  test("11. pasting a list into middle of an existing note leaves surrounding lines intact", async ({ page }) => {
    await setEditorText(page, "Before\nAfter");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter"); // after newline following "Before"

    const html = "<ul><li>Item A</li><li>Item B</li></ul>";
    await pasteHtml(page, html, "flat text");
    await expect.poll(async () => activeTabContent(page)).toBe("Before\n- Item A\n- Item B\nAfter");
  });

  test("12a. copying out bullet list puts exact text/plain and nested <ul> in text/html", async ({ page }) => {
    await setEditorText(page, "- One\n  - Sub\n- Two");
    await selectAllInEditor(page);

    const clip = await copySelection(page);
    expect(clip.plain).toBe("- One\n  - Sub\n- Two");

    const parsed = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const topUl = doc.body.querySelector("ul");
      if (!topUl) return { error: "No root <ul> found" };
      const topLis = Array.from(topUl.children).filter((c) => c.tagName === "LI");
      if (topLis.length !== 2) return { error: `Expected 2 top-level <li>, got ${topLis.length}` };

      const firstLi = topLis[0];
      const secondLi = topLis[1];
      const nestedUl = firstLi.querySelector("ul");
      if (!nestedUl) return { error: "First <li> missing nested <ul>" };

      const nestedLis = Array.from(nestedUl.children).filter((c) => c.tagName === "LI");
      if (nestedLis.length !== 1) return { error: `Expected 1 nested <li>, got ${nestedLis.length}` };

      return {
        error: null,
        topLiCount: topLis.length,
        nestedLiCount: nestedLis.length,
        nestedLiText: nestedLis[0].textContent?.trim(),
        firstLiStartsWithDash: (firstLi.textContent?.trim() ?? "").startsWith("-"),
        secondLiStartsWithDash: (secondLi.textContent?.trim() ?? "").startsWith("-"),
        secondLiText: secondLi.textContent?.trim(),
      };
    }, clip.html);

    expect(parsed.error).toBeNull();
    expect(parsed.topLiCount).toBe(2);
    expect(parsed.nestedLiCount).toBe(1);
    expect(parsed.nestedLiText).toBe("Sub");
    expect(parsed.firstLiStartsWithDash).toBe(false);
    expect(parsed.secondLiStartsWithDash).toBe(false);
    expect(parsed.secondLiText).toBe("Two");
  });

  test("12b. copying out numbered lines gives an <ol>", async ({ page }) => {
    await setEditorText(page, "1. a\n2. b");
    await selectAllInEditor(page);

    const clip = await copySelection(page);
    expect(clip.plain).toBe("1. a\n2. b");

    const parsed = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const ol = doc.body.querySelector("ol");
      if (!ol) return { error: "No <ol> found" };
      const lis = Array.from(ol.children).filter((c) => c.tagName === "LI");
      return {
        error: null,
        liCount: lis.length,
        texts: lis.map((li) => li.textContent?.trim()),
        startsNumber: lis.map((li) => /^\d+\./.test(li.textContent?.trim() ?? "")),
      };
    }, clip.html);

    expect(parsed.error).toBeNull();
    expect(parsed.liCount).toBe(2);
    expect(parsed.texts).toEqual(["a", "b"]);
    expect(parsed.startsNumber).toEqual([false, false]);
  });

  test("12c. copying out text with < and & escapes entities in HTML", async ({ page }) => {
    await setEditorText(page, "- a < b & c");
    await selectAllInEditor(page);

    const clip = await copySelection(page);
    expect(clip.plain).toBe("- a < b & c");
    expect(clip.html).toContain("&lt;");
    expect(clip.html).toContain("&amp;");

    const parsedText = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const li = doc.body.querySelector("li");
      return li?.textContent?.trim();
    }, clip.html);
    expect(parsedText).toBe("a < b & c");
  });

  test("13. copying plain lines with no list puts empty string for text/html and preserves text/plain", async ({ page }) => {
    await setEditorText(page, "hello\nworld");
    await selectAllInEditor(page);

    const clip = await copySelection(page);
    expect(clip.plain).toBe("hello\nworld");
    expect(clip.html).toBe("");
  });

  test("14. cut of a list selection removes it from note and populates the same text/html as copy", async ({ page }) => {
    await setEditorText(page, "- One\n  - Sub\n- Two");
    await selectAllInEditor(page);

    const clip = await cutSelection(page);
    expect(clip.plain).toBe("- One\n  - Sub\n- Two");
    await expect.poll(async () => activeTabContent(page)).toBe("");

    const parsed = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const topUl = doc.body.querySelector("ul");
      if (!topUl) return { error: "No root <ul> found" };
      const topLis = Array.from(topUl.children).filter((c) => c.tagName === "LI");
      if (topLis.length !== 2) return { error: `Expected 2 top-level <li>, got ${topLis.length}` };
      const nestedUl = topLis[0].querySelector("ul");
      const nestedLis = nestedUl ? Array.from(nestedUl.children).filter((c) => c.tagName === "LI") : [];
      return {
        error: null,
        topLiCount: topLis.length,
        nestedLiCount: nestedLis.length,
        nestedLiText: nestedLis[0]?.textContent?.trim(),
        secondLiText: topLis[1]?.textContent?.trim(),
      };
    }, clip.html);

    expect(parsed.error).toBeNull();
    expect(parsed.topLiCount).toBe(2);
    expect(parsed.nestedLiCount).toBe(1);
    expect(parsed.nestedLiText).toBe("Sub");
    expect(parsed.secondLiText).toBe("Two");
  });
});
