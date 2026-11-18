// Types for npm-audit.mjs, imported by src/lib/npmAudit.test.ts.

export interface BlockingAdvisory {
  id: string;
  package: string;
  title: string;
  severity: string;
  range: string;
}

export function blockingAdvisories(report: unknown): BlockingAdvisory[];
export function judge(
  advisories: BlockingAdvisory[],
  allowlist: Array<{ id: string; review: string }>,
  patched: Record<string, string | null>,
  today: string,
): { failures: string[]; allowed: string[] };
