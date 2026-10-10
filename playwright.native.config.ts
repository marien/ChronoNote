import { defineConfig } from "@playwright/test";

/** D1 (readiness review): smoke tests against the REAL app (debug build, real Rust backend, WebView2), driven over
 * WebView2's remote-debugging port. They write the app's real settings folder (%APPDATA%\com.chrononote.app), so they
 * run on CI's fresh Windows runner only; see tests/native/smoke.spec.ts. */
export default defineConfig({
  testDir: "./tests/native",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  outputDir: "./test-results/native",
});
