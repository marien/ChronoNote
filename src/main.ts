import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { devBuild } from "./lib/stores";

// Dev-only: `?mock` (or running in a standalone browser outside Tauri)
// swaps the Tauri IPC layer for an in-memory backend so the real frontend
// runs in a plain browser (Playwright, or by hand via `npm run dev`).
// `import.meta.env.DEV` is a compile-time constant — this whole branch,
// and the dynamic import behind it, is dropped from `vite build` output.
const params = new URLSearchParams(location.search);
const mocked = import.meta.env.DEV && (params.has("mock") || !("__TAURI_INTERNALS__" in window));
if (mocked) {
  const { bootMockBackend } = await import("./lib/testing/bootMock");
  bootMockBackend(params);
}
// §458: the dev markers. Only for the real app (Playwright may reuse the Vite of `tauri dev`); `?devbuild` shows them
// under the mock for the tests, and is dropped from `vite build` output with the rest of the DEV branch.
if ((__TAURI_DEBUG__ && !mocked) || (import.meta.env.DEV && params.has("devbuild"))) devBuild.set(true);

const app = mount(App, { target: document.getElementById("app")! });

export default app;
