// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { htmlToNoteText, isOwnChronoNoteHtml, noteTextToHtml, tabsToTwoSpaces } from "./richClipboard";

describe("richClipboard", () => {
  describe("htmlToNoteText", () => {
    it("returns null when HTML has no list", () => {
      expect(htmlToNoteText("")).toBeNull();
      expect(htmlToNoteText("<p>Just plain text</p>")).toBeNull();
      expect(htmlToNoteText("<h1>Heading</h1><p>Another paragraph</p>")).toBeNull();
      expect(htmlToNoteText("<div><span>Some text</span></div>")).toBeNull();
    });

    it("handles Teams-like nested <ul> in <li> and as a sibling", () => {
      // 1. In <li>
      const inLi = `
        <ul>
          <li>Item 1
            <ul>
              <li>Item 1.1</li>
              <li>Item 1.2</li>
            </ul>
          </li>
          <li>Item 2</li>
        </ul>
      `;
      expect(htmlToNoteText(inLi)).toBe(
        "- Item 1\n  - Item 1.1\n  - Item 1.2\n- Item 2"
      );

      // 2. As a sibling of <li> inside <ul> (Teams format)
      const asSibling = `
        <ul>
          <li>Item 1</li>
          <ul>
            <li>Item 1.1</li>
            <li>Item 1.2</li>
          </ul>
          <li>Item 2</li>
        </ul>
      `;
      expect(htmlToNoteText(asSibling)).toBe(
        "- Item 1\n  - Item 1.1\n  - Item 1.2\n- Item 2"
      );
    });

    it("handles <ol> with start attribute", () => {
      const html = `
        <ol start="4">
          <li>Item four</li>
          <li>Item five</li>
        </ol>
      `;
      expect(htmlToNoteText(html)).toBe(
        "4. Item four\n5. Item five"
      );
    });

    it("handles mixed ol/ul nesting", () => {
      const html = `
        <ol>
          <li>Numbered one
            <ul>
              <li>Bullet under numbered</li>
            </ul>
          </li>
          <li>Numbered two
            <ol>
              <li>Numbered sub under numbered</li>
            </ol>
          </li>
        </ol>
        <ul>
          <li>Bullet item
            <ol>
              <li>Numbered under bullet</li>
            </ol>
          </li>
        </ul>
      `;
      expect(htmlToNoteText(html)).toBe(
        "1. Numbered one\n   - Bullet under numbered\n2. Numbered two\n   1. Numbered sub under numbered\n- Bullet item\n  1. Numbered under bullet"
      );
    });

    it("aligns continuation lines from <br> inside an <li>", () => {
      // Bullet continuation: 2 spaces indent + 2 spaces = 4 spaces total
      const bulletHtml = `
        <ul>
          <li>First bullet<br>continuation line</li>
          <li>
            <ul>
              <li>Nested bullet<br>nested continuation</li>
            </ul>
          </li>
        </ul>
      `;
      expect(htmlToNoteText(bulletHtml)).toBe(
        "- First bullet\n  continuation line\n  - Nested bullet\n    nested continuation"
      );

      // Numbered continuation: marker length + 1 after number
      const numberedHtml = `
        <ol>
          <li>First numbered<br>numbered continuation</li>
        </ol>
        <ol start="12">
          <li>Twelfth numbered<br>twelfth continuation</li>
        </ol>
        <ol>
          <li>
            <ol>
              <li>Nested numbered<br>nested continuation</li>
            </ol>
          </li>
        </ol>
      `;
      expect(htmlToNoteText(numberedHtml)).toBe(
        "1. First numbered\n   numbered continuation\n12. Twelfth numbered\n    twelfth continuation\n   1. Nested numbered\n      nested continuation"
      );
    });

    it("handles Word mso-list bullet list with level1/level2 and <![if !supportLists]> markup", () => {
      const wordHtml = `
        <p class=MsoListParagraphCxSpFirst style='margin-left:.5in;mso-list:l0 level1 lfo1'>
          <![if !supportLists]><span style='mso-list:Ignore'>o<span>&nbsp;&nbsp; </span></span><![endif]>Top bullet
        </p>
        <p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-list:l0 level2 lfo1'>
          <![if !supportLists]><span style='mso-list:Ignore'>o<span>&nbsp;&nbsp; </span></span><![endif]>Sub bullet 1
        </p>
        <p class=MsoListParagraphCxSpLast style='margin-left:1.0in;mso-list:l0 level2 lfo1'>
          <![if !supportLists]><span style='mso-list:Ignore'>o<span>&nbsp;&nbsp; </span></span><![endif]>Sub bullet 2
        </p>
      `;
      expect(htmlToNoteText(wordHtml)).toBe(
        "- Top bullet\n  - Sub bullet 1\n  - Sub bullet 2"
      );
    });

    it("handles Word numbered list with 1. and a. markers", () => {
      const wordNumberedHtml = `
        <p class=MsoListParagraphCxSpFirst style='margin-left:.5in;mso-list:l0 level1 lfo1'>
          <![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>First item
        </p>
        <p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-list:l0 level2 lfo1'>
          <![if !supportLists]><span style='mso-list:Ignore'>a.<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Sub item a
        </p>
        <p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-list:l0 level2 lfo1'>
          <![if !supportLists]><span style='mso-list:Ignore'>b.<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Sub item b
        </p>
        <p class=MsoListParagraphCxSpLast style='margin-left:.5in;mso-list:l0 level1 lfo1'>
          <![if !supportLists]><span style='mso-list:Ignore'>2.<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Second item
        </p>
      `;
      expect(htmlToNoteText(wordNumberedHtml)).toBe(
        "1. First item\n   1. Sub item a\n   2. Sub item b\n2. Second item"
      );
    });

    it("handles &nbsp; and whitespace collapse", () => {
      const html = `
        <ul>
          <li>Hello &nbsp; &nbsp; world &nbsp; test</li>
          <li>Multiple     spaces    and\n\nnewlines\t\tcollapsed</li>
        </ul>
      `;
      expect(htmlToNoteText(html)).toBe(
        "- Hello     world   test\n- Multiple spaces and newlines collapsed"
      );
    });

    it("ignores script and style tags, comments, and o:p", () => {
      const html = `
        <style>body { color: red; }</style>
        <script>alert('bad');</script>
        <!-- A comment -->
        <ul>
          <li>Valid item<o:p>&nbsp;</o:p></li>
        </ul>
      `;
      expect(htmlToNoteText(html)).toBe("- Valid item");
    });

    it("treats checkbox list items as plain bullets", () => {
      const html = `
        <ul>
          <li><input type="checkbox"> Task item</li>
          <li><input type="checkbox" checked> Done task</li>
        </ul>
      `;
      expect(htmlToNoteText(html)).toBe(
        "- Task item\n- Done task"
      );
    });

    it("preserves pre formatted text with exact spaces and newlines", () => {
      const html = `
        <ul>
          <li>Code block below:</li>
        </ul>
        <pre>  function test() {
    return 123;
  }</pre>
      `;
      expect(htmlToNoteText(html)).toBe(
        "- Code block below:\n  function test() {\n    return 123;\n  }"
      );
    });

    it("converts tabs in <pre> blocks to two spaces", () => {
      const tabbedPre = "<ul><li>Code:</li></ul><pre>\ta = 1;\n\t\tb = 2;\nkey\tvalue</pre>";
      expect(htmlToNoteText(tabbedPre)).toBe(
        "- Code:\n  a = 1;\n    b = 2;\nkey  value"
      );

      const tabbedPreInLi = "<ul><li>run:<pre>\tnpm i\n\t\tnpm test</pre></li></ul>";
      expect(htmlToNoteText(tabbedPreInLi)).toBe(
        "- run:\n    npm i\n      npm test"
      );
    });

    it("detects ChronoNote's own HTML marker only as an element attribute", () => {
      expect(isOwnChronoNoteHtml('<div data-chrononote=""><ul><li>a</li></ul></div>')).toBe(true);
      expect(isOwnChronoNoteHtml('<html><body><!--StartFragment--><div data-chrononote=""></div></body></html>')).toBe(true);
      expect(isOwnChronoNoteHtml("<p>data-chrononote in prose</p>")).toBe(false);
      expect(isOwnChronoNoteHtml("")).toBe(false);
      expect(tabsToTwoSpaces("\ta\t\tb\tc")).toBe("  a    b  c");
    });

    it("aligns continuation lines from <p> paragraphs inside <li>", () => {
      const html = `
        <ul>
          <li>
            <p>First paragraph</p>
            <p>Second paragraph</p>
          </li>
        </ul>
      `;
      expect(htmlToNoteText(html)).toBe(
        "- First paragraph\n  Second paragraph"
      );
    });

    it("handles Roman numerals and non-list interruption in Word lists", () => {
      const wordHtml = `
        <p class=MsoListParagraph style='mso-list:l0 level1 lfo1'>
          <span style='mso-list:Ignore'>i.</span>First Roman
        </p>
        <p class=MsoListParagraph style='mso-list:l0 level1 lfo1'>
          <span style='mso-list:Ignore'>ii.</span>Second Roman
        </p>
        <p>A non-list paragraph</p>
        <p class=MsoListParagraph style='mso-list:l0 level1 lfo1'>
          <span style='mso-list:Ignore'>a.</span>Letter item after interruption
        </p>
      `;
      expect(htmlToNoteText(wordHtml)).toBe(
        "1. First Roman\n2. Second Roman\nA non-list paragraph\n1. Letter item after interruption"
      );
    });

    it("nested numbered paste gives 3-space children under 1.", () => {
      const html = "<ol><li>One<ol><li>Sub</li></ol></li></ol>";
      expect(htmlToNoteText(html)).toBe("1. One\n   1. Sub");
    });

    it("strips leading &nbsp; after bullet to produce a single space", () => {
      expect(htmlToNoteText("<ul><li>&nbsp;item</li></ul>")).toBe("- item");
      expect(htmlToNoteText("<ul><li>&nbsp;&nbsp;  item</li></ul>")).toBe("- item");
    });

    it("does not mistake a nested checkbox for the parent item being a checkbox", () => {
      const html = '<ol><li>Step<ul><li><input type="checkbox"> sub</li></ul></li></ol>';
      expect(htmlToNoteText(html)).toBe("1. Step\n   - sub");
    });

    it("preserves <pre> newlines and indents continuation lines inside <li>", () => {
      const html = "<ul><li>run:<pre>npm i\nnpm test</pre></li></ul>";
      expect(htmlToNoteText(html)).toBe("- run:\n  npm i\n  npm test");
    });

    it("handles Google Docs wrapper with aria-level nesting", () => {
      const flatDocs =
        '<b id="docs-internal-guid-1234"><ul><li aria-level="1"><p><span>Top</span></p></li><li aria-level="2"><p><span>Sub</span></p></li><li aria-level="1"><p><span>Next</span></p></li></ul></b>';
      expect(htmlToNoteText(flatDocs)).toBe("- Top\n  - Sub\n- Next");

      const orderedDocs =
        '<b id="docs-internal-guid-5678"><ol><li aria-level="1"><p>One</p></li><li aria-level="2"><p>Sub</p></li><li aria-level="1"><p>Two</p></li></ol></b>';
      expect(htmlToNoteText(orderedDocs)).toBe("1. One\n   1. Sub\n2. Two");
    });

    it("strips visible marker on Word/Outlook mso-list paragraphs without mso-list:Ignore", () => {
      const outlookNum =
        '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.&#9;<span>text</span></p>';
      expect(htmlToNoteText(outlookNum)).toBe("1. text");

      const outlookSpaces =
        '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.<span>&nbsp;&nbsp;&nbsp; </span>text</p>' +
        '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">a.  sub item</p>';
      expect(htmlToNoteText(outlookSpaces)).toBe("1. text\n   1. sub item");
    });

    it("extracts lists inside table cells (td and th) in cell order", () => {
      expect(htmlToNoteText("<table><tr><td><ul><li>Item</li></ul></td></tr></table>")).toBe("- Item");
      expect(htmlToNoteText("<table><tr><th><ul><li>Header</li></ul></th></tr></table>")).toBe("- Header");
      expect(
        htmlToNoteText("<table><tr><td>Name</td><td><ul><li>a</li><li>b</li></ul></td></tr></table>")
      ).toBe("Name\n- a\n- b");
    });

    it("resets wordParents on non-list block interruption before a level 2 mso-list item", () => {
      const html =
        '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>First</p>' +
        "<p>Break</p>" +
        '<p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a.</span>Sub</p>';
      expect(htmlToNoteText(html)).toBe("1. First\nBreak\n  1. Sub");
    });

    it("handles <br> inside a non-list div without inserting an extra blank line", () => {
      expect(htmlToNoteText("<ul><li>x</li></ul><div>a<br>b</div>")).toBe("- x\na\nb");
      expect(htmlToNoteText("<ul><li>x</li></ul><div>a<br><br>b</div>")).toBe("- x\na\n\nb");
    });

    it("does not leave a trailing space on an empty mso-list marker line before <br>", () => {
      expect(
        htmlToNoteText('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.<br>next</p>')
      ).toBe("1.\n   next");
      expect(
        htmlToNoteText('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">•<br>next</p>')
      ).toBe("-\n  next");
      expect(
        htmlToNoteText('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span><br>next</p>')
      ).toBe("1.\n   next");
    });
  });

  describe("noteTextToHtml", () => {
    const own = (inner: string) => `<div data-chrononote="">${inner}</div>`;

    it("copy of a 3-space nested list gives nested <ol>", () => {
      const text = "1. Parent\n   1. Nested child\n2. Sibling";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ol><li>Parent<ol><li>Nested child</li></ol></li><li>Sibling</li></ol>")
      );
    });

    it("old 2-space input still nests", () => {
      const text = "1. Parent\n  1. Old child\n2. Sibling";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ol><li>Parent<ol><li>Old child</li></ol></li><li>Sibling</li></ol>")
      );
    });

    it("returns null when no line is a bullet or numbered item", () => {
      expect(noteTextToHtml("")).toBeNull();
      expect(noteTextToHtml("Just a plain line")).toBeNull();
      expect(noteTextToHtml("# call Dana\nv sent report\n> deferred")).toBeNull();
      expect(noteTextToHtml("Heading\n=======")).toBeNull();
    });

    it("converts nested bullets to HTML", () => {
      const text = "- Item 1\n  - Sub 1\n    - Subsub 1\n- Item 2";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ul><li>Item 1<ul><li>Sub 1<ul><li>Subsub 1</li></ul></li></ul></li><li>Item 2</li></ul>")
      );
    });

    it("converts numbered items with start attribute", () => {
      const text = "4. Item four\n5. Item five";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own('<ol start="4"><li>Item four</li><li>Item five</li></ol>')
      );
    });

    it("escapes HTML characters", () => {
      const text = "- <b>Bold & dangerous</b> \"quotes\" <script>";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ul><li>&lt;b&gt;Bold &amp; dangerous&lt;/b&gt; &quot;quotes&quot; &lt;script&gt;</li></ul>")
      );
    });

    it("handles a non-list line in between list items", () => {
      const text = "- Top list\nMiddle prose\n1. Numbered bottom";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ul><li>Top list</li></ul><div>Middle prose</div><ol><li>Numbered bottom</li></ol>")
      );
    });

    it("converts leading spaces of non-list lines to &nbsp;", () => {
      const text = "- Item\n\n  Indented non-list";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ul><li>Item</li></ul><div><br></div><div>&nbsp;&nbsp;Indented non-list</div>")
      );
    });

    it("rule 13: keeps continuation lines inside one list with <br>", () => {
      const text = "1. a\n   cont\n2. b";
      const html = noteTextToHtml(text);
      expect(html).toBe(own("<ol><li>a<br>cont</li><li>b</li></ol>"));
      expect(htmlToNoteText(html!.replace(' data-chrononote=""', ""))).toBe(text);

      expect(noteTextToHtml("- Item\n  Indented non-list")).toBe(
        own("<ul><li>Item<br>Indented non-list</li></ul>"),
      );
      expect(noteTextToHtml("1. a\n   - sub\n   cont of 1\n2. b")).toBe(
        own("<ol><li>a<ul><li>sub</li></ul><br>cont of 1</li><li>b</li></ol>"),
      );
    });

    it("rule 11: compares tab indents by 2-column width in noteTextToHtml", () => {
      expect(noteTextToHtml("\t1. a\n\t\t1.1. b\n\t2. c")).toBe(
        own("<ol><li>a<ol><li>b</li></ol></li><li>c</li></ol>"),
      );
      expect(noteTextToHtml("\t- a\n\t  1. b")).toBe(
        own("<ul><li>a<ol><li>b</li></ol></li></ul>"),
      );
    });

    it("converts empty lines between lists to <div><br></div>", () => {
      const text = "- Item 1\n\n- Item 2";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ul><li>Item 1</li></ul><div><br></div><ul><li>Item 2</li></ul>")
      );
    });

    it("preserves action and topic symbols inside items", () => {
      const text = "- # call Dana\n- o agenda topic\n1. v completed action";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ul><li># call Dana</li><li>o agenda topic</li></ul><ol><li>v completed action</li></ol>")
      );
    });

    it("handles star bullets and 2) parenthesis numbered markers", () => {
      const text = "* Star bullet\n2) Paren numbered";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own('<ul><li>Star bullet</li></ul><ol start="2"><li>Paren numbered</li></ol>')
      );
    });

    it("nests <ol> by number depth for flat numbered outlines", () => {
      const text = "1. a\n1.1. b\n1.1.1. c\n2. d";
      const html = noteTextToHtml(text);
      expect(html).toBe(
        own("<ol><li>a<ol><li>b<ol><li>c</li></ol></li></ol></li><li>d</li></ol>")
      );

      const parentless = "1.1. a\n1.2. b";
      expect(noteTextToHtml(parentless)).toBe(own("<ol><li>a</li><li>b</li></ol>"));
    });
  });

  describe("round trip", () => {
    it("round trips htmlToNoteText(noteTextToHtml(x)) === x for a nested mixed list", () => {
      const x = [
        "- Bullet 1",
        "  1. Numbered 1",
        "  2. Numbered 2",
        "     - Subsub bullet",
        "  3. Numbered 3",
        "- Bullet 2",
        "Plain text in between",
        "4. Numbered 4",
        "   - Bullet under numbered 4",
      ].join("\n");

      const html = noteTextToHtml(x);
      expect(html).not.toBeNull();
      // Another app keeps the list but not ChronoNote's marker.
      const back = htmlToNoteText(html!.replace(' data-chrononote=""', ""));
      expect(back).toBe(x);
    });

    it("ChronoNote's own HTML is left to the plain text (exact spaces, `*` bullets, the paste-forward link)", () => {
      expect(htmlToNoteText(noteTextToHtml("* a    b\n   - odd indent")!)).toBeNull();
      // As Chrome hands it to a paste event, with its own wrapper around the fragment.
      const wrapped = `<html><body><!--StartFragment-->${noteTextToHtml("- x")}<!--EndFragment--></body></html>`;
      expect(htmlToNoteText(wrapped)).toBeNull();
    });
  });
});
