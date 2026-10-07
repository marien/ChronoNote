import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, modalCard, MODAL_LABELS, datePicker } from "./helpers";

/** CSS parity check for refactors that must not change how anything looks (the app.css split,
 * moving rules into components). Opt-in: skipped unless CSS_PARITY=1, so normal runs and CI never
 * see it. Take a baseline on the commit before the change, then compare after:
 *
 *   CSS_PARITY=1 npx playwright test css-parity --workers=1 --update-snapshots   (baseline)
 *   CSS_PARITY=1 npx playwright test css-parity --workers=1                      (compare)
 *
 * The baseline images live in `css-parity.spec.ts-snapshots/` (git-ignored): they are only valid on
 * the machine and fonts they were taken with, which is why this is not an always-on assertion. */
test.skip(!process.env.CSS_PARITY, "opt-in: set CSS_PARITY=1");
test.describe.configure({ mode: "serial" });

const SAMPLER = [
  "Sprint review",
  "=============",
  "# open action, unresolved",
  "v completed action",
  "x won't do this one",
  "> forwarded to another day",
  "  # indented open action",
  "o an agenda topic",
  ". a discussed topic => # follow up",
  ", a skipped topic",
  "- a bullet",
  "  - nested bullet",
  "1. a numbered item",
  "=> a plain follow-up note",
  "=> @dana a delegated action",
  "# (topic) tagged action for (@sam, @kim)",
  "Talked to Sam => # a consequence action",
  "! an emphasis / remember line",
  "plain prose with no token at all, long enough to show how the line runs on in the editor",
].join("\n");

async function same(page: Page, name: string) {
  await expect(page).toHaveScreenshot(`${name}.png`, { animations: "disabled", caret: "hide", maxDiffPixels: 0 });
}

for (const theme of ["dark", "light"] as const) {
  for (const colorMode of ["color", "grayscale", "legacy"] as const) {
    test(`editor tokens: ${theme} / ${colorMode}`, async ({ page }) => {
      await seedApp(page, { seed: { notes: {}, colorMode, themeMode: theme } });
      await setEditorText(page, SAMPLER);
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await same(page, `editor-${theme}-${colorMode}`);
    });
  }
}

test("every modal over a populated workspace", async ({ page }) => {
  await seedApp(page, { seed: "busy-week" });
  const shots: Array<[string, string]> = [
    ["ControlOrMeta+o", "date"],
    ["ControlOrMeta+Shift+a", "actions"],
    ["ControlOrMeta+Shift+f", "search"],
    ["ControlOrMeta+Shift+h", "history"],
    ["ControlOrMeta+Comma", "settings"],
    ["ControlOrMeta+Slash", "shortcuts"],
    ["ControlOrMeta+Shift+Comma", "about"],
    ["ControlOrMeta+k", "commandPalette"],
  ];
  for (const [combo, key] of shots) {
    await editor(page).click();
    await page.keyboard.press(combo);
    const overlay =
      key === "date" ? datePicker(page) : modalCard(page, MODAL_LABELS[key as keyof typeof MODAL_LABELS]);
    await overlay.waitFor().catch(() => {}); // a drawer that needs a section (history) may show a toast instead
    await page.waitForTimeout(300);
    await same(page, `modal-${key}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
});

test("settings tabs", async ({ page }) => {
  await seedApp(page, { seed: "busy-week" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Comma");
  const tabs = modalCard(page, MODAL_LABELS.settings).getByRole("tab");
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(150);
    await same(page, `settings-tab-${i}`);
  }
});

test("find bar and narrow window", async ({ page }) => {
  // Deterministic scene: a fixed note, caret at the top, the query filled only once the input exists.
  await seedApp(page, { seed: { notes: {} } });
  await setEditorText(page, SAMPLER);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+f");
  const input = page.locator(".find-bar .find-input");
  await input.waitFor();
  await input.fill("action");
  await expect(page.locator(".find-bar")).not.toContainText(/no results/i);
  await page.waitForTimeout(300);
  await same(page, "find-bar");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 700, height: 600 });
  await page.waitForTimeout(400);
  await same(page, "narrow-window");
});

test("phone layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedApp(page, { seed: "busy-week" });
  await page.waitForTimeout(400);
  await same(page, "phone");
});
