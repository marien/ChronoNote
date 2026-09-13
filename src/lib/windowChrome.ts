/** Custom title bar window controls (merged title bar + top bar). Thin
 * wrappers over `@tauri-apps/api/window`, kept in their own module the
 * same way `boot.ts` already isolates its own `getCurrentWindow()` calls —
 * `TopBar.svelte`'s three window-control buttons call these instead of
 * reaching for the Tauri API directly. */
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function minimizeWindow(): Promise<void> {
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await getCurrentWindow().toggleMaximize();
}

/** Deliberately `.close()`, not `.destroy()` — `.close()` emits the same
 * `onCloseRequested` event a native close button, Alt+F4, or the OS "X"
 * already did before this change, so it's routed through the exact
 * existing exit-barrier logic (§93, `boot.ts`'s `wireCloseBarrier`) with
 * zero behavior change: flush pending saves, gate on unsaved
 * scratchpads, *then* the window actually goes away. */
export async function closeWindow(): Promise<void> {
  await getCurrentWindow().close();
}
