// Types for the part of css-literals.mjs that src/lib/cssLiterals.test.ts imports. Without this file
// svelte-check (checkJs) type-checks the script itself, which uses node: modules the browser tsconfig lacks.

export interface LiteralCounts {
  colors: number;
  fontSizes: number;
}

export interface BaselineData {
  colors: number;
  fontSizes: number;
  files: Record<string, LiteralCounts>;
}

export interface LiteralRise {
  file: string;
  colorsBefore: number;
  colorsAfter: number;
  fontSizesBefore: number;
  fontSizesAfter: number;
}

export interface CompareResult {
  ok: boolean;
  colors: number;
  fontSizes: number;
  colorsCeiling: number;
  fontSizesCeiling: number;
  rose: LiteralRise[];
}

/** Counts raw colour literals and literal font-size values in a CSS or Svelte file. */
export function countLiterals(fileName: string, text: string): LiteralCounts;

/** Compares current literal counts against a baseline. */
export function compare(baseline: BaselineData, current: BaselineData): CompareResult;
