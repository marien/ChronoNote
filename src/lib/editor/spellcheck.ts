import { RangeSet, StateEffect, StateField, type Range, type EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { isSetextUnderline } from "../tokens";
import { tokenizeLine, type TokenKind } from "../grammar/tokenize";
import { spellCheckLines, spellLanguages } from "../tauriApi";

const EXCLUDED_TOKEN_KINDS: ReadonlySet<TokenKind> = new Set([
  "action",
  "topic",
  "bullet",
  "arrow",
  "consequence",
  "consequenceTopic",
  "assignee",
  "topicTag",
]);

const URL_REGEX = /https?:\/\/\S+/g;
const DATE_REGEX = /\d{4}-\d{2}-\d{2}/g;

function rangesOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && aTo > bFrom;
}

function wordContainsDigits(lineText: string, from: number, to: number): boolean {
  if (/\d/.test(lineText.slice(from, to))) return true;
  let start = from;
  while (start > 0 && /\w/.test(lineText[start - 1])) start--;
  let end = to;
  while (end < lineText.length && /\w/.test(lineText[end])) end++;
  return /\d/.test(lineText.slice(start, end));
}

/** Pure filter function: removes ranges that overlap grammar tokens, URLs, dates,
 * words containing digits, setext underlines, or the word the caret is currently in. */
export function filterMisspelledRanges(
  lineText: string,
  ranges: [number, number][],
  caretOffset?: number | null,
): [number, number][] {
  if (isSetextUnderline(lineText)) return [];
  if (ranges.length === 0) return [];

  // 1. Collect URL ranges
  const urlRanges: [number, number][] = [];
  let urlMatch: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((urlMatch = URL_REGEX.exec(lineText)) !== null) {
    urlRanges.push([urlMatch.index, urlMatch.index + urlMatch[0].length]);
  }

  // 2. Collect date ranges
  const dateRanges: [number, number][] = [];
  let dateMatch: RegExpExecArray | null;
  DATE_REGEX.lastIndex = 0;
  while ((dateMatch = DATE_REGEX.exec(lineText)) !== null) {
    dateRanges.push([dateMatch.index, dateMatch.index + dateMatch[0].length]);
  }

  // 3. Collect excluded grammar token ranges
  const tokenRanges: [number, number][] = [];
  const tokens = tokenizeLine(lineText);
  for (const token of tokens) {
    if (EXCLUDED_TOKEN_KINDS.has(token.kind)) {
      tokenRanges.push([token.from, token.to]);
    }
  }

  return ranges.filter(([from, to]) => {
    // Caret filter: word caret is in while typing
    if (caretOffset !== undefined && caretOffset !== null && caretOffset >= from && caretOffset <= to) {
      return false;
    }

    // Word containing digits
    if (wordContainsDigits(lineText, from, to)) {
      return false;
    }

    // URLs
    for (const [uFrom, uTo] of urlRanges) {
      if (rangesOverlap(from, to, uFrom, uTo)) return false;
    }

    // Dates
    for (const [dFrom, dTo] of dateRanges) {
      if (rangesOverlap(from, to, dFrom, dTo)) return false;
    }

    // Grammar tokens
    for (const [tFrom, tTo] of tokenRanges) {
      if (rangesOverlap(from, to, tFrom, tTo)) return false;
    }

    return true;
  });
}

/** LRU cache for spell check line results, capped at maxEntries (~2000). */
export class SpellCache {
  private map = new Map<string, [number, number][]>();
  private readonly maxEntries: number;

  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  get(lineText: string): [number, number][] | undefined {
    const val = this.map.get(lineText);
    if (val !== undefined) {
      this.map.delete(lineText);
      this.map.set(lineText, val);
      return val;
    }
    return undefined;
  }

  set(lineText: string, ranges: [number, number][]): void {
    if (this.map.has(lineText)) {
      this.map.delete(lineText);
    } else if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(lineText, ranges);
  }

