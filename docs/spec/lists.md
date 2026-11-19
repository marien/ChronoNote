# Numbered lists

This file specifies ChronoNote's numbered-list editing rules as short statements paired with executable examples. In each table row, `Before` is the editor state using `‸` for the caret, `«` and `»` for selection anchor and head, `↵` for a line break, and `⇥` for a tab; `Keys` lists the keys pressed in order; and `After` is the expected editor state. The test suite `src/lib/editor/specTables.test.ts` reads every table in this file and runs each row against the real editor.

### L1. What counts as a numbered marker

A numbered marker is one or more positive integers separated by `.` and ending with `.` or `)`, followed by a space, as the first non-blank text on a line (`1.`, `2)`, `1.1.`, `1.2.3)`), with no special glyph styling; `3.5 hours`, `0. zero`, `01. leading zero`, and `a. letter` are prose.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. item‸` | Enter | `1. item↵2. ‸` |
| `2) item‸` | Enter | `2) item↵3) ‸` |
| `1.1. sub‸` | Enter | `1.1. sub↵1.2. ‸` |
| `1.2.3) deep‸` | Enter | `1.2.3) deep↵1.2.4) ‸` |
| `3.5 hours‸` | Enter | `3.5 hours↵‸` |
| `0. zero‸` | Enter | `0. zero↵‸` |
| `01. leading zero‸` | Enter | `01. leading zero↵‸` |
| `a. letter‸` | Enter | `a. letter↵‸` |

### L2. Enter continues a numbered item with the next number

Pressing `Enter` inside or after a numbered item's text inserts the next number (last component plus one), keeping any parent prefixes, leading indentation, and delimiter; pressing `Enter` at column 0, inside the indent, or before the marker's trailing space inserts a plain line break instead.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. one‸` | Enter | `1. one↵2. ‸` |
| `2) two‸` | Enter | `2) two↵3) ‸` |
| `9. nine‸` | Enter | `9. nine↵10. ‸` |
| `    3. indented‸` | Enter | `    3. indented↵    4. ‸` |
| `⇥1. tabbed‸` | Enter | `⇥1. tabbed↵⇥2. ‸` |
| `1. al‸pha` | Enter | `1. al↵2. ‸pha` |
| `1. ‸alpha` | Enter | `1. ↵2. ‸alpha` |
| `1.‸ item` | Enter | `1.↵‸ item` |

### L3. Shift-Enter aligns a continuation line under the item's text

Pressing `Shift-Enter` inside a numbered item's text inserts a plain continuation line indented with spaces to the column where the item's text starts.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. text‸` | Shift-Enter | `1. text↵   ‸` |
| `10. text‸` | Shift-Enter | `10. text↵    ‸` |
| `   1.1. text‸` | Shift-Enter | `   1.1. text↵        ‸` |
| `1. te‸xt` | Shift-Enter | `1. te↵   ‸xt` |
| `- a↵1. b‸` | Shift-Enter | `- a↵1. b↵   ‸` |
| `‸1. item` | Shift-Enter | `↵‸1. item` |

### L4. Enter on an item with sub-items renumbers siblings and dotted children

Pressing `Enter` on an item with sub-items inserts the next sibling number right after the split line, updates any following dotted sub-items of the moved item to match its new number, and pushes following siblings down even across deeper sub-items, continuation lines, or sub-bullets.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a‸↵2. b↵  2.1. b one↵3. c` | Enter | `1. a↵2. ‸↵3. b↵  3.1. b one↵4. c` |
| `1. a‸↵   1.1. sub↵2. b↵3. c` | Enter | `1. a↵2. ‸↵   2.1. sub↵3. b↵4. c` |
| `1. a‸↵   1. sub↵2. b↵3. c` | Enter | `1. a↵2. ‸↵   1. sub↵3. b↵4. c` |
| `1. a‸↵   cont↵2. b↵3. c` | Enter | `1. a↵2. ‸↵   cont↵3. b↵4. c` |
| `1. a‸↵   - bullet↵2. b↵3. c` | Enter | `1. a↵2. ‸↵   - bullet↵3. b↵4. c` |
| `4. a‸↵   4.1. sub↵5. b` | Enter | `4. a↵5. ‸↵   5.1. sub↵6. b` |
| `1. a↵   1.1. b‸↵      1.1.1. c↵   1.2. d↵2. e` | Enter | `1. a↵   1.1. b↵   1.2. ‸↵      1.2.1. c↵   1.3. d↵2. e` |
| `1. a‸↵⇥1.1. sub↵2. b↵3. c` | Enter | `1. a↵2. ‸↵⇥2.1. sub↵3. b↵4. c` |

### L5. Tab indents a numbered item under its preceding sibling

Pressing `Tab` on a non-first numbered item indents it to the nearest preceding same-indent sibling's text column within the same parent, restarting at `1` for a new sub-group or continuing an existing sub-group and renumbering following outer siblings.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a↵2. b‸` | Tab | `1. a↵   1. b‸` |
| `10. a↵11. b‸` | Tab | `10. a↵    1. b‸` |
| `1. a↵   1. sub↵2. b‸` | Tab | `1. a↵   1. sub↵   2. b‸` |
| `1. a↵2. bc‸d↵3. e` | Tab | `1. a↵   1. bc‸d↵2. e` |
| `1. a↵‸2. b↵3. c` | Tab | `1. a↵‸   1. b↵2. c` |
| `1. a↵   1.1. b↵2. c↵   1. d‸` | Tab | `1. a↵   1.1. b↵2. c↵     1. d‸` |
| `1. a↵2. b‸` | Tab, Tab | `1. a↵     1. b‸` |
| `intro↵↵1. a↵2. b‸` | Tab | `intro↵↵1. a↵   1. b‸` |
| `1. a↵   1. x↵- sub‸` | Tab | `1. a↵   1. x↵   - sub‸` |
| `1. a↵   1) x↵2. b‸` | Tab | `1. a↵   1) x↵   1. b‸` |
| `1. a↵- bullet↵2. b‸↵3. c` | Tab | `1. a↵- bullet↵  1. b‸↵2. c` |
| `  ! - bullet↵1. a↵  1. b‸` | Tab | `  ! - bullet↵1. a↵    1. b‸` |
| `- bullet↵  - sub↵1. a‸` | Tab | `- bullet↵  - sub↵  1. a‸` |
| `1. a↵   1. b‸↵2. c` | Tab | `1. a↵     1. b‸↵2. c` |
| `1. a‸↵   1.1. sub1↵   1.2. sub2` | Tab | `  1. a‸↵     1.1. sub1↵     1.2. sub2` |
| `! - bullet↵  - sub↵1. a‸` | Tab | `! - bullet↵  - sub↵    1. a‸` |
| `1. a↵     1. x↵2. b‸` | Tab | `1. a↵     1. x↵   1. b‸` |

