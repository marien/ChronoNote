/** Native fullscreen for Zen mode on the desktop app.
 *
 * The window has no native title bar (`decorations: false`). On Windows, asking such a window to go
 * fullscreen while it is MAXIMIZED hides the taskbar but leaves the window at its maximized size, so a strip
 * where the taskbar was stays empty (found by Marien on Windows 11: fine from a normal window, wrong from a
 * maximized one). So a maximized window is restored first, then made fullscreen, and maximized again when
 * Zen ends. That restore is visible as a flicker, so for a maximized window the whole sequence runs with the
 * window hidden and it is shown again once it has its final size. Calls run one after another, so a quick
 * double toggle cannot interleave two sequences. */

/** The bits of Tauri's `Window` this needs (a fake in the unit test). */
export interface ZenWindow {
  isMaximized(): Promise<boolean>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  hide(): Promise<void>;
  show(): Promise<void>;
  setFocus(): Promise<void>;
}

export function createZenWindowController(win: ZenWindow) {
  let wasMaximized = false;
  let queue: Promise<void> = Promise.resolve();

  /** Runs `steps` with the window hidden, and always shows it again, even if a step fails. */
  const hidden = async (steps: () => Promise<void>) => {
    await win.hide().catch(() => {});
    try {
      await steps();
    } finally {
      await win.show().catch(() => {});
      await win.setFocus().catch(() => {});
    }
  };

  const enter = async () => {
    wasMaximized = await win.isMaximized().catch(() => false);
    if (!wasMaximized) return win.setFullscreen(true);
    await hidden(async () => {
      await win.unmaximize();
      await win.setFullscreen(true);
    });
  };

  const leave = async () => {
    if (!wasMaximized) return win.setFullscreen(false);
    wasMaximized = false;
    await hidden(async () => {
      await win.setFullscreen(false);
      await win.maximize();
    });
  };

  return {
    /** Zen turned on (`true`) or off (`false`). Never rejects: a window error must not break the app. */
    set(on: boolean): Promise<void> {
      queue = queue.then(on ? enter : leave).catch(() => {});
      return queue;
    },
  };
}
