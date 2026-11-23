# Token semantics

This file specifies ChronoNote's line tokenization rules (`docs/spec.md` §2.2) as short statements paired with executable examples in `| Line | Tokens |` tables. Each `Line` cell is wrapped in single backticks using `·` for a space where leading, trailing, or extra spaces matter, `↵` for a line break (used to show a title line above its underline), and `⇥` for a tab. Each `Tokens` cell is either `—` (no tokens) or a single-backtick code span listing the tokens returned by `tokenizeNoteLine(lines, 0)` in order, separated by ` · `:

- `action:<sym> from-to` — leading action (`#`, `v`, `>`, `x`) plus its trailing space (`replaced: true`)
- `topic:<sym> from-to` — leading meeting topic (`o`, `.`, `,`) plus its trailing space (`replaced: true`)
- `bullet:<sym> from-to` — leading or post-state bullet (`-`, `*`) plus its trailing space (`replaced: true`)
- `emphasis:! from-to` — `! ` at line start or right after a leading action or topic, covering to the end of the line (`replaced: false`)
- `arrow from-to` — `=> ` follow-up marker (`replaced: true`)
- `consequence:<sym> from-to` — action symbol (`#`, `v`, `>`, `x`) plus space right after `=> ` (`replaced: true`)
- `consequenceTopic:<sym> from-to` — topic symbol (`o`, `.`, `,`) plus space right after `=> ` (`replaced: true`)
- `assignee from-to` — `@name` mention (`replaced: false`)
- `topicTag from-to` — `(topic)` right after an action, topic, or consequence marker (`replaced: false`)
- `paren from-to` — any other single-token `(word)` consumed so it stays plain text (`replaced: false`)
- `due:YYYY-MM-DD from-to` — `by:YYYY-MM-DD` valid calendar due date in an action part (`replaced: false`)
- `dueWord:word from-to` — `by:<word>` non-ISO or invalid-calendar due word in an action part (`replaced: false`)
- `forwardLink:<dir><date>[#Section] from-to` — forward or backward date link (`>` or `<`) (`replaced: false`)
- `escape from-to` — leading `\` before a marker, or `\` before `=> ` (`replaced: false`)

The test suite `src/lib/tokenSpecTables.test.ts` reads every `| Line | Tokens |` table in this file and runs each row through `tokenizeNoteLine`.

### N1. Visual glyphs, atomic selection, and caret-inside-marker behaviour

Glyphs occupy at most 2 `ch` (3 `ch` for `=> `) via explicit CSS sizing, follow the active grayscale or color theme, and act as atomic selection spans except for `@name` badges (which remain editable text); a leading token whose symbol and space surround the caret stays plain text and `Enter` there inserts a plain newline.

Not run as a table: CSS glyph sizing, theme styling, atomic text selection, caret-position masking, and `Enter` handling depend on editor layout, selection, and key state rather than line tokenization.

### N2. Leading action symbols (`# `, `v `, `> `, `x `)

At column 0 or indented, `# `, `v `, `> `, or `x ` followed by a space produces an `action` token covering the symbol and its trailing space (not the indentation); without a following space, or mid-line without `=> `, it stays plain text.

| Line | Tokens |
| :--- | :--- |
| `` | — |
| `···` | — |
| `# task` | `action:# 0-2` |
| `v done` | `action:v 0-2` |
| `> later` | `action:> 0-2` |
| `x drop` | `action:x 0-2` |
| `··# indented` | `action:# 2-4` |
| `⇥x tabbed` | `action:x 1-3` |
| `#·` | `action:# 0-2` |
| `#` | — |
| `#task` | — |
| `call # mid` | — |

### N3. Leading meeting topic symbols (`o `, `. `, `, `)

At column 0 or indented, `o `, `. `, or `, ` followed by a space produces a `topic` token covering the symbol and its trailing space; without a following space, or inside numbers and prose, it stays plain text.

| Line | Tokens |
| :--- | :--- |
| `o agenda` | `topic:o 0-2` |
| `. discussed` | `topic:. 0-2` |
| `, postponed` | `topic:, 0-2` |
| `··o indented` | `topic:o 2-4` |
| `⇥. tabbed` | `topic:. 1-3` |
| `o·` | `topic:o 0-2` |
| `o` | — |
| `oTopic` | — |
| `.hidden` | — |
| `3.5 hours` | — |
| `note o mid` | — |

