import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  // Every component is on runes (§306-§312): legacy syntax (`$:`, `export let`, `on:`, `<slot>`) is now a
  // compile error instead of silently switching that file back to legacy mode.
  compilerOptions: {
    runes: true,
  },
  vitePlugin: {
    // Third-party components keep Svelte's own per-file detection.
    dynamicCompileOptions({ filename, compileOptions }) {
      if (filename.includes("node_modules") && compileOptions.runes) return { runes: undefined };
    },
  },
};
