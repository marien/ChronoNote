/** Named, ready-to-use seed scenarios for the mock backend. Pick one with
 * `?mock&scenario=<name>` in the dev server, or pass the resolved
 * `MockSeed` straight to Playwright via `seedApp()` (see
 * `tests/e2e/helpers.ts`).
 *
 * Every scenario is deterministic — same bytes every run. Testing-only. */
import type { MockSeed } from "./mockBackend";
import { generateDataset } from "./dataset";

/** The fixed "today" every scenario is generated around. Tests that touch
 * date logic MUST pin their clock to this (helpers do it automatically). */
export const REFERENCE_TODAY = "2026-09-07";

export type ScenarioName = "empty" | "single-day" | "busy-week" | "heavy" | "delegation" | "dir-switch";

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
];
