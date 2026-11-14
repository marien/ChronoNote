import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  seedApp,
  editor,
  setEditorText,
  activeTabContent,
  statusCounts,
  cursorLine,
  toast,
  openViaShortcut,
  modalCard,
  MODAL_LABELS,
  todayFilename,
} from "./helpers";

const GLYPH_SEL = [
  ".glyph-open",
  ".glyph-done",
  ".glyph-progress",
  ".glyph-cancelled",
  ".glyph-topic-open",
  ".glyph-topic-done",
  ".glyph-topic-skipped",
  ".glyph-bullet",
  ".glyph-emphasis-line",
  ".glyph-followup",
  ".glyph-cyclable",
].join(", ");

const LONG_LINE =
  "This is a deliberately very long single line of prose that will overflow the editor width many times over so we can tell wrapping apart cleanly.";

async function rightClickSubstring(page: Page, lineIndex: number, substring: string): Promise<void> {
  const coords = await page.evaluate(
    ({ idx, sub }) => {
      const line = document.querySelectorAll<HTMLElement>(".cm-content .cm-line")[idx];
      if (!line) return null;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue ?? "";
        const at = text.indexOf(sub);
        if (at !== -1) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + sub.length);
          const rect = range.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
      }
      return null;
    },
    { idx: lineIndex, sub: substring },
  );
  expect(coords).not.toBeNull();
  await page.mouse.click(coords!.x, coords!.y, { button: "right" });
}

