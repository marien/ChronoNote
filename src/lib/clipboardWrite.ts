/** Clipboard write helpers with progressive fallback:
 * 1. `navigator.clipboard.write` with `ClipboardItem` (`text/html` + `text/plain`) for rich copy
 * 2. `navigator.clipboard.writeText` for plain text
 * 3. Hidden textarea + `document.execCommand("copy")` when clipboard permissions/APIs fail.
 */

/** Copies plain text using `navigator.clipboard.writeText`, falling back to a temporary textarea and `execCommand("copy")`. */
export async function copyPlain(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea + execCommand fallback.
  }
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  try {
    ta.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

/** Copies both HTML and plain text via `ClipboardItem`, falling back to `copyPlain(plain)` if rich write is unavailable or fails. */
export async function copyRich(html: string, plain: string): Promise<boolean> {
  try {
    if (
      typeof ClipboardItem !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.write === "function"
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall through to plain-text clipboard write / textarea fallback.
  }
  return copyPlain(plain);
}
