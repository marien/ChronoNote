import { escapeHtml } from "./exportFormats";
import {
  isTitleLine,
  isTitleUnderline,
  isValidCalendarDate,
  tokenAfterArrow,
  tokenizeNoteLine,
  type Token,
} from "./grammar/tokenize";
import { listSections } from "./tokens";

export interface MinutesLabels {
  decisions: string;
  actions: string;
  done: string;
  stillOpen: string;
  remember: string;
  notDiscussed: string;
  by: string;
}

export interface MinutesInput {
  noteText: string;
  lineIdx: number;
  dateISO: string | null;
  locale: string;
  ownerName: string;
  labels: MinutesLabels;
}

type Segment =
  | { from: number; to: number; kind: "action"; symbol: "#" | "v" | ">" | "x" }
  | { from: number; to: number; kind: "topic"; symbol: "o" | "." | "," }
  | { from: number; to: number; kind: "delegated"; owner: string; delegatingToken: Token }
  | { from: number; to: number; kind: "followup" }
  | { from: number; to: number; kind: "remember" }
  | { from: number; to: number; kind: "other" };

interface ExtractedSegment {
  seg: Segment;
  text: string;
  tag: string | null;
  dueDate: string | null;
}

function capitalizeFirst(text: string, locale: string): string {
  if (!text) return text;
  const chars = Array.from(text);
  return chars[0].toLocaleUpperCase(locale) + chars.slice(1).join("");
}

function parseValidISO(iso: string | null): [number, number, number] | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!isValidCalendarDate(y, mo, d)) return null;
  return [y, mo, d];
}

function formatLongDate(iso: string, locale: string): string | null {
  const parts = parseValidISO(iso);
  if (!parts) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(parts[0], parts[1] - 1, parts[2], 12));
}

function formatShortDate(iso: string, locale: string): string | null {
  const parts = parseValidISO(iso);
  if (!parts) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(parts[0], parts[1] - 1, parts[2], 12));
}

function splitLineSegments(line: string, tokens: readonly Token[]): Segment[] {
  const arrowIndices: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === "arrow") arrowIndices.push(i);
  }

  const segments: Segment[] = [];
  const firstEnd = arrowIndices.length > 0 ? tokens[arrowIndices[0]].from : line.length;
  const firstTok = tokens[0];

  if (firstTok?.kind === "action") {
    segments.push({ from: 0, to: firstEnd, kind: "action", symbol: firstTok.symbol as "#" | "v" | ">" | "x" });
  } else if (firstTok?.kind === "topic") {
    segments.push({ from: 0, to: firstEnd, kind: "topic", symbol: firstTok.symbol as "o" | "." | "," });
  } else if (firstTok?.kind === "emphasis") {
    segments.push({ from: 0, to: firstEnd, kind: "remember" });
  } else {
    segments.push({ from: 0, to: firstEnd, kind: "other" });
  }

  for (let k = 0; k < arrowIndices.length; k++) {
    const arrowIdx = arrowIndices[k];
    const arrowTok = tokens[arrowIdx];
    const from = arrowTok.from;
    const to = k + 1 < arrowIndices.length ? tokens[arrowIndices[k + 1]].from : line.length;
    const next = tokenAfterArrow(line, tokens, arrowIdx);

    if (next?.kind === "consequence") {
      segments.push({ from, to, kind: "action", symbol: next.symbol as "#" | "v" | ">" | "x" });
    } else if (next?.kind === "assignee") {
      segments.push({
        from,
        to,
        kind: "delegated",
        owner: line.slice(next.from + 1, next.to),
        delegatingToken: next,
      });
    } else if (next?.kind === "consequenceTopic") {
      segments.push({ from, to, kind: "topic", symbol: next.symbol as "o" | "." | "," });
    } else {
      segments.push({ from, to, kind: "followup" });
    }
  }

  return segments;
}

function extractSegment(line: string, tokens: readonly Token[], seg: Segment): ExtractedSegment {
  const dropRanges: Array<{ from: number; to: number }> = [];
  let tag: string | null = null;
  let dueDate: string | null = null;
  const delegatingTok = seg.kind === "delegated" ? seg.delegatingToken : undefined;

  for (const t of tokens) {
    if (t.from < seg.from || t.from >= seg.to) continue;
    switch (t.kind) {
      case "action":
      case "topic":
      case "bullet":
      case "arrow":
      case "consequence":
      case "consequenceTopic":
      case "escape":
      case "forwardLink":
        dropRanges.push({ from: t.from, to: Math.min(t.to, seg.to) });
        break;
      case "emphasis":
        dropRanges.push({ from: t.from, to: Math.min(t.from + 2, seg.to) });
        break;
      case "topicTag":
        tag = line.slice(t.from, t.to);
        dropRanges.push({ from: t.from, to: Math.min(t.to, seg.to) });
        break;
      case "due":
        dueDate = t.date ?? null;
        dropRanges.push({ from: t.from, to: Math.min(t.to, seg.to) });
        break;
      case "assignee":
        if (t === delegatingTok) {
          dropRanges.push({ from: t.from, to: Math.min(t.to, seg.to) });
        }
        break;
      default:
        break;
    }
  }

  dropRanges.sort((a, b) => a.from - b.from || a.to - b.to);
  let pos = seg.from;
  let raw = "";
  for (const r of dropRanges) {
    if (r.from > pos) raw += line.slice(pos, r.from);
    if (r.to > pos) pos = r.to;
  }
  if (pos < seg.to) raw += line.slice(pos, seg.to);

  const text = raw.replace(/\s+/g, " ").trim();
  return { seg, text, tag, dueDate };
}

