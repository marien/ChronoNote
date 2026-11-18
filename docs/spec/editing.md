# Bullets, list continuation, and editing keys

This file specifies ChronoNote's bulleted-list, list-continuation, and editing-key rules as short statements paired with executable examples. In each table row, `Before` is the editor state using `‸` for the caret, `«` and `»` for selection anchor and head, `↵` for a line break, and `⇥` for a tab; `Keys` lists the keys pressed in order (`type "..."` types text and `paste "..."` pastes text); and `After` is the expected editor state. The test suite `src/lib/editor/specTables.test.ts` reads every table in this file and runs each row against the real editor.

## Bulleted lists

### B1. Bullet markers render as a bullet glyph without changing leading spaces

A `- ` or `* ` at the start of a line (optionally indented) renders as `•`; only the marker is replaced while the leading whitespace remains untouched, real, visible indentation.

Not run as a table: visual glyph rendering and widget appearance cannot be observed by a key-press row.

### B2. Two-space bullet nesting uses the fixed indent unit

Nesting is two spaces per level, which is what pressing `Tab` on a bullet line produces (and `Shift-Tab` outdents by two spaces, or one when indented by a single space), so no bullet-specific indent handling is needed.

| Before | Keys | After |
| :--- | :--- | :--- |
| `- item‸` | Tab | `  - item‸` |
| `* item‸` | Tab | `  * item‸` |
| `‸- item` | Tab | `  ‸- item` |
| `  - item‸` | Tab | `    - item‸` |
| `  - item‸` | Shift-Tab | `- item‸` |
| ` - item‸` | Shift-Tab | `- item‸` |
| `«- a↵* b»` | Tab | `  «- a↵  * b»` |

### B3. Enter reuses the bullet marker character and indentation

Continuing a bulleted list with `Enter` reuses whichever marker character (`-` or `*`) the current line already has and keeps its leading indentation.

| Before | Keys | After |
| :--- | :--- | :--- |
| `- item‸` | Enter | `- item↵- ‸` |
| `* item‸` | Enter | `* item↵* ‸` |
| `  - sub‸` | Enter | `  - sub↵  - ‸` |
| `  * sub‸` | Enter | `  * sub↵  * ‸` |
| `- al‸pha` | Enter | `- al↵- ‸pha` |
| `* ‸alpha` | Enter | `* ↵* ‸alpha` |

## List continuation

### C1. Enter continues bullets and combined bullet prefixes

Inside a bulleted line (or a line combining an action, topic, or emphasis marker with a bullet, such as `! - item` or `o ! - item`), `Enter` continues the list with the same markers at the same indentation, reopening resolved action or topic states.

| Before | Keys | After |
| :--- | :--- | :--- |
| `- one‸` | Enter | `- one↵- ‸` |
| `  - two‸` | Enter | `  - two↵  - ‸` |
| `# - task‸` | Enter | `# - task↵# - ‸` |
| `v * task‸` | Enter | `v * task↵# * ‸` |
| `! - note‸` | Enter | `! - note↵! - ‸` |
| `! * note‸` | Enter | `! * note↵! * ‸` |
| `# ! - item‸` | Enter | `# ! - item↵# ! - ‸` |
| `o - topic‸` | Enter | `o - topic↵o - ‸` |
| `o ! - item‸` | Enter | `o ! - item↵o ! - ‸` |

### C2. Enter continues action, topic, and follow-up lines

`Enter` on a leading-symbol action line continues as a fresh open `# ` action at the same indent (reopening `v`, `>`, `x`), on a topic line continues as `o `, on a plain `=> ` follow-up (including `=> @name`) continues as `=> `, and on a `=> <symbol>` consequence continues with the open consequence marker (`=> # ` or `=> o `).

