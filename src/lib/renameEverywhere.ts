/** Rename a section title, @name, or (topic) across every note after previewing every changed line. */
import { get } from "svelte/store";
import { NAME_CHAR } from "./grammar/symbols";
import { isTitleLine, tokenizeLine, tokenizeNoteLine } from "./grammar/tokenize";
import { t } from "./i18n";
import type { TranslationKey } from "./i18n/schema";
import { logWarn } from "./appLog";
import { ensureLoaded, notesIndex, type NoteEntry } from "./notesIndex";
import { isScratchpadKey } from "./notesIndex/entries";
import { flushAllPendingSaves, updateNoteOnDisk, writeTabContentAndWait } from "./persistence";
import { underlineFor } from "./sectionFormat";
import { activeTabId, editorApi, modal, renameModalTarget, showToast, tabs } from "./stores";
import { getSectionHeaderForLine, listSections, normalizeHeaderTitle, titleForMatching } from "./tokens";
import type { RenameKind, RenameTarget } from "./types";

export type { RenameKind, RenameTarget };

export interface ChangedLine {
  lineIdx: number;
  before: string;
  after: string;
}

export interface RenameTextResult {
  text: string;
  lines: ChangedLine[];
}

export interface RenamePlanEntry {
  filename: string;
  dateISO: string | null;
  textBefore: string;
  textAfter: string;
  lines: ChangedLine[];
}

export interface ApplyRenameResult {
  renamed: string[];
  skipped: string[];
}

export interface LineDiffSegment {
  kind: "same" | "del" | "ins";
  text: string;
}

const NAME_RE = new RegExp(String.raw`^${NAME_CHAR}+$`, "u");

function stripAt(s: string): string {
  return s.startsWith("@") ? s.slice(1) : s;
}

/** Normalize user-entered `to` (e.g., drop a leading `@` for names, trim titles). */
export function normalizeRenameValue(kind: RenameKind, value: string): string {
  if (kind === "name") return stripAt(value);
  if (kind === "title") return value.trim();
  return value;
}

/** `null` when valid, otherwise the translation key explaining why `target.to` is invalid. */
export function validTarget(target: RenameTarget): TranslationKey | null {
  if (target.kind === "name") {
    const from = stripAt(target.from);
    const to = stripAt(target.to);
    if (!NAME_RE.test(to)) return "rename.invalid.name";
    if (to === from) return "rename.invalid.same";
    return null;
  }
  if (target.kind === "topic") {
    if (target.to.length === 0 || /\s|[()]/.test(target.to)) return "rename.invalid.topic";
    if (target.to === target.from) return "rename.invalid.same";
    return null;
  }
  const trimmedTo = target.to.trim();
  const trimmedFrom = target.from.trim();
  if (
    trimmedTo.length === 0 ||
    /[\r\n]/.test(trimmedTo) ||
    trimmedTo.startsWith("[") ||
    /^\d{4}-\d{2}-\d{2}/.test(trimmedTo)
  ) {
    return "rename.invalid.title";
  }
  if (trimmedTo === trimmedFrom) return "rename.invalid.same";
  return null;
}

/** Split a section title line into preserved prefixes (whitespace, time, [CANCELED], leading date),
 * the core title matched by `titleForMatching(normalizeHeaderTitle(...))`, and preserved suffixes
 * (trailing date + separator, trailing whitespace). */
function splitSectionTitleLine(rawLine: string): { prefix: string; core: string; suffix: string } {
  const leadWs = /^(\s*)/.exec(rawLine)![1];
  const trailWs = /(\s*)$/.exec(rawLine)![1];
  let rest = rawLine.slice(leadWs.length, rawLine.length - trailWs.length);
  let prefix = leadWs;

  const timeMatch = /^\[\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\]\s*/.exec(rest);
  if (timeMatch) {
    prefix += timeMatch[0];
    rest = rest.slice(timeMatch[0].length);
  }
  const canceledMatch = /^\[CANCELED\]\s*/.exec(rest);
  if (canceledMatch) {
    prefix += canceledMatch[0];
    rest = rest.slice(canceledMatch[0].length);
  }
  const leadDateMatch = /^\d{4}-\d{2}-\d{2}\s*[-:]?\s*/.exec(rest);
  if (leadDateMatch) {
    prefix += leadDateMatch[0];
    rest = rest.slice(leadDateMatch[0].length);
  }

  let suffix = trailWs;
  const trailDateMatch = /\s*[-:]?\s*\d{4}-\d{2}-\d{2}$/.exec(rest);
  if (trailDateMatch) {
    suffix = trailDateMatch[0] + suffix;
    rest = rest.slice(0, rest.length - trailDateMatch[0].length);
  }

  return { prefix, core: rest.trim(), suffix };
}

