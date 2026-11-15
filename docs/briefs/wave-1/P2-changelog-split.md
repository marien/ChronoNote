# Brief P2: a changelog a model can open

Run name `p2-changelog-split` · worktree `C:\Users\marie\Dev\Gemini\agy-worktrees\p2-changelog-split` · branch
`gemini/p2-changelog-split` · base `main` · no browser tests · model Gemini 4 Hydrogen

Read `docs/briefs/RULES.md` in your worktree first. For this brief only, you DO edit `docs/CHANGELOG.md` and create
`docs/changelog/`.

## Why

`docs/CHANGELOG.md` is the project's decision log: 478 numbered entries, 12,407 lines, 1.08 MB. It is too large for
any model to read, so briefs cannot point at the reason behind a rule. After this brief each hundred entries is its
own file and `docs/CHANGELOG.md` is a short index. Not one character of any entry changes.

## What exists now

- `docs/CHANGELOG.md`: line 1 is `# ChronoNote — Changelog`; lines 2-117 are an introduction; from line 118 on,
  entries start with a heading `## <number>. <title>` (`## 1. Grayscale-only UI …` up to `## 478. Two test fixes
  after 0.38.0`). A few `## ` headings carry no number; they belong to the entry before them. Entries contain a line
  `**Status: …**`.
- The file may have CRLF or LF line endings depending on the checkout. Treat it as bytes.
- `scripts/changelog-status.mjs` (69 lines) reads and rewrites the status lines at release time. It has
  `const FILE = "docs/CHANGELOG.md"`, finds entries added since the last tag with `git diff <tag> -- FILE`, and
  writes the file back.
- `scripts/release.sh` lines 197-198:

  ```bash
    if [[ -n "$(git status --porcelain docs/CHANGELOG.md)" ]]; then
      git add docs/CHANGELOG.md
  ```

- Other files mention `docs/CHANGELOG.md` as the place to look (`README.md`, `CONTRIBUTING.md`,
  `docs/AGENT_GUIDELINES.md`, `docs/spec.md`, `website/README.md`, two source comments). Those stay correct because
  the file remains, as the index.

## What to build

1. `scripts/changelog-split.mjs` (a one-time tool; commit it, it documents what was done). Reading the file as a
   Buffer and splitting on line feeds without altering any byte:
   - Part 0: everything before the first `## <number>. ` heading goes to `docs/changelog/0000-introduction.md`.
   - Entries 1-100 go to `docs/changelog/0001-0100.md`, 101-200 to `0101-0200.md`, and so on; the last file is
     `0401-0500.md`. An entry runs from its heading to the byte before the next numbered heading.
   - Each part file is exactly the bytes of the original, no header added, nothing trimmed.
   - The script checks, and stops with an error if not true: entry numbers are in rising order without gaps or
     repeats (if the real file breaks this, do not "fix" the file: keep each entry in the file where it sits in
     sequence, list the irregularities in your report); concatenating `0000-introduction.md` and all part files in
     name order gives a buffer identical to the original (`Buffer.compare(...) === 0`).
2. `scripts/changelog-index.mjs`: writes `docs/CHANGELOG.md` from the part files. With `--check` it writes nothing
   and exits 1 when the file on disk differs from what it would write. Content, using the line ending the part files
   use:

   ```
   # ChronoNote — Changelog

   The decision log: every change, numbered, with the reason behind it. The entries live in `docs/changelog/`, one
   file per hundred. A new entry goes at the end of the last file, with a `**Status: on main, not released yet.**`
   line, and this index is regenerated with `node scripts/changelog-index.mjs`.

   - [Introduction and early history](changelog/0000-introduction.md)

   ## 1-100 · [changelog/0001-0100.md](changelog/0001-0100.md)

   - §1 Grayscale-only UI — no color anywhere
   - §2 `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle between open note tabs
   ...
   ```

   One `- §<number> <title>` line per entry, title exactly as in its heading.
3. `scripts/changelog-status.mjs`: work on every `docs/changelog/[0-9]*.md` file instead of the one file. "Added
   since the previous release" comes from `git diff <tag> -- docs/changelog docs/CHANGELOG.md` (the second path so
   the first release after this change still sees entries added before the split: an added line `+## N. title` counts
   from either). Statuses are rewritten in the part file that holds the entry, keeping that file's line endings.
   Messages and exit codes stay as they are.
4. `scripts/release.sh` lines 197-198: use `docs/changelog docs/CHANGELOG.md` in both commands. Change nothing else
   in that script.
5. `scripts/verify.mjs`: add a step `changelog index` that runs `node scripts/changelog-index.mjs --check`, placed
   first in the `steps` array (it takes milliseconds).
6. `docs/AGENT_GUIDELINES.md` line 81 and `CONTRIBUTING.md`: where they say a change gets a section in
   `docs/CHANGELOG.md`, say it goes at the end of the last file in `docs/changelog/` and the index is regenerated.
   Change only those sentences.
7. Run the split, then the index, and commit the result: the part files, the new `docs/CHANGELOG.md`, the scripts.

## Out of scope

The wording of any entry. `docs/briefs/RULES.md` (the reviewer updates it). `CLAUDE.local.md`. Source comments that
mention the changelog.

## Tests to add

`src/lib/changelogScripts.test.ts` (Vitest, node): export the pure parts of the two new scripts (a function that
splits a buffer into parts, a function that builds the index text from part texts) and test them on a small made-up
changelog of an introduction and five entries, with CRLF and with LF: the parts concatenate to the input; an entry
with an un-numbered `## ` heading inside it stays whole; a gap in the numbers is reported; the index lists every
entry once.

Then prove the real run, and put the output in your report:

```bash
git show main:docs/CHANGELOG.md | sha256sum
```

```bash
cat docs/changelog/0000-introduction.md docs/changelog/0[0-9][0-9][1-9]-*.md | sha256sum
```

The two hashes must be equal. (If the checkout converts line endings, compare with
`git show HEAD:<each part>` piped together instead of the working files, and say which you used.)

```bash
node scripts/changelog-status.mjs 0.38.1 --check
```

It must report `0 section(s)` or only real sections added after `v0.38.0`, and exit 0.

## Done when

- [ ] The two hashes are equal.
- [ ] `node scripts/changelog-index.mjs --check` exits 0; `wc -l docs/CHANGELOG.md` is under 520 lines.
- [ ] `grep -c "^## [0-9]" docs/changelog/*.md` adds up to 478.
- [ ] `npm run verify` passes.

## Report

The standard report, plus: the two hashes, entries per file, and any irregularity in the numbering.
