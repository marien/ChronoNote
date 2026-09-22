import {
  Decoration,
  type DecorationSet,
  type EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { openExternalUrl } from "../tauriApi";
import { isMac } from "../platform";
import { isMobile } from "../controller";
import { get } from "svelte/store";

/** Trims trailing punctuation from raw matched URLs, keeping balanced closing parentheses. */
export function cleanUrlMatch(raw: string): { url: string; length: number } | null {
  let url = raw;
  while (url.length > 0) {
    const last = url[url.length - 1];
    if (last === "." || last === "," || last === ";" || last === ":" || last === "!" || last === "?") {
      url = url.slice(0, -1);
      continue;
    }
    if (last === ")" || last === "]" || last === "}") {
      const openChar = last === ")" ? "(" : last === "]" ? "[" : "{";
      const openCount = (url.match(new RegExp("\\" + openChar, "g")) || []).length;
      const closeCount = (url.match(new RegExp("\\" + last, "g")) || []).length;
      if (closeCount > openCount) {
        url = url.slice(0, -1);
        continue;
      }
    }
    break;
  }
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return { url, length: url.length };
}

const linkMatcher = new MatchDecorator({
  regexp: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g,
  decorate(add, from, _to, match) {
    const cleaned = cleanUrlMatch(match[0]);
    if (!cleaned) return;
    const title = isMac ? "Cmd+Click to open link" : "Ctrl+Click to open link";
    add(
      from,
      from + cleaned.length,
      Decoration.mark({
        class: "cm-link",
        attributes: {
          "data-url": cleaned.url,
          title,
        },
      }),
    );
  },
});

export const clickableLinksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = linkMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = linkMatcher.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(e: MouseEvent, _view: EditorView) {
        const target = (e.target as HTMLElement)?.closest?.(".cm-link") as HTMLElement | null;
        if (!target) return false;
        const url = target.getAttribute("data-url");
        if (!url) return false;

        const hasModifier = isMac ? e.metaKey : e.ctrlKey;
        const isMobileOrTouch = get(isMobile) || (e as PointerEvent).pointerType === "touch";

        if (hasModifier || isMobileOrTouch) {
          e.preventDefault();
          e.stopPropagation();
          openExternalUrl(url);
          return true;
        }
        return false;
      },
      auxclick(e: MouseEvent, _view: EditorView) {
        // Middle-click (wheel click)
        if (e.button !== 1) return false;
        const target = (e.target as HTMLElement)?.closest?.(".cm-link") as HTMLElement | null;
        if (!target) return false;
        const url = target.getAttribute("data-url");
        if (!url) return false;

        e.preventDefault();
        e.stopPropagation();
        openExternalUrl(url);
        return true;
      },
    },
  },
);
