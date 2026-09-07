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
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
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
