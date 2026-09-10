/** Realistic ChronoNote dataset generator — produces a set of daily
 * `YYYY-MM-DD.txt` note files that exercise the full spec 2.2 token
 * vocabulary (`# `, `v `, `> `, `x `, `- `/`* `, `=> `, `=> @name`,
 * `=> <symbol>`, `! `, setext `====` headers) the way a real user's notes
 * would over a few weeks — recurring meeting sections, carried-over
 * actions, delegated work, nested bullets, emphasis lines, plain prose.
 *
 * Deterministic given the same options (see `prng.ts`) so every test run
 * and every screenshot baseline sees byte-identical notes. Testing-only —
 * excluded from production builds. */
import { Prng } from "./prng";

export interface GenerateOptions {
  /** Reference "today", `YYYY-MM-DD`. The newest generated file. Tests
   * that touch date logic should pin their clock to this same value. */
  today: string;
  /** How many calendar days back from `today` to cover (inclusive of
   * today). Weekends are usually skipped (see `skipWeekends`). */
  days: number;
  /** PRNG seed — change it for a different-but-still-deterministic set. */
  seed: number;
  /** Skip most (not all) Saturdays/Sundays, like a work journal. Default true. */
  skipWeekends?: boolean;
  /** Include a file for `today` itself. Default true. */
  includeToday?: boolean;
}

const PEOPLE = ["Priya", "Dana", "Sam", "Lena", "Marco", "Ines"] as const;

const RECURRING_SECTIONS = [
  { title: "Daily Standup", cadence: "daily" },
  { title: "Inbox / Notes", cadence: "daily" },
  { title: "Weekly Planning", cadence: "monday", dated: true },
  { title: "1:1 — Priya", cadence: "thursday" },
] as const;

const PROJECT_TOPICS = [
  "ChronoNote — editor polish",
  "ChronoNote — release prep",
  "ChronoNote — section history",
  "Onboarding docs",
  "Billing migration",
  "Q4 roadmap",
] as const;

const OPEN_TASKS = [
  "draft the changelog entry",
  "reply to Marco about the API shape",
  "review the storage refactor PR",
  "cut the 0.3.1 tag",
  "write up the repro for the scroll bug",
  "chase the signing cert renewal",
  "book the user-testing sessions",
  "update the README prerequisites",
  "triage the crash reports",
  "prep slides for the review",
] as const;

const DONE_TASKS = [
  "merged the test-suite branch",
  "answered Lena's thread",
  "shipped the hotfix",
  "closed out the old milestone",
  "sent the weekly update",
  "fixed the CI Node version",
] as const;

const NOTES_LINES = [
  "Decision: keep the plain-text-on-disk guarantee, no exceptions.",
  "Marco raised the WebView2 orphan-process issue again — needs a real fix.",
  "The date-picker grammar should probably accept 'mon'/'tue' too. Later.",
  "Spent an hour on the flicker bug; it's the rounding at the fit boundary.",
  "Users keep asking for word wrap. Worth a Settings toggle.",
  "Left the meeting early — will catch up from Dana's notes.",
] as const;

const EMPHASIS_LINES = [
  "Do NOT bump the Tauri version before the release.",
  "Demo is Friday 10:00 — hard deadline.",
  "The signing cert expires end of month.",
] as const;

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dateToIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function setext(title: string): string {
  return `${title}\n${"=".repeat(Math.max(3, title.length))}`;
}

/** One section's body — a handful of lines drawn from the vocabulary,
 * weighted toward what that kind of section tends to contain. */
function sectionBody(rng: Prng, kind: "standup" | "notes" | "planning" | "one-on-one" | "project", iso: string): string {
  const lines: string[] = [];

  if (kind === "standup") {
    lines.push(`- yesterday: ${rng.pick(DONE_TASKS)}`);
    lines.push(`- today: ${rng.pick(OPEN_TASKS)}`);
    if (rng.chance(0.5)) lines.push(`  - blocked on ${rng.pick(PEOPLE)}'s review`);
    if (rng.chance(0.6)) lines.push(`# ${rng.pick(OPEN_TASKS)}`);
    if (rng.chance(0.4)) lines.push(`=> @${rng.pick(PEOPLE)} ${rng.pick(OPEN_TASKS)}`);
  } else if (kind === "notes") {
    lines.push(rng.pick(NOTES_LINES));
    if (rng.chance(0.5)) lines.push(`=> ${rng.pick(NOTES_LINES)}`);
    if (rng.chance(0.35)) lines.push(`! ${rng.pick(EMPHASIS_LINES)}`);
    if (rng.chance(0.4)) lines.push(`# ${rng.pick(OPEN_TASKS)}`);
  } else if (kind === "planning") {
    lines.push(`Goals for the week of ${iso}:`);
    for (let i = 0; i < rng.int(2, 4); i++) lines.push(`# ${rng.pick(OPEN_TASKS)}`);
    if (rng.chance(0.7)) lines.push(`v ${rng.pick(DONE_TASKS)}`);
    if (rng.chance(0.5)) lines.push(`> ${rng.pick(OPEN_TASKS)}`);
    if (rng.chance(0.4)) lines.push(`x ${rng.pick(OPEN_TASKS)} — descoped`);
  } else if (kind === "one-on-one") {
    lines.push(`- talked through ${rng.pick(PROJECT_TOPICS)}`);
    lines.push(`Talked to Priya => # ${rng.pick(OPEN_TASKS)}`);
    if (rng.chance(0.6)) lines.push(`=> @Priya ${rng.pick(OPEN_TASKS)}`);
    if (rng.chance(0.5)) lines.push(`v ${rng.pick(DONE_TASKS)}`);
  } else {
    // project
    lines.push(`- ${rng.pick(NOTES_LINES)}`);
    for (let i = 0; i < rng.int(1, 3); i++) {
      const roll = rng.next();
      if (roll < 0.4) lines.push(`# ${rng.pick(OPEN_TASKS)}`);
      else if (roll < 0.6) lines.push(`v ${rng.pick(DONE_TASKS)}`);
      else if (roll < 0.75) lines.push(`> ${rng.pick(OPEN_TASKS)}`);
      else if (roll < 0.85) lines.push(`x ${rng.pick(OPEN_TASKS)}`);
      else lines.push(`=> @${rng.pick(PEOPLE)} ${rng.pick(OPEN_TASKS)}`);
    }
    if (rng.chance(0.3)) {
      lines.push(`- sub-points:`);
      lines.push(`  - ${rng.pick(NOTES_LINES)}`);
      lines.push(`  - ${rng.pick(NOTES_LINES)}`);
    }
  }

  return lines.join("\n");
}

