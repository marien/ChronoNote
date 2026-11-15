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

| ID | What | Note |
| :--- | :--- | :--- |
| R1 | One index of all notes | Design: [`docs/design/notes-index-design.md`](../design/notes-index-design.md) (started by Fable, finished by Opus); briefs S1-S6 in `wave-3/`, S1 Google-Sonnet. Design document first (shape of the index, how it is kept up to date, how the three backends feed it). Data safety: Google-Sonnet. |
| F3 | Suggestions for @names, (topics), section titles | After R1 |
| F7 | Search: `section:`, `is:decision`, `is:topic`, `is:emphasis`, saved searches | After R1 |
| F5 | Person view | After R1; short design |
| F6 | Rename across all notes | After R1; writes many notes: Google-Sonnet, earlier versions kept |
| F9 | Agenda file: join link, attendees, series | Starts with the file format (`docs/agenda-file-guide.md`), which Marien's exporter must be able to fill |

## Wave 4 · depth

| ID | What | Note |
| :--- | :--- | :--- |
| T1 | The spec as tables that run | Lists and editing keys first, from `src/lib/editor/editing.*.table.test.ts` |
| T2 | Random typing against the real editor | Uses `src/lib/testing/testEditor.ts` and fast-check |
| U5 | Design pass on the screenshot gallery | Parked 2026-11-15 (Marien) |
| R2 | Split the six largest files | One brief per file, moves only; after waves 2 and 3 so open branches do not conflict |
| R3 | Load dialogs when they open | Measure start time on the phone first |
| T5 | Do the tests notice a broken rule? | Local, monthly; needs a tool as a dev dependency (Marien's OK on the package) |
| U4 | Token reference and a check | |
| R4 | A ceiling on type escapes | Count today: 102 |
| P4 | "Not yet seen by Marien" kept by the tooling | After P2 (it reads the changelog) |

## Later (decided 2026-11-15)

F4 automatic backup, F10 tables, U3 hint in an empty note, T7 update path tested by a machine, T8 OneDrive stand-in
server.