### L6. Tab adopts dotted numbering when the block already uses dotted sub-items

When another item in the same list block with a numbered parent and the same delimiter already has a dotted marker (including after the tabbed line), `Tab` creates or joins a dotted sub-group prefixed by the parent's number; otherwise it uses plain `1.` and ignores other blocks or delimiters.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a↵   1.1. sub↵2. b‸↵3. c` | Tab | `1. a↵   1.1. sub↵   1.2. b‸↵2. c` |
| `1. a↵2. b‸↵3. c↵   3.1. d` | Tab | `1. a↵   1.1. b‸↵2. c↵   2.1. d` |
| `1. Plan↵   1.1. Scope↵2. Build↵3. ‸` | Tab | `1. Plan↵   1.1. Scope↵2. Build↵   2.1. ‸` |
| `1. a↵   1.1. x↵   1.2. y‸↵2. b↵   2.1. c` | Tab | `1. a↵   1.1. x↵        1.1.1. y‸↵2. b↵   2.1. c` |
| `1. a↵   1.1. x↵2. b↵3. c‸d↵   3.1. e` | Tab | `1. a↵   1.1. x↵2. b↵   2.1. c‸d↵   2.2. e` |
| `1. a↵   1.1. x↵↵1. b↵2. c‸` | Tab | `1. a↵   1.1. x↵↵1. b↵   1. c‸` |
| `1. a↵   1.1. x↵1) p↵2) q‸` | Tab | `1. a↵   1.1. x↵1) p↵   1) q‸` |
| `intro↵↵1. a↵   1.1. sub↵2. b‸` | Tab | `intro↵↵1. a↵   1.1. sub↵   1.2. b‸` |
| `1. a↵   1.1. sub1↵   1. sub2↵2. x↵3. b‸` | Tab | `1. a↵   1.1. sub1↵   1.2. sub2↵2. x↵   2.1. b‸` |
| `1. a↵   1. sub↵2. x↵3. b‸` | Tab | `1. a↵   1. sub↵2. x↵   1. b‸` |
| `1.1. x↵1. a↵2. b‸` | Tab | `1.1. x↵1. a↵   1. b‸` |
| `1. a↵   1.1. x↵2. b↵3. c↵4. d↵5. e↵6. f↵7. g↵8. h↵9. i↵10. j↵   - sub↵11. k‸` | Tab | `1. a↵   1.1. x↵2. b↵3. c↵4. d↵5. e↵6. f↵7. g↵8. h↵9. i↵10. j↵   - sub↵    1. k‸` |
| `- bullet↵  1.1. a↵  1.2. b‸` | Tab | `- bullet↵  1.1. a↵       1.1.1. b‸` |
| `10.1. a↵   - sub↵10.2. b‸` | Tab | `10.1. a↵   - sub↵      10.1. b‸` |

### L7. Tab on the first item of a group shifts the whole group without renumbering