### N4. Bulleted list items (`- ` and `* `)

At column 0 or indented, `- ` or `* ` followed by a space produces a `bullet` token covering the symbol and its trailing space; without a trailing space, or mid-line without a preceding state/emphasis marker, it stays plain text.

| Line | Tokens |
| :--- | :--- |
| `- item` | `bullet:- 0-2` |
| `* item` | `bullet:* 0-2` |
| `··- nested` | `bullet:- 2-4` |
| `····* deep` | `bullet:* 4-6` |
| `⇥- tabbed` | `bullet:- 1-3` |
| `-·` | `bullet:- 0-2` |
| `-item` | — |
| `*bold*` | — |
| `---` | — |
| `text - mid` | — |

### N5. Follow-up arrows (`=> `)

Each `=> ` (at line start, indented, or mid-line) produces an `arrow` token covering those three characters; `=>` without a trailing space stays plain text.

| Line | Tokens |
| :--- | :--- |
| `=> note` | `arrow 0-3` |
| `··=> indented` | `arrow 2-5` |
| `talk => outcome` | `arrow 5-8` |
| `a => b => c` | `arrow 2-5 · arrow 7-10` |
| `=>` | — |
| `a=>b` | — |
| `a =>b` | — |
| `= > b` | — |

### N6. Delegated actions (`=> @name`) and `@name` mentions

An `@name` (including hyphens and non-ASCII letters) produces an `assignee` token after `=> `, mid-sentence, in prose, on action or topic lines, or inside parentheses (`(@a, @b, @c)`), also when names are joined by `/` (`(@a/@b)`, §534), while `@` glued to a word, after `@`, after a `/` that does not follow a name, or alone stays plain text.

| Line | Tokens |
| :--- | :--- |
| `=> @dana` | `arrow 0-3 · assignee 3-8` |
| `# task => @dana check` | `action:# 0-2 · arrow 7-10 · assignee 10-15` |
| `ask @jean-luc now` | `assignee 4-13` |
| `ask @René` | `assignee 4-9` |
| `o sync (@a, @b, @c)` | `topic:o 0-2 · assignee 8-10 · assignee 12-14 · assignee 16-18` |
| `(@dana)` | `assignee 1-6` |
| `(@a/@b)` | `assignee 1-3 · assignee 4-6` |
| `=> @a/@b/@c` | `arrow 0-3 · assignee 3-5 · assignee 6-8 · assignee 9-11` |
| `mail dana@example.com` | — |
| `see https://x.y/@dana` | — |
| `see https://x.y/@a/@b` | — |
| `and/@dana` | — |
| `ping @@dana` | — |
| `at @ end` | — |

### N7. Consequence actions (`=> <symbol> `) and consequence topics

An action symbol (`#`, `v`, `>`, `x`) or topic symbol (`o`, `.`, `,`) followed by a space after `=> ` produces `consequence` or `consequenceTopic`; `=> @name` is delegated and never also a consequence action.

| Line | Tokens |
| :--- | :--- |
| `a => # act` | `arrow 2-5 · consequence:# 5-7` |
| `a => v done` | `arrow 2-5 · consequence:v 5-7` |
| `a => > later` | `arrow 2-5 · consequence:> 5-7` |
| `a => x drop` | `arrow 2-5 · consequence:x 5-7` |
| `a => o topic` | `arrow 2-5 · consequenceTopic:o 5-7` |
| `a => . done` | `arrow 2-5 · consequenceTopic:. 5-7` |
| `a => , skip` | `arrow 2-5 · consequenceTopic:, 5-7` |
| `=> #task` | `arrow 0-3` |
| `=> @dana # not` | `arrow 0-3 · assignee 3-8` |
| `. budget => # send => o raise` | `topic:. 0-2 · arrow 9-12 · consequence:# 12-14 · arrow 19-22 · consequenceTopic:o 22-24` |

### N8. Topic tags (`(topic)`) and plain parenthesised words

