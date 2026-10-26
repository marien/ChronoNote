import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, todayFilename } from "./helpers";

async function seedWithText(page: Page, text: string): Promise<void> {
  const file = todayFilename();
  await seedApp(page, {
    seed: {
      notes: { [file]: text },
      session: { openTabs: [file], activeTab: file },
    },
  });
  await expect(editor(page)).toBeVisible();
}

test.describe("action tree lines (§423)", () => {
  test("draws one vertical and three horizontal lines for parent with three children", async ({ page }) => {
    const text = "# release\n  # changelog\n  # build\n  # announce";
    await seedWithText(page, text);

    await expect(page.locator(".cm-action-tree-line.is-vertical")).toHaveCount(1);
    await expect(page.locator(".cm-action-tree-line.is-horizontal")).toHaveCount(3);
  });

  test("footprint: every .cm-line has the same height and text changelog has the same x", async ({ page }) => {
    const groupedText = "# release\n  # changelog\n  # build\n  # announce";
    await seedWithText(page, groupedText);

    const groupedLineHeights = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".cm-line")).map(
        (el) => el.getBoundingClientRect().height,
      );
    });
    const groupedChangelogX = await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.querySelector(".cm-content")!,
        NodeFilter.SHOW_TEXT,
      );
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.includes("changelog")) {
          const range = document.createRange();
          const start = node.textContent.indexOf("changelog");
          range.setStart(node, start);
          range.setEnd(node, start + "changelog".length);
          return range.getBoundingClientRect().x;
        }
      }
      return null;
    });

    const ungroupedText = "# release\n\n  # changelog\n  # build\n  # announce";
    await seedWithText(page, ungroupedText);

    const ungroupedLineHeights = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".cm-line")).map(
        (el) => el.getBoundingClientRect().height,
      );
    });
    const ungroupedChangelogX = await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.querySelector(".cm-content")!,
        NodeFilter.SHOW_TEXT,
      );
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.includes("changelog")) {
          const range = document.createRange();
          const start = node.textContent.indexOf("changelog");
          range.setStart(node, start);
          range.setEnd(node, start + "changelog".length);
          return range.getBoundingClientRect().x;
        }
      }
      return null;
    });

    expect(groupedLineHeights.length).toBeGreaterThan(0);
    const h0 = groupedLineHeights[0];
    for (const h of groupedLineHeights) {
      expect(h).toBeCloseTo(h0, 1);
    }
    for (const h of ungroupedLineHeights) {
      expect(h).toBeCloseTo(h0, 1);
    }

    expect(groupedChangelogX).not.toBeNull();
    expect(ungroupedChangelogX).not.toBeNull();
    expect(groupedChangelogX!).toBeCloseTo(ungroupedChangelogX!, 1);
  });

  test("vertical x is inside parent glyph ink and horizontal segments end left of child glyphs", async ({ page }) => {
    const text = "# release\n  # changelog\n  # build\n  # announce";
    await seedWithText(page, text);

    const parentGlyph = page.locator(".cm-line >> nth=0").locator(".glyph-ink").first();
    const parentBox = await parentGlyph.boundingBox();
    expect(parentBox).not.toBeNull();

    const vertLine = page.locator(".cm-action-tree-line.is-vertical").first();
    const vertBox = await vertLine.boundingBox();
    expect(vertBox).not.toBeNull();

    expect(vertBox!.x).toBeGreaterThanOrEqual(parentBox!.x);
    expect(vertBox!.x).toBeLessThanOrEqual(parentBox!.x + parentBox!.width);

    const horizLines = page.locator(".cm-action-tree-line.is-horizontal");
    await expect(horizLines).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      const childGlyph = page.locator(`.cm-line >> nth=${i + 1}`).locator(".glyph-ink").first();
      const childBox = await childGlyph.boundingBox();
      expect(childBox).not.toBeNull();

      const horizBox = await horizLines.nth(i).boundingBox();
      expect(horizBox).not.toBeNull();

      expect(horizBox!.x + horizBox!.width).toBeLessThanOrEqual(childBox!.x);
    }
  });

  test("resolved state reflects completion and caret position", async ({ page }) => {
    await seedWithText(page, "# a\n  v b");
    await expect(page.locator(".cm-action-tree-line.is-resolved")).toHaveCount(0);

    await seedWithText(page, "v a\n  v b\n\n# other");
    await page.locator(".cm-line >> nth=3").click();
    await expect(page.locator(".cm-action-tree-line.is-resolved")).toHaveCount(2);
  });

  test("empty line breaks the group yielding exactly one horizontal segment", async ({ page }) => {
    await seedWithText(page, "# a\n  # b\n\n  # c");
    await expect(page.locator(".cm-action-tree-line.is-horizontal")).toHaveCount(1);
  });

  test("Peek draws no lines for groups in the hidden part of the note (#182)", async ({ page }) => {
    const file = todayFilename();
    await seedApp(page, {
      seed: {
        notes: { [file]: "Standup\n=======\n# release\n  # build\n  # announce\n\nEmpty\n=====\n" },
        session: { openTabs: [file], activeTab: file },
        peek: {},
      },
    });
    await expect(page.locator(".cm-action-tree-line.is-vertical")).toHaveCount(1);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("ControlOrMeta+Shift+KeyP");
    await expect(page.locator("body.peek-mode")).toBeVisible();
    await expect(page.locator(".cm-action-tree-line")).toHaveCount(0);
  });
});
