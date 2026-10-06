/** One OS-wide (global) shortcut that follows a setting: works while another app has the focus (Peek's toggle, the
 * call-note shortcut). `bind(accelerator)` says which key combination should be registered now ("" = none).
 *
 * Changes are applied one at a time, in order, each against the LATEST wanted value. Registering is asynchronous
 * (the plugin is loaded on first use), and two overlapping `bind` calls used to race: one could unregister what the
 * other had just registered, which left the shortcut dead until the next restart. Needs no registration while
 * nothing is wanted (the plugin is not even loaded). A shortcut another app already holds fails quietly; the next
 * `bind` retries. */
export interface GlobalShortcutBinder {
  bind(accelerator: string): void;
  /** Unregisters and stops: later `bind` calls do nothing. */
  dispose(): void;
}

export function createGlobalShortcutBinder(onPressed: () => void): GlobalShortcutBinder {
  let registered: string | null = null;
  let wanted = "";
  let disposed = false;
  let queue: Promise<void> = Promise.resolve();

  const settle = async () => {
    const target = disposed ? "" : wanted;
    if (registered === target || (!target && !registered)) return;
    try {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      if (registered) {
        const old = registered;
        registered = null;
        await gs.unregister(old).catch(() => {});
      }
      if (!target) return;
      await gs.register(target, (e) => {
        if (e.state === "Pressed") onPressed();
      });
      registered = target;
    } catch {
      // Taken by another app or not available: the in-app shortcut / the palette entry still works.
    }
  };

  return {
    bind(accelerator) {
      if (disposed) return;
      wanted = accelerator;
      queue = queue.then(settle);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      queue = queue.then(settle);
    },
  };
}
