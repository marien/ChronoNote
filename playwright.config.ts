import { defineConfig, devices } from "@playwright/test";

/** ChronoNote UI/UX end-to-end tests.
 *
 * These drive the real Svelte frontend in headless Chromium against the
 * in-memory mock Tauri backend (`src/lib/testing/`). No Rust build, no
 * native window — fast and deterministic. See `tests/e2e/README.md`.
 *
 * The Rust storage layer and the pure TS logic are covered separately by
 * `cargo test` and the Vitest suite (`*.test.ts`); this config is only
 * for the browser-level behaviour those can't reach. */
/** Specs that exercise layout, tabs, menus and settings: the ones the environment projects re-run. */
const LAYOUT_SPECS = [
  "tab-switch-width", "tab-archetypes", "titlebar", "merged-titlebar", "topbar-collapse", "editor-context-menu",
  "glyph-layout", "word-wrap", "settings", "history-pane", "actions-pane", "pane-resize", "visual-audit",
].map((name) => `**/${name}.spec.ts`);

/** Specs that check colours or read screenshot pixels against a dark background: meaningless in a contrast theme, where
 * Windows picks the colours. */
const COLOUR_SPECS = ["settings", "tab-archetypes", "glyph-layout"].map((name) => `**/${name}.spec.ts`);
const PERF_SPEC = "**/perf.spec.ts";

// German (longer labels) is not a project: specs assert English text, and visual-audit already checks every language.
const ENV_PROJECTS = [
  { name: "reduced-motion", use: { ...devices["Desktop Chrome"], contextOptions: { reducedMotion: "reduce" as const } }, testIgnore: PERF_SPEC },
  { name: "scale-150", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1.5 }, testIgnore: PERF_SPEC },
  {
    name: "forced-colors",
    use: { ...devices["Desktop Chrome"], contextOptions: { forcedColors: "active" as const } },
    testIgnore: [...COLOUR_SPECS, PERF_SPEC],
  },
].map((p) => ({ ...p, testMatch: LAYOUT_SPECS }));

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  // Each spec seeds its own dataset and asserts on it — safe in parallel.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  outputDir: "./test-results/e2e",

  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // The app targets a 1100x720 Tauri window (tauri.conf.json).
    viewport: { width: 1100, height: 720 },
    // i18n roadmap: without this, Chromium's reported `navigator.language`
    // (and therefore which language the app's UI renders in) follows the
    // *host OS's* locale — meaning the exact same spec could render
    // English on a CI runner and Dutch on a contributor's own machine.
    // Pinned so the suite is deterministic regardless of where it runs;
    // `i18n-locales.spec.ts` explicitly overrides this per-test to
    // exercise the other two languages.
    locale: "en-US",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: PERF_SPEC,
    },
    // D4: timing budgets mean nothing while other tests load the machine, so the perf project only exists when asked
    // for: `PERF=1 npx playwright test --project=perf --workers=1` (CI does that on pushes to main).
    ...(process.env.PERF === "1"
      ? [{ name: "perf", use: { ...devices["Desktop Chrome"] }, testMatch: PERF_SPEC }]
      : []),
    // D2 (readiness review): the v0.30 follow-up bugs only showed under settings the default run never uses (Windows
    // "Animation effects" off, 125-150% scaling, a contrast theme). These projects re-run the specs that touch layout,
    // tabs and menus under each one. On by default; `E2E_MATRIX=0` runs the default project only (CI does that for PRs).
    ...(process.env.E2E_MATRIX === "0" ? [] : ENV_PROJECTS),
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