  has(lineText: string): boolean {
    return this.map.has(lineText);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const spellCache = new SpellCache(2000);

let spellLanguagesLoaded = false;
let sessionLanguages: string[] = [];

/** Computes the effective spell check language list.
 * Stored list wins if set; otherwise DEFAULT: Windows languages plus English
 * (en-US if available, else first available en-*), without duplicates. */
export function computeEffectiveSpellLanguages(
  stored: string[] | null | undefined,
  windowsLanguages: string[],
  availableLanguages: string[],
): string[] {
  if (stored !== null && stored !== undefined) {
    return [...stored];
  }

  let englishTag: string | undefined;
  if (availableLanguages.some((l) => l.toLowerCase() === "en-us")) {
    englishTag = availableLanguages.find((l) => l.toLowerCase() === "en-us");
  } else {
    englishTag = availableLanguages.find((l) => l.toLowerCase().startsWith("en-"));
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const tag of windowsLanguages) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }

  if (englishTag && !seen.has(englishTag.toLowerCase())) {
    seen.add(englishTag.toLowerCase());
    result.push(englishTag);
  }

  return result;
}

export function getLanguageDisplayName(tag: string, uiLocale: string): string {
  try {
    const dn = new Intl.DisplayNames([uiLocale], { type: "language" });
    return dn.of(tag) || tag;
  } catch {
    return tag;
  }
}

export interface OrderedSpellLanguage {
  tag: string;
  name: string;
  checked: boolean;
}

/** Orders available languages: effective (ticked) first in their order,
 * then Windows languages, then the rest alphabetically by name. */
export function orderSpellLanguages(
  available: string[],
  effective: string[],
  windows: string[],
  uiLocale: string,
): OrderedSpellLanguage[] {
  const result: OrderedSpellLanguage[] = [];
  const seen = new Set<string>();

  // 1. Effective (ticked) languages in their order
  for (const tag of effective) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        tag,
        name: getLanguageDisplayName(tag, uiLocale),
        checked: true,
      });
    }
  }

  // 2. Windows languages that are available and not yet included
  for (const tag of windows) {
    const key = tag.toLowerCase();
    if (!seen.has(key) && available.some((a) => a.toLowerCase() === key)) {
      seen.add(key);
      const availTag = available.find((a) => a.toLowerCase() === key) ?? tag;
      result.push({
        tag: availTag,
        name: getLanguageDisplayName(availTag, uiLocale),
        checked: false,
      });
    }
  }

  // 3. The rest of available languages, sorted alphabetically by name
  const rest: OrderedSpellLanguage[] = [];
  for (const tag of available) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      rest.push({
        tag,
        name: getLanguageDisplayName(tag, uiLocale),
        checked: false,
      });
    }
  }

  rest.sort((a, b) => a.name.localeCompare(b.name, uiLocale));
  result.push(...rest);

  return result;
}

export async function initSpellLanguages(): Promise<string[]> {
  if (!spellLanguagesLoaded) {
    try {
      sessionLanguages = await spellLanguages();
    } catch {
      sessionLanguages = [];
    }
    spellLanguagesLoaded = true;
  }
  return sessionLanguages;
}

export function hasSpellLanguages(): boolean {
  return sessionLanguages.length > 0;
}

const activeSpellPlugins = new Set<SpellCheckPluginValue>();

/** Re-reads spellLanguages() from backend, clears line cache, and re-checks visible lines. */
export async function languagesChanged(view?: EditorView): Promise<void> {
  try {
    sessionLanguages = await spellLanguages();
  } catch {
    sessionLanguages = [];
  }
  spellLanguagesLoaded = true;
  spellCache.clear();
  if (view) {
    const plugin = view.plugin(spellViewPlugin);
    if (plugin) {
      void plugin.runCheck(true);
    }
  } else {
    for (const plugin of activeSpellPlugins) {
      void plugin.runCheck(true);
    }
  }
}

const setSpellDecorations = StateEffect.define<{
  decorations: Range<Decoration>[];
  checkFrom: number;
  checkTo: number;
  clearAll?: boolean;
}>();