// ============================================================================
// Rule 1 (decision D5). A title line is plain text everywhere
// ============================================================================
test.describe("Rule 1: title lines above === or --- are plain text everywhere", () => {
  test("1.1: `# Title\\n=====` renders as plain text, counts 0 open, skipped by Ctrl+J, excluded from Actions view & drawer, exported as heading", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Title\n=====");

    // Editor draws `# Title` as plain text (no checkbox or cyclable glyph)
    const firstLine = editor(page).locator(".cm-line").nth(0);
    await expect(firstLine).toContainText("# Title");
    await expect(firstLine.locator(GLYPH_SEL)).toHaveCount(0);

    // Status bar counts no open action
    expect(await statusCounts(page)).toEqual({ open: 0, closed: 0, forwarded: 0 });

    // Ctrl+J does not stop on `# Title`
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("Control+KeyJ");
    await expect(toast(page)).toContainText(/no open actions/i);

    // Actions view (docked pane at 1280px) does not list it
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press("ControlOrMeta+Shift+A");
    const pane = page.locator(".actions-pane");
    await expect(pane).toBeVisible();
    await expect(pane).not.toContainText("Title");
    await page.keyboard.press("Escape");

    // Actions drawer (modal at 900px) does not list it
    await page.setViewportSize({ width: 900, height: 720 });
    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await expect(drawer).not.toContainText("Title");
    await page.keyboard.press("Escape");

    // Ctrl+J skips `# Title` and stops on a real action below it
    await setEditorText(page, "# Title\n=====\n\n# Real task");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("Control+KeyJ");
    expect(await cursorLine(page)).toBe(4);

    // Export writes `# Title` as a heading, not a task
    await setEditorText(page, "# Title\n=====");
    await page.locator("[data-more-trigger]").click();
    await page.locator(".more-actions-item", { hasText: "Export…" }).click();
    const exportModal = page.locator(".export-modal");
    await expect(exportModal).toBeVisible();
    await exportModal.locator("button", { hasText: "Copy as Markdown" }).click();
    const md = await page.evaluate(() => navigator.clipboard.readText());
    expect(md).not.toContain("- [ ]");
    expect(md).toMatch(/(^#{1,6}\s+# Title\s*$|^# Title\r?\n={3,}\s*$)/m);
  });

  test("1.2: `v Sub\\n---` is not dimmed or struck through, not counted as closed, and excluded from Actions drawer", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "v Sub\n---\nplain comparison");

    const titleLine = editor(page).locator(".cm-line").nth(0);
    const plainLine = editor(page).locator(".cm-line").nth(2);

    await expect(titleLine.locator(GLYPH_SEL)).toHaveCount(0);
    expect(await statusCounts(page)).toEqual({ open: 0, closed: 0, forwarded: 0 });

    const titleStyle = await titleLine.evaluate((el) => {
      const s = getComputedStyle(el);
      return { opacity: Number(s.opacity), textDecoration: s.textDecorationLine };
    });
    const plainStyle = await plainLine.evaluate((el) => {
      const s = getComputedStyle(el);
      return { opacity: Number(s.opacity), textDecoration: s.textDecorationLine };
    });

    expect(titleStyle.textDecoration).not.toContain("line-through");
    expect(titleStyle.opacity).toBeCloseTo(plainStyle.opacity, 2);

    // Even with "Only Open" off, the Actions drawer does not list `v Sub`
    await page.setViewportSize({ width: 900, height: 720 });
    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    await drawer.getByText("Only Open", { exact: false }).click();
    await expect(drawer).not.toContainText("Sub");
  });

  test("1.3: `- point\\n---`, `o agenda\\n===`, and every leading symbol under `===` or `---` render as plain text", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });

    const prefixes = [
      "# open",
      "v done",
      "> deferred",
      "x wontdo",
      "o topic",
      ". discussed",
      ", skipped",
      "- point",
      "* star",
      "! urgent",
      "=> followup",
      "Notes => # inline",
    ];

    for (const underline of ["===", "---", "===  ", "---  "]) {
      const doc = prefixes.map((p) => `${p}\n${underline}`).join("\n\n");
      await setEditorText(page, doc);

      expect(await statusCounts(page)).toEqual({ open: 0, closed: 0, forwarded: 0 });
      await expect(editor(page).locator(GLYPH_SEL)).toHaveCount(0);
    }
  });

  test("1.4: adding and deleting the underline while the note is open toggles glyph and counts without retyping", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });

    // Action line + ===
    await setEditorText(page, "# Live heading");
    await expect(editor(page).locator(".cm-line").nth(0).locator(".glyph-open")).toHaveCount(1);
    expect((await statusCounts(page)).open).toBe(1);

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("===");

    await expect(editor(page).locator(".cm-line").nth(0).locator(".glyph-open")).toHaveCount(0);
    expect((await statusCounts(page)).open).toBe(0);

    // Delete the underline line
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    await expect(editor(page).locator(".cm-line").nth(0).locator(".glyph-open")).toHaveCount(1);
    expect((await statusCounts(page)).open).toBe(1);
    expect(await activeTabContent(page)).toBe("# Live heading");

    // Topic line + --- and Bullet line + ---
    await setEditorText(page, "o Agenda item\n\n- Bullet item");
    await expect(editor(page).locator(".glyph-topic-open")).toHaveCount(1);
    await expect(editor(page).locator(".glyph-bullet")).toHaveCount(1);

    await editor(page).locator(".cm-line").nth(0).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("---");
    await expect(editor(page).locator(".glyph-topic-open")).toHaveCount(0);

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await expect(editor(page).locator(".glyph-topic-open")).toHaveCount(1);
  });

  test("1.5: a `---` line under a blank line is not an underline", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Real task\n\n---\n  \n---");

    await expect(editor(page).locator(".cm-line").nth(0).locator(".glyph-open")).toHaveCount(1);
    expect((await statusCounts(page)).open).toBe(1);
    await expect(editor(page).locator(".cm-subsection-rule")).toHaveCount(0);
  });
});

