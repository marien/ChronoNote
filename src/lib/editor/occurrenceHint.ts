/** The optional `< (X/Y) >` after a section's title: where this note sits among the occurrences of the section,
 * with the arrows to go to the previous / next one. It is a widget, not text: it is never part of the note, cannot be
 * selected, and is hidden while the caret is on the title line so it never gets in the way of editing the title.
 * `info` is pushed in by the editor (`setOccurrenceInfo`); null means "show nothing". */
import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { findSectionRange } from "../peekSection";

export interface OccurrenceInfo {
  /** Matching form of the section title (the same one `findSectionRange` takes). */
  target: string;
  index: number;
  total: number;
}

export interface OccurrenceHintLabels {
  prev: string;
  next: string;
}

export const setOccurrenceInfo = StateEffect.define<OccurrenceInfo | null>();

class HintWidget extends WidgetType {
  constructor(
    private readonly info: OccurrenceInfo,
    private readonly labels: OccurrenceHintLabels,
    private readonly step: (target: string, direction: -1 | 1) => void,
  ) {
    super();
  }

  eq(other: HintWidget): boolean {
    return (
      other.info.target === this.info.target &&
      other.info.index === this.info.index &&
      other.info.total === this.info.total &&
      other.labels.prev === this.labels.prev &&
      other.labels.next === this.labels.next
    );
  }

  toDOM(): HTMLElement {
    const { index, total, target } = this.info;
    const wrap = document.createElement("span");
    wrap.className = "occ-hint";
    wrap.setAttribute("aria-hidden", "false");
    const button = (text: string, direction: -1 | 1, label: string, enabled: boolean) => {
      const b = document.createElement("span");
      b.className = "occ-hint-btn" + (enabled ? "" : " off");
      b.textContent = text;
      b.setAttribute("role", "button");
      b.setAttribute("aria-label", label);
      b.title = label + (direction < 0 ? " (Alt+←)" : " (Alt+→)");
      // The mouse must not move the caret into the title line (which would hide the hint under the pointer).
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (enabled) this.step(target, direction);
      });
      return b;
    };
    const count = document.createElement("span");
    count.className = "occ-hint-count";
    count.textContent = `(${index}/${total})`;
    wrap.append(
      button("‹", -1, this.labels.prev, index > 1),
      count,
      button("›", 1, this.labels.next, index < total),
    );
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function occurrenceHintExtension(
  labels: () => OccurrenceHintLabels,
  step: (target: string, direction: -1 | 1) => void,
): Extension {
  const field = StateField.define<{ info: OccurrenceInfo | null; decorations: DecorationSet }>({
    create: () => ({ info: null, decorations: Decoration.none }),
    update(value, tr) {
      let info = value.info;
      let changed = tr.docChanged || tr.selection !== undefined;
      for (const e of tr.effects) {
        if (e.is(setOccurrenceInfo)) {
          info = e.value;
          changed = true;
        }
      }
      if (!changed) return value;
      if (!info) return value.info === null && value.decorations === Decoration.none ? value : { info, decorations: Decoration.none };
      const doc = tr.state.doc;
      const range = findSectionRange(doc.toString().split("\n"), info.target);
      if (!range) return { info, decorations: Decoration.none };
      const line = doc.line(range.titleLine + 1);
      // Hidden while the caret (or any selection) touches the title line.
      if (tr.state.selection.ranges.some((r) => r.from <= line.to && r.to >= line.from)) {
        return { info, decorations: Decoration.none };
      }
      const widget = new HintWidget(info, labels(), step);
      return { info, decorations: Decoration.set([Decoration.widget({ widget, side: 1 }).range(line.to)]) };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
  });
  return field;
}
