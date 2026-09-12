import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { backendKind } from "./lib/stores";
import { installWebBackend } from "./lib/webapp/webBackend";

/** Entry point for the persisted browser web app
 * (`webapp-src/index.html`, built by `npm run build:webapp` into
 * `website/webapp/`) — the third tier in the design doc's journey,
 * between the ephemeral demo (`main-demo.ts`) and the installed desktop
 * app (`main.ts`). Installs `WebBackend` (IndexedDB) as
 * `window.__TAURI_INTERNALS__`, same shape the mock uses, so the entire
 * frontend above the command layer runs unmodified. See
 * `docs/design/webapp-roadmap.md`. */

// Set only by `vite.webapp.config.ts`'s `define`, mirroring
// `__DEMO_APP_VERSION__`'s pattern in `scenarios.ts` — reads the real
// version from `package.json` at build time. `declare`d rather than
// imported so this file has no ESM-import-attribute issue outside a real
// build (see the comment on `__DEMO_APP_VERSION__` for the underlying
// Playwright-spec-loader gotcha this pattern was chosen to avoid; this
// file specifically is never reached by that loader, but the same
// build-time-constant approach was simplest to reuse as-is).
declare const __WEBAPP_VERSION__: string;

backendKind.set("web");
installWebBackend(__WEBAPP_VERSION__);

// PWA install (design doc, "PWA / offline install") — registered here
// rather than left to a build plugin, matching this bundle's existing
// "as few dependencies as the job needs" approach. Best-effort: an
// unsupported browser or a registration failure just means no offline
// capability / install prompt, never a broken app.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.warn("[ChronoNote] service worker registration failed:", err);
  });
}

const app = mount(App, { target: document.getElementById("app")! });

export default app;
