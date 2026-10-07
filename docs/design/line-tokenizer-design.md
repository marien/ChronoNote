# One line tokenizer for the note grammar

Status: proposal, 2026-10-07. Waiting for Marien's approval.

## Problem

The note grammar (`# `, `v `, `> `, `x `, `o `, `. `, `, `, `- `/`* `, `! `, `=> `, `=> <symbol>`, `=> @name`,
`@name`, `(@a, @b)`, `(topic)`, setext `====`, numbered items) is parsed by regular expressions spread over
several files, each written for one consumer:

| Where | What it parses |
|---|---|
| `src/lib/editor/glyphs.ts` | One 15-alternative regex for the editor's glyph decorations, plus a second regex for the atomic (uneditable) ranges, plus its own private symbol→glyph map |
| `src/lib/editor/glyphLine.ts` | A second, hand-mirrored tokenizer for read-only views (History, Action Drawer, Search), with its own `glyphForSymbol` |
| `src/lib/tokens.ts` | `countActions`, `innermostActionSymbol`, `leadingTopicTag`, `findActionSymbols`, `stripLeadingToken`, `cycleActionSymbol`, the setters, numbered lists, section headers: each with its own pattern |
| `src/lib/history.ts`, `paste.ts`, `actions.ts`, `wrapIndent.ts`, `EditorPane.svelte` | Further local copies of the action-symbol pattern |

The `CLAUDE.local.md` memory note "two parallel impls that must stay in sync" and several changelog entries
(§120, §125, §126, §259, §268) are fixes for one copy drifting from another. The review found the action-symbol
character class `[#vx>]` in 6 files and two separate symbol→glyph maps.

## Proposal

A new module `src/lib/grammar/` with one pure function and one table:

```ts
export type TokenKind =
  | "action"        // # v > x at line start (after indentation)
  | "topic"         // o . , at line start
  | "bullet"        // - * at line start
  | "number"        // 1. 1.1) …
  | "emphasis"      // ! at line start (marks the whole line)
  | "arrow"         // the "=> " of a follow-up / delegation / consequence
  | "consequence"   // the symbol after "=> "
  | "assignee"      // @name, bare or inside (@a, @b) or after "=> "
  | "topicTag";     // (topic) right after a line-start or consequence symbol

export interface Token {
  kind: TokenKind;
  from: number;      // offsets in the line
  to: number;        // includes the trailing space where the grammar requires one
  symbol?: string;   // "#", "v", ">", "x", "o", ".", ",", "-", "*"
  replaced: boolean; // drawn as a glyph widget (and atomic in the editor) vs marked in place
}

export function tokenizeLine(line: string): Token[];
export const GLYPHS: Record<string, { char: string; cls: string }>; // the one symbol→glyph map
```

Every consumer becomes a thin adapter:

- **Editor (`glyphs.ts`)**: a `ViewPlugin` that runs `tokenizeLine` on visible lines and maps tokens to
  `Decoration.replace` (replaced) or `Decoration.mark`; atomic ranges are `tokens.filter(t => t.replaced)`.
  Both `MatchDecorator` regexes go away.
- **Read-only views (`glyphLine.ts`)**: `parseGlyphLine` maps the same tokens to `GlyphPart`s.
- **Queries (`tokens.ts` and the rest)**: `innermostActionSymbol`, `leadingTopicTag`, `findActionSymbols`,
  `countActions`, `stripLeadingToken` are rewritten on top of `tokenizeLine`. Their signatures stay, so call
  sites don't change.

Line-level structure that spans lines (setext headers, section boundaries, numbered-list renumbering) stays in
`tokens.ts`: it isn't a per-line token question.

## Migration plan (agent-sized steps)

1. **Golden corpus first.** A test that runs the *current* `parseGlyphLine`, the editor decorations (via a
   headless `EditorState` + the plugin), and every query in `tokens.ts` over every line of every `scenarios.ts`
   dataset plus a hand-written edge-case list (emails, URLs, `(@a, @b)`, CRLF-free text, indented actions,
   `=> # (topic)`), and snapshots the results. This freezes today's behaviour before anything moves.
2. `src/lib/grammar/` with `tokenizeLine` + `GLYPHS` + its own unit tests.
3. Switch `glyphLine.ts` to it; the golden test must still pass.
4. Switch the editor plugin; golden test + the Playwright `editor-tokens`, `glyph-layout`, `word-wrap` specs.
5. Switch the `tokens.ts` queries one at a time, then remove the local copies in the other files.

Each step is one branch; steps 3-5 can be separate agents once 1-2 are merged.

## Risks

- **Performance**: the editor decorator runs per visible line on every change. `tokenizeLine` must stay a
  single pass; benchmark against the current `MatchDecorator` on the `busy-week` scenario.
- **Intentional differences** between the editor and read-only views (for example the editor keeps `!` visible
  and marks the whole line). The golden corpus will surface each one; they become explicit options rather than
  accidental divergence.

## Open question for Marien

Topic symbols (`o . ,`) are not counted by `countActions` today. Keep it that way (they're agenda items, not
actions)? The tokenizer makes either choice a one-line change.
