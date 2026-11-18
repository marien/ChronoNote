# Briefs

Work instructions for implementers (cheaper models, or a person). One brief is one branch and one pull request.
Every brief links to [`RULES.md`](RULES.md); new briefs start from [`TEMPLATE.md`](TEMPLATE.md).

Source of the list below: the forward review of 2026-11-15 (`docs/design/forward-review.html`) and Marien's decisions
on it the same day. Claude writes the briefs, reviews every diff, runs the full browser suite on the branch and
merges. A brief is written just before its wave, so its file and line references are still true.

## How a brief is run

1. The brief's base branch is up to date and the brief is committed on it (the coder's worktree must contain
   `docs/briefs/`).
2. One run per brief, with the run name from the brief's first line.
3. The coder's report comes back; the reviewer reads the diff against the brief's "Done when" list, runs the browser
   suite, writes the changelog entry and opens the pull request.
4. Briefs marked "after X" wait until X is merged. Briefs in one wave without such a mark can run at the same time.

## Wave 1 · groundwork (briefs ready)

| ID | What | Brief | Order | Who |
| :--- | :--- | :--- | :--- | :--- |
| T3 | A guard against deleted tests | [wave-1/T3-test-guard.md](wave-1/T3-test-guard.md) | first | coder · merged #231 |
| T4 | Browser tests that can run side by side | [wave-1/T4-e2e-ports.md](wave-1/T4-e2e-ports.md) | any time | coder · merged #232 |
| T6 | Test for the last data-loss rule (4.2) | [wave-1/T6-hold-command.md](wave-1/T6-hold-command.md) | any time | coder · merged #230 |
| P2 | Split the changelog | [wave-1/P2-changelog-split.md](wave-1/P2-changelog-split.md) | any time; no changelog entries may be added on other branches while it is open | coder · merged #233 |
| P1 | Faster checks on GitHub | [wave-1/P1-ci-speed.md](wave-1/P1-ci-speed.md) | after T3 | coder · merged #234 |
| P3 | `npm run agent:report` | [wave-1/P3-agent-report.md](wave-1/P3-agent-report.md) | after T3 | coder · merged #235 |
| P6 | Mock scenarios came up empty | none needed | any time | Claude (3 lines) · done in §479 |
| P5 | Three patch updates; first look at TypeScript 7 | none | any time | Claude (needs the full local suite and judgement) |

P6, found: `installMockTauri` restores whatever state the browser tab saved earlier when the seed has no `seedId`
(`MockBackend.tryHydrate`, `src/lib/testing/mockBackend.ts` line 583). A tab that once opened the app without a
scenario keeps that empty state, whatever `?scenario=` says later. Fix: `bootMockBackend`
(`src/lib/testing/bootMock.ts`) gives a scenario seed the id `scenario:<name>`.

## Wave 2 · daily gains (merged 2026-11-15, §481-§486)

