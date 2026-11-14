import { EditorState, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { glyphAtomicRanges, liveGlyphs } from "./glyphs";
import { setextRule } from "./setextRule";
import { resolvedLinesPlugin } from "./resolvedLines";
import { actionTreeLinesExtension } from "./actionTreeLines";
import { topicTagEditingPlugin } from "./topicTagEditing";
import { forwardLinksPlugin } from "./forwardLinks";
import { clickableLinksPlugin } from "./clickableLinks";
import { dateLinksPlugin } from "./dateLinks";
import { dueDatesPlugin } from "./dueDates";
import { numberedListKeymap, numberedListRenumberFilter } from "./numberedListKeys";
import { pasteOverEmptyMarker } from "./pasteOverEmptyMarker";
import { stateFirstFilter } from "./stateFirst";
import { editingKeymap, type EditingKeymapDeps } from "./editingKeymap";

export type { EditingKeymapDeps };

export interface EditingExtensionSlots {
  /** UI extensions placed right after `history()` and before `indentUnit` (e.g. `drawSelection()`). */
  afterHistory?: Extension[];
  /** UI extensions placed after `indentUnit` and before token/glyph plugins (compartments for wrap, spell, measure, aria-label). */
  afterIndentUnit?: Extension[];
  /** UI extensions placed after transaction filters and before keymaps (overview ruler, pulse field, search, find highlight, Peek, occurrence hint). */
  afterFilters?: Extension[];
  /** UI-only keymaps placed right before `editingKeymap(deps)` so they still precede `defaultKeymap`. */
  beforeEditingKeymap?: Extension[];
}

/** All extensions that affect the text, selection, or token presentation, in the exact relative order used by EditorPane. */
export function editingExtensions(
  deps: EditingKeymapDeps = {},
  ui: EditingExtensionSlots = {},
): Extension[] {
  return [
    EditorState.allowMultipleSelections.of(false),
    history(),
    ...(ui.afterHistory ?? []),
    indentUnit.of("  "),
    ...(ui.afterIndentUnit ?? []),
    liveGlyphs,
    glyphAtomicRanges,
    setextRule,
    resolvedLinesPlugin,
    actionTreeLinesExtension(),
    topicTagEditingPlugin,
    forwardLinksPlugin,
    clickableLinksPlugin,
    dateLinksPlugin,
    dueDatesPlugin,
    numberedListRenumberFilter,
    pasteOverEmptyMarker,
    stateFirstFilter,
    ...(ui.afterFilters ?? []),
    numberedListKeymap,
    ...(ui.beforeEditingKeymap ?? []),
    editingKeymap(deps),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  ];
}
