/** Shared helpers for the ChronoNote E2E specs.
 *
 * `seedApp()` is the entry point every test uses: it pins the wall clock
 * to the dataset's reference date, injects a mock-backend seed, navigates
 * to `/?mock`, and waits for the app to finish booting. From there tests
 * interact through the real UI and assert against either the DOM or the
 * mock backend (`readMock()`).
 */
import { type Page, type Locator, expect } from "@playwright/test";
import type { MockSeed } from "../../src/lib/testing/mockBackend";
import { REFERENCE_TODAY, scenario, type ScenarioName } from "../../src/lib/testing/scenarios";

/** 09:00 on the dataset's reference day — pinned so `todayISO()` and the
 * date-picker grammar ("today", "-2", …) are stable. `setFixedTime` keeps
 * real timers running (unlike `clock.install`), so the app's debounced
 * autosave / rAF layout code is unaffected. */
export const REFERENCE_INSTANT = new Date(`${REFERENCE_TODAY}T09:00:00`);

export interface SeedApp {
  /** A named scenario, or a hand-built seed object. */
  seed?: ScenarioName | MockSeed;
  /** Override the pinned instant (rarely needed). */
  now?: Date;
  /** Skip the wait for the app to finish booting — for specs that
   * deliberately break boot (e.g. a seeded `throwOnCommands`). */
  expectBootFailure?: boolean;
}

export async function seedApp(page: Page, opts: SeedApp = {}): Promise<void> {
  const seed: MockSeed =
    typeof opts.seed === "string" ? scenario(opts.seed) : (opts.seed ?? scenario("empty"));

  // #23: session restore forces today's tab active on the *first* launch of
  // a day (`lastOpenedDate` older than today, or absent). Specs that seed a
  // session expect the ordinary "later launch" behaviour — their saved
  // active tab restored — so stamp today's date on any seeded session that
  // doesn't set one. A spec exercising the first-open-of-day path passes an
  // explicit older `lastOpenedDate` (or seeds no session at all).
  const stampToday = (s: MockSeed["session"]) =>
    s && s.lastOpenedDate == null ? { ...s, lastOpenedDate: REFERENCE_TODAY } : s;
  seed.session = stampToday(seed.session);
  if (seed.sessions) {
    seed.sessions = Object.fromEntries(
      Object.entries(seed.sessions).map(([path, s]) => [path, stampToday(s)!]),
    );
  }

  await page.clock.setFixedTime(opts.now ?? REFERENCE_INSTANT);
  await page.addInitScript((s) => {
    (window as unknown as { __CHRONO_SEED__: unknown }).__CHRONO_SEED__ = s;
  }, seed);

  await page.goto("/?mock");
  if (opts.expectBootFailure) return;
  // `#top-bar` only renders once `controller.initApp()` resolves.
  await expect(page.locator("#top-bar")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".cm-editor")).toBeVisible();
}

// --- editor -----------------------------------------------------------

export function editor(page: Page): Locator {
  return page.locator(".cm-content");
}

/** Click into the editor, move to the end, and type character-by-
 * character (real key events — needed when a test is about the editor's
 * own key handling). NOTE: pressing Enter after a `- `/`* ` line triggers
 * the app's bullet-continuation; use `setEditorText` for plain multi-line
 * "arrange" content instead. */
export async function typeInEditor(page: Page, text: string, opts: { clear?: boolean } = {}): Promise<void> {
  const content = editor(page);
  await content.click();
  if (opts.clear) {
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
  } else {
    await page.keyboard.press("ControlOrMeta+End");
  }
  await content.pressSequentially(text);
}

/** Replace the active editor's whole document in one dispatch — bypasses
 * typing (and the editor's smart Enter handling). For test setup. */
export async function setEditorText(page: Page, text: string): Promise<void> {
  await editor(page).click();
  await page.evaluate((t) => window.__CHRONO_MOCK__!.debug!.setEditorContent(t), text);
}

/** The raw document text of the active tab, straight from app state
 * (CodeMirror's DOM shows glyphs, not the underlying `# `/`v `/… tokens). */