Designs and Marien's decisions of 2026-11-15: `docs/design/wave2-designs.html`. F1, F2 and F8 change behaviour, so
each also gets an independent test writer: a second run that receives only the brief's behaviour tables and reference
example (not the coder's diff) and writes `*.independent.test.ts` / `*.independent.spec.ts` from them. A reviewer
from another model family reads each diff before it merges.

| ID | What | Brief | Order | Model |
| :--- | :--- | :--- | :--- | :--- |
| W2-0 | Two settings, one session field, a rich-copy helper | [wave-2/W2-0-shared-pieces.md](wave-2/W2-0-shared-pieces.md) | first | Hydrogen · merged #237 |
| U1 | Actions pane header in two rows, hints behind `?` | [wave-2/U1-actions-header.md](wave-2/U1-actions-header.md) | any time (beside W2-0) | Hydrogen · merged #238 |
| F1 | Calendar sync adds new meetings by itself | [wave-2/F1-calendar-auto-add.md](wave-2/F1-calendar-auto-add.md) | after W2-0 | Google-Sonnet · merged #241 |
| F2 | Copy a meeting as minutes | [wave-2/F2-minutes.md](wave-2/F2-minutes.md) | after W2-0 (beside F1) | Hydrogen · merged #239 |
| F8 | Copy the Actions list as shown | [wave-2/F8-copy-actions-list.md](wave-2/F8-copy-actions-list.md) | after W2-0 and U1 | Hydrogen · merged #242 |
| U2 | No clipped text in any language | [wave-2/U2-no-clipped-text.md](wave-2/U2-no-clipped-text.md) | after U1 | Hydrogen · merged #240 |

One simplification against the design page, in F1: a new meeting is added by itself only when nothing else is
pending for that day. If a meeting also moved, or a section with text lost its meeting, the dot shows and the dialog
handles everything together, as today.

## Wave 3 · the index and what it unlocks

Opus designs and briefs waves 3 and 4 (Marien, 2026-11-15), each brief just before its wave. F3, F5, F6 and F9
change behaviour Marien has not seen: each gets a short design page with examples and his decisions before its brief.
Designs for F7, F3, F5, F6, F9 (16 questions): [`docs/design/wave3-designs.html`](../design/wave3-designs.html),
artifact https://claude.ai/artifact/ApAhovPsvw2oaM7tVFXsXp (2026-11-16). Marien's decisions the same day: the recommended option on all 16; 9.1 "All three" (his exporter can
supply joinUrl, attendees and seriesId; seriesId not used for now).

| ID | What | Note |
| :--- | :--- | :--- |
| R1 | One index of all notes | Design complete 2026-11-16: [`docs/design/notes-index-design.md`](../design/notes-index-design.md) (started by Fable, finished by Opus; section 8 records how each open point was settled). Six slices below. |
| F7 | Search: `section:`, `is:decision`, `is:topic`, `is:emphasis`, saved searches | [wave-3/F7a-search-words.md](wave-3/F7a-search-words.md) (Hydrogen, + independent tests) · merged #246, §493; [wave-3/F7b-saved-searches.md](wave-3/F7b-saved-searches.md) after F7a (Hydrogen; file `.chrononote-searches.txt`, one search per line, so the web app's line merge joins two laptops' saves) · merged #248, §495 |
| F3 | Suggestions for @names, (topics), section titles | [wave-3/F3-suggestions.md](wave-3/F3-suggestions.md) (Hydrogen; own tooltip, no new dependency), beside F7 · merged #247, §494 |
| F5 | Person view | [wave-3/F5-person-view.md](wave-3/F5-person-view.md) after F3 (Hydrogen) · merged #249, §496 |
| F6 | Rename across all notes | [wave-3/F6-rename-everywhere.md](wave-3/F6-rename-everywhere.md) after F5 (Hydrogen, extra review) · PR #251 (auto-merge), §498 |
| F9 | Agenda file: join link, attendees (seriesId not read, 9.3) | [wave-3/F9-agenda-join-attendees.md](wave-3/F9-agenda-join-attendees.md) after F3 (Hydrogen) · merged #250, §497 |

Order: F7a and F3 side by side; then F7b, F5 and F9 (F5 and F9 both touch the F3 suggestions source: one after the
other); F6 last. Each behaviour brief gets an independent test writer and a cross-family review.

R1 in six slices, each a refactor with no change a user sees (the two allowed differences are in the design's
section 8). S1 first; S2-S5 side by side once S1 is merged (they touch different files and none of `notesIndex/`);
S6 last. Each gets the full browser suite and the perf project before and after.

