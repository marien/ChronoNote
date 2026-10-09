/** Web app launch handling: phone defaults (D1) and PWA shortcuts (D7). */
import { get } from "svelte/store";
import { isMobile, backendKind } from "./stores";
import { commitDatePick } from "./tabs";
import { openActionDrawer } from "./actions";
import { openCrossTabSearch } from "./search";
import { todayISO } from "./date";
import type { AppConfig } from "./types";

export const MOBILE_DEFAULTS_KEY = "chrononote.mobileDefaults.v1";

/** Pure function deciding whether to apply mobile defaults (wrap and 16px font size)
 * on first web-app launch on a phone (D1).
 *
 * Applies only:
 * - On the web backend (backendKind === "web")
 * - On a phone (isMobile === true)
 * - If not already applied in this browser (!alreadyApplied)
 * - If the saved config still has the factory values: wordWrap === false AND fontSize === 13 (or unset).
 */
export function shouldApplyMobileDefaults(
  config: { wordWrap?: boolean; fontSize?: number } | null | undefined,
  mobile: boolean,
  backend: string,
  alreadyApplied: boolean,
): boolean {
  if (alreadyApplied) return false;
  if (backend !== "web") return false;
  if (!mobile) return false;
  if (!config) return false;
  const isFactoryWrap = config.wordWrap === false;
  const isFactoryFontSize = config.fontSize === 13 || config.fontSize === undefined;
  return isFactoryWrap && isFactoryFontSize;
}

export function readMobileDefaultsApplied(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MOBILE_DEFAULTS_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeMobileDefaultsApplied(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MOBILE_DEFAULTS_KEY, "true");
    }
  } catch {}
}

export type WebappLaunchTarget = "today" | "actions" | "search";

/** Pure parser for the `?open=` query parameter from app shortcuts (D7.2).
 * Unknown values are ignored (returns null).
 */
export function parseWebappLaunchOpen(
  query: string | URLSearchParams | null | undefined,
): WebappLaunchTarget | null {
  if (!query) return null;
  const params =
    typeof query === "string"
      ? new URLSearchParams(query.startsWith("?") ? query.slice(1) : query)
      : query;
  const val = params.get("open");
  if (val === "today" || val === "actions" || val === "search") {
    return val;
  }
  return null;
}

let webappLaunchHandled = false;

export function resetWebappLaunchHandledForTesting(): void {
  webappLaunchHandled = false;
}

/** Handles app shortcuts (?open=today, ?open=actions, ?open=search) once after the app is ready (D7.2).
 * Strips the `open` query param via history.replaceState, preserving hash and history.state so
 * mobileNavigation's back-button handling is not broken.
 */
export async function handleWebappLaunch(): Promise<void> {
  if (webappLaunchHandled) return;
  webappLaunchHandled = true;

  if (typeof window === "undefined" || !window.location) return;

  const params = new URLSearchParams(window.location.search);
  const target = parseWebappLaunchOpen(params);

  if (target === "today") {
    await commitDatePick(todayISO());
  } else if (target === "actions") {
    openActionDrawer();
  } else if (target === "search") {
    openCrossTabSearch();
  }

  if (params.has("open")) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      const cleanSearch = url.searchParams.toString();
      const cleanUrl = url.pathname + (cleanSearch ? `?${cleanSearch}` : "") + url.hash;
      window.history.replaceState(window.history.state, document.title, cleanUrl);
    } catch {
      // Ignore in restricted environments
    }
  }
}
