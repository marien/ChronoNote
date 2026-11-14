import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { editingExtensions, type EditingKeymapDeps } from "../editor/editingExtensions";

export interface TestEditorOptions {
  /** Initial document text. When `anchor` is omitted, `|` (caret) or `[...]` (selection, anchor at `[`) markers are parsed and stripped. */
  doc: string;
  anchor?: number;
  head?: number;
  deps?: EditingKeymapDeps;
}

export interface TestEditor {
  view: EditorView;
  text(): string;
  caret(): string;
  press(key: string): boolean;
  type(text: string): void;
  paste(text: string): void;
  undo(): boolean;
  redo(): boolean;
  select(anchor: number, head?: number): void;
  destroy(): void;
}

let jsdomStubsInstalled = false;

/** Installs the minimal DOM geometry stubs CodeMirror expects under jsdom, once per worker. */
function ensureJsdomStubs(): void {
  if (jsdomStubsInstalled) return;
  jsdomStubsInstalled = true;

  if (typeof Range !== "undefined") {
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () =>
        Object.assign([], { item: () => null }) as unknown as DOMRectList;
    }
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = () =>
        ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    }
  }
}

function parseDocAndSelection(opts: TestEditorOptions): {
  doc: string;
  selection: EditorSelection | undefined;
} {
  if (opts.anchor !== undefined) {
    return {
      doc: opts.doc,
      selection: EditorSelection.single(opts.anchor, opts.head ?? opts.anchor),
    };
  }

  const raw = opts.doc;
  const pipeIdx = raw.indexOf("|");
  if (pipeIdx !== -1) {
    const doc = raw.slice(0, pipeIdx) + raw.slice(pipeIdx + 1);
    return { doc, selection: EditorSelection.single(pipeIdx) };
  }

  const openIdx = raw.indexOf("[");
  if (openIdx !== -1) {
    const closeIdx = raw.indexOf("]", openIdx + 1);
    if (closeIdx !== -1) {
      const doc = raw.slice(0, openIdx) + raw.slice(openIdx + 1, closeIdx) + raw.slice(closeIdx + 1);
      return { doc, selection: EditorSelection.single(openIdx, closeIdx - 1) };
    }
  }

  return { doc: raw, selection: undefined };
}

function buildKeyboardEvent(keySpec: string): KeyboardEvent {
  const parts = keySpec.split(/-(?!$)/);
  const rawKey = parts[parts.length - 1];
  const isMacPlatform = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

  let altKey = false;
  let ctrlKey = false;
  let metaKey = false;
  let shiftKey = false;

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i];
    if (/^(cmd|meta|m)$/i.test(mod)) metaKey = true;
    else if (/^a(lt)?$/i.test(mod)) altKey = true;
    else if (/^(c|ctrl|control)$/i.test(mod)) ctrlKey = true;
    else if (/^s(hift)?$/i.test(mod)) shiftKey = true;
    else if (/^mod$/i.test(mod)) {
      if (isMacPlatform) metaKey = true;
      else ctrlKey = true;
    } else {
      throw new Error(`Unrecognized modifier in press("${keySpec}"): ${mod}`);
    }
  }

  let key = rawKey === "Space" ? " " : rawKey;
  if (shiftKey && key.length === 1 && /^[A-Z]$/.test(key)) {
    key = key.toLowerCase();
  }

  return new KeyboardEvent("keydown", {
    key,
    altKey,
    ctrlKey,
    metaKey,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
}

const defaultStubDeps: EditingKeymapDeps = {
  onOccurrenceKey: () => false,
  showToast: () => {},
};

export function createTestEditor(opts: TestEditorOptions): TestEditor {
  ensureJsdomStubs();

  const { doc, selection } = parseDocAndSelection(opts);
  const deps: EditingKeymapDeps = { ...defaultStubDeps, ...opts.deps };

  const state = EditorState.create({
    doc,
    selection,
    extensions: editingExtensions(deps),
  });
  const view = new EditorView({ state });

  return {
    view,

    text(): string {
      return view.state.doc.toString();
    },

    caret(): string {
      const content = view.state.doc.toString();
      const { anchor, head } = view.state.selection.main;
      if (anchor === head) {
        return content.slice(0, anchor) + "|" + content.slice(anchor);
      }
      if (anchor < head) {
        return (
          content.slice(0, anchor) +
          "[" +
          content.slice(anchor, head) +
          "]" +
          content.slice(head)
        );
      }
      return (
        content.slice(0, head) +
        "]" +
        content.slice(head, anchor) +
        "[" +
        content.slice(anchor)
      );
    },

    press(key: string): boolean {
      const event = buildKeyboardEvent(key);
      return runScopeHandlers(view, event, "editor");
    },

    type(text: string): void {
      for (const ch of text) {
        const { from, to } = view.state.selection.main;
        const defaultInsert = () =>
          view.state.update({
            ...view.state.replaceSelection(ch),
            userEvent: "input.type",
            scrollIntoView: true,
          });
        const handled = view.state
          .facet(EditorView.inputHandler)
          .some((handler) => handler(view, from, to, ch, defaultInsert));
        if (!handled) {
          view.dispatch(defaultInsert());
        }
      }
    },

    paste(text: string): void {
      if (typeof ClipboardEvent !== "undefined" && typeof DataTransfer !== "undefined") {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const event = new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(event);
        if (event.defaultPrevented) return;
      }
      view.dispatch({
        ...view.state.replaceSelection(text),
        userEvent: "input.paste",
        scrollIntoView: true,
      });
    },

    undo(): boolean {
      return undo(view);
    },

    redo(): boolean {
      return redo(view);
    },

    select(anchor: number, head = anchor): void {
      view.dispatch({
        selection: EditorSelection.single(anchor, head),
        userEvent: "select",
      });
    },

    destroy(): void {
      view.destroy();
    },
  };
}
