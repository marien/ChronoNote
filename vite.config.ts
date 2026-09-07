import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  // `jsdom` is only needed by the handful of tests exercising DOM-touching
  // logic (the `closeOnOutsideClick`/`focusScrollableList` actions,
  // `controller.ts`'s `applyColorModeToDom`) — everything else in the
  // suite is plain function calls against Node's own globals.
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
}));
