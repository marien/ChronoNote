// Types for mutation-summary.mjs, imported by src/lib/mutationSummary.test.ts.

export interface MutationPosition {
  line: number;
  column: number;
}

export interface MutationLocation {
  start: MutationPosition;
  end: MutationPosition;
}

export interface RawMutantResult {
  id?: string;
  mutatorName: string;
  replacement?: string;
  status: string;
  location: MutationLocation;
}

export interface RawFileResult {
  source?: string;
  mutants?: RawMutantResult[];
}

export interface RawMutationReport {
  files?: Record<string, RawFileResult>;
}

export interface SurvivingMutant {
  line: number;
  column: number;
  mutatorName: string;
  original: string;
  replacement: string;
}

export interface FileMutationSummary {
  file: string;
  score: number | null;
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  valid: number;
  survivors: SurvivingMutant[];
}

export interface MutationSummary {
  files: FileMutationSummary[];
  total: {
    score: number | null;
    killed: number;
    timeout: number;
    survived: number;
    noCoverage: number;
    valid: number;
  };
}

export function extractMutantOriginal(source: string, location: MutationLocation): string;
export function parseMutationReport(report: RawMutationReport): MutationSummary;
export function formatMutationSummary(summary: MutationSummary, maxPerFile?: number): string;
