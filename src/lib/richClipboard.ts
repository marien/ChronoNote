import { BULLET_CLASS } from "./grammar/symbols";
import { parseNumberedItem } from "./tokens";

const BULLET_LINE_RE = new RegExp(String.raw`^([ ]*)(${BULLET_CLASS})(?:\s+(.*)|\s*$)`);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ListLineInfo {
  type: "ul" | "ol";
  depth: number;
  text: string;
  startNum: number;
}

function parseListLine(line: string): ListLineInfo | null {
  // Only match bullet when followed by whitespace or end of line (requiring a space or space-only)
  const isBulletDashOrStar = new RegExp(String.raw`^([ ]*)(${BULLET_CLASS})(?:\s+(.*)|\s+$)`).exec(line);
  if (isBulletDashOrStar) {
    const indent = isBulletDashOrStar[1];
    const depth = Math.floor(indent.length / 2);
    const itemText = isBulletDashOrStar[3] !== undefined ? isBulletDashOrStar[3].trim() : "";
    return {
      type: "ul",
      depth,
      text: itemText,
      startNum: 1,
    };
  }

  const numItem = parseNumberedItem(line);
  if (numItem) {
    const depth = Math.floor(numItem.indent.length / 2);
    const startNum = numItem.numbers[numItem.numbers.length - 1];
    return {
      type: "ol",
      depth,
      text: numItem.text,
      startNum,
    };
  }

  return null;
}

/** Converts ChronoNote text to HTML clipboard format if it contains any list lines.
 * Returns null if no line is a bullet or numbered item. */
export function noteTextToHtml(text: string): string | null {
  if (!text) return null;
  const rawLines = text.split(/\r?\n/);

  let hasAnyList = false;
  for (const line of rawLines) {
    if (parseListLine(line) !== null) {
      hasAnyList = true;
      break;
    }
  }

  if (!hasAnyList) return null;

  let output = "";
  const stack: { type: "ul" | "ol"; depth: number }[] = [];

  function closeDownTo(targetDepth: number) {
    while (stack.length > 0 && stack[stack.length - 1].depth > targetDepth) {
      const top = stack.pop()!;
      output += `</li></${top.type}>`;
    }
  }

  function closeAll() {
    while (stack.length > 0) {
      const top = stack.pop()!;
      output += `</li></${top.type}>`;
    }
  }

  for (const line of rawLines) {
    const item = parseListLine(line);
    if (!item) {
      // Non-list line
      closeAll();
      if (line === "") {
        output += "<div><br></div>";
      } else {
        const leadingSpaces = line.match(/^[ ]*/)?.[0].length || 0;
        const rest = line.slice(leadingSpaces);
        const leadingNbsp = "&nbsp;".repeat(leadingSpaces);
        output += `<div>${leadingNbsp}${escapeHtml(rest)}</div>`;
      }
    } else {
      // List line
      closeDownTo(item.depth);

      if (stack.length > 0 && stack[stack.length - 1].depth === item.depth) {
        if (stack[stack.length - 1].type === item.type) {
          output += "</li>";
        } else {
          const top = stack.pop()!;
          output += `</li></${top.type}>`;
        }
      }

      if (stack.length === 0 || stack[stack.length - 1].depth < item.depth) {
        if (item.type === "ol" && item.startNum !== 1) {
          output += `<ol start="${item.startNum}">`;
        } else {
          output += `<${item.type}>`;
        }
        stack.push({ type: item.type, depth: item.depth });
      }

      output += `<li>${escapeHtml(item.text)}`;
    }
  }

  closeAll();
  // Marked as ChronoNote's own, so a paste back into ChronoNote takes the exact text/plain instead (see htmlToNoteText).
  return `<div ${OWN_HTML_ATTR}="">${output}</div>`;
}

/** On the HTML ChronoNote puts on the clipboard. Converting it back would collapse spaces, turn `*` into `-` and change
 * what the paste-forward link (§86) compares, so `htmlToNoteText` leaves it to the plain text. */
const OWN_HTML_ATTR = "data-chrononote";

const BLOCK_TAGS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
  "LI", "TR", "BR", "BLOCKQUOTE", "PRE", "TABLE", "TBODY", "THEAD"
]);

function isBlockElement(el: Element): boolean {
  return BLOCK_TAGS.has(el.tagName.toUpperCase());
}