export async function activeTabContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const t = window.__CHRONO_MOCK__?.debug?.activeTab() as { content?: string } | null;
    return t?.content ?? "";
  });
}

// --- mock backend ----------------------------------------------------

/** Run a function in page context — by convention it reads
 * `window.__CHRONO_MOCK__`. */
export async function readMock<T>(page: Page, fn: () => T): Promise<T> {
  return page.evaluate(fn);
}

/** Latest persisted content for a note file, or `null` if never written.
 * Waits out the 400ms autosave debounce first. */
export async function lastWrittenNote(page: Page, filename: string): Promise<string | null> {
  await page.waitForTimeout(500);
  return page.evaluate((f) => window.__CHRONO_MOCK__!.lastWrite(f), filename);
}

/** All `write_note` payloads for a file, oldest first. */
export async function noteWrites(page: Page, filename: string): Promise<string[]> {
  return page.evaluate((f) => window.__CHRONO_MOCK__!.writesFor(f), filename);
}

/** Current in-memory content of a note file in the active dir. */
export async function mockNote(page: Page, filename: string): Promise<string | null> {
  return page.evaluate((f) => window.__CHRONO_MOCK__!.getNote(f), filename);
}

export async function mockFiles(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__CHRONO_MOCK__!.listFiles());
}

export function todayFilename(): string {
  return `${REFERENCE_TODAY}.txt`;
}

// --- chrome / tabs --------------------------------------------------

export function tab(page: Page, filename: string): Locator {
  // The tab label is `filename` (+ " *" for scratchpads); match on the text span.
  return page.locator("#tab-bar .tab", { hasText: filename });
}

export function activeTabLabel(page: Page): Locator {
  return page.locator("#tab-bar .tab.active span").first();
}

/** Transient status messages (§102 — formerly the floating `#toast`) now
 * surface in the status bar's centre zone. */
export function toast(page: Page): Locator {
  return page.locator("#stat-message");
}

export async function statusCounts(page: Page): Promise<{ open: number; closed: number; forwarded: number }> {
  const text = async (id: string) => (await page.locator(`#${id}`).textContent()) ?? "";
  const num = (s: string) => Number(s.replace(/\D+/g, ""));
  return {
    open: num(await text("stat-open")),
    closed: num(await text("stat-closed")),
    forwarded: num(await text("stat-forwarded")),
  };
}

// --- modals --------------------------------------------------------

export function modalCard(page: Page, label: string): Locator {
  return page.locator(`.modal-card[aria-label="${label}"]`);
}

export const MODAL_LABELS = {
  date: "Jump to date",
  actions: "Action drawer",
  history: "Section history",
  search: "Cross-tab search",
  safety: "Unresolved actions warning",
  sectionImport: "Import sections",
  settings: "Settings",
  shortcuts: "Keyboard shortcuts",
  glyphLegend: "Symbols and section formatting",
  about: "About ChronoNote",
  unsavedScratchpads: "Unsaved scratchpad content",
  conflict: "Note changed on disk",
} as const;

export type ModalKey = keyof typeof MODAL_LABELS;

/** Move the mouse to the top-left corner, away from any modal. Modal list
 * rows select on `mouseenter` (hover-to-select), and Playwright's
 * `mouse.move` dispatches `mousemove` along its whole path — so moving the
 * pointer *while a centered modal is open* drags the selection onto
 * whatever row the path last crossed. Always park BEFORE opening a modal
 * you'll drive by keyboard, never after. */
export async function parkMouse(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
}

/** Focus the app, park the mouse, then press a shortcut and wait for the
 * modal it opens. Order matters: the mouse is parked before the modal
 * exists, so opening it can't land the hover-selection on a stray row. */
export async function openViaShortcut(page: Page, combo: string, modal: ModalKey): Promise<Locator> {
  await editor(page).click();
  await parkMouse(page);
  await page.keyboard.press(combo);
  const card = modalCard(page, MODAL_LABELS[modal]);
  await expect(card).toBeVisible();
  return card;
}

/** Assert exactly which modal (if any) is open, via app state. */
export async function currentModal(page: Page): Promise<string> {
  return page.evaluate(() => window.__CHRONO_MOCK__?.debug?.modal() ?? "unknown");
}