Pressing `Tab` on the first item of a group moves the whole group and its subtrees together by 2 spaces (or to the text column of a bullet directly above at the same indent) while preserving all item numbers.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a‸↵2. b` | Tab | `  1. a‸↵  2. b` |
| `4. a‸↵5. b↵6. c` | Tab | `  4. a‸↵  5. b↵  6. c` |
| `1. a↵   1. b‸↵      1.1. sub↵   2. c` | Tab | `1. a↵     1. b‸↵        1.1. sub↵     2. c` |
| `- bullet↵1. a‸↵2. b` | Tab | `- bullet↵  1. a‸↵  2. b` |
| `* bullet↵2. a‸↵   2.1. sub↵3. b` | Tab | `* bullet↵  2. a‸↵     2.1. sub↵  3. b` |
| `  - bullet↵1. item‸` | Tab | `  - bullet↵  1. item‸` |
| `⇥- bullet↵1. item‸` | Tab | `⇥- bullet↵  1. item‸` |
| `1. abc‸d↵2. e` | Tab | `  1. abc‸d↵  2. e` |
| `1. a‸↵   1. sub↵2. b` | Tab | `  1. a‸↵     1. sub↵  2. b` |

### L8. Shift-Tab outdents a sub-item to its parent or shifts an indented group back

Pressing `Shift-Tab` outdents a sub-item to its parent's indent to continue the outer list while restarting remaining children at `1`, or moves a parentless indented group back by 2 spaces; at column 0 with no parent it is a no-op.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a↵   1. b‸` | Shift-Tab | `1. a↵2. b‸` |
| `1. a↵   1. b‸↵   2. c↵2. d` | Shift-Tab | `1. a↵2. b‸↵   1. c↵3. d` |
| `1. a↵   1.1. b‸` | Shift-Tab | `1. a↵2. b‸` |
| `1. a↵   1.1. x↵2. b↵   2.1. c‸↵   2.2. d↵3. e` | Shift-Tab | `1. a↵   1.1. x↵2. b↵3. c‸↵   3.1. d↵4. e` |
| `  1. a‸↵  2. b` | Shift-Tab | `1. a‸↵2. b` |
| `  4) a‸↵     4.1) sub↵  5) b` | Shift-Tab | `4) a‸↵   4.1) sub↵5) b` |
| `1. a‸↵2. b` | Shift-Tab | `1. a‸↵2. b` |
| `   1. a↵   2. b‸` | Shift-Tab | `   1. a↵ 1. b‸` |
| ` 1. a‸↵ 2. b↵   2.1. sub` | Shift-Tab | `1. a‸↵2. b↵  2.1. sub` |
| `  4. a↵  5. b‸↵    4. sub` | Shift-Tab | `  4. a↵1. b‸↵    1. sub` |
| `  1. a‸↵  1.1. b↵  1) other` | Shift-Tab | `1. a‸↵1.1. b↵  1) other` |
| `1. a↵   4. b‸↵   5. c↵2. d` | Shift-Tab | `1. a↵2. b‸↵   1. c↵3. d` |
| `4. a↵5. b↵   4. c‸↵   5. d` | Shift-Tab | `4. a↵5. b↵6. c‸↵   1. d` |
| `- a↵  1.1. b‸` | Shift-Tab | `- a↵1.1. b‸` |
| `1. a↵   1.1) b‸` | Shift-Tab | `1. a↵1.1) b‸` |
| `1.1. a↵   1. b‸` | Shift-Tab | `1.1. a↵1. b‸` |
| `1.1. a↵   1.1.1. b‸` | Shift-Tab | `1.1. a↵1.2. b‸` |
| `  1. a‸↵  1.1. b↵  - other` | Shift-Tab | `1. a‸↵1.1. b↵  - other` |
| `  1. a‸↵  1.1. b↵  1.1) other` | Shift-Tab | `1. a‸↵1.1. b↵  1.1.1) other` |
| `  1.1. a‸↵  1.2. b↵  1. c` | Shift-Tab | `1.1. a‸↵1.2. b↵  1. c` |
| `1. a↵   - b‸` | Shift-Tab | `1. a↵- b‸` |

### L9. Tab and Shift-Tab on a selection move the selected lines together

With a multi-line selection (excluding a trailing line whose selection ends at column 0), `Tab` and `Shift-Tab` move all selected lines by the first list line's delta and restart any group now starting right after the selection at `1`.

| Before | Keys | After |
| :--- | :--- | :--- |
| `«1. a↵2. b↵3. c»` | Tab | `  «1. a↵  2. b↵  3. c»` |
| `1. a↵«2. b↵3. c↵»4. d` | Tab | `1. a↵«   1. b↵   2. c↵»2. d` |
| `1. a↵   1.1. x↵2. b↵«3. c↵4. d»` | Tab | `1. a↵   1.1. x↵2. b↵«   2.1. c↵   2.2. d»` |
| `«1. a↵2. b»↵3. c↵4. d` | Tab | `  «1. a↵  2. b»↵1. c↵2. d` |
| `1. a↵«   1. b↵   2. c»` | Shift-Tab | `1. a↵«2. b↵3. c»` |
| `1. a↵«   4. b↵   5. c»↵   6. d` | Shift-Tab | `1. a↵«2. b↵3. c»↵   1. d` |
| `1. a↵«   1.1. b↵   1.2. c»↵   1.3. d` | Shift-Tab | `1. a↵«2. b↵3. c»↵   3.1. d` |
| `1. a↵   1.1. b↵«      1.1.1. c↵      1.1.2. d»↵      1.1.3. e` | Shift-Tab | `1. a↵   1.1. b↵«   1.2. c↵   1.3. d»↵      1.3.1. e` |
| `1. a↵«   cont↵2. b»` | Tab | `1. a↵«      cont↵   1. b»` |
| `1. a↵«cont1↵cont2»` | Tab | `1. a↵  «cont1↵  cont2»` |
| `1. a↵   1. b↵«   2. c↵   3. d»` | Tab | `1. a↵   1. b↵«      1. c↵      2. d»` |
| `1. a↵«   1. x↵2. b»` | Tab | `1. a↵«     1. x↵  1. b»` |
| `4. a↵«5. b↵6. c»` | Tab | `4. a↵«   1. b↵   2. c»` |
| `1. a↵«2. b↵3. c»↵4. d↵   4.1. e` | Tab | `1. a↵«   1.1. b↵   1.2. c»↵2. d↵   2.1. e` |
| `1. a↵   - b↵   1.1. x↵«2. c↵3. d»` | Tab | `1. a↵   - b↵   1.1. x↵   1.«2. c↵   1.3. d»` |
| `1) a↵   1.1) x↵1. p↵«2. q↵3. r»` | Tab | `1) a↵   1.1) x↵1. p↵«   1. q↵   2. r»` |
| `- bullet↵  1.1. x↵1. a↵«2. b↵3. c»` | Tab | `- bullet↵  1.1. x↵1. a↵«   1. b↵   2. c»` |
| `«   1. a↵   2. b»` | Shift-Tab | `« 1. a↵ 2. b»` |
| `4. a↵«   1. b↵   2. c»` | Shift-Tab | `4. a↵«5. b↵6. c»` |
| `1.1. a↵«   1.1.1. b↵   1.1.2. c»` | Shift-Tab | `1.1. a↵«1.2. b↵1.3. c»` |
| `- a↵«  1.1. b↵  1.2. c»` | Shift-Tab | `- a↵«1.1. b↵1.2. c»` |
| `1. a↵«   1.1. b↵   - note»` | Shift-Tab | `1. a↵«2. b↵- note»` |
| `1. a↵«   1.1. b↵      1.1.1. c»` | Shift-Tab | `1. a↵«2. b↵   2.1. c»` |
| `1. a↵«   1.1. b↵   1.1) c»` | Shift-Tab | `1. a↵«2. b↵1.1) c»` |
| `1.1. a↵«   1.1.1. b↵   1. c»` | Shift-Tab | `1.1. a↵«1.2. b↵1. c»` |
| `1. a↵«2. b↵3. c»↵   4) d` | Tab | `1. a↵«   1. b↵   2. c»↵   4) d` |

