# Lists on the clipboard

This file specifies ChronoNote's clipboard HTML conversion rules (§439) as short statements paired with executable examples. Paste tables use `| HTML | Text |` and run through `htmlToNoteText`; copy tables use `| Text | HTML |` and run through `noteTextToHtml`. Both `HTML` and `Text` are written in single-backtick code spans on one line using `↵` for a line break and `⇥` for a tab; in `Text` cells, `·` marks a space where leading spaces matter, and `—` in the output column means the function returns `null` so plain text is used instead. The test suite `src/lib/clipboardSpecTables.test.ts` reads every table in this file and runs each row.

## Pasting lists

### P1. HTML is converted only when it holds a list and is not ChronoNote's own

Pasting reads the clipboard's HTML only when it contains an `<li>` element or a Word/Outlook `mso-list` paragraph with `levelN` and does not carry `data-chrononote`; otherwise `htmlToNoteText` returns `null` (`—`), so plain text is pasted as before and copying within ChronoNote pastes back unchanged.

| HTML | Text |
| :--- | :--- |
| `` | — |
| `<p>Just plain text</p>` | — |
| `<h1>Heading</h1><p>Paragraph</p>` | — |
| `<p style="mso-list:l0 lfo1">Missing level</p>` | — |
| `<div data-chrononote=""><ul><li>Item</li></ul></div>` | — |
| `<html><body><!--StartFragment--><div data-chrononote=""><ul><li>- x</li></ul></div><!--EndFragment--></body></html>` | — |
| `<ul><li>Item</li></ul>` | `- Item` |
| `<p style="">No list</p>` | — |

### P2. Bullets and checkbox items convert to dash bullets

Unordered list items (`<ul><li>`), Word/Outlook bullet paragraphs, and items with a direct checkbox (`<input type="checkbox">`) convert to `- `.

| HTML | Text |
| :--- | :--- |
| `<ul><li>First</li><li>Second</li></ul>` | `- First↵- Second` |
| `<ul><li><input type="checkbox"> Task</li><li><input type="checkbox" checked> Done</li></ul>` | `- Task↵- Done` |
| `<ol><li><input type="checkbox"> Checked in ol</li></ol>` | `- Checked in ol` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><![if !supportLists]><span style="mso-list:Ignore">o<span>&nbsp;&nbsp;</span></span><![endif]>Word bullet</p>` | `- Word bullet` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">•  Visible bullet</p>` | `- Visible bullet` |
| `<ol><li><label><input type="checkbox"> Wrapped</label></li></ol>` | `- Wrapped` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">o&nbsp;&nbsp;Two spaces after o</p>` | `- Two spaces after o` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">o One space after o</p>` | `- o One space after o` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">•</span></p>` | `-` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">•</p>` | `-` |

### P3. Numbered items convert to N. from order, start, and value

Ordered list items (`<ol><li>`) convert to `N. ` numbered from `1` in order, or from the `<ol>`'s `start` attribute and any `<li>` `value` attribute.

| HTML | Text |
| :--- | :--- |
| `<ol><li>One</li><li>Two</li><li>Three</li></ol>` | `1. One↵2. Two↵3. Three` |
| `<ol start="4"><li>Four</li><li>Five</li></ol>` | `4. Four↵5. Five` |
| `<ol><li value="5">Five</li><li>Six</li></ol>` | `5. Five↵6. Six` |
| `<ol start="3"><li>Three</li><li value="10">Ten</li><li>Eleven</li></ol>` | `3. Three↵10. Ten↵11. Eleven` |
| `<ol start="abc"><li>Fallback</li></ol>` | `1. Fallback` |
| `<ol><li><input type="text"> Not checkbox</li></ol>` | `1. Not checkbox` |
| `<ol><li></li><li>Second</li></ol>` | `1.↵2. Second` |
| `<ul><li></li><li>Second</li></ul>` | `-↵- Second` |
| `<ul><li><ul><li>Child</li></ul></li></ul>` | `··- Child` |