export function renameInText(
  text: string,
  target: RenameTarget,
  opts: { titles: boolean },
): RenameTextResult {
  if (target.kind === "title") {
    if (!opts.titles) return { text, lines: [] };
    const fromCoreLower = titleForMatching(normalizeHeaderTitle(target.from)).toLowerCase();
    const newCore = target.to.trim();
    if (!fromCoreLower || !newCore) return { text, lines: [] };

    const lines = text.split("\n");
    const changed: ChangedLine[] = [];
    for (const sec of listSections(text)) {
      if (titleForMatching(normalizeHeaderTitle(sec.title)).toLowerCase() !== fromCoreLower) continue;
      const oldLine = lines[sec.lineIdx];
      const { prefix, suffix } = splitSectionTitleLine(oldLine);
      const newLine = prefix + newCore + suffix;
      if (newLine === oldLine) continue;
      lines[sec.lineIdx] = newLine;
      changed.push({ lineIdx: sec.lineIdx, before: oldLine, after: newLine });
      if (sec.lineIdx + 1 < lines.length && lines[sec.lineIdx + 1] === underlineFor(oldLine)) {
        lines[sec.lineIdx + 1] = underlineFor(newLine);
      }
    }
    return changed.length > 0 ? { text: lines.join("\n"), lines: changed } : { text, lines: [] };
  }

  const fromLower = (target.kind === "name" ? stripAt(target.from) : target.from).toLowerCase();
  const replacement =
    target.kind === "name" ? "@" + stripAt(target.to) : "(" + target.to + ")";
  if (!fromLower || (target.kind === "name" ? replacement === "@" : replacement === "()")) {
    return { text, lines: [] };
  }

  const quickChar = target.kind === "name" ? "@" : "(";
  const tokenKind = target.kind === "name" ? "assignee" : "topicTag";
  const lines = text.split("\n");
  const changed: ChangedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(quickChar)) continue;
    const tokens = tokenizeNoteLine(lines, i);
    const matches = tokens.filter((tok) => {
      if (tok.kind !== tokenKind) return false;
      const inner =
        tokenKind === "assignee" ? line.slice(tok.from + 1, tok.to) : line.slice(tok.from + 1, tok.to - 1);
      return inner.toLowerCase() === fromLower;
    });
    if (matches.length === 0) continue;

    let out = "";
    let cursor = 0;
    for (const tok of matches) {
      out += line.slice(cursor, tok.from) + replacement;
      cursor = tok.to;
    }
    out += line.slice(cursor);
    if (out !== line) {
      lines[i] = out;
      changed.push({ lineIdx: i, before: line, after: out });
    }
  }

  return changed.length > 0 ? { text: lines.join("\n"), lines: changed } : { text, lines: [] };
}

/** Splits `before` into unchanged, deleted, and inserted segments for the preview list. */
export function diffRenameLine(before: string, target: RenameTarget): LineDiffSegment[] {
  if (target.kind === "title") {
    const { prefix, core, suffix } = splitSectionTitleLine(before);
    const newCore = target.to.trim();
    const out: LineDiffSegment[] = [];
    if (prefix) out.push({ kind: "same", text: prefix });
    out.push({ kind: "del", text: core });
    out.push({ kind: "ins", text: newCore });
    if (suffix) out.push({ kind: "same", text: suffix });
    return out;
  }

  const fromLower = (target.kind === "name" ? stripAt(target.from) : target.from).toLowerCase();
  const replacement = target.kind === "name" ? "@" + stripAt(target.to) : "(" + target.to + ")";
  const tokenKind = target.kind === "name" ? "assignee" : "topicTag";
  const matches = tokenizeLine(before).filter((tok) => {
    if (tok.kind !== tokenKind) return false;
    const inner =
      tokenKind === "assignee" ? before.slice(tok.from + 1, tok.to) : before.slice(tok.from + 1, tok.to - 1);
    return inner.toLowerCase() === fromLower;
  });
  if (matches.length === 0) return [{ kind: "same", text: before }];

  const out: LineDiffSegment[] = [];
  let cursor = 0;
  for (const tok of matches) {
    if (tok.from > cursor) out.push({ kind: "same", text: before.slice(cursor, tok.from) });
    out.push({ kind: "del", text: before.slice(tok.from, tok.to) });
    out.push({ kind: "ins", text: replacement });
    cursor = tok.to;
  }
  if (cursor < before.length) out.push({ kind: "same", text: before.slice(cursor) });
  return out;
}

