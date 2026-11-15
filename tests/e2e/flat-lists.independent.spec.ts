import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, activeTabContent } from "./helpers";

async function caretAtEndOfLine(page: Page, line: number): Promise<void> {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
}

test.describe("flat numbered outlines: independent E2E", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
  });

  test("typing 1.1. b by hand under 1. a then pressing Enter continues to 1.2. and Ctrl+Z undoes", async ({
    page,
  }) => {
    await setEditorText(page, "1. a\n");
    await page.keyboard.press("ControlOrMeta+End");
    await editor(page).pressSequentially("1.1. b");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b");

    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n1.2. ");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b");
  });

  test("Tab deepens a flat item by number at the same indent and Ctrl+Z undoes", async ({ page }) => {
    await setEditorText(page, "1. a\n1.1. b\n1.2. c");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Tab");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n1.1.1. c");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n1.2. c");
  });

  test("Shift+Tab promotes a flat sub-item and turns following siblings into its sub-items", async ({
    page,
  }) => {
    await setEditorText(page, "1. a\n1.1. b\n1.2. c\n1.3. d\n2. e");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Shift+Tab");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n2. c\n2.1. d\n3. e");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n1.2. c\n1.3. d\n2. e");
  });

  test("Enter on an empty flat sub-item promotes to the parent group's next item", async ({ page }) => {
    await setEditorText(page, "1. a\n1.1. b\n1.2. ");
    await caretAtEndOfLine(page, 2);
    await page.keyboard.press("Enter");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n2. ");

    await page.keyboard.press("ControlOrMeta+z");
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n1.2. ");
  });
});

test.describe("flat numbered outlines: phone toolbar Indent and Dedent", () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test("tapping Indent on 1.2. c deepens it to 1.1.1. c and Dedent restores 1.2. c", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "1. a\n1.1. b\n1.2. c");
    await expect(page.locator(".mobile-accessory-bar")).toBeVisible();

    await caretAtEndOfLine(page, 2);
    await page.getByRole("button", { name: "Indent (2 spaces)" }).click();
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n1.1.1. c");

    await page.getByRole("button", { name: "Dedent (2 spaces)" }).click();
    expect(await activeTabContent(page)).toBe("1. a\n1.1. b\n1.2. c");
  });
});