### P4. Word markers (`a.`, `ii)`) are counted per level

In Word/Outlook `mso-list` paragraphs, plain numeric markers keep their number, while non-numeric markers (`a.`, `ii)`, `i.`) are counted from `1` per level and reset when interrupted by a non-list block or a shallower level.

| HTML | Text |
| :--- | :--- |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>Alpha</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">b.</span>Beta</p>` | `1. Alpha↵2. Beta` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">i)</span>First</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">ii)</span>Second</p>` | `1. First↵2. Second` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>One</p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a.</span>Sub a</p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">b.</span>Sub b</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.</span>Two</p>` | `1. One↵···1. Sub a↵···2. Sub b↵2. Two` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>One</p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">i)</span>First sub</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.</span>Two</p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">ii)</span>Reset sub</p>` | `1. One↵···1. First sub↵2. Two↵···1. Reset sub` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">i.</span>First</p><p>Break</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>Restart</p>` | `1. First↵Break↵1. Restart` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list: Ignore">a.</span>Spaced ignore</p>` | `1. Spaced ignore` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">5.</span>Fifth</p>` | `5. Fifth` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">10.</span>Tenth</p>` | `10. Tenth` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">(2)</span>Paren</p>` | `2. Paren` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">Note 1.</span>Text</p>` | `- Text` |
| `<p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">•</span>Orphan level 2</p>` | `··- Orphan level 2` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>Line 1<br>Line 2<br><br>Line 3</p>` | `1. Line 1↵···Line 2↵↵···Line 3` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">•</span>Line 1<br>Line 2</p>` | `- Line 1↵··Line 2` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>First</p>Bare text<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">b.</span>Second</p>` | `1. First↵Bare text↵1. Second` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>First</p><pre>code</pre><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">b.</span>Second</p>` | `1. First↵code↵1. Second` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>First</p><pre>code</pre><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a.</span>Orphan sub</p>` | `1. First↵code↵··1. Orphan sub` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">•</span>L1</p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">•</span>L2</p><p style="mso-list:l0 level3 lfo1"><span style="mso-list:Ignore">•</span>L3</p><p style="mso-list:l0 level4 lfo1"><span style="mso-list:Ignore">•</span>L4</p><p style="mso-list:l0 level5 lfo1"><span style="mso-list:Ignore">•</span>L5</p><p style="mso-list:l0 level6 lfo1"><span style="mso-list:Ignore">•</span>L6</p><p style="mso-list:l0 level7 lfo1"><span style="mso-list:Ignore">•</span>L7</p><p style="mso-list:l0 level8 lfo1"><span style="mso-list:Ignore">•</span>L8</p><p style="mso-list:l0 level9 lfo1"><span style="mso-list:Ignore">•</span>L9</p><p style="mso-list:l0 level10 lfo1"><span style="mso-list:Ignore">•</span>L10</p>` | `- L1↵··- L2↵····- L3↵······- L4↵········- L5↵··········- L6↵············- L7↵··············- L8↵················- L9↵··················- L10` |
| `<div><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>Inside div</p></div>` | `1. Inside div` |
| `<div><div><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>Nested div</p></div></div>` | `1. Nested div` |
| `<blockquote><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>Quoted</p></blockquote>` | `1. Quoted` |
| `<div><h1 style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>Heading item</h1></div>` | `1. Heading item` |
| `<div><h2 style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a.</span>H2</h2><h3 style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">b.</span>H3</h3><h4 style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">c.</span>H4</h4><h5 style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">d.</span>H5</h5><h6 style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">e.</span>H6</h6></div>` | `1. H2↵2. H3↵3. H4↵4. H5↵5. H6` |
| `<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>First</p><div><pre>code</pre></div><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a.</span>Orphan sub</p>` | `1. First↵code↵··1. Orphan sub` |

### P5. Nested lists indent under their parent's text column and restart numbering at 1

Items in a nested list indent to `indent + String(number).length + 2` spaces under a numbered parent or `indent + 2` spaces under a bullet parent (whether nested inside `<li>` or as a sibling list), and nested ordered lists start at `1`.

| HTML | Text |
| :--- | :--- |
| `<ul><li>Top<ul><li>Sub 1</li><li>Sub 2</li></ul></li><li>Next</li></ul>` | `- Top↵··- Sub 1↵··- Sub 2↵- Next` |
| `<ul><li>Top</li><ul><li>Sub</li></ul><li>Next</li></ul>` | `- Top↵··- Sub↵- Next` |
| `<ul><li>Bullet<ol><li>Num</li></ol></li></ul>` | `- Bullet↵··1. Num` |
| `<ol><li>One<ul><li>Sub bullet</li></ul></li></ol>` | `1. One↵···- Sub bullet` |
| `<ol start="10"><li>Ten<ul><li>Sub bullet</li></ul></li></ol>` | `10. Ten↵····- Sub bullet` |
| `<ol start="4"><li>Four<ol><li>Sub 1</li><li>Sub 2</li></ol></li><li>Five</li></ol>` | `4. Four↵···1. Sub 1↵···2. Sub 2↵5. Five` |
| `<ol><li>One<ol><li>Two<ol><li>Three</li></ol></li></ol></li></ol>` | `1. One↵···1. Two↵······1. Three` |
| `<ol><li>One</li><ol><li>Sub</li></ol></ol>` | `1. One↵···1. Sub` |
| `<ul><ul><li>Nested first</li></ul></ul>` | `- Nested first` |
| `<ul><p>Note</p><li>Item</li></ul>` | `Note↵- Item` |

### P6. Continuation text inside an item aligns under the item's text

Line breaks (`<br>`) and multiple blocks (`<p>`) inside a list item produce continuation lines padded with spaces to the column where that item's text starts.

| HTML | Text |
| :--- | :--- |
| `<ul><li>First bullet<br>continuation</li></ul>` | `- First bullet↵··continuation` |
| `<ul><li>Top<ul><li>Nested<br>continuation</li></ul></li></ul>` | `- Top↵··- Nested↵····continuation` |
| `<ol><li>First<br>continuation</li></ol>` | `1. First↵···continuation` |
| `<ol start="12"><li>Twelfth<br>continuation</li></ol>` | `12. Twelfth↵····continuation` |
| `<ol><li>One<ol><li>Sub<br>continuation</li></ol></li></ol>` | `1. One↵···1. Sub↵······continuation` |
| `<ul><li><p>First para</p><p>Second para</p></li></ul>` | `- First para↵··Second para` |
| `<ul><li>Text<p>Para</p></li></ul>` | `- Text↵··Para` |
| `<ul><li><p>First</p><p></p><p></p><p>Second</p></li></ul>` | `- First↵↵··Second` |
| `<ul><li><p>First</p><p>  </p><p>Second</p></li></ul>` | `- First↵↵··Second` |
| `<ul><li><br>After br</li></ul>` | `- After br` |
| `<ul><li><div>Block</div><blockquote>Quote</blockquote><h1>Heading</h1></li></ul>` | `- Block↵··Quote↵··Heading` |
| `<ul><li><h2>H2</h2><h6>H6</h6></li></ul>` | `- H2↵··H6` |
| `<ul><li><table><tr><td>Row 1</td></tr><tr><td>Row 2</td></tr></table></li></ul>` | `- Row 1↵··Row 2` |
| `<ul><li><div>Parent<ul><li>Ignored child</li></ul></div></li></ul>` | `- Parent` |
| `<ul><li><div>Parent<ol><li>Ignored child</li></ol></div></li></ul>` | `- Parent` |
| `<ul><li><p>First</p><p><style>  </style></p><p>Second</p></li></ul>` | `- First↵↵··Second` |

### P7. Other blocks become lines with collapsed whitespace while preformatted blocks stay verbatim

Non-list blocks become lines with runs of spaces, tabs, and newlines collapsed to single spaces (ignoring `<style>`, `<script>`, comments, and `<o:p>`), while `<pre>` blocks keep their exact spaces and line breaks.

| HTML | Text |
| :--- | :--- |
| `<p>Before</p><ul><li>Item</li></ul><p>After</p>` | `Before↵- Item↵After` |
| `<ul><li>Multiple     spaces⇥and↵↵newlines</li></ul>` | `- Multiple spaces and newlines` |
| `<ul><li>Hello &nbsp; &nbsp; world &nbsp; test</li></ul>` | `- Hello     world   test` |
| `<p>  Lots   of   spaces  </p><ul><li>Item</li></ul>` | `Lots of spaces↵- Item` |
| `<style>body{}</style><script>x()</script><!-- comment --><ul><li>Valid<o:p>&nbsp;</o:p></li></ul>` | `- Valid` |
| `<ul><li>Code:</li></ul><pre>  a = 1;↵    b = 2;</pre>` | `- Code:↵··a = 1;↵····b = 2;` |
| `<ul><li>Item<!-- comment --> text</li></ul>` | `- Item text` |
| `<ul><li><style>.x{}</style><script>y()</script><title>T</title>Clean</li></ul>` | `- Clean` |
| `<ul><li>Item</li></ul><style>.x{}</style><script>y()</script><o:p>ignored</o:p>` | `- Item` |
| `<ul><li>A</li></ul><style>.x{}</style><script>y()</script><o:p>x</o:p><ul><li>B</li></ul>` | `- A↵- B` |
| `<br><ul><li>One</li></ul><br><ul><li>Two</li></ul><br>` | `- One↵↵- Two` |
| `<ul><li>One</li></ul><p></p><p></p><ul><li>Two</li></ul>` | `- One↵↵- Two` |
| `<ul><li>One</li></ul><p><script>x()</script></p><ul><li>Two</li></ul>` | `- One↵↵- Two` |
| `  Bare   text⇥and↵newlines &nbsp; more  <ul><li>Item</li></ul>` | `Bare text and newlines   more↵- Item` |
| `<ul><li>Item</li></ul><pre>↵hello↵</pre>` | `- Item↵hello` |
| `<ul><li>&lt;![if !supportLists]&gt;text&lt;![endif]&gt;</li></ul>` | `- text` |
| `&lt;![if !supportLists]&gt;text&lt;![endif]&gt;<ul><li>Item</li></ul>` | `text↵- Item` |

### P8. Converted pastes go through the standard plain-text paste handling

Once HTML is converted to plain note text, the result goes through the same paste pipeline as plain text: leading state symbols stay first, due words resolve, pasting onto an empty symbol merges, and paste-forward links apply.

Not run as a table: post-paste editor transforms and paste-forward tracking operate on editor state rather than pure HTML-to-text conversion.

### P9. Edge case (§469): a non-breaking space at an item's start gives one space

Leading `&nbsp;` entities at the start of a list item's text are stripped so the converted marker keeps a single separating space.

| HTML | Text |
| :--- | :--- |
| `<ul><li>&nbsp;item</li></ul>` | `- item` |
| `<ul><li>&nbsp;&nbsp;  item</li></ul>` | `- item` |
| `<ol><li>&nbsp;first</li><li>&nbsp;second</li></ol>` | `1. first↵2. second` |
| `<ul><li>&nbsp;a&nbsp;&nbsp;b</li></ul>` | `- a  b` |

### P10. Edge case (§469): a numbered item with a checkbox sub-list stays numbered

Checkbox detection inspects only direct content of an `<li>`, not nested sub-lists, so a numbered parent with a checkbox sub-list keeps its number.

| HTML | Text |
| :--- | :--- |
| `<ol><li>Step<ul><li><input type="checkbox"> sub</li></ul></li></ol>` | `1. Step↵···- sub` |
| `<ol><li>Step<ul><li><input type="checkbox" checked> done</li></ul></li><li>Next</li></ol>` | `1. Step↵···- done↵2. Next` |
| `<ol><li>Step<ol><li><input type="checkbox"> sub</li></ol></li></ol>` | `1. Step↵···- sub` |

### P11. Edge case (§469): a preformatted block inside an item stays aligned under its text

A `<pre>` element inside a list item preserves its internal spaces and newlines while indenting each line under the item's text column.

| HTML | Text |
| :--- | :--- |
| `<ul><li>run:<pre>npm i↵npm test</pre></li></ul>` | `- run:↵··npm i↵··npm test` |
| `<ol><li>run:<pre>npm i↵npm test</pre></li></ol>` | `1. run:↵···npm i↵···npm test` |
| `<ul><li>code:<pre>  if (x) {↵    return 1;↵  }</pre></li></ul>` | `- code:↵····if (x) {↵······return 1;↵····}` |
| `<ol start="10"><li>run:<pre>echo ok↵echo done</pre></li></ol>` | `10. run:↵····echo ok↵····echo done` |
| `<ul><li>First<br>  <pre>second</pre><p>third</p></li></ul>` | `- First↵··second↵··third` |
| `<ul><li>run:<pre>a&nbsp;b</pre></li></ul>` | `- run:↵··a b` |

### P12. Edge case (§469): Google Docs lists keep their aria-level nesting

Lists with `aria-level` attributes (whether flat or wrapped in sibling sub-lists, as exported by Google Docs) nest according to `aria-level` under each parent's text column.

| HTML | Text |
| :--- | :--- |
| `<b id="docs-internal-guid-1"><ul><li aria-level="1"><p>Top</p></li><li aria-level="2"><p>Sub</p></li><li aria-level="1"><p>Next</p></li></ul></b>` | `- Top↵··- Sub↵- Next` |
| `<b id="docs-internal-guid-2"><ul><li aria-level="1"><p>Top one</p></li><ul><li aria-level="2"><p>Sub one</p></li></ul><li aria-level="1"><p>Top two</p></li></ul></b>` | `- Top one↵··- Sub one↵- Top two` |
| `<b id="docs-internal-guid-3"><ol><li aria-level="1"><p>One</p></li><li aria-level="2"><p>Sub</p></li><li aria-level="1"><p>Two</p></li></ol></b>` | `1. One↵···1. Sub↵2. Two` |
| `<ol><li aria-level="1">One</li><li aria-level="2">Two</li><li aria-level="3">Three</li><li aria-level="1">Four</li></ol>` | `1. One↵···1. Two↵······1. Three↵2. Four` |
| `<ul><li aria-level="2">Indented first</li></ul>` | `··- Indented first` |
| `<ol><li aria-level="1">One</li><li aria-level="3">Deep</li></ol>` | `1. One↵·····1. Deep` |
| `<ol><li aria-level="1">One</li><li aria-level="2">Sub 1</li><li aria-level="2">Sub 2</li><li aria-level="1">Two</li><li aria-level="2">Reset sub</li></ol>` | `1. One↵···1. Sub 1↵···2. Sub 2↵2. Two↵···1. Reset sub` |
| `<ol start="5"><li aria-level="1">Five</li></ol>` | `5. Five` |
| `<ol><li aria-level="1" value="5">Five</li><li>Six</li></ol>` | `5. Five↵6. Six` |
| `<ol><li aria-level="1">One</li><li aria-level="2" value="5">Five</li><li aria-level="2">Six</li><li aria-level="1">Two</li></ol>` | `1. One↵···5. Five↵···6. Six↵2. Two` |
| `<ol><li aria-level="0">Zero</li><li aria-level="abc">Bad</li></ol>` | `1. Zero↵2. Bad` |
| `<ol><li aria-level="1">One</li></ol>Bare text<ol><li aria-level="2">After</li></ol>` | `1. One↵Bare text↵··1. After` |
| `<ol><li aria-level="1">One</li></ol><pre>code</pre><ol><li aria-level="2">After</li></ol>` | `1. One↵code↵··1. After` |
| `<ol><li aria-level="1">One</li></ol><p>Break</p><ol><li aria-level="2">After</li></ol>` | `1. One↵Break↵··1. After` |
| `<ol><li aria-level="1">One</li></ol><p style="mso-list:l0 level1 lfo1">Bullet</p><ol><li aria-level="2">After</li></ol>` | `1. One↵- Bullet↵··1. After` |

### P13. Edge case (§469): Word/Outlook paragraphs without Ignore strip their visible marker

When a Word/Outlook `mso-list` paragraph has no `mso-list:Ignore` span and its visible text begins with its own marker, that marker is stripped so the converted line gets one marker instead of two.

| HTML | Text |
| :--- | :--- |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.⇥<span>text</span></p>` | `1. text` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.  text</p>` | `1. text` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.&nbsp;&nbsp;first</p><p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">2.&nbsp;&nbsp;second</p>` | `1. first↵2. second` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1. text</p><p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">a.  sub</p>` | `1. text↵···1. sub` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">•  bullet</p>` | `- bullet` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">10.  ten</p>` | `10. ten` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">ii.  second</p>` | `1. second` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.</p>` | `1.` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">foo 1. bar</p>` | `- foo 1. bar` |
| `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">foo • bar</p>` | `- foo • bar` |

