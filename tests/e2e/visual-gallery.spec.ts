import { test, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, parkMouse } from "./helpers";
import { scenario } from "../../src/lib/testing/scenarios";
import type { MockSeed } from "../../src/lib/testing/mockBackend";

/** The screenshot gallery for the model-based visual review (`scripts/visual-review.mjs`, §399). Like `visual.spec.ts`
 * it never fails on appearance: it only captures. It is skipped in the normal suite; the review script runs it with
 * `VISUAL_GALLERY=1` and sends the images to a model that reports clipped, overlapping, misaligned or unreadable UI.
 *
 * Each variant is one environment (theme, language, scale, phone); each state is one screen. Files land in
 * `test-results/visual/<variant>/<state>.png`. Keep state names stable: the review compares them by name with the
 * gallery of the commit before. */
// The e2e tsconfig has no Node types; Playwright runs specs in Node, where `process` exists.
declare const process: { env: Record<string, string | undefined> };
const OUT = process.env.VISUAL_OUT ?? "test-results/visual/current";

const TOKENS = [
  "Sprint review",
  "=============",
  "# open action, unresolved",
  "v completed action",
  "x won't do this one",
  "> forwarded to another day",
  "  # indented open action",
  "- a bullet",
  "  - nested bullet",
  "=> a plain follow-up note",
  "=> @dana a delegated action",
  "Talked to Sam => # a consequence action",
  "! an emphasis / remember line",
  "o agenda topic",
  ". discussed topic",
  "1. first numbered item",
  "plain prose with no token at all",
].join("\n");

interface Variant {
  name: string;
  seed: Partial<MockSeed>;
  use?: Parameters<typeof test.use>[0];
  phone?: boolean;
}

const VARIANTS: Variant[] = [
  { name: "dark", seed: { themeMode: "dark", languageMode: "en" } },
  { name: "light", seed: { themeMode: "light", languageMode: "en" } },
  { name: "german", seed: { themeMode: "dark", languageMode: "de" } },
  { name: "dark-150", seed: { themeMode: "dark", languageMode: "en" }, use: { deviceScaleFactor: 1.5 } },
  {
    name: "phone",
    seed: { themeMode: "dark", languageMode: "en" },
    use: { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true },
    phone: true,
  },
];

test.skip(process.env.VISUAL_GALLERY !== "1", "Only for the visual review (VISUAL_GALLERY=1)");
test.describe.configure({ timeout: 90_000 });

async function shot(page: Page, variant: string, state: string) {
  await parkMouse(page);
  await page.screenshot({ path: `${OUT}/${variant}/${state}.png`, animations: "disabled" });
}

async function busyWeek(page: Page, v: Variant) {
  await seedApp(page, { seed: { ...scenario("busy-week"), colorMode: "color", ...v.seed } as MockSeed });
}

/** Opens an overlay with its shortcut, captures it, closes it. A state that cannot be reached in this variant is
 * skipped (logged), not failed: the gallery is a review aid. */
/** Any overlay, found by structure rather than by its (translated) label. */
const ANY_OVERLAY = ".modal-card, .datepicker-pop, main.settings-page, aside.history-pane, aside.actions-pane";

async function overlay(page: Page, v: Variant, combo: string, key: string, keepCaret = false) {
  // Clicking the editor focuses it but also moves the caret; Section History opens on the caret's section, so it
  // places the caret itself and keeps it.
  if (!keepCaret) await editor(page).click();
  await parkMouse(page);
  await page.keyboard.press(combo);
  try {
    await page.locator(ANY_OVERLAY).first().waitFor({ timeout: 3000 });
  } catch {
    console.log(`[visual-gallery] ${v.name}: ${key} did not open, skipped`);
    return;
  }
  await shot(page, v.name, key);
  await page.keyboard.press("Escape");
  // Wait until it is gone, so the next overlay's wait cannot match this one while it closes.
  await page.locator(ANY_OVERLAY).first().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
}

for (const v of VARIANTS) {
  test.describe(`gallery: ${v.name}`, () => {
    if (v.use) test.use(v.use);

    test("editor", async ({ page }) => {
      await busyWeek(page, v);
      await shot(page, v.name, "editor-note");
      await setEditorText(page, TOKENS);
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await shot(page, v.name, "editor-tokens");
    });

    test("overlays", async ({ page }) => {
      await busyWeek(page, v);
      await overlay(page, v, "ControlOrMeta+o", "date");
      await overlay(page, v, "ControlOrMeta+Shift+a", "actions");
      await overlay(page, v, "ControlOrMeta+Shift+f", "search");
      await overlay(page, v, "ControlOrMeta+k", "commandPalette");
      await overlay(page, v, "ControlOrMeta+Comma", "settings");
      await overlay(page, v, "ControlOrMeta+Slash", "shortcuts");
      await overlay(page, v, "ControlOrMeta+Shift+Comma", "about");
    });

    test("section history", async ({ page }) => {
      await busyWeek(page, v);
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+Home");
      await overlay(page, v, "ControlOrMeta+Shift+KeyH", "history", true);
    });

    test("safety warning", async ({ page }) => {
      await seedApp(page, { seed: { ...scenario("empty"), ...v.seed } as MockSeed });
      await setEditorText(page, "# an unresolved action");
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+w");
      try {
        await page.locator(".modal-card").first().waitFor({ timeout: 3000 });
        await shot(page, v.name, "safety");
      } catch {
        console.log(`[visual-gallery] ${v.name}: safety warning did not open, skipped`);
      }
    });

    if (!v.phone) {
      test("peek", async ({ page }) => {
        await busyWeek(page, v);
        await editor(page).click();
        await page.keyboard.press("ControlOrMeta+Home");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ControlOrMeta+Shift+KeyP");
        try {
          await page.locator("body.peek-mode").waitFor({ timeout: 3000 });
          await shot(page, v.name, "peek");
        } catch {
          console.log(`[visual-gallery] ${v.name}: peek did not open, skipped`);
        }
      });
    }
  });
}
