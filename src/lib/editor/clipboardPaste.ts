export interface ClipboardPastePayload {
  html: string;
  plain: string;
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
