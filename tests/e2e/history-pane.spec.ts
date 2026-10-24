import { test, expect } from "@playwright/test";
import {
  seedApp,
  editor,
  currentModal,
  todayFilename,
} from "./helpers";

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Section History docked pane (Proposal C1)", () => {
  const seedNotes = {
    "2026-09-01.txt": [
      "Weekly Sync",
      "===========",
      "# previous week sync action",
    ].join("\n"),
    [todayFilename()]: [
      "Weekly Sync",
      "===========",
      "# first open action",
      "v done action",
      "# second open action",
      "",
      "Project Apollo",
      "==============",
      "# apollo discussion",
    ].join("\n"),
  };

  test("docks side-by-side with editor, F6 switches focus, note editable, Ctrl+J works, follows caret, Escape closes, and dialog at 900px", async ({
    page,
  }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    // Place cursor in first section "Weekly Sync"
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    // 1. Ctrl+Shift+H shows .history-pane next to the editor (both visible, no .overlay)
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const pane = page.locator(".history-pane");
    await expect(pane).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(page.locator(".overlay")).toHaveCount(0);
    await expect(pane.locator(".modal-title")).toContainText("Weekly Sync");

    // 2. F6 moves focus to the editor
    await page.keyboard.press("F6");
    await expect(editor(page)).toBeFocused();

    // 3. Typing then changes the note (pane stays open)
    await page.keyboard.type("Note edit test. ");
    await expect(editor(page)).toContainText("Note edit test.");
    await expect(pane).toBeVisible();
    expect(await currentModal(page)).toBe("history");

    // 4. Ctrl+J still works with the pane open
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+j");
    await expect(pane).toBeVisible();
    expect(await currentModal(page)).toBe("history");

    // 5. Moving the caret into another section updates the pane title
    const apolloLine = editor(page).locator(".cm-line", { hasText: "apollo discussion" });
    await apolloLine.click();
    await expect(pane.locator(".modal-title")).toContainText("Project Apollo");

    // 6. Escape in the pane closes it and focuses the editor
    await page.keyboard.press("F6");
    await expect(pane).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pane).toHaveCount(0);
    expect(await currentModal(page)).toBe("none");
    await expect(editor(page)).toBeFocused();

    // 7. At 900px wide History opens as the old dialog
    await page.setViewportSize({ width: 900, height: 800 });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".overlay")).toBeVisible();
    await expect(page.locator(".modal-card.history-modal-card")).toBeVisible();
    await expect(page.locator(".history-pane")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".overlay")).toHaveCount(0);
  });

  test("narrowing window below 1000px while docked closes the pane", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane")).toBeVisible();

    await page.setViewportSize({ width: 950, height: 800 });
    await expect(page.locator(".history-pane")).toHaveCount(0);
    expect(await currentModal(page)).toBe("none");
  });

  test("pressing Ctrl+Shift+H in the note while pane is open moves focus to the pane", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: seedNotes,
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane")).toBeVisible();

    // Switch focus to editor with F6
    await page.keyboard.press("F6");
    await expect(editor(page)).toBeFocused();

    // Pressing Ctrl+Shift+H while in note moves focus to pane
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane .history-body")).toBeFocused();
  });

  test("Ctrl+Shift+H switches focus between the note and the docked pane (no F-key needed)", async ({ page }) => {
    await seedApp(page, { seed: { notes: seedNotes, session: { openTabs: [todayFilename()], activeTab: todayFilename() } } });
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+H");
    const pane = page.locator(".history-pane");
    await expect(pane).toBeVisible();
    const inPane = () => page.evaluate(() => !!document.querySelector(".history-pane")?.contains(document.activeElement));
    await expect.poll(inPane).toBe(true);
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(editor(page)).toBeFocused();
    await expect(pane).toBeVisible();
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect.poll(inPane).toBe(true);
  });

  test("reopening, or opening from a past note, stays on that note's date (no jump to the earliest)", async ({ page }) => {
    const today = todayFilename();
    await seedApp(page, {
      seed: {
        notes: {
          "2026-08-25.txt": ["Weekly Sync", "===========", "# old a"].join("\n"),
          "2026-09-04.txt": ["Weekly Sync", "===========", "# old c", "", "Other", "=====", "# o1"].join("\n"),
          [today]: ["Weekly Sync", "===========", "# first", "", "Other", "=====", "# o2"].join("\n"),
        },
        session: { openTabs: ["2026-09-04.txt", today], activeTab: today },
      },
    });
    const active = page.locator(".history-pane .history-occ-tab.active");
    // Use the pane for "Other", close it, reopen it on "Weekly Sync": the stale caret section used to trigger a
    // rebuild 250ms later that selected the earliest date.
    await editor(page).locator(".cm-line", { hasText: "o2" }).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane .modal-title")).toContainText("Other");
    // A caret move while the pane is open records the caret's section ("Other").
    await editor(page).locator(".cm-line", { hasText: "o2" }).click();
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await editor(page).locator(".cm-line", { hasText: "first" }).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(active).toContainText(today.replace(".txt", ""));
    await page.waitForTimeout(800);
    await expect(active).toContainText(today.replace(".txt", ""));
    await page.keyboard.press("Escape");

    await page.locator("#tab-bar .tab", { hasText: "2026-09-04" }).click();
    await editor(page).locator(".cm-line", { hasText: "old c" }).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(active).toContainText("2026-09-04");
    await page.waitForTimeout(800);
    await expect(active).toContainText("2026-09-04");
  });

  test("Section History draws group tree lines with correct geometry and preserves line height", async ({ page }) => {
    const today = todayFilename();
    const groupedLines = [
      "Weekly Sync",
      "===========",
      "# (ops) release by:2026-10-30",
      "  # changelog",
      "  # build",
      "  v announce",
    ];
    const ungroupedLines = [
      "Weekly Sync",
      "===========",
      "# (ops) release by:2026-10-30",
      "# changelog",
      "# build",
      "v announce",
    ];

    await seedApp(page, {
      seed: {
        notes: {
          [today]: groupedLines.join("\n"),
        },
        session: { openTabs: [today], activeTab: today },
      },
    });

    await editor(page).locator(".cm-line", { hasText: "release" }).click();
    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane")).toBeVisible();

    const lines = page.locator(".history-pane .hp-line");
    await expect(lines).toHaveCount(4);

    // Parent line is index 0 ("# (ops) release by:2026-10-30")
    const parentLine = lines.nth(0);
    const parentGlyph = parentLine.locator(".glyph-open").first();
    await expect(parentGlyph).toBeVisible();
    // Also verify topic and due pills render in Section History
    await expect(parentLine.locator(".glyph-topic")).toBeVisible();
    await expect(parentLine.locator(".cm-due")).toBeVisible();
    await expect(parentLine.locator(".cm-due-flag")).toBeVisible();

    const parentGlyphBox = await parentGlyph.boundingBox();
    expect(parentGlyphBox).not.toBeNull();
    const parentGlyphMiddle = parentGlyphBox!.x + parentGlyphBox!.width / 2;

    // Line 1 ("  # changelog") has a vertical line meeting the parent glyph's middle
    const firstChildLine = lines.nth(1);
    const vertLine = firstChildLine.locator(".cm-action-tree-line.is-vertical").first();
    await expect(vertLine).toBeVisible();
    const vertBox = await vertLine.boundingBox();
    expect(vertBox).not.toBeNull();

    // 1. The line meets the parent glyph's middle within 1px
    expect(Math.abs(vertBox!.x - parentGlyphMiddle)).toBeLessThanOrEqual(1);

    // 2. The last child's line ends at its middle
    // Last child is index 3 ("  v announce")
    const lastChildLine = lines.nth(3);
    const lastChildBox = await lastChildLine.boundingBox();
    expect(lastChildBox).not.toBeNull();
    const lastVertLine = lastChildLine.locator(".cm-action-tree-line.is-vertical").first();
    await expect(lastVertLine).toBeVisible();
    const lastVertBox = await lastVertLine.boundingBox();
    expect(lastVertBox).not.toBeNull();

    const lastChildMiddleY = lastChildBox!.y + lastChildBox!.height / 2;
    const lastVertBottomY = lastVertBox!.y + lastVertBox!.height;
    expect(Math.abs(lastVertBottomY - lastChildMiddleY)).toBeLessThanOrEqual(1);

    const groupedHeights: number[] = [];
    for (let i = 0; i < 4; i++) {
      const box = await lines.nth(i).boundingBox();
      expect(box).not.toBeNull();
      groupedHeights.push(box!.height);
    }

    // 3. Line heights are the same with and without groups
    await page.keyboard.press("Escape");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(ungroupedLines.join("\n"));
    await page.waitForTimeout(300);

    await page.keyboard.press("ControlOrMeta+Shift+H");
    await expect(page.locator(".history-pane")).toBeVisible();

    const ungroupedHistoryLines = page.locator(".history-pane .hp-line");
    await expect(ungroupedHistoryLines).toHaveCount(4);

    for (let i = 0; i < 4; i++) {
      const box = await ungroupedHistoryLines.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeCloseTo(groupedHeights[i], 1);
    }
  });
});
