/** §A2 / Release 2: Windows 11 Mica behind the title bar and status bar of the desktop app.
 *
 * Mica is a window effect: the OS paints a tinted, blurred wallpaper behind the window. It only shows where the page
 * is see-through, so with Mica on the native colour under the page is cleared (the same switch Peek uses,
 * `peek_set_transparent`) and `:root[data-mica]` makes the bars transparent while the note area stays solid
 * (`15-mica.css`). The effect's light/dark variant follows the app's own theme, not the OS one.
 *
 * Not used: outside the desktop app, before Windows 11, in pure black (OLED) mode (that wants true black), and while
 * Peek is on (Peek owns the window's transparency then; Mica re-applies itself through `onPeekLeft` once Peek has
 * fully closed). */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, Effect } from "@tauri-apps/api/window";
import { get } from "svelte/store";
import { backendKind, pureBlack, themeMode } from "./stores";
import { onPeekLeft, peekMode } from "./peek";

let windows11: boolean | null = null;
let applied = false;

async function isWindows11(): Promise<boolean> {
  if (windows11 !== null) return windows11;
  const uad = (navigator as Navigator & {
    userAgentData?: { platform?: string; getHighEntropyValues?: (h: string[]) => Promise<{ platformVersion?: string }> };
  }).userAgentData;
  try {
    if (uad?.platform === "Windows" && uad.getHighEntropyValues) {
      const { platformVersion } = await uad.getHighEntropyValues(["platformVersion"]);
      // Windows 11 reports platform version 13 or higher (Windows 10: 1-10).
      windows11 = Number((platformVersion ?? "0").split(".")[0]) >= 13;
      return windows11;
    }
  } catch {
    // fall through
  }
  windows11 = false;
  return windows11;
}

/** Whether the app is dark right now: an explicit theme, else the OS preference. */
export function resolvedDark(mode: string, osDark: boolean): boolean {
  return mode === "dark" || (mode !== "light" && osDark);
}

/** Whether Mica should be on, from plain inputs (tested). */
export function micaWanted(s: { backend: string; win11: boolean; pureBlack: boolean; peek: boolean }): boolean {
  return s.backend === "desktop" && s.win11 && !s.pureBlack && !s.peek;
}

export async function refreshMica(): Promise<void> {
  const peek = get(peekMode);
  const wanted = micaWanted({
    backend: get(backendKind),
    win11: get(backendKind) === "desktop" && (await isWindows11()),
    pureBlack: get(pureBlack),
    peek,
  });
  const root = document.documentElement;
  const win = getCurrentWindow();
  try {
    if (wanted) {
      const dark = resolvedDark(get(themeMode), window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.mica = "";
      await invoke("peek_set_transparent", { transparent: true, r: 0, g: 0, b: 0 });
      // Mica takes its light/dark tint from the window's theme; set it to the app's own.
      await win.setTheme(dark ? "dark" : "light");
      await win.setEffects({ effects: [Effect.Mica] });
      applied = true;
    } else if (applied) {
      applied = false;
      delete root.dataset.mica;
      await win.clearEffects();
      await win.setTheme(null);
      // Peek manages the transparency itself while it is on.
      if (!peek) {
        const m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(getComputedStyle(document.body).backgroundColor);
        const [r, g, b] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0x1e, 0x1e, 0x1e];
        await invoke("peek_set_transparent", { transparent: false, r, g, b });
      }
    }
  } catch {
    // Older WebView2/Tauri without effects: keep the plain, opaque look.
    delete root.dataset.mica;
    applied = false;
  }
}

/** Wires Mica to the settings that affect it. Call once at startup (desktop). */
export function wireMica(): () => void {
  // No window effects outside a real browser (unit tests run in jsdom).
  if (typeof window.matchMedia !== "function") return () => {};
  const run = () => void refreshMica();
  const unsubs = [themeMode.subscribe(run), pureBlack.subscribe(run), peekMode.subscribe(run)];
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", run);
  onPeekLeft.add(run);
  return () => {
    onPeekLeft.delete(run);
    unsubs.forEach((u) => u());
    mq.removeEventListener("change", run);
  };
}
