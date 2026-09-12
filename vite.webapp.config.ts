import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Same rationale as vite.demo.config.ts's identical read: this file only
// ever runs in a real Node process (Vite's own config loader), so a plain
// JSON read has no ESM-import-attribute restriction to work around here.
const appVersion = JSON.parse(readFileSync("./package.json", "utf-8")).version as string;

/** Builds the persisted browser web app — the design doc's third tier,
 * between the ephemeral demo (`vite.demo.config.ts`) and the real desktop
 * app (`vite.config.ts`). Entirely static output (the `WebBackend`
 * persistence layer is IndexedDB, client-side — no server needed),
 * written into `website/webapp/` so Plesk's Git-pull deploy has nothing
 * further to build, same as the demo.
 *
 * `root: "webapp-src"` points Vite at its own entry HTML, isolated from
 * both the real app's `index.html` and the demo's `demo-src/index.html`
 * — this build can never become the one `build-guard`
 * (`.github/workflows/test.yml`) checks (only ever inspects the real
 * app's `dist/`, which this config never writes to). `base: "./"` keeps
 * every asset reference relative, so the bundle works wherever it's
 * served from.
 *
 * Run with `npm run build:webapp`. */
export default defineConfig({
  root: "webapp-src",
  base: "./",
  plugins: [svelte()],
  define: {
    __WEBAPP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: "../website/webapp",
    emptyOutDir: true,
    target: "es2022",
  },
});