## Copying lists

### K1. Text without any bullet or numbered line puts no HTML on the clipboard

If no line in the copied selection is a bullet or numbered list item, `noteTextToHtml` returns `null` (`—`), leaving plain text only on the clipboard.

| Text | HTML |
| :--- | :--- |
| `` | — |
| `Just a plain line` | — |
| `# call Dana↵v sent report↵> deferred` | — |
| `Heading↵=======` | — |
| `3.5 hours↵0. zero` | — |

### K2. Bullets and numbered items convert to ul and ol with start attributes

Dash (`-`) and star (`*`) bullets become `<ul>`, and numbered items (`.` or `)`) become `<ol>`, adding `start="N"` when the group starts at a number other than `1` and preserving action or topic symbols inside the item text.

| Text | HTML |
| :--- | :--- |
| `- Item 1↵- Item 2` | `<div data-chrononote=""><ul><li>Item 1</li><li>Item 2</li></ul></div>` |
| `* Star bullet` | `<div data-chrononote=""><ul><li>Star bullet</li></ul></div>` |
| `1. One↵2. Two` | `<div data-chrononote=""><ol><li>One</li><li>Two</li></ol></div>` |
| `4. Four↵5. Five` | `<div data-chrononote=""><ol start="4"><li>Four</li><li>Five</li></ol></div>` |
| `* Star↵2) Paren` | `<div data-chrononote=""><ul><li>Star</li></ul><ol start="2"><li>Paren</li></ol></div>` |
| `- item   ` | `<div data-chrononote=""><ul><li>item</li></ul></div>` |
| `1. One↵- Bullet` | `<div data-chrononote=""><ol><li>One</li></ol><ul><li>Bullet</li></ul></div>` |
| `1. Dot↵2) Paren` | `<div data-chrononote=""><ol><li>Dot</li></ol><ol start="2"><li>Paren</li></ol></div>` |

