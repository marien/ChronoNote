// Types for seen-check.mjs, imported by src/lib/seenCheck.test.ts.

export const SEEN_START_SECTION: number;

export interface ChangelogEntry {
  num: number;
  title: string;
  status: string;
  released: boolean;
  seen: boolean;
}

export interface SeenCheckEntryInput {
  num: number;
  title?: string;
  status?: string;
  released?: boolean;
  seen: boolean;
}

export interface OpenCheckRow {
  since: string;
  what: string;
  where: string;
  section: string;
  sections: number[];
}

export interface OpenCheckRowInput {
  what: string;
  section: string;
  since?: string;
  where?: string;
  sections?: number[];
}

export interface SeenCheckResult<
  E extends SeenCheckEntryInput = SeenCheckEntryInput,
  R extends OpenCheckRowInput = OpenCheckRowInput,
> {
  missing: E[];
  stale: R[];
}

export function isSeenLine(line: string): boolean;
export function parseChangelogEntries(text: string): ChangelogEntry[];
export function sectionsInCell(cell: string): number[];
export function parseOpenChecks(text: string): OpenCheckRow[];
export function checkSeen<
  E extends SeenCheckEntryInput,
  R extends OpenCheckRowInput,
>(entries: E[], rows: R[]): SeenCheckResult<E, R>;
