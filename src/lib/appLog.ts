import { get } from "svelte/store";
import * as api from "./tauriApi";
import {
  allNotesCache,
  appVersion,
  backendKind,
  calendarSyncEnabled,
  colorMode,
  fontSize,
  showToast,
  tabs,
  themeMode,
  toastMessage,
  wordWrap,
} from "./stores";
import { locale, t } from "./i18n";

export function logInfo(msg: string): void {
  try {
    void api.appendLog("INFO", msg).catch(() => {});
  } catch {}
}

export function logWarn(msg: string): void {
  try {
    void api.appendLog("WARN", msg).catch(() => {});
  } catch {}
}

export function logError(msg: string): void {
  try {
    void api.appendLog("ERROR", msg).catch(() => {});
  } catch {}
}

let installed = false;
let lastErrorToastTime = 0;

function formatErrorWithStack(err: unknown, fallbackMsg?: string): string {
  if (err instanceof Error) {
    const msg = err.message || fallbackMsg || "Error";
    const stackLines = err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : "";
    return stackLines ? `${msg}\n${stackLines}` : msg;
  }
  if (typeof err === "string") return err;
  return fallbackMsg ?? String(err ?? "Unknown error");
}

function notifyUnexpectedError() {
  const now = Date.now();
  if (now - lastErrorToastTime >= 60000) {
    lastErrorToastTime = now;
    showToast(get(t)("toast.unexpectedError", undefined));
  }
}

export function installErrorReporting(): void {
  if (installed) return;
  installed = true;

  if (typeof window !== "undefined") {
    window.addEventListener("error", (event: ErrorEvent) => {
      logError(formatErrorWithStack(event.error, event.message));
      notifyUnexpectedError();
    });

    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      logError(formatErrorWithStack(event.reason, "Unhandled promise rejection"));
      notifyUnexpectedError();
    });
  }

  toastMessage.subscribe((msg) => {
    if (msg && msg.trim()) {
      logInfo(msg);
    }
  });
}

export async function buildDiagnostics(): Promise<string> {
  const version = get(appVersion);
  const backend = get(backendKind);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : "unknown";
  const screenStr =
    typeof window !== "undefined" && window.screen ? `${window.screen.width}x${window.screen.height}` : "unknown";
  const winStr = typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown";
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : "unknown";
  const forcedColors =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(forced-colors: active)").matches
      : "unknown";
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : "unknown";
  const uiLang = get(locale);
  const navLang = typeof navigator !== "undefined" ? navigator.language : "unknown";
  const color = get(colorMode);
  const theme = get(themeMode);
  const wrap = get(wordWrap);
  const font = get(fontSize);
  const openTabsCount = get(tabs).length;
  const notesCount = Object.keys(get(allNotesCache)).length;
  const calSync = get(calendarSyncEnabled) ? "on" : "off";

  const tail = await api.readLogTail(100);

  const lines = [
    `ChronoNote version: ${version}`,
    `backend kind: ${backend}`,
    `navigator.userAgent: ${ua}`,
    `devicePixelRatio: ${dpr}`,
    `screen size: ${screenStr}`,
    `window size: ${winStr}`,
    `matchMedia (prefers-reduced-motion: reduce): ${reducedMotion}`,
    `matchMedia (forced-colors: active): ${forcedColors}`,
    `matchMedia (prefers-color-scheme: dark): ${prefersDark}`,
    `UI language: ${uiLang}`,
    `navigator.language: ${navLang}`,
    `color mode: ${color}`,
    `theme mode: ${theme}`,
    `word wrap: ${wrap}`,
    `font size: ${font}`,
    `number of open tabs: ${openTabsCount}`,
    `number of notes known: ${notesCount}`,
    `calendar sync: ${calSync}`,
    `--- last 100 log lines ---`,
    tail,
  ];

  return lines.join("\n");
}
