import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { backendKind } from "./lib/stores";

/** Entry point for the public marketing-site demo (`demo-src/index.html`,
 * built by `npm run build:demo` into `website/demo-app/`) — a separate
 * build target from the real app's `index.html`/`main.ts`, which stays
 * gated behind `import.meta.env.DEV` and is what `build-guard`
 * (`.github/workflows/test.yml`) checks never leaks `src/lib/testing/`
 * into the *real* desktop app's `dist/`. This file always boots the
 * in-memory mock backend — there is no real Tauri host to fall back to
 * here, unlike `main.ts`'s dev-only `?mock` branch — defaulting to the
 * `"demo"` scenario (`scenarios.ts`) when no `?scenario=` is given, so a
 * bare link to this page still shows something. */
backendKind.set("demo");

const params = new URLSearchParams(location.search);
if (!params.has("scenario")) params.set("scenario", "demo");

const { bootMockBackend } = await import("./lib/testing/bootMock");
bootMockBackend(params);

const app = mount(App, { target: document.getElementById("app")! });

export default app;