### K3. Indentation levels and flat dotted outlines nest as sub-lists

Structural indentation levels—both 2-space and 3-space indents as well as tabs (compared at 2-column width)—and flat dotted outlines (`1.1.`, `1.1.1.`) produce nested `<ul>` and `<ol>` elements.

| Text | HTML |
| :--- | :--- |
| `- Item 1↵··- Sub 1↵····- Subsub 1↵- Item 2` | `<div data-chrononote=""><ul><li>Item 1<ul><li>Sub 1<ul><li>Subsub 1</li></ul></li></ul></li><li>Item 2</li></ul></div>` |
| `1. Parent↵···1. Nested child↵2. Sibling` | `<div data-chrononote=""><ol><li>Parent<ol><li>Nested child</li></ol></li><li>Sibling</li></ol></div>` |
| `1. Parent↵··1. Old child↵2. Sibling` | `<div data-chrononote=""><ol><li>Parent<ol><li>Old child</li></ol></li><li>Sibling</li></ol></div>` |
| `- Bullet↵··1. Numbered↵····- Deep` | `<div data-chrononote=""><ul><li>Bullet<ol><li>Numbered<ul><li>Deep</li></ul></li></ol></li></ul></div>` |
| `⇥1. a↵⇥⇥1.1. b↵⇥2. c` | `<div data-chrononote=""><ol><li>a<ol><li>b</li></ol></li><li>c</li></ol></div>` |
| `1. a↵1.1. b↵1.1.1. c↵2. d` | `<div data-chrononote=""><ol><li>a<ol><li>b<ol><li>c</li></ol></li></ol></li><li>d</li></ol></div>` |
| `1.1. a↵··1. b` | `<div data-chrononote=""><ol><li>a<ol><li>b</li></ol></li></ol></div>` |

