import { get } from "svelte/store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as controller from "../lib/controller";
import { fontSize } from "../lib/controller";
import { zenCoverMonitor, zenPrepareLeave } from "../lib/tauriApi";

export type DockedPaneKind = "history" | "actions" | "weekReview" | "person";

export const nativeZenWindow = () => {
  const w = getCurrentWindow();
  return {
    isMaximized: () => w.isMaximized(),
    setFullscreen: (on: boolean) => w.setFullscreen(on),
    coverMonitor: () => zenCoverMonitor(),
    prepareLeave: () => zenPrepareLeave(),
  };
};

export function computePaneWidth(share: number, windowWidth: number): number {
  const raw = share * windowWidth;
  const minW = 180;
  const maxW = Math.max(minW, windowWidth - 420);
  return Math.min(maxW, Math.max(minW, raw));
}

export function createEditorWheelHandler() {
  // Ctrl+wheel (Cmd+wheel on macOS) over the note: font size up/down by 1px per notch, within the Settings range.
  // Saved once the wheel stops, not per notch. Also keeps the WebView from zooming the whole page.
  let wheelAcc = 0;
  let fontSaveTimer: ReturnType<typeof setTimeout> | undefined;
  const onEditorWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (!(e.target instanceof Element && e.target.closest("#editor-container"))) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    // A mouse notch is ~100; a touchpad pinch sends many small deltas, so add them up first.
    if (Math.abs(wheelAcc) < 50) return;
    const step = wheelAcc < 0 ? 1 : -1;
    wheelAcc = 0;
    const next = Math.min(18, Math.max(12, Math.round(get(fontSize)) + step));
    if (next === get(fontSize)) return;
    fontSize.set(next);
    clearTimeout(fontSaveTimer);
    fontSaveTimer = setTimeout(() => void controller.setFontSize(next), 400);
  };
  return {
    onEditorWheel,
    clearFontSaveTimer: () => clearTimeout(fontSaveTimer),
  };
}

export function onMouseNav(e: MouseEvent) {
  if (e.button === 3) {
    e.preventDefault();
    void controller.navigateBack();
  } else if (e.button === 4) {
    e.preventDefault();
    void controller.navigateForward();
  }
}
