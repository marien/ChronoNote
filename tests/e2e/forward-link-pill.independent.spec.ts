import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  todayFilename,
  activeTabLabel,
  cursorLine,
} from "./helpers";

function isColorTransparent(color: string): boolean {
  if (color === "transparent") return true;
  const match = color.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/);
  if (match && match[1] !== undefined) {
    return parseFloat(match[1]) === 0;
  }
  return false;
}

test.describe("forward link pills in editor (Task S428-T / Section C)", () => {
  const line1 = "> review budget (<2026-10-20#Standup) (>2026-10-26#Weekly Sync)";
  const line2 = "> review budget";
  const line3 = "plain 2026-10-03 (2026-10-04)";

  const SEED_TEXT = [line1, line2, line3].join("\n");

  const seedNotes = {
    [todayFilename()]: SEED_TEXT,
    "2026-10-26.txt": [
      "Intro",
      "=====",
      "intro notes",
      "",
      "Weekly Sync",
      "===========",
      "# discuss budget",
    ].join("\n"),
    "2026-10-20.txt": [
      "Standup",
      "=======",
      "# morning standup",
    ].join("\n"),
  };

  test("forward link pills render with direction, separator and paren elements, not on plain lines", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const lines = editor(page).locator(".cm-line");
    await expect(lines).toHaveCount(3);

    const fwdLine = lines.nth(0);
    const plainLine = lines.nth(2);

    const links = fwdLine.locator(".cm-fwd-link");
    await expect(links).toHaveCount(2);

    // (<2026-10-20#Standup)
    const backLink = links.nth(0);
    await expect(backLink.locator(".cm-fwd-dir.cm-fwd-dir-from")).toBeVisible();
    await expect(backLink.locator(".cm-fwd-sep")).toBeVisible();
    await expect(backLink.locator(".cm-fwd-paren")).toBeVisible();

    // (>2026-10-26#Weekly Sync)
    const nextLink = links.nth(1);
    await expect(nextLink.locator(".cm-fwd-dir.cm-fwd-dir-to")).toBeVisible();
    await expect(nextLink.locator(".cm-fwd-sep")).toBeVisible();
    await expect(nextLink.locator(".cm-fwd-paren")).toBeVisible();

    // Plain line: plain 2026-10-03 (2026-10-04) has no .cm-fwd-link
    await expect(plainLine.locator(".cm-fwd-link")).toHaveCount(0);
  });

  test("footprint: line width equals expected character width and line height equals plain line height across font sizes", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    // Default font size (13px), and two other sizes (15px, 18px)
    for (const fontSize of [13, 15, 18]) {
      await page.evaluate((size) => {
        document.documentElement.style.setProperty("--editor-font-size", `${size}px`);
        const cm = document.querySelector<HTMLElement>(".cm-editor");
        if (cm) cm.style.setProperty("--editor-font-size", `${size}px`);
      }, fontSize);
      await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));

      const metrics = await page.evaluate(({ rawLen }) => {
        const lines = document.querySelectorAll<HTMLElement>(".cm-editor .cm-line");
        const fwdLine = lines[0];
        const plainLine = lines[2];

        // Measure single char width on plain line using a Range across the entire text
        const walker = document.createTreeWalker(plainLine, NodeFilter.SHOW_TEXT);
        const textNode = walker.nextNode()!;
        const plainRange = document.createRange();
        plainRange.setStart(textNode, 0);
        plainRange.setEnd(textNode, textNode.nodeValue!.length);
        const plainWidth = plainRange.getBoundingClientRect().width;
        const charWidth = plainWidth / textNode.nodeValue!.length;
        const expectedWidth = rawLen * charWidth;

        // Content width of fwdLine: range from start of first text node to end of last text node
        const fwdWalker = document.createTreeWalker(fwdLine, NodeFilter.SHOW_TEXT);
        let firstNode: Node | null = fwdWalker.nextNode();
        let lastNode: Node | null = firstNode;
        let next: Node | null;
        while ((next = fwdWalker.nextNode())) {
          lastNode = next;
        }
        const fwdRange = document.createRange();
        fwdRange.setStart(firstNode!, 0);
        fwdRange.setEnd(lastNode!, lastNode!.nodeValue?.length ?? 0);
        const actualWidth = fwdRange.getBoundingClientRect().width;

        const fwdHeight = fwdLine.getBoundingClientRect().height;
        const plainHeight = plainLine.getBoundingClientRect().height;

        return {
          actualWidth,
          expectedWidth,
          fwdHeight,
          plainHeight,
        };
      }, { rawLen: line1.length });

      expect(
        Math.abs(metrics.actualWidth - metrics.expectedWidth),
        `fontSize ${fontSize}px: content width should match chars x charWidth within 1px`,
      ).toBeLessThanOrEqual(1);

      expect(
        Math.abs(metrics.fwdHeight - metrics.plainHeight),
        `fontSize ${fontSize}px: line height should equal plain line height within 1px`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("nothing moves when caret enters the link or moves to another line", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const getLastCharX = () => {
      const line = document.querySelectorAll<HTMLElement>(".cm-editor .cm-line")[0];
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let lastNode: Node | null = null;
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.length > 0) {
          lastNode = n;
        }
      }
      if (!lastNode) return null;
      const range = document.createRange();
      const len = lastNode.nodeValue!.length;
      range.setStart(lastNode, len - 1);
      range.setEnd(lastNode, len);
      return range.getBoundingClientRect().left;
    };

    // Caret is outside on line 1
    await editor(page).locator(".cm-line").nth(1).click();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
    const xOutsideInitial = await page.evaluate(getLastCharX);
    expect(xOutsideInitial).not.toBeNull();

    // Put caret inside the (>…) link (second link on line 0)
    const secondLink = editor(page).locator(".cm-line").nth(0).locator(".cm-fwd-link").nth(1);
    await secondLink.click();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
    const xInside = await page.evaluate(getLastCharX);
    expect(xInside).not.toBeNull();
    expect(Math.abs(xInside! - xOutsideInitial!)).toBeLessThan(0.5);

    // Put caret outside on another line (line 1)
    await editor(page).locator(".cm-line").nth(1).click();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
    const xOutsideAgain = await page.evaluate(getLastCharX);
    expect(xOutsideAgain).not.toBeNull();
    expect(Math.abs(xOutsideAgain! - xOutsideInitial!)).toBeLessThan(0.5);
  });

  test("link receives cm-fwd-editing class when caret is inside, and loses it when caret moves away", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const line0 = editor(page).locator(".cm-line").nth(0);
    const line1 = editor(page).locator(".cm-line").nth(1);
    const links = line0.locator(".cm-fwd-link");
    const link0 = links.nth(0);
    const link1 = links.nth(1);

    // Place caret on line 1
    await line1.click();
    await expect(link0).not.toHaveClass(/cm-fwd-editing/);
    await expect(link1).not.toHaveClass(/cm-fwd-editing/);

    // Click inside the second link (>2026-10-26#Weekly Sync)
    await link1.click();
    await expect(link1).toHaveClass(/cm-fwd-editing/);
    await expect(link0).not.toHaveClass(/cm-fwd-editing/);

    // Move caret back to line 1
    await line1.click();
    await expect(link1).not.toHaveClass(/cm-fwd-editing/);
    await expect(link0).not.toHaveClass(/cm-fwd-editing/);
  });

  test("direction symbol and separator are transparent while idle and visible while editing", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const line0 = editor(page).locator(".cm-line").nth(0);
    const line1 = editor(page).locator(".cm-line").nth(1);
    const link1 = line0.locator(".cm-fwd-link").nth(1);

    const getColors = () =>
      page.evaluate(() => {
        const link = document.querySelectorAll(".cm-editor .cm-line")[0]?.querySelectorAll(".cm-fwd-link")[1];
        if (!link) return null;
        const dir = link.querySelector<HTMLElement>(".cm-fwd-dir");
        const sep = link.querySelector<HTMLElement>(".cm-fwd-sep");
        return {
          dirColor: dir ? window.getComputedStyle(dir).color : null,
          sepColor: sep ? window.getComputedStyle(sep).color : null,
        };
      });

    // Caret on line 1: idle state
    await line1.click();
    const idleColors = await getColors();
    expect(idleColors).not.toBeNull();
    expect(isColorTransparent(idleColors!.dirColor ?? "")).toBe(true);
    expect(isColorTransparent(idleColors!.sepColor ?? "")).toBe(true);

    // Caret inside link 1: editing state
    await link1.click();
    const editingColors = await getColors();
    expect(editingColors).not.toBeNull();
    expect(isColorTransparent(editingColors!.dirColor ?? "")).toBe(false);
    expect(isColorTransparent(editingColors!.sepColor ?? "")).toBe(false);
  });

  test("Ctrl+Click on date inside (>...) pill opens target note", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    const line0 = editor(page).locator(".cm-line").nth(0);
    const fwdLink = line0.locator(".cm-fwd-link").nth(1);

    const dateLink = fwdLink.locator(".cm-date-link");
    const clickTarget = (await dateLink.count()) > 0 ? dateLink : fwdLink;

    await clickTarget.click({ modifiers: ["ControlOrMeta"] });

    // Active tab is now 2026-10-26
    await expect(activeTabLabel(page)).toHaveText("2026-10-26");

    // Section title "Weekly Sync" is at line 5
    await expect.poll(() => cursorLine(page)).toBe(5);

    // Navigation toast is shown
    const navToast = page.locator(".nav-toast");
    await expect(navToast).toBeVisible();

    // Nav toast back button returns to today's note
    const backBtn = navToast.locator(".nav-toast-back");
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(activeTabLabel(page)).toHaveText(todayFilename().replace(".txt", ""));
  });
});
