/** Phone companion, phase 2: the pure part of applying `.chrononote-mobile/inbox.json` requests to notes: parsing and
 * validating the file, and rewriting one note's text for a request. No stores, no API. Format:
 * `docs/phone-companion-file-guide.md` (section 3); rules: spec section 6.7. */
import { isValidCalendarDate, tokenizeLine } from "./grammar/tokenize";
import { underlineFor } from "./sectionFormat";
import {
  isSetextUnderline,
  normalizeHeaderTitle,
  setActionSymbolTo,
  setTopicSymbolTo,
  titleForMatching,
} from "./tokens";

export type PhoneState = "open" | "done" | "wontdo" | "discussed" | "postponed";
export type LineKind = "action" | "topic";
interface RequestBase {
  id: string;
  made?: string;
  date: string;
  section?: string;
}
export interface AddLineRequest extends RequestBase {
  type: "addLine";
  text: string;
}
export interface SetStateRequest extends RequestBase {
  type: "setState";
  line: string;
  n: number;
  state: PhoneState;
}
export type InboxRequest = AddLineRequest | SetStateRequest;

const STATES: readonly string[] = ["open", "done", "wontdo", "discussed", "postponed"];
const MAX_TEXT_LENGTH = 1000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parses the inbox file's text. Strips a leading BOM. null for null input, invalid JSON, or a value that isn't an
 * object with a numeric `format` and an array `requests`. */
export function parseInbox(text: string | null): { format: number; requests: unknown[] } | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.format !== "number" || !Array.isArray(value.requests)) return null;
  return { format: value.format, requests: value.requests };
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && isValidCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** One raw entry of `requests`. `id` must be a non-empty string, else `{ ok: false, id: null }` (can't be reported).
 * Otherwise invalid (`{ ok: false, id }`) when: `type` is not addLine/setState; `date` is not a real calendar date
 * `YYYY-MM-DD`; `section` is present but not a string; addLine `text` not a string, empty after trimming, containing
 * `\n` or `\r`, or longer than 1000 characters; setState `line` not a string, `n` not an integer >= 1, `state` not one
 * of PhoneState. Unknown extra fields are ignored. */
export function validateRequest(raw: unknown): { ok: true; request: InboxRequest } | { ok: false; id: string | null } {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "") return { ok: false, id: null };
  const id = raw.id;
  const invalid = { ok: false, id } as const;
  if (typeof raw.date !== "string" || !isRealDate(raw.date)) return invalid;
  if (raw.section !== undefined && typeof raw.section !== "string") return invalid;
  const base: RequestBase = { id, date: raw.date };
  if (typeof raw.made === "string") base.made = raw.made;
  if (raw.section !== undefined) base.section = raw.section as string;

  if (raw.type === "addLine") {
    const text = raw.text;
    if (typeof text !== "string" || text.trim() === "" || /[\r\n]/.test(text) || text.length > MAX_TEXT_LENGTH) {
      return invalid;
    }
    return { ok: true, request: { ...base, type: "addLine", text } };
  }
  if (raw.type === "setState") {
    const { line, n, state } = raw;
    if (typeof line !== "string" || typeof n !== "number" || !Number.isInteger(n) || n < 1) return invalid;
    if (typeof state !== "string" || !STATES.includes(state)) return invalid;
    return { ok: true, request: { ...base, type: "setState", line, n, state: state as PhoneState } };
  }
  return invalid;
}

export type ApplyOutcome =
  | { result: "applied"; text: string; changed: boolean }
  | { result: "conflict"; reason: "lineChanged" | "lineAmbiguous" }
  | { result: "rejected"; reason: "invalid" };

// --- Note structure ---

/** A note as its lines, without the empty piece after a final newline (`trailing` remembers it). */
function toLines(note: string): { lines: string[]; trailing: boolean } {
  const trailing = note.endsWith("\n");
  if (note === "") return { lines: [], trailing };
  return { lines: (trailing ? note.slice(0, -1) : note).split("\n"), trailing };
}

function fromLines(lines: string[], trailing: boolean): string {
  return lines.length === 0 ? "" : lines.join("\n") + (trailing ? "\n" : "");
}

/** Indexes of the section title lines (a non-blank line followed by a setext underline), as `listSections` finds them. */
function titleIndexes(lines: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (isSetextUnderline(lines[i + 1]) && !isSetextUnderline(lines[i]) && lines[i].trim() !== "") out.push(i);
  }
  return out;
}