// ============================================================================
// Rule 2. One meaning of "open action"
// ============================================================================
test.describe("Rule 2: one meaning of open action across status bar, Ctrl+J, and Actions view", () => {
  test("2.1-2.3: status bar counts each open action on a line", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    await setEditorText(page, "# first => v resolved");
    expect(await statusCounts(page)).toEqual({ open: 1, closed: 1, forwarded: 0 });

    await setEditorText(page, "v done => # next step");
    expect(await statusCounts(page)).toEqual({ open: 1, closed: 1, forwarded: 0 });

    await setEditorText(page, "Notes => # call Sam");
    expect(await statusCounts(page)).toEqual({ open: 1, closed: 0, forwarded: 0 });

    await setEditorText(page, "# first => # second");
    expect(await statusCounts(page)).toEqual({ open: 2, closed: 0, forwarded: 0 });
  });

  test("2.1-2.3: Ctrl+J stops on each line containing an open action and skips resolved-only lines", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(
      page,
      [
        "# first => v resolved", // line 1
        "v done => x dropped", // line 2 (no open action)
        "v done => # next step", // line 3
        "Notes => # call Sam", // line 4
      ].join("\n"),
    );

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");

    // Caret starts on line 1, so first Ctrl+J advances to line 3 (skipping line 2), then line 4, then wraps to line 1
    await page.keyboard.press("Control+KeyJ");
    expect(await cursorLine(page)).toBe(3);

    await page.keyboard.press("Control+KeyJ");
    expect(await cursorLine(page)).toBe(4);

    await page.keyboard.press("Control+KeyJ");
    expect(await cursorLine(page)).toBe(1);
  });

  test("2.1-2.3: Actions view and drawer list each open action consistently", async ({ page }) => {
    await seedApp(page, {
      seed: {
        notes: {
          [todayFilename()]: [
            "# first => v resolved",
            "v done => # next step",
            "Notes => # call Sam",
            "v all done => x dropped",
          ].join("\n"),
        },
        session: { openTabs: [todayFilename()], activeTab: todayFilename() },
      },
    });

    for (const width of [1280, 900]) {
      await page.setViewportSize({ width, height: 800 });
      const view = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
      await expect(view).toContainText("first");
      await expect(view).toContainText("next step");
      await expect(view).toContainText("call Sam");
      await expect(view).not.toContainText("all done");
      await expect(view.locator(".modal-counter")).toContainText(/3 open/);
      await page.keyboard.press("Escape");
      await expect(view).toBeHidden();
    }
  });
});

// ============================================================================
// Rule 3. Read-only rows draw what the editor draws
// ============================================================================
test.describe("Rule 3: read-only rows draw what the editor draws", () => {
  const LINE_1 = "! urgent @alice by:2026-11-20 => # call";
  const LINE_2 = "# ! - task";
  const WEEK36_FILE = "2026-09-02.txt";

  async function expectRule3RowDom(
    row1: Locator,
    row2: Locator,
  ): Promise<void> {
    // Line 1: `! urgent @alice by:2026-11-20 => # call`
    const emph1 = row1.locator(".glyph-emphasis-line");
    await expect(emph1.first()).toBeVisible();
    await expect(row1.locator(".glyph-emphasis-line", { hasText: "urgent" }).first()).toBeVisible();
    const weight1 = await emph1.first().evaluate((el) => Number(getComputedStyle(el).fontWeight) || 0);
    expect(weight1).toBeGreaterThanOrEqual(700);

    // Tokens after emphasis are NOT swallowed
    await expect(row1.locator(".glyph-assignee")).toHaveText("@alice");
    await expect(row1.locator(".cm-due .cm-due-flag")).toBeVisible();
    await expect(row1.locator(".glyph-followup")).toHaveCount(1);
    await expect(row1.locator(".glyph-open")).toHaveCount(1);

    // Line 2: `# ! - task`
    await expect(row2.locator(".glyph-open")).toHaveCount(1);
    await expect(row2.locator(".glyph-bullet")).toHaveCount(1);
    const emph2 = row2.locator(".glyph-emphasis-line", { hasText: "task" }).first();
    await expect(emph2).toBeVisible();
    const weight2 = await emph2.evaluate((el) => Number(getComputedStyle(el).fontWeight) || 0);
    expect(weight2).toBeGreaterThanOrEqual(700);
  }

  test("3.1 & 3.2: editor, Actions drawer, Section History, Week review, and Search rows match", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 950, height: 750 });
    await seedApp(page, {
      seed: {
        notes: {
          [WEEK36_FILE]: ["Standup", "=======", LINE_1, LINE_2].join("\n"),
        },
        session: { openTabs: [WEEK36_FILE], activeTab: WEEK36_FILE },
      },
    });

    // 1. Editor
    const cmLines = editor(page).locator(".cm-line");
    await expectRule3RowDom(cmLines.nth(2), cmLines.nth(3));

    // 2. Actions drawer
    const drawer = await openViaShortcut(page, "ControlOrMeta+Shift+A", "actions");
    const drawerRows = drawer.locator('.modal-item[role="option"]');
    await expectRule3RowDom(
      drawerRows.filter({ hasText: "urgent" }).first(),
      drawerRows.filter({ hasText: "task" }).first(),
    );
    await page.keyboard.press("Escape");

    // 3. Section History
    await editor(page).locator(".cm-line", { hasText: "Standup" }).click();
    const history = await openViaShortcut(page, "ControlOrMeta+Shift+H", "history");
    const historyLines = history.locator(".history-select-line");
    await expectRule3RowDom(
      historyLines.filter({ hasText: "urgent" }).first(),
      historyLines.filter({ hasText: "task" }).first(),
    );
    await page.keyboard.press("Escape");

    // 4. Week review (2026-09-02 is in Week 36, default on REFERENCE_TODAY Monday 2026-09-07)
    const weekReview = await openViaShortcut(page, "ControlOrMeta+Shift+K", "weekReview");
    const weekRows = weekReview.locator('.modal-item[role="option"]');
    await expectRule3RowDom(
      weekRows.filter({ hasText: "urgent" }).first(),
      weekRows.filter({ hasText: "task" }).first(),
    );
    await page.keyboard.press("Escape");

    // 5. Cross-tab search
    const search = await openViaShortcut(page, "ControlOrMeta+Shift+F", "search");
    await search.locator(".modal-input").fill("call");
    const searchRow1 = search.locator('.modal-item[role="option"] .search-match-line').first();
    await expect(searchRow1).toBeVisible();

    await search.locator(".modal-input").fill("task");
    const searchRow2 = search.locator('.modal-item[role="option"] .search-match-line').first();
    await expect(searchRow2).toBeVisible();

    // Verify Rule 3 on search rows (search "call" keeps urgent/@alice/due intact; search "task" checks # ! - task)
    await expect(searchRow2.locator(".glyph-open")).toHaveCount(1);
    await expect(searchRow2.locator(".glyph-bullet")).toHaveCount(1);
    await expect(searchRow2.locator(".glyph-emphasis-line")).toContainText("task");

    await search.locator(".modal-input").fill("call");
    await expect(searchRow1.locator(".glyph-emphasis-line")).toContainText("urgent");
    await expect(searchRow1.locator(".glyph-assignee")).toHaveText("@alice");
    await expect(searchRow1.locator(".cm-due .cm-due-flag")).toBeVisible();
    await expect(searchRow1.locator(".glyph-followup")).toHaveCount(1);
    await expect(searchRow1.locator(".glyph-open")).toHaveCount(1);
  });
});