### L10. Backspace on an empty sub-item under a numbered parent promotes it

Pressing `Backspace` on an empty sub-item (numbered or bullet) whose parent is numbered promotes it to the parent list's next item and turns any following siblings into its children from `1`; on an empty top-level item or under a bullet, `Backspace` follows the normal marker rule instead.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a↵   1. ‸` | Backspace | `1. a↵2. ‸` |
| `1. a↵   1. ‸↵   2. b` | Backspace | `1. a↵2. ‸↵   1. b` |
| `1. a↵   - ‸` | Backspace | `1. a↵2. ‸` |
| `1. a↵   1.1. b↵   1.2. ‸` | Backspace | `1. a↵   1.1. b↵2. ‸` |
| `1. a↵   1.1. b↵      1.1.1. c↵      1.1.2. ‸` | Backspace | `1. a↵   1.1. b↵      1.1.1. c↵   1.2. ‸` |
| `- a↵  1. ‸` | Backspace | `- a↵  ‸` |
| `1. ‸` | Backspace | `‸` |
| `1. a↵2. ‸` | Backspace | `1. a↵   ‸` |
| `intro↵↵1. a↵   1. ‸` | Backspace | `intro↵↵1. a↵2. ‸` |
| `1. a↵   4. ‸↵   5. b` | Backspace | `1. a↵2. ‸↵   1. b` |
| `1. a↵   1. ‸ ` | Backspace | `1. a↵   1.‸ ` |
| `1. a↵   -‸` | Backspace | `1. a↵   ‸` |
| `1. a↵   # -‸` | Backspace | `1. a↵   # ‸` |

### L11. Backspace at text start converts the marker to continuation spaces, and a second Backspace outdents

With the caret at the text start of a numbered item, `Backspace` removes the marker, aligns the line under the preceding item's text (or keeps its own indent if none), and renumbers following items; a second `Backspace` outdents the continuation line back to the item's indent and restarts following items at `1`.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. ‸item` | Backspace | `‸item` |
| `  1. ‸item` | Backspace | `  ‸item` |
| `1. a↵2. ‸b↵3. c` | Backspace | `1. a↵   ‸b↵2. c` |
| `1. a↵2. ‸b↵3. c` | Backspace, Backspace | `1. a↵‸b↵1. c` |
| `1. a↵   1.1. sub↵2. ‸c↵3. d` | Backspace | `1. a↵   1.1. sub↵   ‸c↵2. d` |
| `1. a↵   1.1. sub↵   ‸c↵2. d` | Backspace | `1. a↵   1.1. sub↵‸c↵1. d` |
| `1) a↵2) ‸b↵3) c` | Backspace, Backspace | `1) a↵‸b↵1) c` |
| `⇥1. a↵⇥2. ‸b↵⇥3. c` | Backspace, Backspace | `⇥1. a↵⇥‸b↵⇥1. c` |

### L12. Enter on an empty sub-item promotes it, and exiting mid-list restarts later items at 1

Pressing `Enter` on an empty sub-item under a numbered parent promotes it to the parent's next item and turns following siblings into its children from `1` (or updates following dotted children); exiting an empty item in the middle of a list clears the line and restarts following items at `1`.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a↵   1. ‸` | Enter | `1. a↵2. ‸` |
| `1. a↵   - ‸` | Enter | `1. a↵2. ‸` |
| `1. a↵   1. ‸↵   2. b` | Enter | `1. a↵2. ‸↵   1. b` |
| `1. a↵   1.1. b↵   1.2. ‸↵   1.3. c↵2. d` | Enter | `1. a↵   1.1. b↵2. ‸↵   2.1. c↵3. d` |
| `1. a↵   1.1. b↵      1.1.1. c↵      1.1.2. ‸↵      1.1.3. d↵   1.2. e` | Enter | `1. a↵   1.1. b↵      1.1.1. c↵   1.2. ‸↵      1.2.1. d↵   1.3. e` |
| `- a↵  1. ‸` | Enter | `- a↵‸` |
| `1. a↵2. ‸↵3. b` | Enter | `1. a↵‸↵1. b` |
| `4. a↵5. ‸↵6. c` | Enter | `4. a↵‸↵1. c` |
| `intro↵↵1. a↵   1. ‸` | Enter | `intro↵↵1. a↵2. ‸` |
| `intro↵↵1. a↵2. ‸↵3. b` | Enter | `intro↵↵1. a↵‸↵1. b` |
| `1. a↵   4. ‸↵   5. b` | Enter | `1. a↵2. ‸↵   1. b` |

### L13. Renumbering keeps groups consecutive on split, join, and deletion

Renumbering keeps groups consecutive (splitting keeps the first part's start and restarts later parts at `1`; joining keeps the first part's start), runs on deletions, `Enter` collisions, and pasting a list onto an empty numbered item, and never runs when typing or deleting a number on a digit-prefixed line.

