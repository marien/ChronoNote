import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [svelte()],
  clearScreen: false,
  // §458: Tauri sets TAURI_ENV_DEBUG for the Vite it starts for `tauri dev` and `tauri build --debug`.
  define: { __TAURI_DEBUG__: JSON.stringify(process.env.TAURI_ENV_DEBUG === "true") },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  // Plain TS tests run in `node` by default; the handful of files that
  // touch the DOM opt into `jsdom` via `// @vitest-environment jsdom`.
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
