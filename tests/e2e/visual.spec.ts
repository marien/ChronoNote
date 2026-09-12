import { test, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, modalCard, MODAL_LABELS, datePicker } from "./helpers";

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
  test("editor with the full token vocabulary (grayscale + color + legacy)", async ({ page }) => {
    // Explicit — the app's own default is "color" now, but this gallery
    // wants a genuine grayscale shot first, not two color ones in a row.
    await seedApp(page, { seed: { notes: {}, colorMode: "grayscale" } });
    await setEditorText(page, TOKEN_SAMPLER);
    await editor(page).click();
    await shot(page, "editor-tokens-grayscale");

    const settings = () => modalCard(page, MODAL_LABELS.settings);
    await page.keyboard.press("ControlOrMeta+Comma");
    await settings().getByRole("radio", { name: "Color", exact: true }).click();
    await page.keyboard.press("Escape");
    await shot(page, "editor-tokens-color");

    // §111: the restored pre-0.6 palette (red open / amber deferred / green done).
    await page.keyboard.press("ControlOrMeta+Comma");
    await settings().getByRole("radio", { name: "Legacy", exact: true }).click();
    await page.keyboard.press("Escape");
    await shot(page, "editor-tokens-legacy");
  });

  test("every modal, opened over a populated workspace", async ({ page }) => {
    await seedApp(page, { seed: "busy-week" });
    const shots: Array<[string, string]> = [
      ["ControlOrMeta+o", "date"],
      ["ControlOrMeta+Shift+a", "actions"],
      ["ControlOrMeta+Shift+f", "search"],
      ["ControlOrMeta+Shift+i", "sectionImport"],
      ["ControlOrMeta+Comma", "settings"],
      ["ControlOrMeta+Slash", "shortcuts"],
      ["ControlOrMeta+Shift+Comma", "about"],
    ];
    for (const [combo, key] of shots) {
      await editor(page).click();
      await page.keyboard.press(combo);
      const overlay =
        key === "date" ? datePicker(page) : modalCard(page, MODAL_LABELS[key as keyof typeof MODAL_LABELS]);
      await overlay.waitFor();
      await shot(page, `modal-${key}`);
      await page.keyboard.press("Escape");
    }
  });

  test("safety modal", async ({ page }) => {
    await seedApp(page, { seed: "empty" });
    await setEditorText(page, "# an unresolved action");
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+w");
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