| Before | Keys | After |
| :--- | :--- | :--- |
| `# task‸` | Enter | `# task↵# ‸` |
| `v task‸` | Enter | `v task↵# ‸` |
| `  > task‸` | Enter | `  > task↵  # ‸` |
| `⇥x task‸` | Enter | `⇥x task↵⇥# ‸` |
| `o topic‸` | Enter | `o topic↵o ‸` |
| `. topic‸` | Enter | `. topic↵o ‸` |
| `=> follow‸` | Enter | `=> follow↵=> ‸` |
| `=> @dana check‸` | Enter | `=> @dana check↵=> ‸` |
| `=> # act‸` | Enter | `=> # act↵=> # ‸` |
| `=> . top‸` | Enter | `=> . top↵=> o ‸` |

### C3. Enter on an empty leading marker exits and clears the line

Pressing `Enter` when the current bullet, action, topic, combined marker, or follow-up line is empty exits the list or marker and clears the line.

| Before | Keys | After |
| :--- | :--- | :--- |
| `- ‸` | Enter | `‸` |
| `  - ‸` | Enter | `‸` |
| `* ‸` | Enter | `‸` |
| `# ‸` | Enter | `‸` |
| `v ‸` | Enter | `‸` |
| `o ‸` | Enter | `‸` |
| `# - ‸` | Enter | `‸` |
| `o ! - ‸` | Enter | `‸` |
| `=> ‸` | Enter | `‸` |
| `=> # ‸` | Enter | `‸` |

### C4. Shift-Enter starts an aligned continuation line under any leading marker

`Shift-Enter` (decision D3) adds a continuation line with no new marker, padded with spaces to the column where the line's text starts (the same column visual word wrap uses), on bullets, topics, numbered items, actions (`# `, `# - `, `# ! `, `# 1. `), and follow-ups (`=> `, `=> # `).

| Before | Keys | After |
| :--- | :--- | :--- |
| `- text‸` | Shift-Enter | `- text↵  ‸` |
| `  - text‸` | Shift-Enter | `  - text↵    ‸` |
| `# text‸` | Shift-Enter | `# text↵  ‸` |
| `o text‸` | Shift-Enter | `o text↵  ‸` |
| `! text‸` | Shift-Enter | `! text↵  ‸` |
| `# - text‸` | Shift-Enter | `# - text↵    ‸` |
| `# ! - te‸xt` | Shift-Enter | `# ! - te↵      ‸xt` |
| `=> text‸` | Shift-Enter | `=> text↵   ‸` |
| `=> # text‸` | Shift-Enter | `=> # text↵     ‸` |
| `# 1. ‸text` | Shift-Enter | `# 1. ↵     ‸text` |

### C5. Enter and Shift-Enter at column 0, in the indent, or inside a marker insert a plain break

On every line kind, pressing `Enter` or `Shift-Enter` with the caret at column 0, inside leading indentation, inside a leading symbol, or before a numbered marker's trailing space inserts a plain line break, leaving the pushed-down marker intact.

| Before | Keys | After |
| :--- | :--- | :--- |
| `‸- item` | Enter | `↵‸- item` |
| `‸# task` | Enter | `↵‸# task` |
| `‸1. item` | Shift-Enter | `↵‸1. item` |
| `‸=> follow` | Shift-Enter | `↵‸=> follow` |
| ` ‸ - item` | Enter | ` ↵‸ - item` |
| ` ‸ - task` | Shift-Enter | ` ↵‸ - task` |
| `#‸ hello` | Enter | `#↵‸ hello` |
| `=>‸ hello` | Shift-Enter | `=>↵‸ hello` |
| `1.‸ item` | Shift-Enter | `1.↵‸ item` |
| `1‸2. twelve` | Enter | `1↵‸2. twelve` |

### C6. Enter and Shift-Enter at the end of a title line insert a plain break

Pressing `Enter` or `Shift-Enter` at the end of a Setext title line (directly above `===` or `---`) inserts a plain line break regardless of any leading marker on the title line.

| Before | Keys | After |
| :--- | :--- | :--- |
| `Title‸↵=====` | Enter | `Title↵‸↵=====` |
| `# Task title‸↵============` | Enter | `# Task title↵‸↵============` |
| `1. Num title‸↵============` | Enter | `1. Num title↵‸↵============` |
| `- Bullet sub‸↵------------` | Enter | `- Bullet sub↵‸↵------------` |
| `o Topic sub‸↵-----------` | Enter | `o Topic sub↵‸↵-----------` |
| `# Title‸↵=======` | Shift-Enter | `# Title↵‸↵=======` |