function dayFile(rng: Prng, date: Date, isToday: boolean): string {
  const iso = dateToIso(date);
  const dow = date.getUTCDay(); // 0 Sun .. 6 Sat
  const blocks: string[] = [];

  if (isToday) {
    // A real "today" note opens with a short priorities list — the thing
    // the Action Drawer's "forward to today" lands in.
    const prio = ["Top priorities", "=".repeat(14)].join("\n");
    const prioLines = [`# ${rng.pick(OPEN_TASKS)}`, `# ${rng.pick(OPEN_TASKS)}`];
    if (rng.chance(0.5)) prioLines.push(`# ${rng.pick(OPEN_TASKS)}`);
    blocks.push(`${prio}\n${prioLines.join("\n")}`);
  }

  // Daily sections.
  blocks.push(`${setext("Daily Standup")}\n${sectionBody(rng, "standup", iso)}`);
  if (rng.chance(0.7)) {
    blocks.push(`${setext("Inbox / Notes")}\n${sectionBody(rng, "notes", iso)}`);
  }

  // Weekly planning on Mondays, dated in the title (exercises §37 date
  // normalization in Section History).
  if (dow === 1) {
    blocks.push(`${setext(`Weekly Planning — ${iso}`)}\n${sectionBody(rng, "planning", iso)}`);
  }
  // 1:1 on Thursdays.
  if (dow === 4) {
    blocks.push(`${setext("1:1 — Priya")}\n${sectionBody(rng, "one-on-one", iso)}`);
  }

  // 0-2 project sections, drawn from a stable rotation so the same topic
  // recurs across days (also feeds Section History).
  const projectCount = rng.int(0, 2);
  for (let i = 0; i < projectCount; i++) {
    const topic = PROJECT_TOPICS[(date.getUTCDate() + i) % PROJECT_TOPICS.length];
    blocks.push(`${setext(topic)}\n${sectionBody(rng, "project", iso)}`);
  }

  // Spec 2.3: two blank lines between a section body and the next heading.
  return blocks.join("\n\n\n") + "\n";
}

export interface GeneratedDataset {
  /** `filename -> file contents`, e.g. `{ "2026-09-07.txt": "..." }`. */
  notes: Record<string, string>;
  /** Filenames newest-first — handy for seeding an initial tab session. */
  filenames: string[];
  today: string;
}

export function generateDataset(opts: GenerateOptions): GeneratedDataset {
  const { today, days, seed, skipWeekends = true, includeToday = true } = opts;
  const rng = new Prng(seed);
  const todayDate = isoToDate(today);
  const notes: Record<string, string> = {};

  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(todayDate);
    date.setUTCDate(date.getUTCDate() - offset);
    const iso = dateToIso(date);
    const dow = date.getUTCDay();
    const isToday = offset === 0;

    if (isToday && !includeToday) continue;
    // Skip ~80% of weekend days (leave the occasional Saturday note in).
    if (!isToday && skipWeekends && (dow === 0 || dow === 6) && rng.chance(0.8)) continue;

    notes[`${iso}.txt`] = dayFile(rng, date, isToday);
  }

  const filenames = Object.keys(notes).sort().reverse();
  return { notes, filenames, today };
}

/** Quick stats about a generated set — used by scenario definitions and
 * handy for asserting a dataset actually contains what a test needs. */
export function datasetStats(ds: GeneratedDataset): {
  files: number;
  open: number;
  closed: number;
  forwarded: number;
  delegated: number;
} {
  let open = 0;
  let closed = 0;
  let forwarded = 0;
  let delegated = 0;
  for (const content of Object.values(ds.notes)) {
    open += (content.match(/(^\s*#\s)|(=>\s#\s)/gm) || []).length;
    closed += (content.match(/(^\s*[vx]\s)|(=>\s[vx]\s)/gm) || []).length;
    forwarded += (content.match(/(^\s*>\s)|(=>\s>\s)/gm) || []).length;
    delegated += (content.match(/=>\s@[\w-]+/g) || []).length;
  }
  return { files: Object.keys(ds.notes).length, open, closed, forwarded, delegated };
}
