// Types for the part of type-escapes.mjs that src/lib/typeEscapes.test.ts imports. Without this file
// svelte-check (checkJs) type-checks the script itself, which uses node: modules the browser tsconfig lacks.

export interface EscapeCounts {
  total: number;
  files: Record<string, number>;
}

export interface EscapeRise {
  file: string;
  before: number;
  after: number;
}

export interface CompareResult {
  ok: boolean;
  total: number;
  ceiling: number;
  rose: EscapeRise[];
}

/** Counts type escapes (`any` keywords and `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck` directives) in one file. */
export function countEscapes(fileName: string, text: string): number;

/** Compares current escape counts against a baseline. */
export function compare(baseline: EscapeCounts, current: EscapeCounts): CompareResult;