A single-token `(topic)` (not starting with `@`) immediately after a leading action/topic symbol or `=> <symbol>` produces `topicTag`; any other single-token `(word)` produces `paren` (consumed so it stays plain text), while `(@name)` produces `assignee` and multi-word parentheses produce no token. A line has at most one topic tag (§422): a second `(word)` in a tag position, such as after `=> # `, is a `paren`.

| Line | Tokens |
| :--- | :--- |
| `# (work) task` | `action:# 0-2 · topicTag 2-8` |
| `v (ops) done` | `action:v 0-2 · topicTag 2-7` |
| `o (hiring) notes` | `topic:o 0-2 · topicTag 2-10` |
| `a => # (urgent) act` | `arrow 2-5 · consequence:# 5-7 · topicTag 7-15` |
| `a => o (sync) item` | `arrow 2-5 · consequenceTopic:o 5-7 · topicTag 7-13` |
| `# (a) (b) task` | `action:# 0-2 · topicTag 2-5 · paren 6-9` |
| `# task (work)` | `action:# 0-2 · paren 7-13` |
| `(prose) line` | `paren 0-7` |
| `# (@dana) task` | `action:# 0-2 · assignee 3-8` |
| `# (two words) task` | `action:# 0-2` |
| `- (word) item` | `bullet:- 0-2 · paren 2-8` |
| `a => (word) item` | `arrow 2-5 · paren 5-11` |
| `(word) => # (tag) act` | `paren 0-6 · arrow 7-10 · consequence:# 10-12 · topicTag 12-17` |
| `# (a) text => # (b) task` | `action:# 0-2 · topicTag 2-5 · arrow 11-14 · consequence:# 14-16 · paren 16-19` |

### N9. Due dates (`by:YYYY-MM-DD`) and due words (`by:<word>`)

Inside an action part (leading `# v > x`, `=> <symbol>`, `=> @name`, or a plain `=> text` belonging to a preceding action part), the first `by:<text>` produces `due` for a valid calendar `YYYY-MM-DD` and `dueWord` otherwise, excluding trailing `) ] , . ; ! ? " '` punctuation; topic, bullet, emphasis, and prose lines, one-word `(by:…)` brackets, and `by:` glued to a word or preceded by `/ . @ : -` produce no due token.

| Line | Tokens |
| :--- | :--- |
| `# call by:2026-11-20` | `action:# 0-2 · due:2026-11-20 7-20` |
| `notes => # call by:2026-11-20` | `arrow 6-9 · consequence:# 9-11 · due:2026-11-20 16-29` |
| `notes => @dana by:2026-11-20` | `arrow 6-9 · assignee 9-14 · due:2026-11-20 15-28` |
| `# ask => note by:2026-11-20` | `action:# 0-2 · arrow 6-9 · due:2026-11-20 14-27` |
| `prose => note by:2026-11-20` | `arrow 6-9` |
| `# a by:2026-11-20 by:2026-11-21` | `action:# 0-2 · due:2026-11-20 4-17` |
| `# a by:2026-11-20 => # b by:2026-11-21` | `action:# 0-2 · due:2026-11-20 4-17 · arrow 18-21 · consequence:# 21-23 · due:2026-11-21 25-38` |
| `o topic by:2026-11-20` | `topic:o 0-2` |
| `- bullet by:2026-11-20` | `bullet:- 0-2` |
| `! note by:2026-11-20` | `emphasis:! 0-20` |
| `prose by:2026-11-20` | — |
| `# (by:2026-11-20) task` | `action:# 0-2 · topicTag 2-17` |
| `# task (by:2026-11-20)` | `action:# 0-2 · paren 7-22` |
| `# standby:2026-11-20` | `action:# 0-2` |
| `# see http://x/by:2026-11-20` | `action:# 0-2` |
| `# a.by:2026-11-20` | `action:# 0-2` |
| `# @by:2026-11-20` | `action:# 0-2 · assignee 2-5` |
| `# a:by:2026-11-20` | `action:# 0-2` |
| `# a-by:2026-11-20` | `action:# 0-2` |
| `# (task by:2026-11-20)` | `action:# 0-2 · due:2026-11-20 8-21` |
| `# task by:2026-11-20.` | `action:# 0-2 · due:2026-11-20 7-20` |
| `# task by:2026-11-20,` | `action:# 0-2 · due:2026-11-20 7-20` |
| `# task by:2026-02-30` | `action:# 0-2 · dueWord:2026-02-30 7-20` |
| `# task by:2024-02-29` | `action:# 0-2 · due:2024-02-29 7-20` |
| `# task by:fri` | `action:# 0-2 · dueWord:fri 7-13` |
| `# task by:fridy` | `action:# 0-2 · dueWord:fridy 7-15` |
| `# task by:·` | `action:# 0-2` |
| `notes => ask @dana by:2026-11-20` | `arrow 6-9 · assignee 13-18` |
| `# task => (word) by:2026-11-20` | `action:# 0-2 · arrow 7-10 · paren 10-16 · due:2026-11-20 17-30` |
| `# task => o topic by:2026-11-20` | `action:# 0-2 · arrow 7-10 · consequenceTopic:o 10-12` |
| `# (by:2026-11-20)foo` | `action:# 0-2 · topicTag 2-17` |
| `# by:@dana` | `action:# 0-2 · assignee 5-10` |
| `# task by:2026-01-15` | `action:# 0-2 · due:2026-01-15 7-20` |
| `# task by:2026.11.20` | `action:# 0-2 · dueWord:2026.11.20 7-20` |
| `# task by:.` | `action:# 0-2` |
| `# task by:x2026-11-20` | `action:# 0-2 · dueWord:x2026-11-20 7-21` |
| `# task by:2026-11-20x` | `action:# 0-2 · dueWord:2026-11-20x 7-21` |