/** The form in which two titles are the same meeting: the one Section History compares. */
function titleKey(title: string): string {
  return titleForMatching(normalizeHeaderTitle(title.trim())).toLowerCase();
}

/** The body lines `[start, end)` a request's `section` points to: the first matching section's, or the day part (the
 * lines before the first title) without a section. null when no section matches. */
function bodyOf(lines: string[], titles: number[], section: string | undefined): { start: number; end: number } | null {
  if (section === undefined || section.trim() === "") return { start: 0, end: titles[0] ?? lines.length };
  const key = titleKey(section);
  const k = titles.findIndex((t) => titleKey(lines[t]) === key);
  if (k < 0) return null;
  return { start: titles[k] + 2, end: titles[k + 1] ?? lines.length };
}

function lastNonBlank(lines: string[], start: number, end: number): number {
  for (let i = end - 1; i >= start; i--) if (lines[i].trim() !== "") return i;
  return -1;
}

// --- Line state ---

type Kind = LineKind;

/** The kind of a line's state symbol (as `stateSymbolOf` finds it), or null when it has none. */
export function stateKindOf(line: string): LineKind | null {
  return stateSymbolOf(line)?.kind ?? null;
}

/** The lines of `section` (same section matching as applySetState; undefined/blank = the day part) that carry a state
 * symbol, deferred `>` lines left out. `line` is the 0-based line index in the note. null when the section is gone. */
export function sectionStateLines(
  note: string,
  section: string | undefined,
): { line: number; text: string; kind: LineKind }[] | null {
  const { lines } = toLines(note);
  const titles = titleIndexes(lines);
  const body = bodyOf(lines, titles, section);
  if (!body) return null;
  const out: { line: number; text: string; kind: LineKind }[] = [];
  for (let i = body.start; i < body.end; i++) {
    const sym = stateSymbolOf(lines[i]);
    if (sym && sym.sym !== ">") {
      out.push({ line: i, text: lines[i], kind: sym.kind });
    }
  }
  return out;
}

/** `line` with its state symbol replaced by the one for `state` (same kind), or null when that is not possible. */
export function lineWithState(line: string, state: PhoneState): string | null {
  const sym = stateSymbolOf(line);
  if (!sym || sym.sym === ">") return null;
  const newSym = SYMBOLS[sym.kind][state];
  if (newSym === undefined) return null;
  if (stateOfSymbol(sym.sym) === state) return line;

  const col = sym.index + 1;
  return sym.kind === "action"
    ? setActionSymbolTo(line, newSym as "#" | "v" | "x", col)
    : setTopicSymbolTo(line, newSym as "o" | "." | ",", col);
}

/** Sets the state of line `line` (0-based). `rejected`/`invalid` when that line has no state symbol, has `>`, or the
 * state doesn't fit its kind (done on a topic, discussed on an action...). Already in that state: applied, unchanged. */
export function applyStateAtLine(note: string, line: number, state: PhoneState): ApplyOutcome {
  const { lines, trailing } = toLines(note);
  const rejected: ApplyOutcome = { result: "rejected", reason: "invalid" };
  if (line < 0 || line >= lines.length) return rejected;
  const targetLine = lines[line];
  const sym = stateSymbolOf(targetLine);
  if (!sym || sym.sym === ">") return rejected;
  const newSym = SYMBOLS[sym.kind][state];
  if (newSym === undefined) return rejected;
  if (stateOfSymbol(sym.sym) === state) return unchanged(note);

  const replaced = lineWithState(targetLine, state);
  if (replaced === null) return rejected;
  const next = [...lines];
  next[line] = replaced;
  return { result: "applied", text: fromLines(next, trailing), changed: replaced !== targetLine };
}

/** The symbol that gives a line its state: its first symbol after the indentation, or right after a leading `=> `. */
function stateSymbolOf(line: string): { index: number; sym: string; kind: Kind } | null {
  const tokens = tokenizeLine(line);
  const first = tokens[0];
  if (!first) return null;
  if (first.kind === "action" || first.kind === "topic") {
    return { index: first.from, sym: first.symbol!, kind: first.kind };
  }
  const next = tokens[1];
  if (
    first.kind === "arrow" &&
    line.slice(0, first.from).trim() === "" &&
    next &&
    next.from === first.to &&
    (next.kind === "consequence" || next.kind === "consequenceTopic") &&
    line[next.from] === next.symbol
  ) {
    return { index: next.from, sym: next.symbol!, kind: next.kind === "consequence" ? "action" : "topic" };
  }
  return null;
}

