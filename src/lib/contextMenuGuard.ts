/** The browser's own right-click menu (Back, Refresh, Save as, Print, Inspect) is not ChronoNote's: in the desktop
 * app and the installed web app it showed wherever the app has no menu of its own (top bar outside the tabs, status
 * bar, the note's margins and scrollbar). Text fields keep it, for cut/copy/paste and spelling. The editor, the tabs
 * and the line menu handle their own `contextmenu` before this listener sees it. */

/** Whether the browser menu may show for a right-click on `target`. */
export function allowsNativeContextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const field = target.closest("input, textarea, [contenteditable]");
  if (!field) return false;
  // The note itself is contenteditable, but its menu is ChronoNote's line menu.
  return !field.closest(".cm-editor");
}

/** In a browser tab the page is not an app, so the browser menu stays; only the desktop app and the installed
 * web app replace it. */
export function suppressesNativeContextMenu(backend: "desktop" | "demo" | "web", installed: boolean): boolean {
  return backend === "desktop" || (backend === "web" && installed);
}

export function wireContextMenuGuard(enabled: () => boolean): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if (e.defaultPrevented || !enabled()) return;
    if (!allowsNativeContextMenu(e.target)) e.preventDefault();
  };
  window.addEventListener("contextmenu", onContextMenu);
  return () => window.removeEventListener("contextmenu", onContextMenu);
}
