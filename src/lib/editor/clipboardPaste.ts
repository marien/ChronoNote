import { htmlToNoteText, isOwnChronoNoteHtml, tabsToTwoSpaces } from "../richClipboard";

export interface ClipboardPastePayload {
  html: string;
  plain: string;
}

export interface ResolvedClipboardPaste {
  /** Text to insert into the editor, or `null` when CodeMirror should insert `text/plain` unchanged. */
  insertText: string | null;
  /** Plain text passed to paste-forward detection (`handlePasteIntoTab`). */
  pasteCheckText: string | undefined;
}

/** Resolves clipboard or external drop `text/html` + `text/plain` once at the editor boundary:
 * ChronoNote's own copies (`data-chrononote`) keep their exact plain text (tabs included), foreign HTML
 * lists convert via `htmlToNoteText` (with `<pre>` tabs becoming two spaces), and foreign plain text
 * converts every tab to two spaces. */
export function resolveClipboardPaste(
  html: string | undefined,
  plain: string | undefined,
): ResolvedClipboardPaste {
  if (html && isOwnChronoNoteHtml(html)) {
    return { insertText: null, pasteCheckText: plain };
  }
  const fromHtml = html ? htmlToNoteText(html) : null;
  if (fromHtml !== null) {
    return { insertText: fromHtml, pasteCheckText: fromHtml };
  }
  if (plain !== undefined && plain.includes("\t")) {
    const converted = tabsToTwoSpaces(plain).replace(/\r\n?/g, "\n");
    return { insertText: converted, pasteCheckText: converted };
  }
  return { insertText: null, pasteCheckText: plain };
}

/** Reads HTML and plain text from the Async Clipboard API, falling back to `readText()` when `clipboard.read()` is unavailable or blocked. */
export async function readClipboardPastePayload(
  clipboard: Pick<Clipboard, "readText"> & Partial<Pick<Clipboard, "read">> = navigator.clipboard,
): Promise<ClipboardPastePayload> {
  let html = "";
  let plain = "";
  if (clipboard.read) {
    try {
      const items = await clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html") && !html) {
          html = await (await item.getType("text/html")).text();
        }
        if (item.types.includes("text/plain") && !plain) {
          plain = await (await item.getType("text/plain")).text();
        }
      }
    } catch {
      // Clipboard.read() can reject or be unimplemented while readText() still works.
    }
  }
  if (!plain) {
    try {
      plain = await clipboard.readText();
    } catch (err) {
      if (!html) throw err;
    }
  }
  return { html, plain };
}

/** Builds a `DataTransfer` holding clipboard `text/html` and `text/plain` for right-click Paste. */
export async function buildPasteDataTransfer(
  clipboard: Pick<Clipboard, "readText"> & Partial<Pick<Clipboard, "read">> = navigator.clipboard,
): Promise<DataTransfer> {
  const { html, plain } = await readClipboardPastePayload(clipboard);
  const dt = new DataTransfer();
  if (html) dt.setData("text/html", html);
  if (plain) dt.setData("text/plain", plain);
  return dt;
}
