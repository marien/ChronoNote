import { test, expect, type Locator } from "@playwright/test";
import {
  seedApp,
  editor,
  todayFilename,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 800 } });

interface TreeElementData {
  tagName: string;
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  bottom: number;
}

/** Finds absolutely positioned, aria-hidden tree-line elements inside a .hp-line. */
async function getTreeElements(line: Locator): Promise<TreeElementData[]> {
  return line.evaluate((lineEl) => {
    return Array.from(lineEl.children)
      .filter((el) => {
        const style = window.getComputedStyle(el);
        const isAbs = style.position === "absolute";
        const ariaHidden = el.getAttribute("aria-hidden") === "true";
        // Ignore normal text/glyph spans (relative/static or visible content)
        const isNormalSpan =
          el.classList.contains("glyph-open") ||
          el.classList.contains("glyph-done") ||
          el.classList.contains("cm-due") ||
          el.classList.contains("glyph-topic") ||
          (!ariaHidden && style.position !== "absolute" && (el.textContent?.trim().length ?? 0) > 0);
        return isAbs && !isNormalSpan;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName,
          className: el.className,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
  });
}

test.describe("Section History action group tree lines and due pills (§426-T)", () => {
  const earlierDate = "2026-09-01";
  const pastDueDate = "2026-08-15";

  test("draws tree lines for grouped actions and due pills in Section History occurrence body", async ({
    page,
  }) => {
    const today = todayFilename();

    const earlierNoteContent = [
      "Project Review",
      "==============",
      "# Prepare the review",
      "    # Book a room",
      "    # Draft the agenda",
      "        # Collect slides",
      "    # Send invites",
      `# Unrelated action by:${pastDueDate}`,
    ].join("\n");

    const todayNoteContent = [
      "Project Review",
      "==============",
      "# today review action",
    ].join("\n");

    await seedApp(page, {
      seed: {
        notes: {
          [`${earlierDate}.txt`]: earlierNoteContent,
          [today]: todayNoteContent,
        },
        session: { openTabs: [today], activeTab: today },
      },
    });

    // Place cursor in first section "Project Review"
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    // Open Section History docked pane
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const pane = page.locator(".history-pane, .history-modal-card");
    await expect(pane.first()).toBeVisible();

    // Select the earlier occurrence (2026-09-01)
    const occTab = page.locator(".history-occ-tab", { hasText: earlierDate });
    await expect(occTab).toBeVisible();
    await occTab.click();
    await expect(page.locator(".history-occ-tab.active")).toContainText(earlierDate);

    // Locate the occurrence body lines
    const contextBody = page.locator(".hp-context");
    await expect(contextBody).toBeVisible();

    const lines = contextBody.locator(".hp-line");
    await expect(lines).toHaveCount(6);

    const prepareLine = lines.nth(0);
    const bookLine = lines.nth(1);
    const agendaLine = lines.nth(2);
    const slidesLine = lines.nth(3);
    const invitesLine = lines.nth(4);
    const unrelatedLine = lines.nth(5);

    await expect(prepareLine).toContainText("Prepare the review");
    await expect(bookLine).toContainText("Book a room");
    await expect(agendaLine).toContainText("Draft the agenda");
    await expect(slidesLine).toContainText("Collect slides");
    await expect(invitesLine).toContainText("Send invites");
    await expect(unrelatedLine).toContainText("Unrelated action");

    // 1. Tree-line elements exist on the group's lines and none on Unrelated action's line
    const bookGuides = await getTreeElements(bookLine);
    expect(bookGuides.length).toBeGreaterThan(0);

    const agendaGuides = await getTreeElements(agendaLine);
    expect(agendaGuides.length).toBeGreaterThan(0);

    const slidesGuides = await getTreeElements(slidesLine);
    expect(slidesGuides.length).toBeGreaterThan(0);

    const invitesGuides = await getTreeElements(invitesLine);
    expect(invitesGuides.length).toBeGreaterThan(0);

    const unrelatedGuides = await getTreeElements(unrelatedLine);
    expect(unrelatedGuides.length).toBe(0);
    await expect(unrelatedLine.locator('[aria-hidden="true"]')).toHaveCount(0);

    // 2. The vertical line on Book a room's line is within 1px (x) of the middle of the parent line's glyph
    const parentGlyph = prepareLine.locator('.glyph-open, span[class*="glyph-"]').first();
    const parentGlyphBox = (await parentGlyph.boundingBox())!;
    const parentGlyphCenterX = parentGlyphBox.x + parentGlyphBox.width / 2;

    const vertGuide =
      bookGuides.find(
        (g) =>
          Math.abs(g.x + g.width / 2 - parentGlyphCenterX) <= 2 ||
          Math.abs(g.x - parentGlyphCenterX) <= 2,
      ) ??
      bookGuides.find((g) => g.height > g.width) ??
      bookGuides[0];

    const vertX = vertGuide.width <= 2 ? vertGuide.x : vertGuide.x + vertGuide.width / 2;
    expect(Math.abs(vertX - parentGlyphCenterX)).toBeLessThanOrEqual(1.5);

    // 3. On Send invites (the last child of Prepare the review) the line ends at about the middle of its first row
    // (its bottom is above the line's bottom by at least 3px)
    const invitesLineBox = (await invitesLine.boundingBox())!;
    const invitesLineBottom = invitesLineBox.y + invitesLineBox.height;

    const endGuide =
      invitesGuides.find((g) => invitesLineBottom - g.bottom >= 3) ?? invitesGuides[0];
    expect(invitesLineBottom - endGuide.bottom).toBeGreaterThanOrEqual(3);

    const invitesLineMiddle = invitesLineBox.y + invitesLineBox.height / 2;
    expect(Math.abs(endGuide.bottom - invitesLineMiddle)).toBeLessThanOrEqual(invitesLineBox.height / 3);

    // 4. Every .hp-line of a one-row line is the same height as a line in a note without groups (compare with Unrelated action)
    const unrelatedBox = (await unrelatedLine.boundingBox())!;
    const baselineHeight = unrelatedBox.height;

    for (let i = 0; i < 5; i++) {
      const lineBox = (await lines.nth(i).boundingBox())!;
      expect(lineBox.height).toBeCloseTo(baselineHeight, 0);
    }

    // 5. Unrelated action's due date shows as .cm-due.cm-due-overdue with a .cm-due-flag inside
    const dueOverdue = unrelatedLine.locator(".cm-due.cm-due-overdue");
    await expect(dueOverdue).toBeVisible();
    await expect(dueOverdue.locator(".cm-due-flag")).toBeVisible();
  });

  test("nested group lines with multiple indentation levels render guide lines at respective depths", async ({
    page,
  }) => {
    const today = todayFilename();

    const earlierNoteContent = [
      "Project Review",
      "==============",
      "# Parent",
      "    # Child 1",
      "        # Grandchild",
      "    # Child 2",
      "# Standalone",
    ].join("\n");

    await seedApp(page, {
      seed: {
        notes: {
          [`${earlierDate}.txt`]: earlierNoteContent,
          [today]: ["Project Review", "==============", "# current"].join("\n"),
        },
        session: { openTabs: [today], activeTab: today },
      },
    });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");

    const occTab = page.locator(".history-occ-tab", { hasText: earlierDate });
    await expect(occTab).toBeVisible();
    await occTab.click();

    const contextBody = page.locator(".hp-context");
    await expect(contextBody).toBeVisible();

    const lines = contextBody.locator(".hp-line");
    await expect(lines).toHaveCount(5);

    // Grandchild is indented twice and has tree guides
    const grandchildGuides = await getTreeElements(lines.nth(2));
    expect(grandchildGuides.length).toBeGreaterThan(0);

    // Standalone has no tree guides
    const standaloneGuides = await getTreeElements(lines.nth(4));
    expect(standaloneGuides.length).toBe(0);
  });
});
