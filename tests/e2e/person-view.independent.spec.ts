import { test, expect, type Page } from "@playwright/test";
import {
  seedApp,
  editor,
  modalCard,
  MODAL_LABELS,
  currentModal,
  activeTabLabel,
  todayFilename,
  activeTabContent,
  dateLabel,
  cursorLine,
} from "./helpers";

function daysBefore(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const todayNote = todayFilename();
const olderDate = daysBefore(dateLabel(todayNote), 2);
const olderNote = `${olderDate}.txt`;

const SEED_NOTES = {
  [todayNote]: "# ask @Dana about the key",
  [olderNote]: "# shirts => @Dana",
};

async function clickAssigneeInEditor(
  page: Page,
  assigneeText: string,
  options: { ctrl?: boolean } = {},
): Promise<void> {
  const line = page
    .locator(".cm-content .cm-line", { hasText: assigneeText.replace(/^@/, "") })
    .first();
  await expect(line).toBeVisible();

  const coords = await line.evaluate((el, target) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const segments: Array<{ node: Text; start: number; end: number }> = [];
    let full = "";
    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      const value = textNode.nodeValue ?? "";
      segments.push({ node: textNode, start: full.length, end: full.length + value.length });
      full += value;
      current = walker.nextNode();
    }

    const plain = target.replace(/^@/, "");
    let idx = full.indexOf(target);
    let hitOffset = idx >= 0 ? idx + Math.floor(target.length / 2) : -1;
    if (hitOffset < 0) {
      idx = full.indexOf(plain);
      if (idx >= 0) hitOffset = idx + Math.floor(plain.length / 2);
    }
    if (hitOffset < 0) return null;

    const seg = segments.find((s) => hitOffset >= s.start && hitOffset < s.end);
    if (!seg) return null;

    const range = document.createRange();
    const local = hitOffset - seg.start;
    range.setStart(seg.node, local);
    range.setEnd(seg.node, Math.min(local + 1, seg.node.length));
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, assigneeText);

  expect(coords).not.toBeNull();
  if (!coords) return;

  if (options.ctrl) {
    const isMac = await page.evaluate(() => /Mac/i.test(navigator.platform));
    const mod = isMac ? "Meta" : "Control";
    await page.keyboard.down(mod);
    try {
      await page.mouse.click(coords.x, coords.y);
    } finally {
      await page.keyboard.up(mod);
    }
  } else {
    await page.mouse.click(coords.x, coords.y);
  }
}

test.describe("person view (independent)", () => {
  test("1. Ctrl+click on @Dana at 1280x800 opens aside.person-pane beside the editor", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, { seed: { notes: SEED_NOTES } });

    await clickAssigneeInEditor(page, "@Dana", { ctrl: true });

    const pane = page.locator("aside.person-pane");
    await expect(pane).toBeVisible();
    await expect(pane).toContainText("Your open actions that mention Dana");
    await expect(pane).toContainText("Delegated to Dana");

    const editorBox = await page.locator(".cm-editor").boundingBox();
    const paneBox = await pane.boundingBox();
    expect(editorBox).not.toBeNull();
    expect(paneBox).not.toBeNull();
    if (editorBox && paneBox) {
      const sideBySide =
        paneBox.x >= editorBox.x + editorBox.width - 2 ||
        editorBox.x >= paneBox.x + paneBox.width - 2;
      expect(sideBySide).toBe(true);
    }
  });

  test("2. clicking the row with shirts opens the older note at that line and keeps the pane open", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, { seed: { notes: SEED_NOTES } });

    await clickAssigneeInEditor(page, "@Dana", { ctrl: true });
    const pane = page.locator("aside.person-pane");
    await expect(pane).toBeVisible();

    await pane.getByText(/shirts/).first().click();

    await expect(activeTabLabel(page)).toHaveText(dateLabel(olderNote));
    await expect.poll(() => activeTabContent(page)).toContain("# shirts => @Dana");
    await expect.poll(() => cursorLine(page)).toBe(1);
    await expect(pane).toBeVisible();
  });

  test("3. plain click on @Dana does not open the pane", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, { seed: { notes: SEED_NOTES } });

    await clickAssigneeInEditor(page, "@Dana", { ctrl: false });

    await expect(page.locator("aside.person-pane")).toBeHidden();
    expect(await currentModal(page)).toBe("none");
  });

  test("4. at 800x800 Ctrl+click on @Dana opens a dialog instead of an aside", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    await seedApp(page, { seed: { notes: SEED_NOTES } });

    await clickAssigneeInEditor(page, "@Dana", { ctrl: true });

    const dialog = page
      .locator('[role="dialog"], .modal-card')
      .filter({ hasText: "Your open actions that mention Dana" })
      .first();
    await expect(dialog).toBeVisible();
    await expect(page.locator("aside.person-pane")).toHaveCount(0);
  });

  test("5. palette @da lists @Dana under People and choosing it opens the view", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedApp(page, { seed: { notes: SEED_NOTES } });

    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+k");
    const palette = modalCard(page, MODAL_LABELS.commandPalette);
    await expect(palette).toBeVisible();

    await palette.locator(".modal-input").fill("@da");

    const peopleHeader = palette.getByText("People", { exact: true });
    await expect(peopleHeader).toBeVisible();
    const danaRow = palette.locator('.modal-item[role="option"]', { hasText: "@Dana" }).first();
    await expect(danaRow).toBeVisible();

    const headerBox = await peopleHeader.boundingBox();
    const rowBox = await danaRow.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(rowBox).not.toBeNull();
    if (headerBox && rowBox) {
      expect(rowBox.y).toBeGreaterThan(headerBox.y);
    }

    await danaRow.click();
    const pane = page.locator("aside.person-pane");
    await expect(pane).toBeVisible();
    await expect(pane).toContainText("Your open actions that mention Dana");
  });
});