function compareEntriesNewestFirst(a: NoteEntry, b: NoteEntry): number {
  const aDate = a.dateISO ?? "";
  const bDate = b.dateISO ?? "";
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;
  return a.filename < b.filename ? 1 : a.filename > b.filename ? -1 : 0;
}

export async function planRename(
  target: RenameTarget,
  todayISO: string,
  entriesOverride?: ReadonlyMap<string, NoteEntry>,
): Promise<RenamePlanEntry[]> {
  if (validTarget(target) !== null) return [];

  let entries = entriesOverride;
  if (!entries) {
    await ensureLoaded();
    entries = get(notesIndex).entries;
  }

  const candidates: NoteEntry[] = [];
  for (const entry of entries.values()) {
    if (!isScratchpadKey(entry.key)) candidates.push(entry);
  }
  candidates.sort(compareEntriesNewestFirst);

  const plan: RenamePlanEntry[] = [];
  for (const entry of candidates) {
    const isFuture = entry.dateISO !== null && entry.dateISO > todayISO;
    const titles = target.kind === "title" && !isFuture;
    const res = renameInText(entry.text, target, { titles });
    if (res.lines.length > 0) {
      plan.push({
        filename: entry.filename,
        dateISO: entry.dateISO,
        textBefore: entry.text,
        textAfter: res.text,
        lines: res.lines,
      });
    }
  }
  return plan;
}

export function diffLineEdits(before: string, after: string): { lineIdx: number; text: string }[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const count = Math.min(beforeLines.length, afterLines.length);
  const edits: { lineIdx: number; text: string }[] = [];
  for (let i = 0; i < count; i++) {
    if (beforeLines[i] !== afterLines[i]) {
      edits.push({ lineIdx: i, text: afterLines[i] });
    }
  }
  return edits;
}

function formatSkippedDates(filenames: readonly string[], entries: readonly RenamePlanEntry[]): string {
  const byName = new Map(entries.map((e) => [e.filename, e]));
  return filenames
    .map((fn) => {
      const e = byName.get(fn);
      return e?.dateISO ?? fn.replace(/\.txt$/, "");
    })
    .join(", ");
}

async function applyNoteBatch(
  entries: readonly RenamePlanEntry[],
  direction: "forward" | "undo",
): Promise<ApplyRenameResult> {
  await flushAllPendingSaves();

  const renamed: string[] = [];
  const skipped: string[] = [];
  let touchedClosedNote = false;

  for (const entry of entries) {
    const expectedBefore = direction === "forward" ? entry.textBefore : entry.textAfter;
    const nextText = direction === "forward" ? entry.textAfter : entry.textBefore;

    const openTab = get(tabs).find((tab) => !tab.isScratchpad && tab.filename === entry.filename);
    if (openTab) {
      if (openTab.content !== expectedBefore) {
        skipped.push(entry.filename);
        continue;
      }
      try {
        if (openTab.id === get(activeTabId) && editorApi?.applyLineEdits) {
          editorApi.applyLineEdits(diffLineEdits(expectedBefore, nextText));
          await writeTabContentAndWait(openTab.id, nextText, expectedBefore, {
            keepVersion: true,
            alreadyAppliedInEditor: true,
          });
        } else {
          await writeTabContentAndWait(openTab.id, nextText, expectedBefore, { keepVersion: true });
        }
        renamed.push(entry.filename);
      } catch (e) {
        logWarn(`rename: failed writing open tab ${entry.filename}: ${e}`);
        skipped.push(entry.filename);
      }
    } else {
      try {
        let wrote = false;
        await updateNoteOnDisk(
          entry.filename,
          (current) => {
            if (current !== expectedBefore) {
              wrote = false;
              return current;
            }
            wrote = true;
            return nextText;
          },
          { keepVersion: true },
        );
        if (wrote) {
          renamed.push(entry.filename);
          touchedClosedNote = true;
        } else {
          skipped.push(entry.filename);
        }
      } catch (e) {
        logWarn(`rename: failed writing closed note ${entry.filename}: ${e}`);
        skipped.push(entry.filename);
      }
    }
  }

  if (touchedClosedNote) {
    await ensureLoaded();
  }

  return { renamed, skipped };
}

