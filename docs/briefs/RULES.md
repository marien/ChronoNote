# Rules for every brief

Every brief in this folder links here. Read this file once, fully, before the brief. Where a brief says something
different, the brief wins.

## The project in five lines

ChronoNote is a plain-text notes app: one `YYYY-MM-DD.txt` per day, inline tokens (`# v > x o . , - * => ! @name
(topic)`) drawn as glyphs while the file stays plain text. Rust (Tauri 2) in `src-tauri/`, Svelte 5 (runes mode) +
TypeScript + CodeMirror 6 in `src/`. Three backends implement one contract (`src/lib/tauriCommands.ts`): Rust
(`src-tauri/src/`), the web app (`src/lib/webapp/webBackend.ts`) and the mock for tests and the demo
(`src/lib/testing/mockBackend.ts`). Precise behaviour is in `docs/spec.md`; the reasons are in the changelog.

## Where you work

- Your worktree and branch are named at the top of the brief. Work only there. Never touch
  `C:\Users\marie\Dev\Claude\ChronoNote`, `C:\Users\marie\Dev\Gemini\ChronoNote` or any other folder.
- `node_modules` is a link to another checkout. Never delete, move or reinstall it. No `npm install`, no new
  dependency, unless the brief names the package and version.
- Do not push, do not switch branches, do not open a pull request. Commit on your branch only.
- Shell: Git Bash. First command of every session:
  `export PATH="/c/Program Files/nodejs:/c/Users/marie/.cargo/bin:$PATH"`. For Rust always `cd src-tauri` first.
- Foreground commands only. Never start a dev server yourself; Playwright starts its own.

## How you change code

- Edit files with your file-edit tool. Never patch source with `sed`, inline Python or inline Node in the shell: text
  with backslashes, `#`, backticks or `${` gets damaged. A scripted change is a script FILE you write and then run.
- Do only what the brief asks. Something else that looks wrong goes into your report, not into the diff.
- Format by hand like the code around it. There is no Prettier; ignore its warnings.
- Never delete, skip or weaken an existing test to get a green run. If the brief changes behaviour that an existing
  test asserts, change that test and name it in your report with the old and new expectation.
- Expected values in new tests come from the brief or the spec, never from running the code and copying its output.
- Do not edit `docs/CHANGELOG.md`, `docs/changelog/`, `website/`, `CLAUDE.local.md` or files under `docs/` unless the
  brief names them. Never commit rebuilt bundles under `website/webapp` or `website/demo-app`.
- Do not add `any`, `@ts-ignore` or `@ts-expect-error`. `npm run type-escapes` fails when their number rises (R4).

## Rules of the product (they apply to every change)

1. The file is plain text. Nothing invisible is ever written into a note: no IDs, no front matter.
2. What is drawn in place of note text keeps the exact width in `ch` of the text it covers and never changes the
   line's height. Test both when you draw anything in the editor.
3. Every reader of a note line goes through the tokenizer (`src/lib/grammar/tokenize.ts`). No new regular expression
   that decides what a line is.
4. A new storage command exists in all three backends and in `src/lib/tauriApi.ts`, and the shared cases in
   `src/lib/conformance/storage-cases.json` move with it.
5. Changes to the open note go through CodeMirror transactions, never by replacing the text from outside.
6. New UI text gets a key in all seven languages (`src/lib/i18n/locales/`). Add them with ONE script file that edits
   all seven, not seven separate edits. English and Dutch must read naturally; mark the other five in your report as
   "needs a native check".
7. Shortcuts: no function keys; no `Ctrl+Alt+letter` except B F G H J K V; prefer `Ctrl+Shift+letter`. A new shortcut
   goes into `src/lib/shortcuts.ts` and the table in `website/guide.html` (a test compares the two).
8. Nothing in the app watches other applications, the registry or the screen.
9. Marien's setup, which your change must look right on: Windows 11, Dutch UI, 100 % and 125 % scaling, animations
   off (`prefers-reduced-motion`), US-International keyboard.

## Before your final commit

Run these from the worktree root; all must pass. The brief may add more.

```bash
npm run verify
```

```bash
npm run build
```

Browser tests: only the spec files the brief names (each checkout derives its own port and server automatically), for
example `npx playwright test tests/e2e/<file>.spec.ts --workers=2 --reporter=line`. A new test that depends on timing
is run ten times (`--repeat-each=10`) and must pass all ten.

Commit message: a short subject in the imperative, a blank line, what and why in two or three lines, a blank line,
then exactly `Co-Authored-By: Gemini 4 Hydrogen <noreply@google.com>` (or the model named in the brief).

## Your plan file and your report

Keep a plan of four to eight steps in the plan file the run gives you and tick steps off as you go.

Your last message is the report and nothing comes after it. Start with the full output of `npm run agent:report`,
followed by:

1. Existing tests you changed, and why. Tests you added.
2. Anything you were unsure about, anything in the brief that did not match the code, anything you saw and left.

If the brief is wrong, contradicts the code, or you cannot make a check pass after two honest attempts: stop, commit
nothing broken, and say so in the report. A truthful "could not" is worth more than a green run that hides it.
