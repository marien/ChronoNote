// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { htmlToNoteText } from "./richClipboard";

describe("richClipboard htmlToNoteText (batch 4, rule 6)", () => {
  it("6.1: strips leading &nbsp; inside <li> so <ul><li>&nbsp;item</li></ul> becomes '- item'", () => {
    expect(htmlToNoteText("<ul><li>&nbsp;item</li></ul>")).toBe("- item");
    expect(htmlToNoteText("<ul><li>&nbsp;&nbsp;item</li></ul>")).toBe("- item");
    expect(htmlToNoteText("<ol><li>&nbsp;first</li><li>&nbsp;second</li></ol>")).toBe("1. first\n2. second");
  });

  it("6.2: <ol><li>Step<ul><li><input type='checkbox'> sub</li></ul></li></ol> becomes '1. Step\\n   - sub'", () => {
    const html = '<ol><li>Step<ul><li><input type="checkbox"> sub</li></ul></li></ol>';
    expect(htmlToNoteText(html)).toBe("1. Step\n   - sub");
  });

  it("6.3: <pre> inside <li> keeps its lines aligned under the item text", () => {
    const html = "<ul><li>run:<pre>npm i\nnpm test</pre></li></ul>";
    expect(htmlToNoteText(html)).toBe("- run:\n  npm i\n  npm test");

    const olHtml = "<ol><li>run:<pre>npm i\nnpm test</pre></li></ol>";
    expect(htmlToNoteText(olHtml)).toBe("1. run:\n   npm i\n   npm test");
  });

  it("6.4: Google Docs HTML preserves top-level indent 0 and aria-level='2' one level in", () => {
    const siblingUlHtml =
      '<b id="docs-internal-guid-12345678-1234-1234-1234-123456789abc" style="font-weight:normal;">' +
      "<ul>" +
      '<li dir="ltr" aria-level="1"><p dir="ltr">Top one</p></li>' +
      "<ul>" +
      '<li dir="ltr" aria-level="2"><p dir="ltr">Sub one</p></li>' +
      "</ul>" +
      '<li dir="ltr" aria-level="1"><p dir="ltr">Top two</p></li>' +
      "</ul>" +
      "</b>";
    expect(htmlToNoteText(siblingUlHtml)).toBe("- Top one\n  - Sub one\n- Top two");

    const flatAriaHtml =
      '<b id="docs-internal-guid-abcdef12-1234-1234-1234-123456789abc" style="font-weight:normal;">' +
      "<ul>" +
      '<li aria-level="1">Top one</li>' +
      '<li aria-level="2">Sub one</li>' +
      '<li aria-level="1">Top two</li>' +
      "</ul>" +
      "</b>";
    expect(htmlToNoteText(flatAriaHtml)).toBe("- Top one\n  - Sub one\n- Top two");
  });

  it("6.5: Word/Outlook mso-list paragraph without mso-list:Ignore span avoids duplicating '1.'", () => {
    const tabHtml = `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.\ttext</p>`;
    expect(htmlToNoteText(tabHtml)).toBe("1. text");

    const spacesHtml = `<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">1.  text</p>`;
    expect(htmlToNoteText(spacesHtml)).toBe("1. text");

    const multiHtml =
      `<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1">1.\tfirst</p>` +
      `<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1">2.&nbsp;&nbsp;second</p>`;
    expect(htmlToNoteText(multiHtml)).toBe("1. first\n2. second");
  });
});