### C7. Enter and Shift-Enter on a selection delete it first and act at its start

With a selection, both `Enter` and `Shift-Enter` first delete the selected text and then behave as if pressed at the selection's start, in one undo step.

| Before | Keys | After |
| :--- | :--- | :--- |
| `# buy «milk»` | Enter | `# buy ↵# ‸` |
| `- «one↵- t»wo` | Enter | `- ↵- ‸wo` |
| `# a«b»c` | Enter | `# a↵# ‸c` |
| `«# task»` | Enter | `↵‸` |
| `# buy «milk»` | Shift-Enter | `# buy ↵  ‸` |
| `- «one↵- t»wo` | Shift-Enter | `- ↵  ‸wo` |
| `«# task»` | Shift-Enter | `↵‸` |

### C8. Shift-Enter rewrites due words on the line it leaves

`Shift-Enter` rewrites due words (such as `by:tomorrow`) to ISO dates on the line it leaves, just as `Enter` does.

Not run as a table: relative due words resolve to the current calendar date rather than a fixed string (tested with date patterns in `editing.enter.table.test.ts`).

## Editing keys

### E1. Home moves to the line's text start across all line kinds

`Home` (decision D2) jumps to where the line's text starts: after the indent, any leading marker(s) with their space, and a `(topic)` tag right after an action symbol (or after the indent on prose, or column 0 on unindented prose and mid-line `=>`).

| Before | Keys | After |
| :--- | :--- | :--- |
| `  indented‸` | Home | `  ‸indented` |
| `- it‸em` | Home | `- ‸item` |
| `  * item‸` | Home | `  * ‸item` |
| `# ta‸sk` | Home | `# ‸task` |
| `# ! - item‸` | Home | `# ! - ‸item` |
| `=> # action‸` | Home | `=> # ‸action` |
| `   1.1. sub‸` | Home | `   1.1. ‸sub` |
| `# (api) fix bug‸` | Home | `# (api) ‸fix bug` |
| `a => # b‸` | Home | `‸a => # b` |
| `Meeting‸↵=======` | Home | `‸Meeting↵=======` |

### E2. Home toggles between text start and column 0

Pressing `Home` at the line's text start moves to column 0, and pressing `Home` at column 0 moves back to the text start; from inside leading indentation or a held symbol, `Home` moves to the text start.

| Before | Keys | After |
| :--- | :--- | :--- |
| `# ‸task` | Home | `‸# task` |
| `‸# task` | Home | `# ‸task` |
| ` ‸ # task` | Home | `  # ‸task` |
| `#‸ task` | Home | `# ‸task` |
| `  ‸` | Home | `‸  ` |
| `‸  ` | Home | `  ‸` |
| `- item↵  continued‸` | Home, Home | `- item↵‸  continued` |
| `plain text‸` | Home | `‸plain text` |

### E3. Shift-Home toggles and extends the selection between text start and column 0

`Shift-Home` follows the same text-start and column-0 stops as `Home` while extending or adjusting the selection from its anchor.

| Before | Keys | After |
| :--- | :--- | :--- |
| `pla‸in` | Shift-Home | `»pla«in` |
| `# ta‸sk` | Shift-Home | `# »ta«sk` |
| `# ta‸sk` | Shift-Home, Shift-Home | `»# ta«sk` |
| `# ta‸sk` | Shift-Home, Shift-Home, Shift-Home | `# »ta«sk` |
| `# ‸task` | Shift-Home | `»# «task` |
| `‸# task` | Shift-Home | `«# »task` |
| `# (api) fi‸x` | Shift-Home | `# (api) »fi«x` |
| `# «ta»sk` | Shift-Home | `# ‸task` |
| `# t«as»k` | Shift-Home | `# »t«ask` |

### E4. Home on a wrapped line uses the visual row start

On a wrapped line, when the caret is past its first visual row, `Home` goes to the start of the current visual row rather than the logical line's text start.

Not run as a table: visual line wrapping depends on rendered viewport geometry, which the headless test editor does not lay out.