function hasList(doc: Document): boolean {
  if (doc.querySelector("li")) return true;
  const elements = doc.querySelectorAll("[style]");
  for (let i = 0; i < elements.length; i++) {
    const style = elements[i].getAttribute("style") || "";
    if (/mso-list:[^;"']*level\d+/i.test(style)) return true;
  }
  return false;
}

function extractLines(nodes: Node | Node[], options?: { ignoreSpan?: Element }): string[] {
  const rawLines: string[] = [];
  let current = "";

  function flush() {
    rawLines.push(current);
    current = "";
  }

  function walk(n: Node) {
    if (n.nodeType === Node.COMMENT_NODE) return;
    if (n.nodeType === Node.TEXT_NODE) {
      let t = n.nodeValue || "";
      t = t.replace(/<!?\[(?:if|endif)[^\]]*\]>?/gi, "");
      current += t;
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;

    const el = n as Element;
    if (options?.ignoreSpan && el === options.ignoreSpan) return;

    const tag = el.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "HEAD" || tag === "TITLE" || tag === "O:P" || tag === "INPUT") {
      return;
    }
    if (tag === "UL" || tag === "OL") {
      return;
    }
    if (tag === "BR") {
      flush();
      return;
    }

    if (tag === "P" || tag === "DIV" || tag === "TR" || tag === "BLOCKQUOTE" || /^H[1-6]$/.test(tag)) {
      if (current.trim() !== "") {
        flush();
      }
      for (const child of Array.from(el.childNodes)) {
        walk(child);
      }
      if (current !== "") {
        flush();
      } else if (rawLines.length === 0 || rawLines[rawLines.length - 1] !== "") {
        if (el.childNodes.length === 0 || el.textContent?.trim() === "") {
          rawLines.push("");
        }
      }
      return;
    }

    // Inline element
    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }
  }

  const nodeList = Array.isArray(nodes) ? nodes : [nodes];
  for (const n of nodeList) {
    walk(n);
  }
  if (current.trim() !== "") {
    flush();
  }

  return rawLines.map(line => {
    let l = line.replace(/\r/g, "");
    l = l.replace(/[ \t\n]+/g, " ");
    l = l.replace(/^[ ]+/, "");
    l = l.replace(/\u00a0/g, " ");
    return l.trimEnd();
  });
}

function getListDepth(el: Element): number {
  let depth = 0;
  let p = el.parentElement;
  while (p) {
    if (p.tagName === "UL" || p.tagName === "OL") {
      depth++;
    }
    p = p.parentElement;
  }
  return depth;
}

/** Parses HTML clipboard content and converts it to ChronoNote list/note text.
 * Returns null if the HTML contains no list (no <li> and no Word mso-list paragraphs). */
