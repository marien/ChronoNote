/** Named, ready-to-use seed scenarios for the mock backend. Pick one with
 * `?mock&scenario=<name>` in the dev server, or pass the resolved
 * `MockSeed` straight to Playwright via `seedApp()` (see
 * `tests/e2e/helpers.ts`).
 *
 * Every scenario but `demo` is deterministic — same bytes every run.
 * Testing-only. */
import type { MockSeed } from "./mockBackend";
import { generateDataset } from "./dataset";
import { addDaysISO, todayISO } from "../date";

/** Set only by `vite.demo.config.ts`'s `define` — the website's demo
 * bundle is rebuilt from this same source tree (see
 * `website/README.md`), so its "demo" scenario reports the real version
 * it was built from rather than a hand-maintained literal. A plain
 * `import pkg from "../../../package.json"` would do this more simply,
 * but breaks Playwright's Node-based spec loader (a different module
 * resolution path than Vite/Vitest, which both handle a bare JSON import
 * fine) with "needs an import attribute of type: json" — this constant
 * is undefined outside the demo build (dev mock, Vitest, Playwright), so
 * every other scenario's/consumer's behaviour is unaffected. */
declare const __DEMO_APP_VERSION__: string | undefined;

/** The fixed "today" every scenario is generated around. Tests that touch
 * date logic MUST pin their clock to this (helpers do it automatically). */
export const REFERENCE_TODAY = "2026-09-07";

export type ScenarioName = "empty" | "single-day" | "busy-week" | "heavy" | "delegation" | "dir-switch" | "demo";

