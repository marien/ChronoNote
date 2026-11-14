import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent } from "./helpers";

async function caretAtLineStart(page: Page, line: number): Promise<void> {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
}

async function caretAtEndOfLine(page: Page, line: number): Promise<void> {
  await caretAtLineStart(page, line);
  await page.keyboard.press("End");
}

async function caretAtLineOffset(page: Page, line: number, offset: number): Promise<void> {
  await caretAtLineStart(page, line);
  for (let i = 0; i < offset; i++) await page.keyboard.press("ArrowRight");
}

test.describe("D4 independent E2E: list keys behind a state symbol", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("Tab indents '# 2. book hotel' under '# 1. plan trip', renumbers '# 3. pack', and Ctrl+Z undoes", async ({
    page,
  }) => {
    await setEditorText(page, "# 1. plan trip\n# 2. book hotel\n# 3. pack");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("# 1. plan trip\n     # 1. book hotel\n# 2. pack");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("# 1. plan trip\n# 2. book hotel\n# 3. pack");
  });

  test("Enter at the end of 'v 2. x' continues with '# 3. ' and Ctrl+Z undoes in one step", async ({ page }) => {
    await setEditorText(page, "# 1. a\nv 2. x");
    await caretAtEndOfLine(page, 1);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("# 1. a\nv 2. x\n# 3. ");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("# 1. a\nv 2. x");
  });

  test("Backspace at text start of '# 2. b' aligns under '# 1. a', second Backspace keeps lead, and Ctrl+Z undoes each", async ({
    page,
  }) => {
    await setEditorText(page, "# 1. a\n# 2. b\n# 3. c");
    await caretAtLineOffset(page, 1, 5); // "# 2. |b"
    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("# 1. a\n#    b\n# 2. c");

    await page.keyboard.press("Backspace");
    expect(await activeTabContent(page)).toBe("# 1. a\n# b\n# 2. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("# 1. a\n#    b\n# 2. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("# 1. a\n# 2. b\n# 3. c");
  });

  test("Ctrl+1 and right-click line menu on '1. task\\n2. next' keep the item in the list without renumbering", async ({
    page,
  }) => {
    await setEditorText(page, "1. task\n2. next");
    await caretAtEndOfLine(page, 0);
    await page.keyboard.press("ControlOrMeta+1");
    expect(await activeTabContent(page)).toBe("# 1. task\n2. next");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. task\n2. next");

    await editor(page).locator(".cm-line").first().click({ button: "right" });
    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();
    await menu.locator(".editor-context-item", { hasText: "Set line/selection to Open" }).click();
    await expect(menu).toBeHidden();
    expect(await activeTabContent(page)).toBe("# 1. task\n2. next");
  });
});

test.describe("D4 independent E2E: phone toolbar Indent and Dedent buttons", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test("tapping Indent on '# 2. book hotel' indents under '# 1. plan trip' and Dedent brings it back", async ({
    page,
  }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# 1. plan trip\n# 2. book hotel");
    await expect(page.locator(".mobile-accessory-bar")).toBeVisible();

    await caretAtEndOfLine(page, 1);
    await page.getByRole("button", { name: "Indent (2 spaces)" }).click();
    expect(await activeTabContent(page)).toBe("# 1. plan trip\n     # 1. book hotel");

    await page.getByRole("button", { name: "Dedent (2 spaces)" }).click();
    expect(await activeTabContent(page)).toBe("# 1. plan trip\n# 2. book hotel");
  });
});