| Before | Keys | After |
| :--- | :--- | :--- |
| `4. a↵5. ‸b↵6. c` | Backspace, Backspace | `4. a↵‸b↵1. c` |
| `4. a↵   ‸b↵5. c` | Shift-Tab | `4. a↵‸b↵1. c` |
| `4. a↵↵‸1. b↵2. c` | Backspace | `4. a↵‸5. b↵6. c` |
| `«1. a↵»2. b↵3. c` | Backspace | `‸1. b↵2. c` |
| `1. a↵«2. b↵»3. c` | Backspace | `1. a↵‸2. c` |
| `1. a‸↵3. b` | Enter | `1. a↵2. ‸↵3. b` |
| `1. a↵   25‸↵3. c` | Backspace | `1. a↵   2‸↵3. c` |
| `1. a↵23‸. b↵4. c` | Backspace | `1. a↵2‸. b↵4. c` |
| `1. a‸↵3. c` | paste "↵" | `1. a↵‸↵1. c` |
| `1. a‸↵↵4. x↵6. y` | paste "↵2. b" | `1. a↵2. b‸↵↵4. x↵6. y` |
| `intro↵↵«4. a↵»5. b↵6. c` | Backspace | `intro↵↵‸4. b↵5. c` |
| `one↵two↵three↵↵«4. a↵»5. b↵6. c` | Backspace | `one↵two↵three↵↵‸4. b↵5. c` |
| `intro↵↵1‸2. twelve` | Enter | `intro↵↵1↵‸2. twelve` |
| `1. a↵   1. b↵   ‸2. c` | Enter | `1. a↵   1. b↵   ↵‸1. c` |
| `1. a↵2.‸ b↵3. c` | Enter | `1. a↵2.↵‸ b↵1. c` |
| `1. a↵2«3. b↵»4. c` | Backspace | `1. a↵2‸. c` |
| `1. a↵   «x»↵2. b` | Backspace | `1. a↵   ‸↵1. b` |
| `1. a↵   «25»↵2. c` | paste " " | `1. a↵    ‸↵1. c` |
| `1. a↵«x»↵2. c` | paste "5. mid" | `1. a↵2. mid‸↵3. c` |
| `1. a↵«2. b»↵3. c` | paste "note" | `1. a↵note‸↵1. c` |
| `4. a↵«5. b»↵6. c` | paste "x" | `4. a↵x‸↵1. c` |
| `1. a↵   «x»↵3. c` | paste "y" | `1. a↵   y‸↵3. c` |

### L14. Width changes between one and two digits shift sub-items and continuation lines

When renumbering changes a marker's digit width (`9.` to `10.`, `10.` to `9.`, or `9.9.` to `9.10.`), nested sub-items and continuation lines shift along by the same column delta while trailing text stays exact.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. x↵2. x↵3. x↵4. x↵5. x↵6. x↵7. x↵8. x‸↵9. ninth↵   cont↵   1. sub` | Enter | `1. x↵2. x↵3. x↵4. x↵5. x↵6. x↵7. x↵8. x↵9. ‸↵10. ninth↵    cont↵    1. sub` |
| `9.8. prev‸↵9.9. a↵     sub text↵     1. sub` | Enter | `9.8. prev↵9.9. ‸↵9.10. a↵      sub text↵      1. sub` |
| `8. x‸↵9. a↵   9.1. b↵        9.1.1. c` | Enter | `8. x↵9. ‸↵10. a↵    10.1. b↵          10.1.1. c` |
| `8) pre‸↵9) a↵   sub text↵   1) sub` | Enter | `8) pre↵9) ‸↵10) a↵    sub text↵    1) sub` |
| `8. pre↵«9. y↵»10. a↵    sub text↵    1. sub` | Backspace | `8. pre↵‸9. a↵   sub text↵   1. sub` |

### L15. Tab and Shift-Tab on a non-item line under a list cycle through the list's columns

On a continuation line, a line whose number was removed, or plain text directly under a list item, `Tab` and `Shift-Tab` step through the indent and text columns of the item above and its parents, advancing by 2 spaces past the last stop; moving a line between two lists joins or splits them.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a↵cont‸` | Tab | `1. a↵   cont‸` |
| `1. a↵   - x↵b‸↵2. c` | Tab | `1. a↵   - x↵   b‸↵2. c` |
| `1. a↵   - x↵   b‸↵2. c` | Tab | `1. a↵   - x↵     b‸↵2. c` |
| `1. a↵   - x↵   b‸↵2. c` | Shift-Tab | `1. a↵   - x↵b‸↵1. c` |
| `1. a↵note‸↵1. b` | Tab | `1. a↵   note‸↵2. b` |
| `4) a↵text‸↵1) b↵2) c` | Tab | `4) a↵   text‸↵5) b↵6) c` |
| `intro↵↵1. a↵cont‸` | Tab | `intro↵↵1. a↵   cont‸` |
| `intro↵↵1. a↵ ‸b` | Tab | `intro↵↵1. a↵   ‸b` |

### L16. A bullet and a numbered item are exclusive per line

A line starting with `- ` or `* ` followed by a number (`- 1. x`) is a bullet, and a line starting with `1. ` followed by `- ` (`1. - x`) is a numbered item; `Enter` and `Shift-Enter` follow only the outer marker, while a bullet under a numbered item aligns to its text column on `Tab`.

| Before | Keys | After |
| :--- | :--- | :--- |
| `- 1. bullet‸` | Enter | `- 1. bullet↵- ‸` |
| `1. - numbered‸` | Enter | `1. - numbered↵2. ‸` |
| `- 1. bullet‸` | Shift-Enter | `- 1. bullet↵  ‸` |
| `1. - numbered‸` | Shift-Enter | `1. - numbered↵   ‸` |
| `1. a↵- sub‸` | Tab | `1. a↵   - sub‸` |
| `1. a↵‸- x` | Tab | `1. a↵‸   - x` |

### L17. Flat outlines read depth from the number of parts at the same indent

In a flat outline, an item at the same indent and delimiter with more number parts than the nearest numbered item above it is its flat sub-item; `Enter`, `Backspace`, and width-change renumbering follow that hierarchy without shifting flat sub-item indentation.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a↵1.1. b‸` | Enter | `1. a↵1.1. b↵1.2. ‸` |
| `1. a↵1.1. b↵1.1.1. c‸` | Enter | `1. a↵1.1. b↵1.1.1. c↵1.1.2. ‸` |
| `1. a↵1.1. b↵1.2. c↵2. e‸` | Enter | `1. a↵1.1. b↵1.2. c↵2. e↵3. ‸` |
| `1. a↵1.1. b↵1.2. ‸↵1.3. d↵2. e` | Enter | `1. a↵1.1. b↵2. ‸↵2.1. d↵3. e` |
| `1. a‸↵1.1. b↵1.2. c↵2. e` | Enter | `1. a↵2. ‸↵2.1. b↵2.2. c↵3. e` |
| `1. a↵1.1. b↵1.2. ‸↵1.3. d↵2. e` | Backspace | `1. a↵1.1. b↵2. ‸↵2.1. d↵3. e` |
| `1. a↵1.1. ‸b↵1.2. c↵2. d` | Backspace | `1. a↵   ‸b↵1.1. c↵2. d` |
| `8. x‸↵9. a↵9.1. b↵9.2. c` | Enter | `8. x↵9. ‸↵10. a↵10.1. b↵10.2. c` |