export function htmlToNoteText(html: string): string | null {
  if (!html || typeof html !== "string") return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  if (!hasList(doc) || doc.querySelector(`[${OWN_HTML_ATTR}]`)) {
    return null;
  }

  const lines: string[] = [];
  function addLine(line: string) {
    if (line === "") {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
    } else {
      lines.push(line);
    }
  }

  let wordCounters: number[] = [];

  function processListContainer(listEl: Element) {
    wordCounters = [];
    const isOl = listEl.tagName === "OL";
    const startAttr = listEl.getAttribute("start");
    let counter = isOl ? (startAttr && !isNaN(parseInt(startAttr, 10)) ? parseInt(startAttr, 10) : 1) : 1;
    const depth = getListDepth(listEl);

    for (const child of Array.from(listEl.children)) {
      if (child.tagName === "LI") {
        processLi(child as Element, depth, isOl, counter);
        if (isOl) {
          if (child.hasAttribute("value") && !isNaN(parseInt(child.getAttribute("value")!, 10))) {
            counter = parseInt(child.getAttribute("value")!, 10) + 1;
          } else {
            counter++;
          }
        }
      } else if (child.tagName === "UL" || child.tagName === "OL") {
        processListContainer(child as Element);
      } else {
        walkNode(child);
      }
    }
  }

  function processLi(li: Element, depth: number, isParentOl: boolean, currentCounter: number) {
    const isCheckbox = li.querySelector('input[type="checkbox"]') !== null;
    const isNumbered = !isCheckbox && isParentOl;
    let number = currentCounter;
    if (isNumbered && li.hasAttribute("value") && !isNaN(parseInt(li.getAttribute("value")!, 10))) {
      number = parseInt(li.getAttribute("value")!, 10);
    }

    const markerStr = isNumbered ? `${number}. ` : "- ";
    const indent = "  ".repeat(depth);
    const continuationIndent = isNumbered
      ? indent + " ".repeat(String(number).length + 2)
      : indent + "  ";

    let emittedItemHeader = false;
    let currentNodes: Node[] = [];

    function flushItemNodes() {
      if (currentNodes.length === 0) return;
      const rawLines = extractLines(currentNodes);
      currentNodes = [];

      for (const line of rawLines) {
        if (!emittedItemHeader) {
          if (line !== "") {
            addLine(indent + markerStr + line);
            emittedItemHeader = true;
          }
        } else {
          if (line === "") {
            addLine("");
          } else {
            addLine(continuationIndent + line);
          }
        }
      }
    }

    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child.nodeName === "UL" || child.nodeName === "OL")) {
        flushItemNodes();
        processListContainer(child as Element);
      } else {
        currentNodes.push(child);
      }
    }
    flushItemNodes();

    if (!emittedItemHeader) {
      const hasChildLists = li.querySelector("ul, ol") !== null;
      if (!hasChildLists) {
        addLine(indent + markerStr.trimEnd());
      }
    }
  }

  function walkNode(node: Node) {
    if (node.nodeType === Node.COMMENT_NODE) return;
    if (node.nodeType === Node.TEXT_NODE) {
      let t = node.nodeValue || "";
      t = t.replace(/<!?\[(?:if|endif)[^\]]*\]>?/gi, "");
      t = t.replace(/[ \t\n]+/g, " ").replace(/^[ ]+/, "").replace(/\u00a0/g, " ").trimEnd();
      if (t !== "") {
        wordCounters = [];
        addLine(t);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toUpperCase();

    if (tag === "SCRIPT" || tag === "STYLE" || tag === "HEAD" || tag === "TITLE" || tag === "O:P") {
      return;
    }

    // Word list paragraph?
    const style = el.getAttribute("style") || "";
    const msoMatch = style.match(/mso-list:[^;"']*level(\d+)/i);
    if (msoMatch) {
      const level = parseInt(msoMatch[1], 10);
      const depth = Math.max(0, level - 1);

      const ignoreSpan = Array.from(el.querySelectorAll("span")).find(s =>
        /mso-list:[^;"']*ignore/i.test(s.getAttribute("style") || "")
      );

      const markerRaw = ignoreSpan ? (ignoreSpan.textContent || "").trim() : "";
      const numMatch = markerRaw.match(/^\(?([0-9]+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)]$/);

      let markerStr = "- ";
      let isNumbered = false;
      let itemNumber = 1;

      wordCounters.length = depth + 1;

      if (numMatch) {
        isNumbered = true;
        const plainNumMatch = markerRaw.match(/^\(?([0-9]+)[.)]$/);
        if (plainNumMatch) {
          itemNumber = parseInt(plainNumMatch[1], 10);
          wordCounters[depth] = itemNumber;
        } else {
          const current = (wordCounters[depth] ?? 0) + 1;
          wordCounters[depth] = current;
          itemNumber = current;
        }
        markerStr = `${itemNumber}. `;
      }

      const indent = "  ".repeat(depth);
      const continuationIndent = isNumbered
        ? indent + " ".repeat(String(itemNumber).length + 2)
        : indent + "  ";

      const itemLines = extractLines(el, { ignoreSpan });
      if (itemLines.length > 0) {
        addLine(indent + markerStr + itemLines[0]);
        for (let i = 1; i < itemLines.length; i++) {
          if (itemLines[i] === "") {
            addLine("");
          } else {
            addLine(continuationIndent + itemLines[i]);
          }
        }
      } else {
        addLine(indent + markerStr.trimEnd());
      }
      return;
    }

    if (tag === "UL" || tag === "OL") {
      processListContainer(el);
      return;
    }

    if (tag === "PRE") {
      wordCounters = [];
      const text = el.textContent || "";
      const preLines = text.split(/\r?\n/);
      for (const l of preLines) {
        addLine(l);
      }
      return;
    }

    if (tag === "BR") {
      addLine("");
      return;
    }

    const hasBlockChildren = Array.from(el.children).some(child =>
      isBlockElement(child) || child.tagName === "UL" || child.tagName === "OL"
    );

    if (hasBlockChildren) {
      for (const child of Array.from(el.childNodes)) {
        walkNode(child);
      }
    } else {
      wordCounters = [];
      const blockLines = extractLines(el);
      if (blockLines.length === 0) {
        addLine("");
      } else {
        for (const l of blockLines) {
          addLine(l);
        }
      }
    }
  }

  for (const child of Array.from(doc.body.childNodes)) {
    walkNode(child);
  }

  while (lines.length > 0 && lines[0] === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}