### K4. Non-list lines become divs, empty lines break, and continuation lines stay inside the item

Non-list lines outside a list become `<div>` elements (with leading spaces as `&nbsp;`), empty lines become `<div><br></div>`, and indented continuation lines inside an open list stay in their item with `<br>`.

| Text | HTML |
| :--- | :--- |
| `- Top list↵Middle prose↵1. Bottom` | `<div data-chrononote=""><ul><li>Top list</li></ul><div>Middle prose</div><ol><li>Bottom</li></ol></div>` |
| `- Item 1↵↵- Item 2` | `<div data-chrononote=""><ul><li>Item 1</li></ul><div><br></div><ul><li>Item 2</li></ul></div>` |
| `- Item↵↵··Indented non-list` | `<div data-chrononote=""><ul><li>Item</li></ul><div><br></div><div>&nbsp;&nbsp;Indented non-list</div></div>` |
| `1. a↵···cont↵2. b` | `<div data-chrononote=""><ol><li>a<br>cont</li><li>b</li></ol></div>` |
| `1. a↵···- sub↵···cont of 1↵2. b` | `<div data-chrononote=""><ol><li>a<ul><li>sub</li></ul><br>cont of 1</li><li>b</li></ol></div>` |
| `- Item 1↵···↵- Item 2` | `<div data-chrononote=""><ul><li>Item 1</li></ul><div><br></div><ul><li>Item 2</li></ul></div>` |