### L18. Tab and Shift-Tab in a flat outline change depth by number at the same indent

When a block contains at least one flat sub-item, `Tab` deepens a non-first item (and its flat sub-items) by one number part at the same indent and `Shift-Tab` promotes it one level while folding later siblings under it; a selection of numbered items in one flat list (same indent and delimiter) moves together, while mixed delimiters or non-flat lists fall back to indentation.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a↵1.1. b↵2. c‸` | Tab | `1. a↵1.1. b↵1.2. c‸` |
| `1. a↵1.1. b↵1.1.1. c↵1.2. d‸` | Tab | `1. a↵1.1. b↵1.1.1. c↵1.1.2. d‸` |
| `1. a‸↵1.1. b` | Tab | `1. a‸↵1.1. b` |
| `1. a↵1.1. b↵1.2. c‸↵1.2.1. d↵1.3. e` | Tab | `1. a↵1.1. b↵1.1.1. c‸↵1.1.1.1. d↵1.2. e` |
| `1. a↵1.1. b↵1.2. c‸↵1.3. d↵2. e` | Shift-Tab | `1. a↵1.1. b↵2. c‸↵2.1. d↵3. e` |
| `1. a↵1.1. b↵2. «c↵3. d»↵4. e` | Tab | `1. a↵1.1. b↵1.2. «c↵1.3. d»↵2. e` |
| `1. a↵1.1. b↵«1.2. c↵1.3. d»↵1.4. e↵2. f` | Shift-Tab | `1. a↵1.1. b↵«2. c↵3. d»↵3.1. e↵4. f` |
| `1. a↵1.1. b↵1) c‸` | Tab | `1. a↵1.1. b↵1) c‸` |
| `intro↵↵1. a↵1.1. b↵2. c‸` | Tab | `intro↵↵1. a↵1.1. b↵1.2. c‸` |
| `  1. a↵  1.1. b↵1. x↵  2. c‸` | Tab | `  1. a↵  1.1. b↵1. x↵  2. c‸` |
| `1. a↵1.1. b↵   1. sub↵2. c‸` | Tab | `1. a↵1.1. b↵   1. sub↵1.2. c‸` |
| `1. a↵1.1. b↵- note↵2. c‸` | Tab | `1. a↵1.1. b↵- note↵1.2. c‸` |
| `1. a↵1.1. b↵1.1.1. x↵1.2. c↵1.2.1. d‸` | Tab | `1. a↵1.1. b↵1.1.1. x↵1.2. c↵1.2.1. d‸` |
| `1. a↵1.1. b↵1.2. c‸↵   1. sub↵   - note↵1.3. d` | Tab | `1. a↵1.1. b↵1.1.1. c‸↵   1. sub↵   - note↵1.2. d` |
| `9. a↵9.1. b↵10. c‸↵    sub` | Tab | `9. a↵9.1. b↵9.2. c‸↵    sub` |
| `1. a↵1.1. b↵«2. c↵3. d»↵↵1. next` | Tab | `1. a↵1.1. b↵1.«2. c↵1.3. d»↵↵1. next` |
| `1. a↵1.1. b↵«- note↵2. c»` | Tab | `1. a↵1.1. b↵     «- note↵     1. c»` |
| `1. a↵1.1. b↵«2. c↵- note»` | Tab | `1. a↵1.1. b↵«     1. c↵     - note»` |
| `1. a↵1.1. b↵«2. c↵   3. d»` | Tab | `1. a↵1.1. b↵«     1. c↵        1. d»` |
| `1. a↵1.1. b↵«2. c↵1) d»` | Tab | `1. a↵1.1. b↵«     1. c↵     1) d»` |
| `1. a↵1.1. b↵«1.2. c↵2. d»` | Tab | `1. a↵1.1. b↵«     1.1.1. c↵     1.1.2. d»` |
| `1. a↵1.1. b↵   1. c‸` | Shift-Tab | `1. a↵1.1. b↵2. c‸` |
| `1. a↵1.1. b‸↵   1. sub↵   - note↵1.2. c` | Shift-Tab | `1. a↵2. b‸↵   1. sub↵   - note↵2.1. c` |
| `1. a↵1.4. b‸↵1.5. c` | Shift-Tab | `1. a↵2. b‸↵2.1. c` |
| `1. a↵1.1. b‸↵2. c↵2.4. d` | Shift-Tab | `1. a↵2. b‸↵3. c↵3.4. d` |
| `4. a↵4.1. b↵4.2. c‸↵4.3. d` | Shift-Tab | `4. a↵4.1. b↵5. c‸↵5.1. d` |
| `1. a↵1.1. b↵1.‸2. c` | Tab | `1. a↵1.1. b↵1.‸1.1. c` |
| `  1. a↵  1.1. b↵  1.2. c‸↵    cont↵  1.2.1. sub↵  1.3. d` | Tab | `  1. a↵  1.1. b↵  1.1.1. c‸↵    cont↵  1.1.1.1. sub↵  1.2. d` |
| `  1. a↵  1.1. b↵  1.2. c‸↵1. x↵  1.1.1. y` | Tab | `  1. a↵  1.1. b↵  1.1.1. c‸↵1. x↵  1.1. y` |
| `1. a↵1.1. b↵1.2. c‸↵1) other↵1.2.1. sub` | Tab | `1. a↵1.1. b↵1.1.1. c‸↵1) other↵1.1.1.1. sub` |
| `1. old↵x↵1. a↵«1.1. b↵1.2. c↵1.3. d↵1.4. e»` | Shift-Tab | `1. old↵x↵1. a↵«2. b↵3. c↵4. d↵5. e»` |
| `1. a↵1.1. b↵2. c↵   1. sub↵3. d‸` | Tab | `1. a↵1.1. b↵2. c↵   1. sub↵2.1. d‸` |
| `  1. a↵  1.1. b↵  1.2. c‸↵- x↵  4.1.1. y` | Tab | `  1. a↵  1.1. b↵  1.1.1. c‸↵- x↵  4.1.1. y` |
| `1. a↵1.1. b↵1.2. c‸↵   1. sub↵1.2.1. child↵1.3. d` | Tab | `1. a↵1.1. b↵1.1.1. c‸↵   1. sub↵1.1.1.1. child↵1.2. d` |
| `1. a↵1.1. b↵1.2. c‸↵   1.1. sub↵1.3. d` | Tab | `1. a↵1.1. b↵1.1.1. c‸↵   1.1.1.1. sub↵1.2. d` |
| `1. a↵1.1. b↵2. c‸↵   1. sub↵3. d` | Tab | `1. a↵1.1. b↵1.2. c‸↵   1. sub↵2. d` |
| `1. a↵1.1. b↵1.2. c‸↵1.1) other↵1.3. d` | Tab | `1. a↵1.1. b↵1.1.1. c‸↵1.1) other↵1.2. d` |
| `1. a↵1.1. b‸↵   1.1. sub↵1.2. c` | Shift-Tab | `1. a↵2. b‸↵   2.1. sub↵2.1. c` |
| `1. a↵1.1. b‸↵1.1) other↵1.2. c` | Shift-Tab | `1. a↵2. b‸↵1.1) other↵2.1. c` |

### L19. Deleting a flat sub-item's parent keeps the sub-item's prefix

Deleting the parent of a flat sub-item leaves the orphaned sub-item's prefix intact while restarting following top-level items at `1`, and a parentless dotted list keeps its own prefix; copying a flat outline to HTML nests its lists by level.

| Before | Keys | After |
| :--- | :--- | :--- |
| `«1. a↵»1.1. b↵2. e` | Backspace | `‸1.1. b↵1. e` |
| `«1) a↵»1.1) b↵2) e` | Backspace | `‸1.1) b↵1) e` |
| `1.1. a↵1.2. b‸` | Enter | `1.1. a↵1.2. b↵1.3. ‸` |
| `4.1. a↵4.2. b‸` | Enter | `4.1. a↵4.2. b↵4.3. ‸` |

### L20. Action and topic symbols sit in front of list markers without splitting the list

An action or topic symbol (`# `, `v `, `> `, `x `, `o `, `. `, `, `) before a list marker is part of the line, not the list: plain items and items with any symbol share one numbering, columns include the symbol width (so `# 1. plan` has text column 5), and setting or removing a state leaves numbers unchanged.

