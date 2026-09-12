import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Read directly via fs rather than `import pkg from "./package.json"` —
// this file always runs in a real Node process (Vite's own config
// loader), so there's no ESM-import-attribute restriction to work around
// here; it's specifically a bare JSON *module* import reaching Playwright's
// separate Node-based spec loader (via scenarios.ts) that doesn't work
// (see the comment on `__DEMO_APP_VERSION__` in scenarios.ts).
const appVersion = JSON.parse(readFileSync("./package.json", "utf-8")).version as string;

/** Builds the public marketing-site demo — a separate target from the
 * real app's `vite.config.ts`/`index.html`. Entirely static output (the
 * mock backend runs client-side, no server needed), written straight
 * into `website/demo-app/` so Plesk's Git-pull deploy has nothing further
 * to build: the checked-out repo already contains the finished bundle.
 *
 * `root: "demo-src"` points Vite at a dedicated entry HTML file
 * (`demo-src/index.html`) rather than the real app's `index.html` at the
 * project root, so this build can never accidentally become the one
 * `build-guard` (`.github/workflows/test.yml`) checks — that job only
 * ever inspects the real app's `dist/`, which this config never writes
 * to. `base: "./"` keeps every asset reference relative, so the bundle
 * works regardless of which path it's ultimately served from (a local
 * folder, a subdomain root, a subpath — all identical).
 *
 * Run with `npm run build:demo`. */
export default defineConfig({
  root: "demo-src",
  base: "./",
  plugins: [svelte()],
  define: {
    __DEMO_APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: "../website/demo-app",
    emptyOutDir: true,
    // `main-demo.ts` uses top-level await; the real app's build never
    // needs to (Tauri's own webview is always modern enough that this
    // wouldn't matter there either) so this is only set here.
    target: "es2022",
  },
});