### K5. All copied text is HTML-escaped and wrapped with data-chrononote

HTML special characters (`&`, `<`, `>`, `"`) in both list items and non-list `<div>` lines are escaped, and the entire output is wrapped in `<div data-chrononote="">...</div>`.

| Text | HTML |
| :--- | :--- |
| `- <b>Bold & dangerous</b> "quotes"` | `<div data-chrononote=""><ul><li>&lt;b&gt;Bold &amp; dangerous&lt;/b&gt; &quot;quotes&quot;</li></ul></div>` |
| `1. a < b & c > d` | `<div data-chrononote=""><ol><li>a &lt; b &amp; c &gt; d</li></ol></div>` |
| `Plain <tag> & "text"↵- item` | `<div data-chrononote=""><div>Plain &lt;tag&gt; &amp; &quot;text&quot;</div><ul><li>item</li></ul></div>` |
| `- # call & verify <script>` | `<div data-chrononote=""><ul><li># call &amp; verify &lt;script&gt;</li></ul></div>` |

### K6. Empty selections and multi-range selections copy plain text only

When the selection is empty (so CodeMirror copies the whole line) or has several ranges, copying or cutting writes plain text only without HTML.

Not run as a table: clipboard selection inspection and multi-range copy dispatch depend on CodeMirror selection state rather than `noteTextToHtml`.

## Drag and drop

### P14. Dropping text uses the paste rules and internal moves are one undo step

Dropping text into the editor goes through the same HTML/plain-text paste rules as pasting (decision D9), and moving text within the note by dragging is recorded as a single undo step.

Not run as a table: pointer drag-and-drop and CodeMirror transaction grouping cannot be expressed as HTML/Text conversion rows.
