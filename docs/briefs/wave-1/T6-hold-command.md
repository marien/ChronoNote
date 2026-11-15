# Brief T6: test the last data-loss rule (typing while a phone save fails)

Run name `t6-hold-command` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\t6-hold-command` · branch
`gemini/t6-hold-command` · base `main` · browser-test port `1441` · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. It applies in full. This brief changes test code only: the mock backend and
tests. No file outside `src/lib/testing/` and `tests/e2e/` changes.

## Why

Rule 4.2 of the editor review: a change from the phone is applied to the open note and saved; if that save fails, the
phone's change is taken out again, and what the user typed while the save was running stays. The app does this
(changelog §465) but no test proves it, because the mock backend cannot keep a save open and then fail it. The test is
a placeholder at `tests/e2e/editor-batch1.independent.spec.ts` line 684.

## What exists now

`src/lib/testing/mockBackend.ts`, the dispatcher at lines 897-908:

```ts
  async invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.invokeLog.push({ cmd, args, at: Date.now() });
    if (this.throwOnCommands.has(cmd)) {
      throw new Error(`mock: ${cmd} failed (seeded via throwOnCommands)`);
    }
    const delayMs = this.delayCommands.get(cmd);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const out = await this.dispatch(cmd, args);
    if (MUTATING_COMMANDS.has(cmd)) this.persist();
    return out;
  }
```

`throwOnCommands` and `delayCommands` are declared at lines 429-432. Tests reach the backend in the page as
`window.__CHRONO_MOCK__`.

`tests/e2e/editor-batch1.independent.spec.ts`: test 4.1 (starts near line 632) is the model to copy. It seeds
`phoneCompanion: true`, a note and a `phoneInbox`, then calls the file's own helper `triggerApplyPhoneChanges(page)`.
The helpers `editor`, `activeTabContent`, `mockNote`, `todayFilename` are imported at the top. Lines 672-687 hold
the placeholder and the six steps the test should take.

## What to build

1. `mockBackend.ts`, in class `MockBackend`, next to `delayCommands`:
   - a private map of held commands;
   - `holdCommand(cmd: string): void`: from now on, the next call of `cmd` waits;
   - `releaseHeld(cmd: string, outcome?: { reject?: string }): boolean`: lets the waiting call go on. With
     `reject`, the call throws `new Error(reject)` and does not run; without it the call runs normally. Returns false
     when nothing was waiting. Either way the hold is over: later calls of `cmd` are not held.
   - `isHeld(cmd: string): boolean`: true while a call of `cmd` is waiting.
   - In `invoke`, right after the `invokeLog.push` line and BEFORE the `throwOnCommands` check: if `cmd` is held,
     wait for its release; on reject, throw. Only the first call after `holdCommand` waits.
   - None of this is saved by `persist()` or restored by `tryHydrate()`.

2. Replace the `test.fixme(...)` at line 684 with a real test, same title without the placeholder body. Keep the
   comment's six steps as the test's structure and delete the comment lines that explain why it could not be written.

   | Step | Do | Expect |
   | :--- | :--- | :--- |
   | 1 | Seed `phoneCompanion: true`, note `"Planning\n========\noriginal\n"` open and active, `phoneInbox` with one `addLine` request, section `"Planning"`, text `"phone line"` (copy the JSON shape from test 4.1) | |
   | 2 | `page.evaluate(() => window.__CHRONO_MOCK__!.holdCommand("write_note"))` | |
   | 3 | `triggerApplyPhoneChanges(page)` | poll until `isHeld("write_note")` is true, and until `activeTabContent(page)` contains `"phone line"` |
   | 4 | Click the editor, put the caret at the start of the `original` line (`Control+Home`, then `ArrowDown` twice, then `Home` twice if needed so the caret is at column 0), type `USER ` | `activeTabContent(page)` contains `"USER original"` |
   | 5 | `releaseHeld("write_note", { reject: "disk full" })` | |
   | 6 | | poll: `activeTabContent(page)` is exactly `"Planning\n========\nUSER original\n"`; it does not contain `"phone line"` |

   If step 3 or step 6 does not hold in the real app, do NOT change the expectation and do NOT change app code. Stop
   and report exactly what the content was at that point: that would be a bug in the app and a finding.

## Out of scope

Any file under `src/` outside `src/lib/testing/`. The other tests in the spec file.

## Tests to add

`src/lib/testing/mockBackend.hold.test.ts` (Vitest), constructing `new MockBackend({ notes: { "2026-09-07.txt": "a" } })`
the way `mockBackend.b3.independent.test.ts` does:

- a held `read_note` call is still pending after `await Promise.resolve()` several times; `isHeld` is true; after
  `releaseHeld("read_note")` it resolves with the note's content and `isHeld` is false;
- with `{ reject: "nope" }` the call rejects with an error whose message is `"nope"`, and the note is unchanged;
- a second call after the release is not held;
- `releaseHeld` with nothing waiting returns false.

Use the exact argument shape `read_note` and `write_note` take in `src/lib/tauriCommands.ts`.

Run:

```bash
E2E_PORT=1441 npx playwright test tests/e2e/editor-batch1.independent.spec.ts --workers=2 --reporter=line
```

```bash
E2E_PORT=1441 npx playwright test tests/e2e/editor-batch1.independent.spec.ts -g "4.2" --repeat-each=10 --workers=2 --reporter=line
```

## Done when

- [ ] `npm run verify` passes.
- [ ] Both Playwright commands pass, the second ten times out of ten.
- [ ] `grep -n "fixme" tests/e2e/editor-batch1.independent.spec.ts` prints nothing.
- [ ] `git diff --stat main` lists only `mockBackend.ts`, the new Vitest file and the spec file.

## Report

The standard report, plus: did the app behave as the table says at steps 3 and 6 on the first try.