// ============================================================================
// Rule 4. Export and Print show what the editor shows
// ============================================================================
test.describe("Rule 4: browser Copy as Markdown and Print HTML show what the editor shows", () => {
  test("4.1-4.3 & 4.5: Copy as Markdown exports stripped markers, glyph consequences, and headings", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: "empty" });
    await setEditorText(
      page,
      [
        "# Title",
        "=====",
        "# - bulleted",
        "# ! urgent",
        "! - urgent",
        "=> # standalone",
        "=> v sent",
        "=> x dropped",
        "=> > later",
      ].join("\n"),
    );

    await page.locator("[data-more-trigger]").click();
    await page.locator(".more-actions-item", { hasText: "Export…" }).click();
    const modal = page.locator(".export-modal");
    await expect(modal).toBeVisible();
    await modal.locator("button", { hasText: "Copy as Markdown" }).click();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).not.toContain("- [ ] Title");
    expect(clip).toMatch(/(^#{1,6}\s+# Title\s*$|^# Title\r?\n={3,}\s*$)/m);
    expect(clip).toContain("- [ ] bulleted");
    expect(clip).not.toContain("- [ ] - bulleted");
    expect(clip).toContain("- [ ] **urgent**");
    expect(clip).toContain("- **urgent**");
    expect(clip).not.toContain("**- urgent**");
    expect(clip).toContain("→ ☐ standalone");
    expect(clip).toContain("→ ☑ sent");
    expect(clip).toContain("→ ☒ dropped");
    expect(clip).toContain("→ ☐ later *(deferred)*");
  });

  test("4.1-4.5: Print iframe HTML renders headings, bold emphasis, consequence glyphs, and distinct deferred glyph with ` (deferred)`", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.print = () => {};
      if (window.Window && window.Window.prototype) {
        window.Window.prototype.print = () => {};
      }
    });

    await seedApp(page, { seed: "empty" });
    await setEditorText(
      page,
      [
        "# Title",
        "=====",
        "v Sub",
        "---",
        "# - bulleted",
        "# ! urgent",
        "! - urgent",
        "=> # standalone",
        "=> v sent",
        "=> x dropped",
        "=> > later",
        "> deferred task",
      ].join("\n"),
    );

    await page.locator("[data-more-trigger]").click();
    await page.locator(".more-actions-item", { hasText: "Print…" }).click();
    const iframe = page.locator("iframe");
    await expect(iframe).toBeAttached();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector("iframe");
          return el?.contentDocument?.body?.innerText ?? "";
        }),
      )
      .toContain("deferred task");

    const info = await page.evaluate(() => {
      const el = document.querySelector("iframe")!;
      const doc = el.contentDocument!;
      const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(
        (h) => h.textContent?.trim() ?? "",
      );
      const progress = Array.from(doc.querySelectorAll(".glyph-progress"));
      const styles = Array.from(doc.querySelectorAll("style"))
        .map((s) => s.textContent ?? "")
        .join("\n");
      return {
        text: doc.body.innerText,
        html: doc.documentElement.innerHTML,
        headings,
        progressCount: progress.length,
        hasSvgInProgress: progress.some((p) => p.querySelector("svg") !== null),
        hasProgressCss: styles.includes("glyph-progress"),
      };
    });

    expect(info.headings).toContain("# Title");
    expect(info.headings).toContain("v Sub");
    expect(info.text).toContain("bulleted");
    expect(info.text).not.toContain("- bulleted");
    expect(info.text).toContain("urgent");
    expect(info.text).not.toContain("! urgent");
    expect(info.text).not.toContain("=> #");
    expect(info.text).not.toContain("=> v");
    expect(info.text).not.toContain("=> x");
    expect(info.text).not.toContain("=> >");
    expect(info.text).toContain("➔");
    expect(info.text).toContain("☐");
    expect(info.text).toContain("☑");
    expect(info.text).toContain("☒");
    expect(info.text).toMatch(/deferred task\s*\(deferred\)/);
    expect(info.progressCount).toBeGreaterThanOrEqual(2);
    expect(info.hasSvgInProgress || info.hasProgressCss).toBe(true);
  });
});

