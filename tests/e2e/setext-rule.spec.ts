import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, parkMouse } from "./helpers";

/** §81 — a Setext underline row (`====` under a section title) renders as
 * a drawn double-rule, reverting to the literal editable `=` characters
 * whenever the row is active (cursor / selection / hover). */
const NOTE = [
  "Weekly Planning", // line 1
  "===============", // line 2 — underline
  "# renew the certificate", // line 3
  "body notes here", // line 4
  "", // line 5
  "1:1 with Dana", // line 6
  "=============", // line 7 — underline
  "- talked through the roadmap", // line 8
].join("\n");

const rules = (page: Page) => editor(page).locator(".cm-setext-rule");
const cmLine = (page: Page, n: number) => editor(page).locator(".cm-line").nth(n - 1);

test.describe("setext underline rule (§81)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, NOTE);
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await parkMouse(page);
  });

  test("both underline rows render as a rule; titles and body do not", async ({ page }) => {
    await expect(rules(page)).toHaveCount(2);
    // The rule spans only the `=` run.
    await expect(rules(page).first()).toHaveText("===============");
    // Row height is unaffected — same as a plain line.
    const heights = await page.$$eval(".cm-line", (els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10),
    );
    expect(new Set(heights).size).toBe(1);
  });

  test("cursor on the underline row reveals the literal characters", async ({ page }) => {
    await cmLine(page, 2).click();
    await parkMouse(page);
    await expect(rules(page)).toHaveCount(1); // only the other one
    await expect(cmLine(page, 2).locator(".cm-setext-rule")).toHaveCount(0);

    // Moving off re-applies it — no stuck state.
    await cmLine(page, 4).click();
    await parkMouse(page);
    await expect(rules(page)).toHaveCount(2);
  });

  test("hovering the underline row reveals the literal characters", async ({ page }) => {
    await cmLine(page, 7).hover();
    await expect(cmLine(page, 7).locator(".cm-setext-rule")).toHaveCount(0);
    await parkMouse(page);
    await expect(cmLine(page, 7).locator(".cm-setext-rule")).toHaveCount(1);
  });

  test("the underline is editable once revealed, and the edit persists", async ({ page }) => {
    await cmLine(page, 2).click();
    await page.keyboard.press("End");
    await page.keyboard.type("==="); // lengthen the underline
    await parkMouse(page);
    await cmLine(page, 4).click();

    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.getEditorContent())).toContain(
      "Weekly Planning\n==================\n",
    );
    // Still renders as a rule afterward.
    await expect(cmLine(page, 2).locator(".cm-setext-rule")).toHaveCount(1);
  });

  test("Ctrl/Cmd+Shift+S makes a section whose underline then renders as a rule", async ({ page }) => {
    await setEditorText(page, "Project kickoff");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ControlOrMeta+Shift+S");
    await parkMouse(page);

    // Underline was inserted on line 2; cursor ended up on line 3, so line 2 rules.
    await expect(cmLine(page, 2).locator(".cm-setext-rule")).toHaveCount(1);
    expect(await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.getEditorContent())).toMatch(
      /^Project kickoff\n={15}\n/,
    );
  });
});