function build(name: ScenarioName): MockSeed {
  switch (name) {
    case "empty":
      // First launch: no notes, no session. The app force-creates today's
      // tab (empty).
      return { notesDir: "/notes", notes: {}, session: null };

    case "single-day": {
      const ds = generateDataset({ today: REFERENCE_TODAY, days: 1, seed: 1, includeToday: true });
      return { notes: ds.notes, session: { openTabs: ds.filenames, activeTab: ds.filenames[0] } };
    }

    case "busy-week": {
      // ~2 working weeks, a few tabs already open.
      const ds = generateDataset({ today: REFERENCE_TODAY, days: 16, seed: 42 });
      const open = ds.filenames.slice(0, 4).reverse();
      return {
        notes: ds.notes,
        session: { openTabs: open, activeTab: ds.filenames[0] },
      };
    }

    case "heavy": {
      // ~10 weeks — for large-list / virtualization / search-perf checks.
      const ds = generateDataset({ today: REFERENCE_TODAY, days: 70, seed: 7 });
      const open = ds.filenames.slice(0, 6).reverse();
      return { notes: ds.notes, session: { openTabs: open, activeTab: ds.filenames[0] } };
    }

    case "delegation": {
      // Deterministic hand-authored set focused on the `=> ` forms, so the
      // Action Drawer's delegated/consequence behaviour has stable rows to
      // assert against regardless of generator tweaks.
      const notes: Record<string, string> = {
        "2026-09-07.txt": [
          "Top priorities",
          "==============",
          "# finish the delegation write-up",
          "",
          "",
          "1:1 — Priya",
          "===========",
          "Talked to Priya => # send the recap email",
          "=> @Priya draft the migration plan",
          "=> @Dana review the API shape",
          "v agreed on the rollout order",
          "=> keep the plain-text guarantee — no DB",
        ].join("\n"),
        "2026-09-04.txt": [
          "Daily Standup",
          "=============",
          "- today: chase the cert renewal",
          "# chase the signing cert renewal",
          "=> @Marco confirm the CI matrix",
          "x drop the Linux build for now",
        ].join("\n"),
        "2026-09-02.txt": [
          "Weekly Planning — 2026-09-02",
          "===========================",
          "# chase the signing cert renewal",
          "> book the user-testing sessions",
          "=> @Priya draft the migration plan",
        ].join("\n"),
      };
      return {
        notes,
        session: { openTabs: ["2026-09-02.txt", "2026-09-04.txt", "2026-09-07.txt"], activeTab: "2026-09-07.txt" },
      };
    }

    case "demo": {
      // Hand-authored (not generated) for the marketing site's embedded
      // live demo (`website/`) — every token form gets a real, readable
      // example, two sections recur across weeks so Section History has
      // something worth aggregating, and today is left with genuine open
      // work so the app doesn't look staged. Dates are relative to the
      // *real* current date (not `REFERENCE_TODAY`, which every other
      // scenario deliberately pins for deterministic tests) — a public
      // demo needs to look current on whatever day someone actually
      // loads it, not increasingly stale after 2026-09-07 passes. Never
      // used by an automated test, so there's no coupling to keep in
      // sync beyond this file.
      const today = todayISO();
      const d = (offset: number) => `${addDaysISO(today, offset)}.txt`;
      const notes: Record<string, string> = {
        [d(-21)]: [
          "Planning Kickoff",
          "================",
          "# scope the Q3 roadmap doc",
          "- reviewed last quarter's metrics",
          "- decided to focus on notes-sync reliability",
          "! Board update is due end of month — don't forget",
        ].join("\n"),
        [d(-19)]: [
          "Daily Standup",
          "=============",
          "- yesterday: fixed the sync retry bug",
          "- today: write the roadmap doc",
          "# scope the Q3 roadmap doc",
          "=> @Priya loop in design on the sync UI",
        ].join("\n"),
        [d(-17)]: [
          "Daily Standup",
          "=============",
          "- yesterday: roadmap doc first draft",
          "- today: send it out for review",
          "v scope the Q3 roadmap doc",
          "# get feedback from the team by Monday",
          "> book the user-testing sessions",
          "",
          "",
          "1:1 — Dana",
          "==========",
          "Talked to Dana => # follow up on the hiring plan",
          "=> @Dana share the updated headcount numbers",
          "v discussed the notes-sync reliability project",
        ].join("\n"),
        [d(-14)]: [
          "Daily Standup",
          "=============",
          "- today: read through roadmap feedback",
          "x drop the analytics rewrite — descoped this quarter",
          "# get feedback from the team by Monday",
          "",
          "",
          "Hiring",
          "======",
          "=> @Dana share the updated headcount numbers",
          "# follow up on the hiring plan",
          "# (interviews) schedule two more candidate calls",
        ].join("\n"),
        [d(-12)]: [
          "Daily Standup",
          "=============",
          "- yesterday: incorporated feedback into the roadmap",
          "v get feedback from the team by Monday",
          "# publish the roadmap doc to the team wiki",
          "",
          "",
          "1:1 — Priya",
          "===========",
          "=> @Priya loop in design on the sync UI",
          "v shared the roadmap draft with Priya",
          "- Priya flagged the offline-mode edge case",
          "# write up the offline-mode edge case",
        ].join("\n"),
        [d(-10)]: [
          "Daily Standup",
          "=============",
          "- yesterday: published the roadmap doc",
          "v publish the roadmap doc to the team wiki",
          "# write up the offline-mode edge case",
          "",
          "",
          "Retro — Sprint 14",
          "=================",
          "* good: shipped the sync retry fix ahead of schedule",
          "* good: roadmap doc landed with no major pushback",
          "* improve: standups running long — keep to 10 minutes",
          "! Bring donuts next retro",
        ].join("\n"),
        [d(-7)]: [
          "Daily Standup",
          "=============",
          "- today: start the offline-mode write-up",
          "# write up the offline-mode edge case",
          "# (sync) decide on the conflict-resolution strategy",
        ].join("\n"),
        [d(-5)]: [
          "Daily Standup",
          "=============",
          "- yesterday: drafted the offline-mode doc",
          "v write up the offline-mode edge case",
          "# (sync) decide on the conflict-resolution strategy",
          "",
          "",
          "1:1 — Dana",
          "==========",
          "v follow up on the hiring plan",
          "=> @Dana two candidates moving to onsite",
          "# prep interview questions for the onsite round",
        ].join("\n"),
        [d(-3)]: [
          "Daily Standup",
          "=============",
          "- today: interview prep",
          "# prep interview questions for the onsite round",
          "# (sync) decide on the conflict-resolution strategy",
          "=> keep the plain-text guarantee — no hidden metadata",
          "",
          "",
          "Hiring",
          "======",
          "=> @Dana two candidates moving to onsite",
          "# prep interview questions for the onsite round",
          "v (interviews) schedule two more candidate calls",
          "=> (@Dana) send the signed offer letter once approved",
        ].join("\n"),
        [d(0)]: [
          "Daily Standup",
          "=============",
          "- today: finalize interview questions, sync design review",
          "# prep interview questions for the onsite round",
          "# (sync) decide on the conflict-resolution strategy",
          "! Onsite interviews are this week — confirm the room booking",
          "",
          "",
          "1:1 — Priya",
          "===========",
          "- Priya reviewed the offline-mode doc",
          "=> @Priya sign off on the conflict-resolution approach",
          "# write up the offline-mode edge case",
        ].join("\n"),
      };
      return {
        notes,
        session: {
          openTabs: [d(-5), d(-3), d(0)],
          activeTab: d(0),
        },
        // See the module doc-comment on __DEMO_APP_VERSION__ above —
        // `undefined` here (every context but the built demo bundle)
        // just falls through to the mock's own default ("0.3.0").
        appVersion: __DEMO_APP_VERSION__,
      };
    }

    case "dir-switch": {
      const work = generateDataset({ today: REFERENCE_TODAY, days: 8, seed: 3 });
      const personal = generateDataset({ today: REFERENCE_TODAY, days: 5, seed: 99 });
      return {
        notesDir: "/work-notes",
        notes: work.notes,
        session: { openTabs: work.filenames.slice(0, 3).reverse(), activeTab: work.filenames[0] },
        otherDirs: { "/personal-notes": personal.notes },
        sessions: {
          "/personal-notes": {
            openTabs: personal.filenames.slice(0, 2).reverse(),
            activeTab: personal.filenames[0],
          },
        },
        recentNotesDirs: ["/personal-notes"],
      };
    }
  }
}

const cache = new Map<ScenarioName, MockSeed>();

export function scenario(name: ScenarioName): MockSeed {
  if (!cache.has(name)) cache.set(name, build(name));
  // Return a shallow clone so a test mutating its seed can't poison the cache.
  return structuredClone(cache.get(name)!);
}

export const SCENARIO_NAMES: ScenarioName[] = [
  "empty",
  "single-day",
  "busy-week",
  "heavy",
  "delegation",
  "dir-switch",
  "demo",
];