// ============================================================================
// Rule 5. The right-click line menu offers the line's own states
// ============================================================================
test.describe("Rule 5: right-click line menu offers the target action's own states", () => {
  test("5.1: on `Notes => # call Sam`, menu offers Done/Deferred/Won't-Do and not Open or To Discuss", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "Notes => # call Sam");

    await editor(page).locator(".cm-line").first().click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Done" })).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Deferred" })).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Won't-Do" })).toBeVisible();

    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Open" })).toHaveCount(0);
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to To Discuss" })).toHaveCount(0);

    await menu.locator(".editor-context-item", { hasText: "Set line/selection to Done" }).click();
    expect(await activeTabContent(page)).toBe("Notes => v call Sam");
  });

  test("5.2: on `v done => # next`, right-clicking `next` acts on `next` and right-clicking `done` acts on `done`", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "v done => # next");
    const menu = page.locator(".editor-context-menu");

    // Right-click on `next` (open consequence)
    await rightClickSubstring(page, 0, "next");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Done" })).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Open" })).toHaveCount(0);
    await menu.locator(".editor-context-item", { hasText: "Set line/selection to Done" }).click();
    expect(await activeTabContent(page)).toBe("v done => v next");

    // Reset and right-click on `done` (done leading action)
    await setEditorText(page, "v done => # next");
    await rightClickSubstring(page, 0, "done");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Open" })).toBeVisible();
    await expect(menu.locator(".editor-context-item", { hasText: "Set line/selection to Done" })).toHaveCount(0);
    await menu.locator(".editor-context-item", { hasText: "Set line/selection to Open" }).click();
    expect(await activeTabContent(page)).toBe("# done => # next");
  });
});