### E5. State shortcuts, Tab, and Shift-Tab act on covered lines and exclude trailing column 0

`Mod-1`..`Mod-7`, `Mod-Shift-o`, `Tab`, and `Shift-Tab` act on every line covered by the selection; a selection ending at column 0 of a line does not cover that line.

| Before | Keys | After |
| :--- | :--- | :--- |
| `«# a↵# b»` | Mod-2 | `«v a↵v b»` |
| `«# first↵»second` | Mod-2 | `«v first↵»second` |
| `«# first↵»# second` | Mod-2 | `«v first↵»# second` |
| `«a↵b»` | Mod-5 | `«o a↵o b»` |
| `«v a↵. b↵prose»` | Mod-Shift-o | `«# a↵o b↵prose»` |
| `«# a↵# b»` | Tab | `  «# a↵  # b»` |
| `«# a↵»second` | Tab | `  «# a↵»second` |
| `«  # a↵»  second` | Shift-Tab | `«# a↵»  second` |

### E6. Ctrl+Shift+S creates a section title and ignores titles, underlines, and blank lines

`Mod-Shift-s` turns a non-blank line into a Setext section title underlined with `=`, and does nothing on a blank line, an existing title line, or its `===` underline.

| Before | Keys | After |
| :--- | :--- | :--- |
| `Title‸` | Mod-Shift-s | `Title↵=====↵‸` |
| `Ti‸tle` | Mod-Shift-s | `Title↵=====↵‸` |
| `# Action‸` | Mod-Shift-s | `# Action↵========↵‸` |
| `‸` | Mod-Shift-s | `‸` |
| `   ‸` | Mod-Shift-s | `   ‸` |
| `Title‸↵=====` | Mod-Shift-s | `Title‸↵=====` |
| `Title↵=====‸` | Mod-Shift-s | `Title↵=====‸` |
| `Sub‸↵---` | Mod-Shift-s | `Sub‸↵---` |
| `Sub↵---‸` | Mod-Shift-s | `Sub↵---‸` |

### E7. Setting or removing a state symbol on a numbered item leaves numbers unchanged

Setting or removing a state symbol on a numbered item (`1. task` to `# 1. task` and back) keeps it in its list and leaves all item numbers unchanged.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. task‸↵2. next` | Mod-1 | `# 1. task‸↵2. next` |
| `1. keep↵2. task‸↵3. next` | Mod-1 | `1. keep↵# 2. task‸↵3. next` |
| `# 1. a↵2. b‸↵# 3. c` | Mod-2 | `# 1. a↵v 2. b‸↵# 3. c` |
| `# 1. a↵v 2. b‸↵3. c` | Mod-3 | `# 1. a↵> 2. b‸↵3. c` |
| `1. a↵# 2. b‸↵3. c` | Mod-4 | `1. a↵x 2. b‸↵3. c` |
| `1. a↵v 2. b‸↵3. c` | Mod-Shift-o | `1. a↵# 2. b‸↵3. c` |
| `1. a↵2. b‸↵3. c` | Mod-5 | `1. a↵o 2. b‸↵3. c` |
| `1. a↵o 2. b‸↵3. c` | Mod-6 | `1. a↵. 2. b‸↵3. c` |
| `1. a↵. 2. b‸↵3. c` | Mod-7 | `1. a↵, 2. b‸↵3. c` |
| `1. a↵# ‸2. b↵3. c` | Backspace | `1. a↵‸2. b↵3. c` |

### E8. Shift-Tab removes a leading tab

Pressing `Shift-Tab` on a line indented with a leading tab removes that tab.

| Before | Keys | After |
| :--- | :--- | :--- |
| `⇥# task‸` | Shift-Tab | `# task‸` |
| `⇥- item‸` | Shift-Tab | `- item‸` |
| `⇥prose‸` | Shift-Tab | `prose‸` |
| `⇥1. a‸↵⇥2. b` | Shift-Tab | `1. a‸↵2. b` |

### E9. Phone toolbar buttons mirror list indent and combine with state symbols

