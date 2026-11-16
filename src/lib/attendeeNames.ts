import { NAME_CHAR } from "./grammar/symbols";

const NAME_CHAR_RE = new RegExp(NAME_CHAR, "gu");
const TRAILING_ANNOTATION_RE = /(?:\s*(?:\([^)]*\)|\[[^\]]*\]))+\s*$/;

function keepNameChars(s: string): string {
  return s.match(NAME_CHAR_RE)?.join("") ?? "";
}

function capitalizeFirst(s: string): string {
  const chars = Array.from(s);
  if (chars.length === 0) return "";
  return chars[0].toUpperCase() + chars.slice(1).join("");
}

interface ParsedAttendee {
  first: string;
  firstLower: string;
  lastWordLower: string;
  lastInitial: string;
}

function parseDisplayName(raw: string): ParsedAttendee | null {
  const cleaned = raw.trim().replace(TRAILING_ANNOTATION_RE, "").trim();
  if (!cleaned) return null;

  let firstRaw = "";
  let lastRaw = "";

  if (cleaned.includes("@")) {
    const local = cleaned.slice(0, cleaned.indexOf("@")).trim();
    const pieces = local.split(/[._-]+/).filter(Boolean);
    if (pieces.length === 0) return null;
    firstRaw = capitalizeFirst(pieces[0]);
    lastRaw = pieces.length > 1 ? pieces[pieces.length - 1] : "";
  } else if (cleaned.includes(",")) {
    const commaIdx = cleaned.indexOf(",");
    const lastPart = cleaned.slice(0, commaIdx).trim();
    const firstPart = cleaned.slice(commaIdx + 1).trim();
    const firstWords = firstPart.split(/\s+/).filter(Boolean);
    const lastWords = lastPart.split(/\s+/).filter(Boolean);
    if (firstWords.length > 0) {
      firstRaw = firstWords[0];
      lastRaw = lastWords.length > 0 ? lastWords[lastWords.length - 1] : "";
    } else if (lastWords.length > 0) {
      firstRaw = lastWords[0];
    }
  } else {
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    firstRaw = words[0];
    lastRaw = words.length > 1 ? words[words.length - 1] : "";
  }

  const first = keepNameChars(firstRaw);
  if (!first) return null;
  const lastWord = keepNameChars(lastRaw);
  const lastChars = Array.from(lastWord);
  const lastInitial = lastChars.length > 0 ? lastChars[0].toUpperCase() : "";

  return {
    first,
    firstLower: first.toLowerCase(),
    lastWordLower: lastWord.toLowerCase(),
    lastInitial,
  };
}

/** Converts calendar display names into short `@name`s in input order without duplicates, excluding `ownName`. */
export function attendeeNames(displayNames: string[], ownName: string): string[] {
  const ownParsed = ownName.trim() ? parseDisplayName(ownName) : null;
  const ownFirstLower = ownParsed ? ownParsed.firstLower : "";

  const uniquePeople: ParsedAttendee[] = [];
  const seenPerson = new Set<string>();

  for (const raw of displayNames) {
    const parsed = parseDisplayName(raw);
    if (!parsed) continue;
    if (ownFirstLower && parsed.firstLower === ownFirstLower) continue;
    const personKey = `${parsed.firstLower}|${parsed.lastWordLower}`;
    if (seenPerson.has(personKey)) continue;
    seenPerson.add(personKey);
    uniquePeople.push(parsed);
  }

  const firstCounts = new Map<string, number>();
  for (const p of uniquePeople) {
    firstCounts.set(p.firstLower, (firstCounts.get(p.firstLower) ?? 0) + 1);
  }

  const out: string[] = [];
  const seenOut = new Set<string>();
  for (const p of uniquePeople) {
    const needsInitial = (firstCounts.get(p.firstLower) ?? 0) > 1 && p.lastInitial !== "";
    const name = needsInitial ? `${p.first}-${p.lastInitial}` : p.first;
    const key = name.toLowerCase();
    if (seenOut.has(key)) continue;
    seenOut.add(key);
    out.push(name);
  }

  return out;
}