// ============================================================================
// Rule 6. Phone toolbar buttons keep the line's other markers
// ============================================================================
test.describe("Rule 6: phone toolbar buttons keep the line's other markers", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  async function tapMorePanelToken(page: Page, ariaLabel: string): Promise<void> {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.locator(".accessory-more-panel").getByRole("button", { name: ariaLabel }).click();
  }

  test("6.1: Bullet on `o agenda` toggles to `o - agenda` and back to `o agenda`", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "o agenda");
    await editor(page).click();

    await tapMorePanelToken(page, "Bullet list");
    expect(await activeTabContent(page)).toBe("o - agenda");

    await tapMorePanelToken(page, "Bullet list");
    expect(await activeTabContent(page)).toBe("o agenda");
  });

  test("6.2: Bullet on `# - task` removes the bullet and keeps `# `", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# - task");
    await editor(page).click();

    await tapMorePanelToken(page, "Bullet list");
    expect(await activeTabContent(page)).toBe("# task");
  });

  test("6.3: Emphasis on `o agenda` produces `o ! agenda`", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "o agenda");
    await editor(page).click();

    await tapMorePanelToken(page, "Emphasis");
    expect(await activeTabContent(page)).toBe("o ! agenda");
  });

  test("state buttons preserve bullet and emphasis markers", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# - task");
    await editor(page).click();
    await page.locator(".mobile-accessory-bar").getByRole("button", { name: "Completed task (check)" }).click();
    expect(await activeTabContent(page)).toBe("v - task");

    await setEditorText(page, "v ! urgent");
    await editor(page).click();
    await page.locator(".mobile-accessory-bar").getByRole("button", { name: "Open task (box)" }).click();
    expect(await activeTabContent(page)).toBe("# ! urgent");

    await setEditorText(page, "o - agenda");
    await editor(page).click();
    await page.locator(".mobile-accessory-bar").getByRole("button", { name: "Discussed topic (fisheye)" }).click();
    expect(await activeTabContent(page)).toBe(". - agenda");
  });
});

// ============================================================================
// Rule 7. A tab is two columns everywhere
// ============================================================================
test.describe("Rule 7: a tab counts as two columns everywhere", () => {
  test("action tree connectors for `# parent\\n\\t# child` match `# parent\\n  # child`", async ({ page }) => {
    const measureTree = async (doc: string) => {
      await seedApp(page, { seed: "empty" });
      await setEditorText(page, doc);
      const vert = page.locator(".cm-action-tree-line.is-vertical");
      const horiz = page.locator(".cm-action-tree-line.is-horizontal");
      await expect(vert).toHaveCount(1);
      await expect(horiz).toHaveCount(1);
      const vBox = (await vert.first().boundingBox())!;
      const hBox = (await horiz.first().boundingBox())!;
      const childGlyph = (await editor(page).locator(".cm-line").nth(1).locator(".glyph-ink").boundingBox())!;
      return {
        vx: vBox.x,
        hx: hBox.x,
        hw: hBox.width,
        childX: childGlyph.x,
      };
    };

    const withSpaces = await measureTree("# parent\n  # child");
    const withTab = await measureTree("# parent\n\t# child");

    expect(withTab.vx).toBeCloseTo(withSpaces.vx, 1);
    expect(withTab.hx).toBeCloseTo(withSpaces.hx, 1);
    expect(withTab.hw).toBeCloseTo(withSpaces.hw, 1);
    expect(withTab.childX).toBeCloseTo(withSpaces.childX, 1);
  });

  test("Tab / Shift+Tab column alignment treats a leading tab as two columns", async ({ page }) => {
    await seedApp(page, { seed: "empty" });

    // Tab on a numbered item under `\t- bullet` aligns to column 4 (2 for tab + 2 for `- `), matching `  - bullet`
    await setEditorText(page, "\t- bullet\n1. item");
    await editor(page).locator(".cm-line").nth(1).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("\t- bullet\n    1. item");

    // Shift+Tab outdents a tab-indented action line and tab-indented numbered list
    await setEditorText(page, "\t# child");
    await editor(page).click();
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("# child");

    await setEditorText(page, "\t1. a\n\t2. b");
    await editor(page).locator(".cm-line").nth(0).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1. a\n2. b");
  });

  test("wrapping indent for `\\t# ` and `\\t` matches `  # ` and `  `", async ({ page }) => {
    await seedApp(page, { seed: { notes: {}, wordWrap: true } });

    await setEditorText(page, `\t# ${LONG_LINE}\n  # ${LONG_LINE}\n\t${LONG_LINE}\n  ${LONG_LINE}`);
    const indents = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".cm-line")).map((line) => ({
        hasClass: line.classList.contains("cm-line-wrap-indent"),
        indentVar: line.style.getPropertyValue("--line-indent"),
      })),
    );

    expect(indents).toHaveLength(4);
    expect(indents[0]).toEqual({ hasClass: true, indentVar: "4ch" });
    expect(indents[1]).toEqual({ hasClass: true, indentVar: "4ch" });
    expect(indents[2]).toEqual({ hasClass: true, indentVar: "2ch" });
    expect(indents[3]).toEqual({ hasClass: true, indentVar: "2ch" });
  });
});
