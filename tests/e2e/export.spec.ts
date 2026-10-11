import { test, expect } from "@playwright/test";
import { seedApp, setEditorText, editor } from "./helpers";

test.describe("export and print (proposals G1 and G2)", () => {
  test("open Export from More menu, Copy as Markdown puts - [ ] lines on clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# First task\n# Second task\n");

    // Open More menu
    await page.locator("[data-more-trigger]").click();
    const morePop = page.locator(".more-actions-pop");
    await expect(morePop).toBeVisible();

    // Click Export…
    await morePop.locator(".more-actions-item", { hasText: "Export…" }).click();
    await expect(morePop).toBeHidden();

    // Export modal is visible
    const modal = page.locator(".export-modal");
    await expect(modal).toBeVisible();

    // Click "Copy as Markdown"
    await modal.locator("button", { hasText: "Copy as Markdown" }).click();
    await expect(modal).toBeHidden();

    // Read clipboard
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("- [ ] First task");
    expect(clip).toContain("- [ ] Second task");
  });

  test("Print creates an iframe whose document contains the note's first line", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__printed__ = false;
      window.print = () => {
        (window as any).__printed__ = true;
      };
      if (window.Window && window.Window.prototype) {
        window.Window.prototype.print = () => {
          (window as any).__printed__ = true;
        };
      }
    });

    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "Special First Line of Note\n# An action here\n");

    // Trigger Print via More menu
    await page.locator("[data-more-trigger]").click();
    const morePop = page.locator(".more-actions-pop");
    await expect(morePop).toBeVisible();
    await morePop.locator(".more-actions-item", { hasText: "Print…" }).click();

    // An iframe is created
    const iframe = page.locator("iframe");
    await expect(iframe).toBeAttached();

    // Check iframe content contains the note's first line
    const content = await page.evaluate(() => {
      const el = document.querySelector("iframe");
      return (
        el?.contentDocument?.body?.innerText ||
        el?.contentDocument?.documentElement?.innerHTML ||
        el?.getAttribute("srcdoc") ||
        ""
      );
    });
    expect(content).toContain("Special First Line of Note");
  });

  test("editor context menu shows Copy as Markdown only with a selection", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# Selection task item\n");

    // Right-click with no selection
    const line = editor(page).locator(".cm-line").first();
    await line.click({ button: "right" });

    const menu = page.locator(".editor-context-menu");
    await expect(menu).toBeVisible();

    // Copy as Markdown should not be visible without selection
    const copyMdItem = menu.locator(".editor-context-item", { hasText: "Copy as Markdown" });
    await expect(copyMdItem).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // Now select the text
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+a");

    // Right-click on the selection
    await line.click({ button: "right" });
    await expect(menu).toBeVisible();

    // Copy as Markdown should now be visible
    await expect(copyMdItem).toBeVisible();

    // Click it and verify clipboard
    await copyMdItem.click();
    await expect(menu).toBeHidden();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("- [ ] Selection task item");
  });
});
