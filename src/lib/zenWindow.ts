/** Native fullscreen for Zen mode on the desktop app.
 *
 * The window has no native title bar (`decorations: false`). On Windows, asking such a window to go
 * fullscreen while it is MAXIMIZED hides the taskbar but leaves the window at its maximized size, so a strip
 * where the taskbar was stays empty (found by Marien on Windows 11: fine from a normal window, wrong from a
 * maximized one). So a maximized window is restored first, then made fullscreen, and maximized again when
 * Zen ends. Calls run one after another, so a quick double toggle cannot interleave two sequences. */

/** The bits of Tauri's `Window` this needs (a fake in the unit test). */
export interface ZenWindow {
  isMaximized(): Promise<boolean>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  setFullscreen(fullscreen: boolean): Promise<void>;
}

export function createZenWindowController(win: ZenWindow) {
  let wasMaximized = false;
  let queue: Promise<void> = Promise.resolve();

  const enter = async () => {
    wasMaximized = await win.isMaximized().catch(() => false);
    if (wasMaximized) await win.unmaximize();
    await win.setFullscreen(true);
  };

  const leave = async () => {
    await win.setFullscreen(false);
    if (wasMaximized) {
      wasMaximized = false;
      await win.maximize();
    }
  };

  return {
    /** Zen turned on (`true`) or off (`false`). Never rejects: a window error must not break the app. */
    set(on: boolean): Promise<void> {
      queue = queue.then(on ? enter : leave).catch(() => {});
      return queue;
    },
  };
}