| Before | Keys | After |
| :--- | :--- | :--- |
| `«1. a↵»# 2. b↵v 3. c` | Backspace | `‸# 1. b↵v 2. c` |
| `# 1. a‸↵# 2. b↵v 3. c` | Enter | `# 1. a↵# 2. ‸↵# 3. b↵v 4. c` |
| `# 1. plan‸` | Shift-Enter | `# 1. plan↵     ‸` |
| `1. plan↵# 2. book‸↵3. meet` | Tab | `1. plan↵   # 1. book‸↵2. meet` |
| `# 1. plan↵2. book‸↵# 3. meet` | Tab | `# 1. plan↵     1. book‸↵# 2. meet` |
| `# 1. a↵«# 2. b↵v 3. c»↵# 4. d` | Tab | `# 1. a↵«     # 1. b↵     v 2. c»↵# 2. d` |
| `# 1. a↵«     # 1. b↵     v 2. c»↵# 2. d` | Shift-Tab | `# 1. a↵«# 2. b↵v 3. c»↵# 4. d` |

### L21. Tab and Enter behind a state symbol indent before the symbol and reopen resolved states

`Tab` on `# 2. x` under `# 1. y` indents before the symbol to the parent's text column (`     # 1. x`), and `Shift-Tab` outdents back; `Enter` continues an open or resolved action as `# ` and any topic as `o `, and list keys never change the item's symbol.

| Before | Keys | After |
| :--- | :--- | :--- |
| `# 1. plan trip↵# 2. book hotel‸↵# 3. pack` | Tab | `# 1. plan trip↵     # 1. book hotel‸↵# 2. pack` |
| `  # 1. a↵  v 2. b‸` | Tab | `  # 1. a↵       v 1. b‸` |
| `# 1. a↵     v 1. b‸↵# 2. c` | Shift-Tab | `# 1. a↵v 2. b‸↵# 3. c` |
| `o - point↵o - detail‸` | Tab | `o - point↵    o - detail‸` |
| `# 1. a↵v 2. x‸` | Enter | `# 1. a↵v 2. x↵# 3. ‸` |
| `> 1. x‸` | Enter | `> 1. x↵# 2. ‸` |
| `. 1. x‸` | Enter | `. 1. x↵o 2. ‸` |
| `# 1. a↵     # 1. ‸` | Enter | `# 1. a↵# 2. ‸` |

### L22. Backspace behind a state symbol keeps the symbol and removes only the number

