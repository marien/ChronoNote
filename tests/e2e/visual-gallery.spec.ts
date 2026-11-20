import { test, expect, type Page } from "@playwright/test";
import { seedApp, editor, setEditorText, parkMouse, toast } from "./helpers";
import { REFERENCE_TODAY, scenario } from "../../src/lib/testing/scenarios";
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

const TODAY_FILE = `${REFERENCE_TODAY}.txt`;

const DUE_DATES_NOTE = [
  "Top priorities",
  "==============",
  "# send the Q3 budget review by:2026-09-04",
  "# finalize release notes by:2026-09-07",
  "# book user-testing sessions by:2026-09-10",
  "=> @Dana confirm the CI matrix by:2026-09-14",
  "v merged the test-suite branch by:2026-09-05",
  "",
  "Daily Standup",
  "=============",
  "- today: review storage refactor PR",
  "# reply to @Marco about the API shape",
].join("\n");

const ACTION_GROUPS_NOTE = [
  "Release 0.34",
  "============",
  "# ship the beta build",
  "  # write the changelog entry",
  "  v tag the release branch",
  "  # post notes to the team channel",
  "# onboard @Lena => v laptop setup => # create accounts => # intro meeting",
  "v old cleanup",
  "  v archive staging logs",
  "",
  "# standalone follow-up",
].join("\n");

const PERSON_TODAY_NOTE = [
  "Top priorities",
  "==============",
  "# ask @Dana about the release checklist",
  "=> @Dana share the updated headcount numbers",
  "Plain note mentioning Dana's review of the API shape",
  "",
  "",
  "Daily Standup",
  "=============",
  "- yesterday: merged the test-suite branch",
  "- today: prep slides for the review",
  "# book user-testing sessions",
].join("\n");

const PERSON_PAST_NOTE = [
  "Coffee rota",
  "===========",
  "=> @Dana bring oat milk for the team sync",
  "- Dana volunteered to coordinate the Q4 retro",
  "",
  "",
  "Daily Standup",
  "=============",
  "# chase the signing cert renewal",
].join("\n");

const PEEK_ON_NOW_NOTE = [
  "Standup",
  "=======",
  "o standup notes",
  "# share release status",
  "",
  "",
  "Design review",
  "=============",
  "o review new spacing tokens",
  "# update Figma frames",
  "v align modal button heights",
  "- checked 125% scaling on Windows 11",
  "- dark mode contrast passes on secondary buttons",
  "=> @Dana share the updated design tokens doc",
  "! Keep monospace alignment across all glyph lines",
  "# verify focus ring visibility in light theme",
].join("\n");

const CALENDAR_REVIEW_NOTE = [
  "Budget sync",
  "===========",
  "# send updated forecast to @Dana",
  "- discussed Q4 numbers and hiring freeze",
  "",
  "",
  "Daily Standup",
  "=============",
  "- today: review storage refactor PR",
  "# reply to @Marco about the API shape",
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
  {
    name: "marien",
    seed: { themeMode: "dark", languageMode: "nl" },
    use: { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25, reducedMotion: "reduce" },
  },
  {
    name: "light-125",
    seed: { themeMode: "light", languageMode: "en" },
    use: { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 },
  },
];

test.skip(process.env.VISUAL_GALLERY !== "1", "Only for the visual review (VISUAL_GALLERY=1)");
test.describe.configure({ timeout: 90_000 });

async function shot(page: Page, variant: string, state: string) {
  await parkMouse(page);
  await page.screenshot({ path: `${OUT}/${variant}/${state}.png`, animations: "disabled" });
}

async function busyWeek(page: Page, v: Variant, extra: Partial<MockSeed> = {}) {
  const base = scenario("busy-week");
  const mergedNotes = extra.notes ? { ...base.notes, ...extra.notes } : base.notes;
  await seedApp(page, {
    seed: { ...base, colorMode: "color", ...v.seed, ...extra, notes: mergedNotes } as MockSeed,
  });
}

/** Opens an overlay with its shortcut, captures it, closes it. A state that cannot be reached in this variant is
 * skipped (logged), not failed: the gallery is a review aid. */
