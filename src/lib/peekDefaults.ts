/** Peek mode's setting defaults and range limits. Mirrors `PeekConfig::default()` / `PeekConfig::clamped()` in
 * `storage.rs`; the mock backend, the web backend and the frontend before the config has loaded all start from
 * these, so they live in one file with no imports from the rest of the app. */
import type { PeekConfig } from "./types";

export const PEEK_MAX_LINES = 15;
export const PEEK_MIN_OPACITY = 20;

export const PEEK_DEFAULTS: PeekConfig = {
  enabled: false,
  lines: 6,
  opacity: 80,
  alwaysOnTop: true,
  header: "always",
  shortcut: "CommandOrControl+F11",
  geometry: null,
  useLinesHeight: false,
  defaultsVersion: 1,
  callShortcut: "CommandOrControl+Alt+J",
};

export function clampPeek(peek: PeekConfig): PeekConfig {
  return {
    ...peek,
    lines: Math.min(Math.max(0, Math.round(peek.lines)), PEEK_MAX_LINES),
    opacity: Math.min(Math.max(PEEK_MIN_OPACITY, Math.round(peek.opacity)), 100),
  };
}