### N10. Emphasis lines (`! `) and emphasised bullets (`! - `, `! * `)

An `! ` at column 0, indented, or immediately after a leading action or topic symbol produces an `emphasis` token to the end of the line (while inline tokens after it are still scanned), and a following `- ` or `* ` produces a `bullet` token; `! ` after a bullet or mid-line stays plain text.

| Line | Tokens |
| :--- | :--- |
| `! urgent` | `emphasis:! 0-8` |
| `··! indented` | `emphasis:! 2-12` |
| `! - item` | `emphasis:! 0-8 · bullet:- 2-4` |
| `··! * sub` | `emphasis:! 2-9 · bullet:* 4-6` |
| `# ! urgent` | `action:# 0-2 · emphasis:! 2-10` |
| `o ! note` | `topic:o 0-2 · emphasis:! 2-8` |
| `# ! - task` | `action:# 0-2 · emphasis:! 2-10 · bullet:- 4-6` |
| `! see @sam => # act` | `emphasis:! 0-19 · assignee 6-10 · arrow 11-14 · consequence:# 14-16` |
| `- ! item` | `bullet:- 0-2` |
| `prose ! mid` | — |
| `!urgent` | — |

### N11. Title lines above `===` or `---` underlines are plain text

A non-blank line directly above a line of three or more `=` or `-` (with only optional spaces) is a section or subsection title and produces no tokens regardless of what it starts with; shorter underlines, lines with extra text, blank lines, and underline lines themselves are not titles.

| Line | Tokens |
| :--- | :--- |
| `Heading↵====` | — |
| `Heading↵----` | — |
| `# Task↵===` | — |
| `o Topic↵---` | — |
| `# @dana by:2026-11-20 (>2026-11-21#S) => # act↵··===··` | — |
| `# Task↵==` | `action:# 0-2` |
| `# Task↵--` | `action:# 0-2` |
| `# Task↵--- x` | `action:# 0-2` |
| `# Task↵- --` | `action:# 0-2` |
| `# Task↵aaa` | `action:# 0-2` |
| `====` | — |
| `---` | — |
| `↵---` | — |

### N12. One line, one meaning across parts and emphasis

Each open action or consequence part on a line is tokenized independently, and inline tokens (`@name`, `=> #`, `due`) inside an `! ` emphasis line are still recognized according to the action part they sit in; read-only views, counts, line menus, and two-column tabs read the same tokenizer output.

