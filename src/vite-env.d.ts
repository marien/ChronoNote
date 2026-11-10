/// <reference types="svelte" />
/// <reference types="vite/client" />

/** §458: true when Tauri ran Vite for a debug build (`TAURI_ENV_DEBUG`); defined in vite.config.ts only. */
declare const __TAURI_DEBUG__: boolean;
