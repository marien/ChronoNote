import { test, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, modalCard, MODAL_LABELS } from "./helpers";

/** Captures key UI states as PNG artifacts for human review — NOT pixel-
 * diff assertions. Per CLAUDE.local.md, layout here is genuinely noisy at
 * the sub-pixel level under display scaling and needs a human eye, not a
 * brittle `toHaveScreenshot()`. Run `npm run test:e2e -- visual` then open
 * `test-results/e2e/screens/`.
 *
 * These tests never fail on appearance; they exist to make a visual
 * regression *easy to notice* in a PR by attaching before/after images. */
const SHOTS = "test-results/e2e/screens";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: "disabled" });
}

const TOKEN_SAMPLER = [
  "Sprint review — 2026-09-07",
  "=========================",
  "# open action, unresolved",
  "v completed action",
  "x won't do this one",
  "> forwarded to another day",
  "  # indented open action",
  "- a bullet",
  "  - nested bullet",
  "* star bullet",
  "=> a plain follow-up note",
  "=> @dana a delegated action",
  "Talked to Sam => # a consequence action",
  "! an emphasis / remember line",
  "plain prose with no token at all",
].join("\n");

test.describe("visual — state gallery", () => {
  test("editor with the full token vocabulary (grayscale + color)", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, TOKEN_SAMPLER);
    await editor(page).click();
    await shot(page, "editor-tokens-grayscale");

    await page.keyboard.press("Control+Comma");
    await modalCard(page, MODAL_LABELS.settings).getByRole("button", { name: "Color", exact: true }).click();
    await page.keyboard.press("Escape");
    await shot(page, "editor-tokens-color");
  });

  test("every modal, opened over a populated workspace", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    const shots: Array<[string, string]> = [
      ["Control+o", "date"],
      ["Control+Shift+a", "actions"],
      ["Control+Shift+f", "search"],
      ["Control+Shift+i", "sectionImport"],
      ["Control+Comma", "settings"],
      ["Control+Slash", "shortcuts"],
      ["Control+Shift+Slash", "glyphLegend"],
      ["Control+Shift+Comma", "about"],
    ];
    for (const [combo, key] of shots) {
      await editor(page).click();
      await page.keyboard.press(combo);
      await modalCard(page, MODAL_LABELS[key as keyof typeof MODAL_LABELS]).waitFor();
      await shot(page, `modal-${key}`);
      await page.keyboard.press("Escape");
    }
  });

  test("safety modal", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# an unresolved action");
    await editor(page).click();
    await page.keyboard.press("Control+w");
    await modalCard(page, MODAL_LABELS.safety).waitFor();
    await shot(page, "modal-safety");
  });

  test("setext underline as a rule (§81), and word wrap (§80)", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(
      page,
      [
        "Q4 Planning",
        "===========",
        "# lock the roadmap by Friday",
        "notes from the session about the priorities for next quarter",
        "",
        "",
        "Retro",
        "=====",
        "- what went well",
        "=> @dana write up the themes",
      ].join("\n"),
    );
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await shot(page, "editor-setext-rule");
  });
});