| Line | Tokens |
| :--- | :--- |
| `# first => v resolved` | `action:# 0-2 · arrow 8-11 · consequence:v 11-13` |
| `Notes => # call Sam` | `arrow 6-9 · consequence:# 9-11` |
| `! @sam => # check by:2026-11-20` | `emphasis:! 0-31 · assignee 2-6 · arrow 7-10 · consequence:# 10-12 · due:2026-11-20 18-31` |
| `! call by:2026-11-20 => # check` | `emphasis:! 0-31 · arrow 21-24 · consequence:# 24-26` |

### N13. Marker spacing: symbol plus one space

Each marker covers its symbol plus one space; extra spaces after `# ` belong to text, while extra spaces between `=>` and a following symbol or `@name` (or between a marker and `(topic)`) are allowed and skipped.

| Line | Tokens |
| :--- | :--- |
| `#··task` | `action:# 0-2` |
| `a =>··# call` | `arrow 2-5 · consequence:# 6-8` |
| `a =>··@dana` | `arrow 2-5 · assignee 6-11` |
| `#··(topic) task` | `action:# 0-2 · topicTag 3-10` |
| `a =>··#··(tag) x` | `arrow 2-5 · consequence:# 6-8 · topicTag 9-14` |
| `#task` | — |
| `a =># call` | — |

### N14. Backslash escapes (`\#`, `\=>`)

A leading `\` right before a line-start marker (action, topic, bullet, `! `, `=> `, or numbered marker, optionally indented) emits `escape` and leaves that marker plain text, while a mid-line `\=> ` emits `escape` and prevents `arrow`.

| Line | Tokens |
| :--- | :--- |
| `\# config` | `escape 0-1` |
| `\v done` | `escape 0-1` |
| `\- item` | `escape 0-1` |
| `\1. not a list` | `escape 0-1` |
| `\=> x` | `escape 0-1` |
| `··\# indented` | `escape 2-3` |
| `\! plain` | `escape 0-1` |
| `\o plain` | `escape 0-1` |
| `a \=> b` | `escape 2-3` |
| `\# config => # next` | `escape 0-1 · arrow 10-13 · consequence:# 13-15` |
| `\v` | — |
| `\plain` | — |

### N15. Links and impossible due dates

A forward link's section may contain balanced parentheses, while an impossible due date or due word produces `dueWord` instead of `due`; URL link detection (where a date inside a URL belongs to the URL rather than a date link) is handled by link decorations rather than the line tokenizer.

| Line | Tokens |
| :--- | :--- |
| `# task (>2026-11-20#Sync (Part 1))` | `action:# 0-2 · forwardLink:>2026-11-20#Sync (Part 1) 7-34` |
| `# task by:2026-02-30` | `action:# 0-2 · dueWord:2026-02-30 7-20` |
| `# task by:fridy` | `action:# 0-2 · dueWord:fridy 7-15` |
| `# task by:fri` | `action:# 0-2 · dueWord:fri 7-13` |

### N16. Outside changes

Outside changes from disk, sync, or the phone companion apply minimal edits that keep UTF-16 surrogate pairs intact and preserve the caret and scroll position.

Not run as a table: outside-change diffing and caret/scroll preservation operate on CodeMirror document transactions rather than line tokenization.

### N17. Per-part dimming of resolved parts

Resolved leading markers and resolved `=> <symbol>` parts are drawn dimmed (while returning to full strength on hover or selection), whereas `=> text` and `=> @name` follow the part before them.

Not run as a table: visual dimming and hover/caret strength changes are editor styling rather than line tokenization.

### N18. Glyph clicks, hover previews, and state shortcuts

Clicking a glyph toggles between open and closed/discussed with a hover preview, and `Ctrl/Cmd+1`–`7` set specific action or topic states.

Not run as a table: pointer clicks, hover previews, and keyboard shortcuts are editor interactions rather than line tokenization.

### N19. Combining symbols in state-first order

Lines combine markers in state-first order (action/topic symbol, optional list marker or `! `, text, then `=> ` follow-ups); placing a state symbol after a bullet or another state symbol, or `! ` right after `=> `, leaves the second symbol as plain text.