export async function undoRename(entries: readonly RenamePlanEntry[]): Promise<ApplyRenameResult> {
  const result = await applyNoteBatch(entries, "undo");
  const translate = get(t);
  const skippedMsg =
    result.skipped.length > 0
      ? translate("rename.toast.skipped", {
          count: result.skipped.length,
          dates: formatSkippedDates(result.skipped, entries),
        })
      : "";

  if (result.renamed.length > 0) {
    const undoneMsg = translate("rename.toast.undone", { count: result.renamed.length });
    const msg = skippedMsg ? `${undoneMsg} ${skippedMsg}` : undoneMsg;
    showToast(msg, skippedMsg ? { durationMs: 10_000 } : undefined);
  } else if (skippedMsg) {
    showToast(skippedMsg, { durationMs: 10_000 });
  }
  return result;
}

export async function applyRename(
  plan: readonly RenamePlanEntry[],
  ticked: ReadonlySet<string>,
): Promise<ApplyRenameResult> {
  const toApply = plan.filter((e) => ticked.has(e.filename));
  const result = await applyNoteBatch(toApply, "forward");
  const translate = get(t);
  const skippedMsg =
    result.skipped.length > 0
      ? translate("rename.toast.skipped", {
          count: result.skipped.length,
          dates: formatSkippedDates(result.skipped, toApply),
        })
      : "";

  if (result.renamed.length > 0) {
    const renamedSet = new Set(result.renamed);
    const renamedEntries = toApply.filter((e) => renamedSet.has(e.filename));
    const renamedMsg = translate("rename.toast.renamed", { count: result.renamed.length });
    const msg = skippedMsg ? `${renamedMsg} ${skippedMsg}` : renamedMsg;
    showToast(msg, {
      durationMs: 10_000,
      action: () => {
        void undoRename(renamedEntries);
      },
    });
  } else if (skippedMsg) {
    showToast(skippedMsg, { durationMs: 10_000 });
  }

  return result;
}

/** Target for the line menu at `(line, col)`: token under `col` wins, then section title line. */
export function renameTargetAt(
  line: string,
  col?: number,
  options?: { title?: boolean; isSectionTitle?: boolean },
): RenameTarget | null {
  const tokens = tokenizeLine(line, { title: options?.title });
  if (col !== undefined) {
    const tok = tokens.find(
      (t) => (t.kind === "assignee" || t.kind === "topicTag") && col >= t.from && col <= t.to,
    );
    if (tok?.kind === "assignee") {
      const name = line.slice(tok.from + 1, tok.to);
      return name ? { kind: "name", from: name, to: name } : null;
    }
    if (tok?.kind === "topicTag") {
      const topic = line.slice(tok.from + 1, tok.to - 1);
      return topic ? { kind: "topic", from: topic, to: topic } : null;
    }
  }
  if (options?.isSectionTitle) {
    const core = titleForMatching(normalizeHeaderTitle(line));
    return core ? { kind: "title", from: core, to: core } : null;
  }
  return null;
}

/** Targets for the command palette's three rename commands at the caret offset in `text`. */
export function renameTargetsForCursor(
  text: string,
  offset: number,
): { section: RenameTarget | null; name: RenameTarget | null; topic: RenameTarget | null } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, clamped);
  const lines = text.split("\n");
  const lastNl = before.lastIndexOf("\n");
  const lineIdx = before.split("\n").length - 1;
  const col = clamped - (lastNl + 1);
  const line = lines[lineIdx] ?? "";

  const rawHeader = getSectionHeaderForLine(lines, lineIdx);
  const coreHeader = rawHeader ? titleForMatching(normalizeHeaderTitle(rawHeader)) : "";
  const section: RenameTarget | null = coreHeader
    ? { kind: "title", from: coreHeader, to: coreHeader }
    : null;

  const isTitle = isTitleLine(line, lines[lineIdx + 1]);
  const tokens = tokenizeLine(line, { title: isTitle });
  const nameTok = tokens.find((t) => t.kind === "assignee" && col >= t.from && col <= t.to);
  const topicTok = tokens.find((t) => t.kind === "topicTag" && col >= t.from && col <= t.to);

  const nameStr = nameTok ? line.slice(nameTok.from + 1, nameTok.to) : "";
  const topicStr = topicTok ? line.slice(topicTok.from + 1, topicTok.to - 1) : "";

  return {
    section,
    name: nameStr ? { kind: "name", from: nameStr, to: nameStr } : null,
    topic: topicStr ? { kind: "topic", from: topicStr, to: topicStr } : null,
  };
}

export function openRenameModal(target: RenameTarget): void {
  renameModalTarget.set(target);
  modal.set("rename");
}