| ID | What | Brief | Order | Model |
| :--- | :--- | :--- | :--- | :--- |
| S1 | The index core: disk layer, store, facets, property test | [wave-3/S1-notes-index-core.md](wave-3/S1-notes-index-core.md) | first | Google-Sonnet |
| S2 | The due item reads the index | [wave-3/S2-due-from-index.md](wave-3/S2-due-from-index.md) | after S1 | Hydrogen |
| S3 | Actions view, week review, palette read the index | [wave-3/S3-actions-from-index.md](wave-3/S3-actions-from-index.md) | after S1 (beside S2, S4, S5) | Hydrogen |
| S4 | Search, Section History, occurrences, copy forward | [wave-3/S4-search-history-from-index.md](wave-3/S4-search-history-from-index.md) | after S1 (beside S2, S3, S5) | Hydrogen |
| S5 | Date picker, phone companion, export, phone tab bar, Peek | [wave-3/S5-views-from-index.md](wave-3/S5-views-from-index.md) | after S1 (beside S2-S4) | Hydrogen |
| S6 | Remove the old map; a guard against its return | [wave-3/S6-remove-all-notes-cache.md](wave-3/S6-remove-all-notes-cache.md) | after S2-S5 | Hydrogen |

Progress: S1 merged (#243, §487; plus S1b, the six fixes from Gemini's review,
[wave-3/S1b-review-fixes.md](wave-3/S1b-review-fixes.md)). S2-S5 in one PR (§488-§491, one combined browser suite;
separate PRs would each have added to the end of the same changelog file), merged as #244. S6 (§492, #245): R1
complete.

Live views (design 8.4), Marien 2026-11-16: the Actions pane keeps its snapshot. Settled.

## Wave 4 · depth

| ID | What | Note |
| :--- | :--- | :--- |
| T1 | The spec as tables that run | Step 1, numbered lists: [wave-4/T1-spec-tables-lists.md](wave-4/T1-spec-tables-lists.md) · Hydrogen · merged #257 (§503). Step 2, bullets, continuation, editing keys: [wave-4/T1b-spec-tables-editing.md](wave-4/T1b-spec-tables-editing.md) · merged #260 (§506). Step 3, lists on the clipboard: [wave-4/T1c-spec-tables-clipboard.md](wave-4/T1c-spec-tables-clipboard.md) · Hydrogen · merged #261 (§510) |
| T2 | Random typing against the real editor | [wave-4/T2-random-typing.md](wave-4/T2-random-typing.md) · Hydrogen · merged #255 (§501) |
| U5 | Design pass on the screenshot gallery | Parked 2026-11-15 (Marien) |
| R2 | Split the six largest files | Step 1, `storage.rs`: [wave-4/R2a-split-storage-rs.md](wave-4/R2a-split-storage-rs.md) · Google-Sonnet · merged #262 (§511). Steps 2-7, shared rules [wave-4/R2-common.md](wave-4/R2-common.md): R2b `boot.ts`, R2c `mockBackend.ts` (Google-Sonnet, a restructure), R2d `TopBar.svelte`, R2e `SettingsModal.svelte`, R2f `HistoryModal.svelte`, R2g `App.svelte` (briefs `wave-4/R2b-...` to `R2g-...`, Hydrogen unless noted). One brief per file, moves only; after waves 2 and 3 so open branches do not conflict. `mockBackend.ts` is one 1,200-line class: splitting it is a restructure, not a move (2026-11-18) |
| R3 | Load dialogs when they open | Measure start time on the phone first |
| T5 | Do the tests notice a broken rule? | [wave-4/T5-mutation-testing.md](wave-4/T5-mutation-testing.md) · Hydrogen · merged #263 (§512). Local, monthly. StrykerJS (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`) as dev dependencies: Marien's OK 2026-11-18. Not in CI or verify; core modules only |
| U4 | Token reference and a check | [wave-4/U4-token-reference.md](wave-4/U4-token-reference.md) · Hydrogen · merged #259 (§505) |
| R4 | A ceiling on type escapes | [wave-4/R4-type-escape-ceiling.md](wave-4/R4-type-escape-ceiling.md) · Hydrogen · merged #256 (§502) |
| P4 | "Not yet seen by Marien" kept by the tooling | [wave-4/P4-seen-by-marien.md](wave-4/P4-seen-by-marien.md) · Hydrogen · merged #258 (§504) |

## Later (decided 2026-11-15)

F4 automatic backup, F10 tables, U3 hint in an empty note, T7 update path tested by a machine, T8 OneDrive stand-in
server.