export const spellField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSpellDecorations)) {
        if (effect.value.clearAll) {
          decorations = Decoration.set(effect.value.decorations, true);
        } else {
          const { checkFrom, checkTo, decorations: newDecos } = effect.value;
          decorations = decorations.update({
            filter: (from, to) => from < checkFrom || to > checkTo,
            add: newDecos,
            sort: true,
          });
        }
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

class SpellCheckPluginValue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private view: EditorView;
  private isDestroyed = false;
  private isTyping = false;
  private emptyRetries = 0;

  constructor(view: EditorView) {
    this.view = view;
    activeSpellPlugins.add(this);
    this.scheduleCheck(true);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.isTyping = true;
      this.scheduleCheck();
    } else if (update.viewportChanged || update.geometryChanged) {
      // geometryChanged: the window starts hidden and the editor gets its size only when it is shown; without this the
      // first check found no visible lines and nothing checked again until the user typed or scrolled (0.32.0-3).
      this.scheduleCheck();
    } else if (update.selectionSet && this.isTyping) {
      // Caret moved after typing: re-evaluate caret exclusion
      this.scheduleCheck();
    }
  }

  scheduleCheck(immediate = false) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (immediate) {
      void this.runCheck();
    } else {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.runCheck();
      }, 300);
    }
  }

  async runCheck(clearAll = false) {
    if (this.isDestroyed) return;
    const langs = await initSpellLanguages();
    if (langs.length === 0) return;

    const visibleRanges = this.view.visibleRanges;
    // Not laid out yet (hidden window, Settings page covering the note): try again shortly, a bounded number of times.
    if (visibleRanges.length === 0 || this.view.contentDOM.offsetHeight === 0) {
      if (this.emptyRetries++ < 20) this.scheduleCheck();
      return;
    }
    this.emptyRetries = 0;

    const doc = this.view.state.doc;
    const linesToCheck: { number: number; from: number; to: number; text: string }[] = [];
    const seenLineNumbers = new Set<number>();

    for (const { from, to } of visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = doc.lineAt(pos);
        if (!seenLineNumbers.has(line.number)) {
          seenLineNumbers.add(line.number);
          linesToCheck.push({
            number: line.number,
            from: line.from,
            to: line.to,
            text: line.text,
          });
        }
        pos = line.to + 1;
      }
    }

    if (linesToCheck.length === 0) return;

    const checkFrom = linesToCheck[0].from;
    const checkTo = linesToCheck[linesToCheck.length - 1].to;

    const uncachedLines: { text: string; index: number }[] = [];
    const lineRangesMap = new Map<number, [number, number][]>();

    for (let i = 0; i < linesToCheck.length; i++) {
      const line = linesToCheck[i];
      // Blank lines have nothing to check (and Windows rejects an empty string).
      if (line.text.trim() === "") {
        lineRangesMap.set(i, []);
        continue;
      }
      const cached = spellCache.get(line.text);
      if (cached !== undefined) {
        lineRangesMap.set(i, cached);
      } else {
        uncachedLines.push({ text: line.text, index: i });
      }
    }

    if (uncachedLines.length > 0) {
      const uniqueTexts: string[] = [];
      const textToUncachedIndices = new Map<string, number[]>();
      for (const item of uncachedLines) {
        let indices = textToUncachedIndices.get(item.text);
        if (!indices) {
          indices = [];
          textToUncachedIndices.set(item.text, indices);
          uniqueTexts.push(item.text);
        }
        indices.push(item.index);
      }

      try {
        const results = await spellCheckLines(uniqueTexts);
        if (this.isDestroyed) return;
        for (let u = 0; u < uniqueTexts.length; u++) {
          const text = uniqueTexts[u];
          const ranges = results[u] ?? [];
          spellCache.set(text, ranges);
          const indices = textToUncachedIndices.get(text) ?? [];
          for (const idx of indices) {
            lineRangesMap.set(idx, ranges);
          }
        }
      } catch (err) {
        console.error("spellCheckLines failed", err);
        return;
      }
    }

    if (this.isDestroyed) return;

    const selection = this.view.state.selection.main;
    const caretPos = selection.empty ? selection.head : null;

    const decorations: Range<Decoration>[] = [];
    const misspelledDeco = Decoration.mark({ class: "cm-misspelled" });

    for (let i = 0; i < linesToCheck.length; i++) {
      const line = linesToCheck[i];
      const rawRanges = lineRangesMap.get(i) ?? [];

      let caretOffset: number | null = null;
      if (this.isTyping && caretPos !== null && caretPos >= line.from && caretPos <= line.to) {
        caretOffset = caretPos - line.from;
      }

      const filtered = filterMisspelledRanges(line.text, rawRanges, caretOffset);

      for (const [rFrom, rTo] of filtered) {
        decorations.push(misspelledDeco.range(line.from + rFrom, line.from + rTo));
      }
    }

    decorations.sort((a, b) => a.from - b.from);

    this.view.dispatch({
      effects: setSpellDecorations.of({
        decorations,
        checkFrom,
        checkTo,
        clearAll,
      }),
    });
  }

  destroy() {
    this.isDestroyed = true;
    activeSpellPlugins.delete(this);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const spellViewPlugin = ViewPlugin.fromClass(SpellCheckPluginValue);

export function spellcheckExtension() {
  return [spellField, spellViewPlugin];
}

/** Context menu helper: returns misspelled range and word at pos, or null. */
export function misspelledAt(state: EditorState, pos: number): { from: number; to: number; word: string } | null {
  const deco = state.field(spellField, false);
  if (!deco) return null;
  let match: { from: number; to: number; word: string } | null = null;
  deco.between(Math.max(0, pos - 1), Math.min(state.doc.length, pos + 1), (from, to) => {
    if (pos >= from && pos <= to) {
      match = { from, to, word: state.sliceDoc(from, to) };
      return false;
    }
  });
  return match;
}

/** Context menu helper: clears the cache and immediately rechecks visible lines. */
export function recheckAll(view: EditorView): void {
  spellCache.clear();
  const plugin = view.plugin(spellViewPlugin);
  if (plugin) {
    void plugin.runCheck(true);
  }
}
