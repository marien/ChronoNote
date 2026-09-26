/** i18n roadmap (`docs/design/i18n-roadmap.md`) — locale resolution and
 * the reactive translate function. `languageMode` (mirrors
 * `AppConfig.languageMode`) lives in `../stores` alongside `themeMode`;
 * this module turns it into an actual resolved locale and a `t` store
 * components read from. */
import { derived } from "svelte/store";
import { languageMode } from "../stores";
import type { LanguageMode } from "../types";
import type { Dictionary, TranslationKey, TranslationParams } from "./schema";
import { en } from "./locales/en";
import { nl } from "./locales/nl";
import { de } from "./locales/de";

export type SupportedLocale = "en" | "nl" | "de";

export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "nl", "de"];

// Cast to the shared `Dictionary` call signature — each locale module's
// own inferred type keeps its literal zero-arg functions (so `satisfies
// Dictionary` there still enforces the right key set/arity), but calling
// through `dict[key](params)` below needs the uniform signature.
const DICTIONARIES: Record<SupportedLocale, Dictionary> = { en, nl, de } as Record<SupportedLocale, Dictionary>;

/** Detected once at boot from the webview's/browser's own reported
 * language — identical mechanism on desktop (WebView2/WKWebView/
 * webkit2gtk already resolve this to the OS-configured language) and
 * the web app (a real browser). No Tauri plugin or OS permission needed;
 * `tauri-plugin-os`'s `locale()` command is the documented fallback if
 * this ever proves unreliable on some platform. */
export function detectSystemLocale(): SupportedLocale {
  const candidates = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const tag of candidates) {
    const base = tag.toLowerCase().split("-")[0];
    if ((SUPPORTED_LOCALES as string[]).includes(base)) return base as SupportedLocale;
  }
  return "en";
}

const systemLocale = detectSystemLocale();

/** The actual resolved display language: the explicit override when one
 * is set, otherwise the detected system locale — exactly the same
 * "system means no override" relationship `ThemeMode`/`prefers-color-
 * scheme` already has. Falls back to `systemLocale` for *any* value that
 * isn't a real supported locale — not just the literal `"system"` — the
 * same defensive spirit as this app's `#[serde(default)]` fields: a
 * config from before `languageMode` existed (or a test fixture that
 * predates it) reports `undefined` here rather than `"system"`, and
 * that must resolve exactly the same way `"system"` itself does, not
 * crash the whole translate function. */
export const locale = derived(languageMode, ($mode: LanguageMode) =>
  ($mode as string) in DICTIONARIES ? ($mode as SupportedLocale) : systemLocale,
);

/** Reactive translate function. A component that reads `$t("some.key")`
 * in its template subscribes to `locale` through this store and
 * re-renders when the language changes — the same mechanism
 * `$themeMode`/`$colorMode` already rely on elsewhere in the app. */
export const t = derived(locale, ($locale) => {
  const dict = DICTIONARIES[$locale];
  return <K extends TranslationKey>(key: K, params?: TranslationParams[K]) => dict[key](params as never);
});
