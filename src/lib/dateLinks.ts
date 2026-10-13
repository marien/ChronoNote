import { get } from "svelte/store";
import { activeTabId, backStack, forwardStack, type BackStackEntry, editorApi, showToast, tabs } from "./stores";
import { jumpToFileLine, openOrCreateDatedFile } from "./tabs";
import { isSetextUnderline, normalizeHeaderTitle, titleForMatching } from "./tokens";
import { t } from "./i18n";

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function parseDateLink(text: string): { date: string; section?: string } | null {
  const trimmed = text.trim();
  let dateStr = "";
  let sectionRaw: string | undefined;

  // A date with a section is a link ONLY in brackets: "(2026-10-03#Weekly Sync)", "(>2026-10-14#Weekly Sync)", "(<2026-10-13#Standup)".
  // "(2026-10-03)" is also a link to the day.
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(1, -1).trim();
    const innerMatch = /^[<>]?(\d{4}-\d{2}-\d{2})(?:#([^)]*))?$/.exec(inner);
    if (!innerMatch) return null;
    dateStr = innerMatch[1];
    sectionRaw = innerMatch[2];
  } else {
    // Bare date: "2026-10-03". A bare "2026-10-03#Standup" links only to the date (day); the section stays plain text.
    const bareMatch = /^(\d{4}-\d{2}-\d{2})(?:#.*)?$/.exec(trimmed);
    if (!bareMatch) return null;
    dateStr = bareMatch[1];
    sectionRaw = undefined;
  }

  const parts = dateStr.split("-").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || !isValidCalendarDate(parts[0], parts[1], parts[2])) {
    return null;
  }

  const section = sectionRaw?.trim();
  return section ? { date: dateStr, section } : { date: dateStr };
}

export function findSectionLine(content: string, section: string): number | null {
  const clean = section.replace(/^#\s*/, "").trim();
  const target = titleForMatching(normalizeHeaderTitle(clean)).toLowerCase();
  if (!target) return null;

  const lines = content.split("\n");
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!isSetextUnderline(lines[i + 1])) continue;
    const candidate = titleForMatching(normalizeHeaderTitle(lines[i].trim())).toLowerCase();
    if (candidate === target) {
      return i;
    }
  }
  return null;
}

export function pushBackStack(entry: BackStackEntry) {
  backStack.update((stack) => {
    const next = [...stack, entry];
    if (next.length > 50) return next.slice(next.length - 50);
    return next;
  });
}

export function pushForwardStack(entry: BackStackEntry) {
  forwardStack.update((stack) => {
    const next = [...stack, entry];
    if (next.length > 50) return next.slice(next.length - 50);
    return next;
  });
}

export async function openDateLink(target: string | { date: string; section?: string }) {
  const parsed = typeof target === "string" ? parseDateLink(target) : target;
  if (!parsed) return;

  const currentTabId = get(activeTabId);
  const currentTab = get(tabs).find((t) => t.id === currentTabId);
  if (currentTab) {
    const lineIdx = editorApi ? editorApi.getCursorLineIdx() : 0;
    pushBackStack({ filename: currentTab.filename, lineIdx });
  }
  forwardStack.set([]);

  const filename = `${parsed.date}.txt`;
  await openOrCreateDatedFile(parsed.date);

  if (parsed.section) {
    const openedTab = get(tabs).find((t) => t.filename === filename);
    const lineIdx = openedTab ? findSectionLine(openedTab.content, parsed.section) : null;
    if (lineIdx !== null) {
      await jumpToFileLine({ tabId: openedTab?.id, filename, lineIdx });
    } else {
      await jumpToFileLine({ tabId: openedTab?.id, filename, lineIdx: 0 });
      showToast(get(t)("toast.dateLink.sectionNotFound", { section: parsed.section }));
    }
  }
}

export async function navigateBack() {
  const currentTabId = get(activeTabId);
  const currentTab = get(tabs).find((t) => t.id === currentTabId);
  const currentPlace: BackStackEntry | null = currentTab
    ? { filename: currentTab.filename, lineIdx: editorApi ? editorApi.getCursorLineIdx() : 0 }
    : null;

  const stack = [...get(backStack)];
  let target: BackStackEntry | null = null;
  while (stack.length > 0) {
    const entry = stack.pop()!;
    const list = get(tabs);
    const existing = list.find((t) => t.filename === entry.filename);
    if (existing || /^\d{4}-\d{2}-\d{2}(\.txt)?$/.test(entry.filename)) {
      target = entry;
      break;
    }
  }
  backStack.set(stack);

  if (target) {
    if (currentPlace) {
      pushForwardStack(currentPlace);
    }
    const entry: BackStackEntry = target;
    const list = get(tabs);
    const existing = list.find((t) => t.filename === entry.filename);
    await jumpToFileLine({
      tabId: existing?.id,
      filename: entry.filename,
      lineIdx: entry.lineIdx,
    });
  }
}

export async function navigateForward() {
  const currentTabId = get(activeTabId);
  const currentTab = get(tabs).find((t) => t.id === currentTabId);
  const currentPlace: BackStackEntry | null = currentTab
    ? { filename: currentTab.filename, lineIdx: editorApi ? editorApi.getCursorLineIdx() : 0 }
    : null;

  const stack = [...get(forwardStack)];
  let target: BackStackEntry | null = null;
  while (stack.length > 0) {
    const entry = stack.pop()!;
    const list = get(tabs);
    const existing = list.find((t) => t.filename === entry.filename);
    if (existing || /^\d{4}-\d{2}-\d{2}(\.txt)?$/.test(entry.filename)) {
      target = entry;
      break;
    }
  }
  forwardStack.set(stack);

  if (target) {
    if (currentPlace) {
      pushBackStack(currentPlace);
    }
    const entry: BackStackEntry = target;
    const list = get(tabs);
    const existing = list.find((t) => t.filename === entry.filename);
    await jumpToFileLine({
      tabId: existing?.id,
      filename: entry.filename,
      lineIdx: entry.lineIdx,
    });
  }
}
