/** Peek mode's setting defaults and range limits. Mirrors `PeekConfig::default()` / `PeekConfig::clamped()` in
 * `storage.rs`; the mock backend, the web backend and the frontend before the config has loaded all start from
 * these, so they live in one file with no imports from the rest of the app. */
import type { PeekConfig } from "./types";

export const PEEK_MAX_LINES = 15;
export const PEEK_MIN_OPACITY = 20;
export const PEEK_MAX_FADE_SECONDS = 60;

export const PEEK_DEFAULTS: PeekConfig = {
  enabled: false,
  lines: 6,
  opacity: 80,
  opacityHover: 100,
  fadeSeconds: 5,
  alwaysOnTop: true,
  header: "always",
  shortcut: "CommandOrControl+Alt+Space",
  geometry: null,
  useLinesHeight: false,
  defaultsVersion: 2,
  callShortcut: "CommandOrControl+Alt+J",
};

export function clampPeek(peek: PeekConfig): PeekConfig {
  return {
    ...peek,
    lines: Math.min(Math.max(0, Math.round(peek.lines)), PEEK_MAX_LINES),
    opacity: Math.min(Math.max(PEEK_MIN_OPACITY, Math.round(peek.opacity)), 100),
    opacityHover: Math.min(Math.max(PEEK_MIN_OPACITY, Math.round(peek.opacityHover)), 100),
    fadeSeconds: Math.min(Math.max(0, Math.round(peek.fadeSeconds)), PEEK_MAX_FADE_SECONDS),
  };
}