const SYMBOLS: Record<Kind, Partial<Record<PhoneState, string>>> = {
  action: { open: "#", done: "v", wontdo: "x" },
  topic: { open: "o", discussed: ".", postponed: "," },
};

/** The state a symbol stands for; null for the deferred `>`, which no request reaches. */
function stateOfSymbol(sym: string): PhoneState | null {
  for (const kind of ["action", "topic"] as const) {
    for (const [state, s] of Object.entries(SYMBOLS[kind])) if (s === sym) return state as PhoneState;
  }
  return null;
}

const conflict = (reason: "lineChanged" | "lineAmbiguous"): ApplyOutcome => ({ result: "conflict", reason });
const unchanged = (note: string): ApplyOutcome => ({ result: "applied", text: note, changed: false });

/** Applies a setState to one note's text (LF line endings). Rules: spec section 6.7. */
export function applySetState(note: string, req: SetStateRequest): ApplyOutcome {
  const { lines } = toLines(note);
  const body = bodyOf(lines, titleIndexes(lines), req.section);
  if (!body) return conflict("lineChanged");

  const exact: number[] = [];
  for (let i = body.start; i < body.end; i++) if (lines[i] === req.line) exact.push(i);

  let target: number;
  if (exact.length === 1) {
    target = exact[0];
  } else if (exact.length > 1) {
    // The phone saw one of several equal lines; its number says which (the line may have moved, then it is a conflict).
    const at = exact.find((i) => i + 1 === req.n);
    if (at === undefined) return conflict("lineAmbiguous");
    target = at;
  } else {
    // The line may only have changed state since the phone read it.
    const want = stateSymbolOf(req.line);
    if (!want) return conflict("lineChanged");
    const before = req.line.slice(0, want.index);
    const after = req.line.slice(want.index + 1);
    const similar: string[] = [];
    for (let i = body.start; i < body.end; i++) {
      const s = stateSymbolOf(lines[i]);
      // Same kind only: an action request never matches a topic with the same text, or the reverse.
      if (s && s.kind === want.kind && lines[i].slice(0, s.index) === before && lines[i].slice(s.index + 1) === after) {
        similar.push(s.sym);
      }
    }
    if (similar.length === 1 && stateOfSymbol(similar[0]) === req.state) return unchanged(note);
    return conflict("lineChanged");
  }

  return applyStateAtLine(note, target, req.state);
}

/** Applies an addLine. `agendaTitles`: that day's live agenda meeting titles in agenda order (already cleaned, as
 * `read_agenda_for_date` returns them). Always `applied`. */
export function applyAddLine(note: string, req: AddLineRequest, agendaTitles: string[]): ApplyOutcome {
  const applied = (text: string): ApplyOutcome => ({ result: "applied", text, changed: true });
  const section = req.section?.trim() ?? "";

  if (note === "") {
    return applied(section === "" ? `${req.text}\n` : `${section}\n${underlineFor(section)}\n${req.text}\n`);
  }

  const { lines, trailing } = toLines(note);
  const titles = titleIndexes(lines);
  const body = bodyOf(lines, titles, section);

  if (body) {
    const last = lastNonBlank(lines, body.start, body.end);
    if (section === "" && last < 0) {
      // Nothing in the day part: the line becomes the first line, kept apart from a title right behind it.
      lines.splice(0, 0, req.text, ...(titles[0] === 0 ? [""] : []));
    } else {
      // An empty or blank section body: directly after the underline.
      lines.splice(last < 0 ? body.start : last + 1, 0, req.text);
    }
    return applied(fromLines(lines, trailing));
  }

  // No such section yet: a new one, in agenda order when the meeting is in the agenda.
  const agenda = agendaTitles.map(titleKey);
  const own = agenda.indexOf(titleKey(section));
  let at = lines.length;
  let beforeSection = false;
  if (own >= 0) {
    const later = new Set(agenda.slice(own + 1));
    const k = titles.findIndex((t) => later.has(titleKey(lines[t])));
    if (k >= 0) {
      at = titles[k];
      beforeSection = true;
    }
  }
  const block: string[] = [];
  if (at > 0 && lines[at - 1].trim() !== "") block.push("");
  block.push(section, underlineFor(section), req.text);
  if (beforeSection) block.push("");
  lines.splice(at, 0, ...block);
  return applied(fromLines(lines, trailing));
}