`Backspace` at the text start behind a state symbol removes only the number, keeping the symbol and padding spaces after it to align under the item above's text; a second `Backspace` collapses the extra spaces to split the list, while `Backspace` on an empty sub-item promotes it.

| Before | Keys | After |
| :--- | :--- | :--- |
| `# 1. a↵# 2. ‸b↵# 3. c` | Backspace | `# 1. a↵#    ‸b↵# 2. c` |
| `# 1. a↵# 2. ‸b↵# 3. c` | Backspace, Backspace | `# 1. a↵# ‸b↵# 1. c` |
| `# 1. ‸only` | Backspace | `# ‸only` |
| `1. a↵# 2. ‸b↵3. c` | Backspace | `1. a↵#  ‸b↵2. c` |
| `# 1. a↵     # 1. ‸` | Backspace | `# 1. a↵# 2. ‸` |
| `# 1. a↵# 1.1. b‸` | Enter | `# 1. a↵# 1.1. b↵# 1.2. ‸` |

### L23. Aligned state lines continue a list, while unaligned state lines split it

A line with a state symbol and extra spaces aligning its text under the preceding item's text (`#  book room`) continues the list; any other action or topic line at the list's indent (`# call Sam`, `o Hiring`) splits it into separate lists.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. a‸↵#  book room↵2. b` | Enter | `1. a↵2. ‸↵#  book room↵3. b` |
| `1. a↵#  book room↵2. ‸b↵3. c` | Backspace | `1. a↵#  book room↵   ‸b↵2. c` |
| `# 1. a‸↵#    book room↵# 2. b` | Enter | `# 1. a↵# 2. ‸↵#    book room↵# 3. b` |
| `o Budget↵1. a‸↵2. b↵o Hiring↵1. c` | Enter | `o Budget↵1. a↵2. ‸↵3. b↵o Hiring↵1. c` |
| `o Budget↵1. a↵2. ‸b↵o Hiring↵1. c↵2. d` | Tab | `o Budget↵1. a↵   1. ‸b↵o Hiring↵1. c↵2. d` |
| `1. a↵2. ‸b↵# call Sam↵1. c` | Tab | `1. a↵   1. ‸b↵# call Sam↵1. c` |

### L24. Enter on a continuation line starts the next item, while Shift-Enter stays indented

A non-empty line with no marker of its own whose indentation is at least the text column of the nearest list item above it (with only continuation lines or that item's sub-items between them) belongs to that item: `Enter` inserts the item's next sibling number or bullet at the item's indent (renumbering following items), `Shift-Enter` inserts a continuation line at the same indentation, and spaces-only lines or lines under action, topic, or `=> ` lines stay unchanged.

| Before | Keys | After |
| :--- | :--- | :--- |
| `1. First↵   more‸` | Enter | `1. First↵   more↵2. ‸` |
| `1. First↵   more‸↵2. Second` | Enter | `1. First↵   more↵2. ‸↵3. Second` |
| `1. First↵   mo‸re` | Enter | `1. First↵   mo↵2. ‸re` |
| `  1.1. Sub↵       more‸` | Enter | `  1.1. Sub↵       more↵  1.2. ‸` |
| `- Bullet↵  more‸` | Enter | `- Bullet↵  more↵- ‸` |
| `* Star↵  more‸` | Enter | `* Star↵  more↵* ‸` |
| `1. First↵   more‸` | Shift-Enter | `1. First↵   more↵   ‸` |
| `- Bullet↵  more‸` | Shift-Enter | `- Bullet↵  more↵  ‸` |
| `1. First↵   1.1. Sub↵        more‸↵2. Second` | Enter | `1. First↵   1.1. Sub↵        more↵   1.2. ‸↵2. Second` |
| `1. First↵   1.1. Sub↵        more‸` | Shift-Enter | `1. First↵   1.1. Sub↵        more↵        ‸` |
| `1. First↵   - sub bullet↵     more‸` | Enter | `1. First↵   - sub bullet↵     more↵   - ‸` |
| `1. First↵   1.1. Sub↵   more‸` | Enter | `1. First↵   1.1. Sub↵   more↵2. ‸` |
| `9. Ninth↵   more‸` | Enter | `9. Ninth↵   more↵10. ‸` |
| `9. Ninth↵   more‸↵10. Tenth` | Enter | `9. Ninth↵   more↵10. ‸↵11. Tenth` |
| `8. Eighth↵   more‸↵9. Ninth↵   cont` | Enter | `8. Eighth↵   more↵9. ‸↵10. Ninth↵    cont` |
| `1. First↵   line one↵   line two‸` | Enter | `1. First↵   line one↵   line two↵2. ‸` |
| `v 1. Done↵     more‸` | Enter | `v 1. Done↵     more↵# 2. ‸` |
| `1. First↵   mo«r»e` | Enter | `1. First↵   mo↵2. ‸e` |
| `1. First↵   mo«r»e` | Shift-Enter | `1. First↵   mo↵   ‸e` |
| `- Bullet↵  mo«re↵  ev»en` | Enter | `- Bullet↵  mo↵- ‸en` |
| `1. First↵   ‸` | Enter | `1. First↵↵   ‸` |
| `1. First↵   ‸` | Shift-Enter | `1. First↵   ↵‸` |
| `# Task↵  more‸` | Enter | `# Task↵  more↵  ‸` |
| `# Task↵  more‸` | Shift-Enter | `# Task↵  more↵‸` |
| `o Topic↵  more‸` | Enter | `o Topic↵  more↵  ‸` |
| `=> Follow↵   more‸` | Enter | `=> Follow↵   more↵   ‸` |
| `  plain prose‸` | Enter | `  plain prose↵  ‸` |
| `1. First↵‸   more` | Enter | `1. First↵↵‸   more` |
| `1. First↵ ‸  more` | Shift-Enter | `1. First↵ ↵‸  more` |
