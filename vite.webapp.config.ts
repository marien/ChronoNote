import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Same rationale as vite.demo.config.ts's identical read: this file only
// ever runs in a real Node process (Vite's own config loader), so a plain
// JSON read has no ESM-import-attribute restriction to work around here.
const appVersion = JSON.parse(readFileSync("./package.json", "utf-8")).version as string;

/** `public/sw.js` is copied verbatim by Vite (no `define` substitution runs
 * over static `public/` files, only over processed JS/TS modules) — so its
 * own `__WEBAPP_VERSION__` cache-name placeholder needs a manual patch after
 * the copy. Ties the service worker's cache generation to the app version
 * (see sw.js's own comment for why a hand-bumped literal isn't enough).
 * Reads the resolved `root`/`build.outDir` from `configResolved` rather than
 * a hand-typed relative path, so this works regardless of the cwd `vite
 * build` was invoked from. */
function injectSwVersion(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "inject-sw-version",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const path = resolve(config.root, config.build.outDir, "sw.js");
      writeFileSync(path, readFileSync(path, "utf-8").replaceAll("__WEBAPP_VERSION__", appVersion));
    },
  };
}

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
  plugins: [svelte(), injectSwVersion()],
  define: {
    __WEBAPP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: "../website/webapp",
    emptyOutDir: true,
    target: "es2022",
  },
});
