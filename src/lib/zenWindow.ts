/** Native fullscreen for Zen mode on the desktop app.
 *
 * The window has no native title bar (`decorations: false`). On Windows, fullscreen from a MAXIMIZED window hides
 * the taskbar but leaves the window inside the work area, so a strip where the taskbar was stays empty (found by
 * Marien on Windows 11). tao leaves the WS_MAXIMIZE style set, which is what keeps it there; Rust's
 * `zen_cover_monitor` (`zen_window.rs`) clears that style bit and moves the window onto the full monitor in one
 * step. No restore/maximize round trip, so nothing flickers, and tao's remembered placement puts the window back
 * to maximized when Zen ends. Calls run one after another, so a quick double toggle cannot interleave. */

/** The bits of Tauri's `Window` this needs, plus the native command (fakes in the unit test). */
export interface ZenWindow {
  isMaximized(): Promise<boolean>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  /** Rust `zen_cover_monitor`: make a fullscreen window cover its whole monitor. */
  coverMonitor(): Promise<void>;
}

export function createZenWindowController(win: ZenWindow) {
  let queue: Promise<void> = Promise.resolve();

  const enter = async () => {
    const maximized = await win.isMaximized().catch(() => false);
    await win.setFullscreen(true);
    if (maximized) await win.coverMonitor();
  };

  const leave = async () => {
    await win.setFullscreen(false);
  };

  return {
    /** Zen turned on (`true`) or off (`false`). Never rejects: a window error must not break the app. */
    set(on: boolean): Promise<void> {
      queue = queue.then(on ? enter : leave).catch(() => {});
      return queue;
    },
  };
}