The phone toolbar's Indent/Outdent controls run the same list logic as `Tab`/`Shift-Tab`, its state buttons act on the lines covered by the selection, and its Bullet and emphasis buttons combine with an action or topic (`# task` + Bullet gives `# - task`).

Not run as a table: phone toolbar buttons are UI controls rather than editor keyboard shortcuts.

### E10. Multiple cursors are switched off

The editor keeps a single caret: `Ctrl+click` and `Alt+drag` place the caret or select a single range just as a plain click or drag does.

Not run as a table: mouse pointer interactions (`Ctrl+click` and `Alt+drag`) cannot be expressed as key-press rows.

### E11. Typing `by` before an existing `:date` keeps `by:` as plain text inside it

Typing `by` right before an existing `:date` keeps `by:` as plain text while the caret stays inside it, so `Backspace` deletes one letter at a time instead of deleting the whole due date.

| Before | Keys | After |
| :--- | :--- | :--- |
| `# task ‸:2026-11-20` | type "by" | `# task by‸:2026-11-20` |
| `# task ‸:2026-11-20` | type "by", Backspace | `# task b‸:2026-11-20` |
| `# task ‸:2026-11-20` | type "by", Backspace, Backspace | `# task ‸:2026-11-20` |

### E12. Right-click Paste reads the clipboard's HTML

Right-clicking Paste from the editor context menu reads HTML from the clipboard just as `Ctrl+V` does, converting pasted HTML lists into note lists.

Not run as a table: context-menu invocation and HTML clipboard payloads are outside plain-text key-press rows.

### E13. Pasting onto an empty marker merges and preserves indentation across pasted lines

Pasting onto an empty `# `, `=> `, `=> # `, `# - `, `# ! `, or `! ` marker replaces or merges the empty marker with the pasted line's leading symbol, and a multi-line paste onto an indented empty marker keeps that indentation on every pasted line.

| Before | Keys | After |
| :--- | :--- | :--- |
| `# ‸` | paste "# call Dana" | `# call Dana‸` |
| `# ‸` | paste "v sent" | `v sent‸` |
| `# ‸` | paste "- item" | `- item‸` |
| `  => ‸` | paste "=> item" | `  => item‸` |
| `=> # ‸` | paste "=> # act" | `=> # act‸` |
| `  # - ‸` | paste "# - nested" | `  # - nested‸` |
| `# ! ‸` | paste "# ! urgent" | `# ! urgent‸` |
| `! ‸` | paste "! urgent" | `! urgent‸` |
| `  # ‸` | paste "# one↵# two" | `  # one↵  # two‸` |
| `  - ‸` | paste "- one↵- two" | `  - one↵  - two‸` |

### E14. Word navigation treats each leading marker and combined lead as one word

`Ctrl-ArrowLeft`, `Ctrl-ArrowRight` (and with `Shift-`, extending) treat each leading marker with its trailing space (`# `, `v `, `! `, `12. `, `=> `) as a single word, stepping one marker at a time across combined leads (`v 12. done` steps through `v `, `12. `, `done`).

| Before | Keys | After |
| :--- | :--- | :--- |
| `‸# (bug) task` | Ctrl-ArrowRight | `# ‸(bug) task` |
| `‸# - task` | Ctrl-ArrowRight, Ctrl-ArrowRight | `# - ‸task` |
| `‸=> # call` | Ctrl-ArrowRight, Ctrl-ArrowRight | `=> # ‸call` |
| `‸v 12. done` | Ctrl-ArrowRight | `v ‸12. done` |
| `‸v 12. done` | Ctrl-ArrowRight, Ctrl-ArrowRight | `v 12. ‸done` |
| `v 12. done‸` | Ctrl-ArrowLeft, Ctrl-ArrowLeft | `v ‸12. done` |
| `  ! urgent‸` | Ctrl-ArrowLeft, Ctrl-ArrowLeft | `  ‸! urgent` |
| `‸# (bug) task` | Shift-Ctrl-ArrowRight, Shift-Ctrl-ArrowRight | `«# (bug)» task` |

### E15. Word navigation treats due dates, topic tags, dates, and `@name` tokens as one word

