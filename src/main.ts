import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

// Dev-only: `?mock` swaps the Tauri IPC layer for an in-memory backend so
// the real frontend runs in a plain browser (Playwright, or by hand via
// `npm run dev`). `import.meta.env.DEV` is a compile-time constant — this
// whole branch, and the dynamic import behind it, is dropped from
// `vite build` output, so `src/lib/testing/` never ships.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) {
  const { bootMockBackend } = await import("./lib/testing/bootMock");
  bootMockBackend(new URLSearchParams(location.search));
}

const app = mount(App, { target: document.getElementById("app")! });

export default app;
