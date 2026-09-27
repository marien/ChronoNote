import { Facet, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { innermostActionSymbol, innermostTopicSymbol, isSetextUnderline } from "../tokens";

export interface OverviewRulerConfig {
  onJump?: (lineIdx: number) => void;
}

export const overviewRulerFacet = Facet.define<OverviewRulerConfig, OverviewRulerConfig>({
  combine(values) {
    return values[0] || {};
  },
});

export interface MarkerItem {
  lineNumber: number;
  text: string;
  pos: number;
}

export interface MarkerData {
  topPx: number;
  pos: number;
  lineNumber: number;
  type: "action" | "topic";
  items: MarkerItem[];
}

/** Computes the list of overview ruler markers for open actions and topics. */
export function buildMarkers(
  view: EditorView,
  trackHeight: number,
  markerHeight: number = 3,
): MarkerData[] {
  if (trackHeight <= 0) return [];
  const doc = view.state.doc;
  const numLines = doc.lines;
  const totalHeight = Math.max(view.contentHeight, view.scrollDOM ? view.scrollDOM.scrollHeight : 0, 1);
  const effectiveTrackHeight = Math.max(trackHeight - markerHeight, 0);

  const markerMap = new Map<number, MarkerData>();

  for (let lineNum = 1; lineNum <= numLines; lineNum++) {
    const line = doc.line(lineNum);
    const text = line.text;

    // Skip section header title lines directly above a setext `====` underline
    if (lineNum < numLines && isSetextUnderline(doc.line(lineNum + 1).text)) {
      continue;
    }

    const actionSym = innermostActionSymbol(text);
    const topicSym = innermostTopicSymbol(text);

    let type: "action" | "topic" | null = null;
    if (actionSym === "#") {
      type = "action";
    } else if (topicSym === "o") {
      type = "topic";
    }

    if (!type) continue;

    // Compute proportional vertical position
    let fraction = 0;
    if (view.contentHeight > 0) {
      try {
        const lineBlock = view.lineBlockAt(line.from);
        fraction = Math.min(Math.max(lineBlock.top / totalHeight, 0), 1);
      } catch {
        fraction = (lineNum - 1) / Math.max(numLines - 1, 1);
      }
    } else {
      fraction = (lineNum - 1) / Math.max(numLines - 1, 1);
    }

    const topPx = Math.round(fraction * effectiveTrackHeight);
    const existing = markerMap.get(topPx);

    if (existing) {
      existing.items.push({ lineNumber: lineNum, text, pos: line.from });
      if (type === "action") existing.type = "action"; // action takes visual precedence
    } else {
      markerMap.set(topPx, {
        topPx,
        pos: line.from,
        lineNumber: lineNum,
        type,
        items: [{ lineNumber: lineNum, text, pos: line.from }],
      });
    }
  }

  return Array.from(markerMap.values());
}

class OverviewRulerPluginClass {
  dom: HTMLDivElement;
  view: EditorView;
  private rafId: number | null = null;

  constructor(view: EditorView) {
    this.view = view;
    this.dom = document.createElement("div");
    this.dom.className = "cm-overview-ruler";
    this.dom.setAttribute("aria-hidden", "true");
    this.dom.addEventListener("click", this.handleClick);
    view.dom.appendChild(this.dom);
    this.scheduleUpdate();
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.geometryChanged || update.viewportChanged) {
      this.scheduleUpdate();
    }
  }

  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.dom.removeEventListener("click", this.handleClick);
    this.dom.remove();
  }

  private scheduleUpdate() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.renderMarkers();
    });
  }

  private renderMarkers() {
    const trackHeight = this.view.scrollDOM ? this.view.scrollDOM.clientHeight : this.view.dom.clientHeight;
    if (trackHeight <= 0) {
      this.dom.style.display = "none";
      return;
    }

    // The box's own on-screen size comes from CSS (top+bottom: 0), not
    // from this measurement — see the comment on `.cm-overview-ruler` in
    // app.css for why a JS-set height was the actual bug.
    const markers = buildMarkers(this.view, trackHeight);
    if (markers.length === 0) {
      this.dom.style.display = "none";
      this.dom.replaceChildren();
      return;
    }

    this.dom.style.display = "block";
    const fragment = document.createDocumentFragment();

    for (const m of markers) {
      const el = document.createElement("div");
      el.className = `cm-ruler-marker cm-ruler-${m.type}`;
      el.style.top = `${m.topPx}px`;
      el.dataset.pos = String(m.pos);
      el.dataset.line = String(m.lineNumber);

      if (m.items.length === 1) {
        el.title = `Line ${m.items[0].lineNumber}: ${m.items[0].text.trim()}`;
      } else {
        const summary = m.items
          .slice(0, 3)
          .map((item) => `Line ${item.lineNumber}: ${item.text.trim()}`)
          .join("\n");
        const extra = m.items.length > 3 ? `\n(+${m.items.length - 3} more)` : "";
        el.title = summary + extra;
      }

      fragment.appendChild(el);
    }

    this.dom.replaceChildren(fragment);
  }

  private handleClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest(".cm-ruler-marker") as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();

    const pos = Number(target.dataset.pos);
    const lineNum = Number(target.dataset.line);

    if (!isNaN(pos) && pos >= 0 && pos <= this.view.state.doc.length) {
      this.view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true,
        effects: EditorView.scrollIntoView(pos, { y: "center" }),
      });
      this.view.focus();

      if (!isNaN(lineNum)) {
        const config = this.view.state.facet(overviewRulerFacet);
        config.onJump?.(lineNum - 1);
      }
    }
  };
}

export const overviewRulerPlugin = ViewPlugin.fromClass(OverviewRulerPluginClass);

export function overviewRuler(config: OverviewRulerConfig = {}): Extension {
  return [overviewRulerFacet.of(config), overviewRulerPlugin];
}