`Ctrl-ArrowLeft` and `Ctrl-ArrowRight` (with `Shift-`) step over a due date with `by:` (`by:2026-11-20`, `by:fri`, `by:2026-02-30`), a `(topic)` tag right after an action or topic symbol, a date (`2026-11-20`, including in a forward link), and an `@name` (letters, digits, `_`, `-`) without stopping inside.

| Before | Keys | After |
| :--- | :--- | :--- |
| `# ‸a by:2026-11-20 fix` | Ctrl-ArrowRight, Ctrl-ArrowRight | `# a by:2026-11-20‸ fix` |
| `# task by:2026-11-20‸` | Shift-Ctrl-ArrowLeft | `# task »by:2026-11-20«` |
| `# ‸a by:fri` | Ctrl-ArrowRight, Ctrl-ArrowRight | `# a by:fri‸` |
| `# ‸a by:2026-02-30` | Ctrl-ArrowRight, Ctrl-ArrowRight | `# a by:2026-02-30‸` |
| `on ‸2026-11-20 met` | Ctrl-ArrowRight | `on 2026-11-20‸ met` |
| `see ‸(>2026-11-20#Sync) end` | Ctrl-ArrowRight, Ctrl-ArrowRight | `see (>2026-11-20‸#Sync) end` |
| `ask ‸@dana-k and @dana.k` | Ctrl-ArrowRight, Ctrl-ArrowRight, Ctrl-ArrowRight | `ask @dana-k and @dana‸.k` |
| `‸(@dana)` | Ctrl-ArrowRight, Ctrl-ArrowRight | `(@dana‸)` |
| `(@dana)‸` | Ctrl-ArrowLeft, Ctrl-ArrowLeft | `(‸@dana)` |

### E16. Word deletion removes special words as a unit and deletes indent spaces as one step

`Ctrl-Backspace` and `Ctrl-Delete` delete a whole leading marker, due date, topic tag, or `@name` in one step (while stopping at parentheses and line breaks), and delete an indent run of spaces as its own `Ctrl-Delete` step.

| Before | Keys | After |
| :--- | :--- | :--- |
| `# task by:2026-11-20‸` | Ctrl-Backspace | `# task ‸` |
| `# task‸ by:2026-11-20 fix` | Ctrl-Delete | `# task‸ fix` |
| `# (bug)‸ task` | Ctrl-Backspace | `# ‸ task` |
| `# ‸task` | Ctrl-Backspace | `‸task` |
| `‸# task` | Ctrl-Delete | `‸task` |
| `v 12. ‸done` | Ctrl-Backspace | `v ‸done` |
| `v ‸12. done` | Ctrl-Delete | `v ‸done` |
| `ping @dana-k ‸now` | Ctrl-Backspace | `ping ‸now` |
| `‸  task` | Ctrl-Delete | `‸task` |
| `first↵‸# second` | Ctrl-Backspace | `first‸# second` |

### E17. Plain prose and plain Arrow keys keep standard word and character motion

Outside those special tokens, words keep CodeMirror's standard boundaries (and a `(topic)` elsewhere in prose is not treated as a tag), and plain `ArrowLeft`/`ArrowRight` still step inside special tokens.

| Before | Keys | After |
| :--- | :--- | :--- |
| `‸fix-it don't` | Ctrl-ArrowRight | `fix‸-it don't` |
| `# by:2026-11-20‸` | ArrowLeft | `# by:2026-11-2‸0` |
| `ask (bug)‸ me` | Ctrl-ArrowLeft | `ask (bug‸) me` |
| `ask (bug)‸ me` | Ctrl-ArrowLeft, Ctrl-ArrowLeft | `ask (‸bug) me` |
| `(# first)‸` | Ctrl-ArrowLeft | `(# first‸)` |

### E18. Double-click and triple-click select words, toggle glyphs, or select lines

Double-clicking a word or special token selects the whole word (for a marker, without its trailing space, such as `12.`), double-clicking an action or topic glyph still toggles it, and triple-clicking selects the whole line.

Not run as a table: mouse double-click and triple-click gestures are pointer interactions rather than key-press rows.