function formatTextWithTag(text: string, tag: string | null, locale: string, uppercase: boolean): string {
  const head = uppercase ? capitalizeFirst(text, locale) : text;
  if (head && tag) return `${head} ${tag}`;
  return head || tag || "";
}

function formatActionEntry(
  text: string,
  tag: string | null,
  owner: string | null,
  dueDate: string | null,
  locale: string,
  byLabel: string,
): string {
  let out = formatTextWithTag(text, tag, locale, true);
  if (owner) out += `: ${capitalizeFirst(owner, locale)}`;
  if (dueDate) {
    const formattedDue = formatShortDate(dueDate, locale);
    if (formattedDue) out += `, ${byLabel} ${formattedDue}`;
  }
  return out;
}

export function buildMinutes(input: MinutesInput): { html: string; plain: string; empty: boolean } | null {
  const { noteText, lineIdx, dateISO, locale, ownerName, labels } = input;
  const lines = noteText.split("\n");
  if (lineIdx < 0 || lineIdx >= lines.length) return null;

  const sections = listSections(noteText);
  let sectionIdx = -1;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].lineIdx <= lineIdx) sectionIdx = i;
    else break;
  }
  if (sectionIdx === -1) return null;

  const section = sections[sectionIdx];
  const bodyStart = section.lineIdx + 2;
  const bodyEnd = sectionIdx + 1 < sections.length ? sections[sectionIdx + 1].lineIdx : lines.length;

  const decisions: string[] = [];
  const actions: string[] = [];
  const done: string[] = [];
  const stillOpen: string[] = [];
  const remember: string[] = [];

  const cleanOwner = ownerName.trim() || null;

  for (let i = bodyStart; i < bodyEnd; i++) {
    const line = lines[i];
    if (isTitleLine(line, lines[i + 1]) || isTitleUnderline(line) || line.trim() === "") continue;

    const tokens = tokenizeNoteLine(lines, i);
    if (tokens.length === 0) continue;

    const extracted = splitLineSegments(line, tokens).map((seg) => extractSegment(line, tokens, seg));

    for (let j = 0; j < extracted.length; j++) {
      // A delegated follow-up (=> @name) owns the preceding part, so that part is not listed separately.
      if (j + 1 < extracted.length && extracted[j + 1].seg.kind === "delegated") {
        continue;
      }

      const cur = extracted[j];
      const seg = cur.seg;

      if (seg.kind === "action") {
        if (!cur.text && !cur.tag) continue;
        if (seg.symbol === "#") {
          actions.push(formatActionEntry(cur.text, cur.tag, cleanOwner, cur.dueDate, locale, labels.by));
        } else if (seg.symbol === "v") {
          done.push(formatActionEntry(cur.text, cur.tag, null, cur.dueDate, locale, labels.by));
        }
      } else if (seg.kind === "delegated") {
        const prev = j > 0 ? extracted[j - 1] : null;
        const hasOwnText = Boolean(cur.text || cur.tag);
        const text = hasOwnText ? cur.text : (prev?.text ?? "");
        const tag = hasOwnText ? cur.tag : (prev?.tag ?? null);
        const dueDate = cur.dueDate ?? (hasOwnText ? null : (prev?.dueDate ?? null));
        if (!text && !tag) continue;
        actions.push(formatActionEntry(text, tag, seg.owner, dueDate, locale, labels.by));
      } else if (seg.kind === "followup") {
        if (!cur.text && !cur.tag) continue;
        const prev = j > 0 ? extracted[j - 1] : null;
        const subject = prev ? formatTextWithTag(prev.text, prev.tag, locale, true) : "";
        if (subject) {
          const body = formatTextWithTag(cur.text, cur.tag, locale, false);
          decisions.push(`${subject}: ${body}`);
        } else {
          decisions.push(formatTextWithTag(cur.text, cur.tag, locale, true));
        }
      } else if (seg.kind === "topic") {
        if (!cur.text && !cur.tag) continue;
        if (seg.symbol === "o") {
          stillOpen.push(formatTextWithTag(cur.text, cur.tag, locale, true));
        } else if (seg.symbol === ",") {
          stillOpen.push(`${formatTextWithTag(cur.text, cur.tag, locale, true)} (${labels.notDiscussed})`);
        }
      } else if (seg.kind === "remember") {
        if (!cur.text && !cur.tag) continue;
        remember.push(formatTextWithTag(cur.text, cur.tag, locale, true));
      }
    }
  }

  const groups: Array<{ heading: string; items: string[] }> = [
    { heading: labels.decisions, items: decisions },
    { heading: labels.actions, items: actions },
    { heading: labels.done, items: done },
    { heading: labels.stillOpen, items: stillOpen },
    { heading: labels.remember, items: remember },
  ].filter((g) => g.items.length > 0);

  const empty = groups.length === 0;
  const formattedDate = dateISO ? formatLongDate(dateISO, locale) : null;
  const titlePlain = formattedDate ? `${section.title}, ${formattedDate}` : section.title;

  const plainParts: string[] = [titlePlain];
  for (const g of groups) {
    plainParts.push("", g.heading, ...g.items.map((item) => `- ${item}`));
  }

  const htmlParts: string[] = [
    formattedDate
      ? `<p><b>${escapeHtml(section.title)}</b>, ${escapeHtml(formattedDate)}</p>`
      : `<p><b>${escapeHtml(section.title)}</b></p>`,
  ];
  for (const g of groups) {
    htmlParts.push(
      `<p><b>${escapeHtml(g.heading)}</b></p><ul>${g.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    );
  }

  return {
    html: htmlParts.join(""),
    plain: plainParts.join("\n"),
    empty,
  };
}
