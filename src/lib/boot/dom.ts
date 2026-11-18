import type { ColorMode, ThemeMode } from "../types";

export function applyColorModeToDom(mode: ColorMode) {
  document.documentElement.dataset.colorMode = mode;
}

/** #48: `system` means "no override" — `app.css`'s `prefers-color-scheme`
 * query alone decides, exactly like before this setting existed — so the
 * `data-theme` attribute is removed rather than set to `"system"` (no CSS
 * selector matches that value; the attribute's mere *absence* is what the
 * bare `:root` / media-query blocks are written against). */
const THEME_CHROME_COLORS: Record<"dark" | "light", string> = {
  dark: "#252526",
  light: "#f3f3f3",
};

export function applyThemeModeToDom(mode: ThemeMode) {
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;

  // §D7: update web app theme-color meta tags if present (desktop has none)
  if (typeof document !== "undefined") {
    const darkMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
    );
    const lightMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
    );
    if (darkMeta && lightMeta) {
      if (mode === "system") {
        darkMeta.content = THEME_CHROME_COLORS.dark;
        lightMeta.content = THEME_CHROME_COLORS.light;
      } else {
        const color = THEME_CHROME_COLORS[mode];
        darkMeta.content = color;
        lightMeta.content = color;
      }
    }
  }
}

export function applyPureBlackToDom(pureBlack: boolean) {
  if (pureBlack) document.documentElement.setAttribute("data-pure-black", "");
  else document.documentElement.removeAttribute("data-pure-black");
}

/** i18n roadmap: reflects the *resolved* display language (never
 * `"system"` itself — `./i18n`'s `locale` store already resolved that)
 * onto `<html lang>`, a real accessibility/correctness fix (screen
 * readers and the browser's own spell-checker pick the right language)
 * that falls out of having a resolved locale at all. Called once at
 * boot and again on every `setLanguageMode`, mirroring
 * `applyThemeModeToDom`'s call sites below. */
export function applyLocaleToDom(resolvedLocale: string) {
  document.documentElement.lang = resolvedLocale;
}