| Line | Tokens |
| :--- | :--- |
| `# - task` | `action:# 0-2 · bullet:- 2-4` |
| `o 1. topic` | `topic:o 0-2` |
| `# ! urgent` | `action:# 0-2 · emphasis:! 2-10` |
| `# ! - urgent item` | `action:# 0-2 · emphasis:! 2-17 · bullet:- 4-6` |
| `. budget => # send => o raise` | `topic:. 0-2 · arrow 9-12 · consequence:# 12-14 · arrow 19-22 · consequenceTopic:o 22-24` |
| `- # task` | `bullet:- 0-2` |
| `o # task` | `topic:o 0-2` |
| `# o task` | `action:# 0-2` |
| `=> ! urgent` | `arrow 0-3` |

### N20. Target symbol selection for clicks, shortcuts, and Action Drawer

Clicks act on the clicked glyph, keyboard/palette/phone commands pick the symbol nearest left of the caret (else nearest right), multi-line selections use each line's reference column, and Action Drawer rows act on their own symbol.

Not run as a table: target-symbol selection depends on pointer hit-testing, caret/selection geometry, and Action Drawer row state rather than line tokenization.

### N21. Action groups and tree lines

Consecutive indented group lines or same-indent arrow lines under an action parent form visual parent-child trees with muted tree connector lines and step numbers.

Not run as a table: action groups span multiple lines and render CodeMirror connector layers rather than single-line tokens.

### N22. Copy/paste deferral across tabs

Copying open `# ` actions or `o ` topics and pasting into today's or a later-dated note marks the originals `> ` or `, ` in their source tab, reversible on undo/redo.

Not run as a table: copy/paste deferral operates across editor tabs, note dates, and clipboard transactions rather than line tokenization.

### N23. Forward links (`(>YYYY-MM-DD#Section)` and `(<YYYY-MM-DD#Section)`)

Forward and backward links with valid calendar dates (with or without `#Section`) produce `forwardLink` tokens, whereas plain `(YYYY-MM-DD)`, empty `#`, invalid calendar dates, and unclosed links do not.

| Line | Tokens |
| :--- | :--- |
| `> task (>2026-11-20#Sync)` | `action:> 0-2 · forwardLink:>2026-11-20#Sync 7-25` |
| `# task (<2026-11-18#Standup)` | `action:# 0-2 · forwardLink:<2026-11-18#Standup 7-28` |
| `# task (>2026-11-20)` | `action:# 0-2 · forwardLink:>2026-11-20 7-20` |
| `> task (<2026-11-18#S1) (>2026-11-20#S2)` | `action:> 0-2 · forwardLink:<2026-11-18#S1 7-23 · forwardLink:>2026-11-20#S2 24-40` |
| `task (2026-10-03)` | `paren 5-17` |
| `task (>2026-11-20#)` | `paren 5-19` |
| `task (>2026-02-30#Sync)` | `paren 5-23` |
| `task (>2026-11-20#Sync` | — |
| `task (>2026-11-20)(word)` | `forwardLink:>2026-11-20 5-18 · paren 18-24` |
| `task (word) (>2026-11-20)` | `paren 5-11 · forwardLink:>2026-11-20 12-25` |
| `task (word)(>2026-11-20)` | `paren 5-11 · forwardLink:>2026-11-20 11-24` |
| `# (>2026-11-20#LongSection) @a` | `action:# 0-2 · forwardLink:>2026-11-20#LongSection 2-27 · assignee 28-30` |

### N24. Due-word rewriting, date tooltips, and compact date picker

Leaving a line or pasting rewrites relative `by:<word>` words to `by:YYYY-MM-DD`, clicking a due date opens `CompactDatePicker.svelte`, and hovering shows the long date and lateness tooltip.

Not run as a table: due-word calendar resolution, editor rewrites, tooltips, and the compact date picker popover depend on current date, locale, and UI interactions rather than line tokenization.

### N25. Pasting onto an empty symbol

Pasting a line starting with a symbol onto a line holding only an empty symbol replaces or merges the empty symbol at the line's indentation.

Not run as a table: empty-symbol paste merging is an editor paste transform (tested in `docs/spec/editing.md`) rather than line tokenization.