/** Any overlay, found by structure rather than by its (translated) label. */
const ANY_OVERLAY =
  ".modal-card, .datepicker-pop, main.settings-page, aside.history-pane, aside.actions-pane, aside.week-review-pane, aside.person-pane";

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
      await overlay(page, v, "ControlOrMeta+Shift+A", "actions");
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

      test("peek on now", async ({ page }) => {
        await busyWeek(page, v, {
          notes: { [TODAY_FILE]: PEEK_ON_NOW_NOTE },
          agendaJson: JSON.stringify([
            { date: REFERENCE_TODAY, start: "08:30", end: "09:30", title: "Standup" },
            { date: REFERENCE_TODAY, start: "09:00", end: "10:00", title: "Design review" },
          ]),
        });
        await editor(page).locator(".cm-line", { hasText: "review new spacing tokens" }).click();
        await page.keyboard.press("ControlOrMeta+Shift+KeyP");
        try {
          await page.locator("body.peek-mode").waitFor({ timeout: 3000 });
          const chip = page.locator('#peek-bar [data-testid="peek-switch"]');
          await chip.waitFor({ timeout: 3000 });
          await chip.click();
          await page.locator("#peek-switcher").waitFor({ timeout: 3000 });
          await shot(page, v.name, "peek-on-now");
        } catch {
          console.log(`[visual-gallery] ${v.name}: peek-on-now did not open, skipped`);
        }
      });
    } else {
      test("desktop-only states skipped on phone", async () => {
        console.log(`[visual-gallery] ${v.name}: peek skipped (phone has no Peek)`);
        console.log(`[visual-gallery] ${v.name}: peek-on-now skipped (phone has no Peek)`);
      });
    }

    test("due dates and picker", async ({ page }) => {
      await busyWeek(page, v, { notes: { [TODAY_FILE]: DUE_DATES_NOTE } });
      await editor(page).locator(".cm-line").last().click();
      await expect(page.locator(".cm-due-overdue").first()).toBeVisible();
      if (!v.phone) {
        await expect(page.locator("#stat-due .stat-due-overdue")).toBeVisible();
      }
      await shot(page, v.name, "due-dates");

      await page.locator(".cm-due-later").first().click();
      await expect(page.locator(".compact-picker")).toBeVisible();
      await shot(page, v.name, "due-picker");
    });

    test("action groups", async ({ page }) => {
      await busyWeek(page, v, { notes: { [TODAY_FILE]: ACTION_GROUPS_NOTE } });
      await editor(page).locator(".cm-line").last().click();
      await expect(page.locator(".cm-action-tree-line").first()).toBeVisible();
      await shot(page, v.name, "action-groups");
    });

    test("week review, person view, and saved searches", async ({ page }) => {
      await busyWeek(page, v, {
        notes: {
          [TODAY_FILE]: PERSON_TODAY_NOTE,
          "2026-09-04.txt": PERSON_PAST_NOTE,
        },
      });

      await overlay(page, v, "ControlOrMeta+Shift+KeyK", "week-review");

      const danaToken = page.locator(".cm-line .glyph-assignee", { hasText: "@Dana" }).first();
      await expect(danaToken).toBeVisible();
      await parkMouse(page);
      await danaToken.click({ modifiers: ["ControlOrMeta"] });
      const personOverlay = page.locator('aside.person-pane, .modal-card[role="dialog"]');
      try {
        await personOverlay.first().waitFor({ timeout: 3000 });
        await expect(personOverlay.first().locator(".person-row").first()).toBeVisible();
        await shot(page, v.name, "person-view");
        await page.keyboard.press("Escape");
        await personOverlay.first().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
      } catch {
        console.log(`[visual-gallery] ${v.name}: person-view did not open, skipped`);
      }

      await editor(page).click();
      await parkMouse(page);
      await page.keyboard.press("ControlOrMeta+Shift+f");
      const searchDialog = page.locator('.modal-card[role="dialog"]').first();
      await expect(searchDialog).toBeVisible();
      const input = searchDialog.locator(".modal-input");
      await input.fill("@Dana");
      await searchDialog.locator(".modal-star-btn").click();
      await input.fill("is:open");
      await searchDialog.locator(".modal-star-btn").click();
      await expect(searchDialog.locator(".saved-searches-row .saved-search-chip").first()).toBeVisible();
      await expect(searchDialog.locator('.modal-list .modal-item[role="option"]').first()).toBeVisible();
      await shot(page, v.name, "saved-searches");
    });

    test("rename preview and copy minutes", async ({ page }) => {
      try {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      } catch {
        // Clipboard permission override may be unsupported on some contexts.
      }
      await busyWeek(page, v, {
        notes: {
          [TODAY_FILE]: PERSON_TODAY_NOTE,
          "2026-09-04.txt": PERSON_PAST_NOTE,
        },
        minutesName: "Marien",
      });

      const titleLine = editor(page).locator(".cm-line", { hasText: "Daily Standup" }).first();
      await titleLine.click({ button: "right" });
      const menu = page.locator(".editor-context-menu");
      await expect(menu).toBeVisible();
      await menu.locator(".editor-context-item").nth(1).click();

      const renameDialog = page.locator(".rename-modal-card");
      await expect(renameDialog).toBeVisible();
      await renameDialog.locator(".rename-input").nth(1).fill("Morning Standup");
      await expect(renameDialog.locator(".rename-row").first()).toBeVisible();
      await shot(page, v.name, "rename-preview");
      await page.keyboard.press("Escape");
      await expect(renameDialog).toBeHidden();

      await titleLine.click({ button: "right" });
      await expect(menu).toBeVisible();
      await menu.locator(".editor-context-item").nth(2).click();
      await expect(toast(page)).toBeVisible();
      await shot(page, v.name, "copy-minutes");
    });

    test("inline suggestions", async ({ page }) => {
      if (v.phone) {
        console.log(`[visual-gallery] ${v.name}: suggestions-name skipped (inline suggestions are disabled on phone)`);
        console.log(`[visual-gallery] ${v.name}: suggestions-title skipped (inline suggestions are disabled on phone)`);
        return;
      }
      await busyWeek(page, v, {
        calendarSyncEnabled: true,
        calendarAutoAdd: false,
        notes: {
          [TODAY_FILE]: `${PERSON_TODAY_NOTE}\n# ask `,
          "2026-09-04.txt": PERSON_PAST_NOTE,
        },
        agendaJson: JSON.stringify([
          {
            date: REFERENCE_TODAY,
            start: "09:00",
            end: "09:30",
            title: "Design review",
            attendees: ["Marien de Gelder", "Dana Smith", "Ben Jones"],
          },
        ]),
      });

      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await editor(page).pressSequentially("@D");
      const listbox = page.locator('[role="listbox"].cn-suggest');
      await expect(listbox).toBeVisible();
      await shot(page, v.name, "suggestions-name");
      await page.keyboard.press("Escape");
      await expect(listbox).toBeHidden();

      await setEditorText(page, `${PERSON_TODAY_NOTE}\n\n\n\n==========`);
      await editor(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("ArrowUp");
      await editor(page).pressSequentially("D");
      await expect(listbox).toBeVisible();
      await shot(page, v.name, "suggestions-title");
    });

    test("calendar review", async ({ page }) => {
      await busyWeek(page, v, {
        calendarSyncEnabled: true,
        calendarAutoAdd: false,
        notes: { [TODAY_FILE]: CALENDAR_REVIEW_NOTE },
        agendaJson: JSON.stringify([
          { date: REFERENCE_TODAY, start: "09:00", end: "09:30", title: "Daily Standup" },
          { date: REFERENCE_TODAY, start: "10:00", end: "10:30", title: "Confirmed: Design review" },
          { date: REFERENCE_TODAY, start: "11:00", end: "11:30", title: "Canceled: Budget sync" },
        ]),
      });

      await editor(page).click();
      await parkMouse(page);
      await page.keyboard.press("ControlOrMeta+Shift+KeyC");
      const dialog = page.locator('.modal-card[role="dialog"]').first();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".sync-review-removal").first()).toBeVisible();
      await shot(page, v.name, "calendar-review");
    });

    test("docked actions widths", async ({ page }) => {
      if (v.phone) {
        console.log(`[visual-gallery] ${v.name}: actions-docked-narrow skipped (no docked panes on phone)`);
        console.log(`[visual-gallery] ${v.name}: actions-docked-wide skipped (no docked panes on phone)`);
        return;
      }

      await busyWeek(page, v, { actionsPaneShare: 0.1 });
      await editor(page).locator(".cm-line").first().click();
      await parkMouse(page);
      await page.keyboard.press("ControlOrMeta+Shift+A");
      const narrowPane = page.locator("aside.actions-pane");
      await expect(narrowPane).toBeVisible();
      await expect(narrowPane.locator(".actions-header-row-2.is-narrow")).toBeVisible();
      await shot(page, v.name, "actions-docked-narrow");

      await busyWeek(page, v, { actionsPaneShare: 0.45 });
      await editor(page).locator(".cm-line").first().click();
      await parkMouse(page);
      await page.keyboard.press("ControlOrMeta+Shift+A");
      const widePane = page.locator("aside.actions-pane");
      await expect(widePane).toBeVisible();
      await expect(widePane.locator(".actions-header-row-2:not(.is-narrow)")).toBeVisible();
      await shot(page, v.name, "actions-docked-wide");
    });

    test("earlier versions", async ({ page }) => {
      if (v.phone) {
        console.log(`[visual-gallery] ${v.name}: earlier-versions skipped (no tab context menu on phone)`);
        return;
      }
      await busyWeek(page, v, {
        notes: { [TODAY_FILE]: PERSON_TODAY_NOTE },
        versions: {
          [TODAY_FILE]: [
            {
              name: "2026-09-07_08-15-00",
              savedMs: Date.parse("2026-09-07T08:15:00"),
              sizeBytes: 98,
              content: "Top priorities\n==============\n# ask @Dana about the old checklist\nPlain note mentioning Dana\n",
            },
            {
              name: "2026-09-07_07-40-00",
              savedMs: Date.parse("2026-09-07T07:40:00"),
              sizeBytes: 52,
              content: "Top priorities\n==============\n# draft checklist\n",
            },
          ],
        },
      });

      await page.locator("#tab-bar .tab.active").click({ button: "right" });
      const menu = page.locator(".tab-context-menu");
      await expect(menu).toBeVisible();
      await menu.locator(".tab-context-item").nth(6).click();

      const modal = page.locator('.modal-card[role="dialog"]').first();
      await expect(modal).toBeVisible();
      await expect(modal.locator('[data-testid="version-diff-left"]')).toBeVisible();
      await shot(page, v.name, "earlier-versions");
    });

    test("conflict", async ({ page }) => {
      await busyWeek(page, v, { notes: { [TODAY_FILE]: PERSON_TODAY_NOTE } });
      await editor(page).click();
      await page.evaluate(() => {
        window.__CHRONO_MOCK__!.debug!.setEditorContent("Top priorities\n==============\n# my unsaved local edit\n");
        window.__CHRONO_MOCK__!.setNote("2026-09-07.txt", "Top priorities\n==============\n# external edit from another device\n");
      });
      await page.evaluate(() => window.__CHRONO_MOCK__!.debug!.checkDrift());
      const dialog = page.locator(".modal-card.dialog-card").first();
      await expect(dialog).toBeVisible();
      await shot(page, v.name, "conflict");
    });

    test("settings panels", async ({ page }) => {
      await busyWeek(page, v);
      await editor(page).click();
      await parkMouse(page);
      await page.keyboard.press("ControlOrMeta+Comma");
      const container = page.locator("main.settings-page, .settings-modal-card").first();
      await expect(container).toBeVisible();

      const tabs = container.locator('[role="tab"]');
      await tabs.nth(0).click();
      await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
      await shot(page, v.name, "settings-appearance");

      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
      await shot(page, v.name, "settings-notes-sync");
    });
  });
}
