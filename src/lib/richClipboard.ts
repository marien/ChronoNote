import { BULLET_CLASS } from "./grammar/symbols";
import { indentLen, parseNumberedItem } from "./tokens";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ListLineInfo {
  type: "ul" | "ol";
  indent: number;
  text: string;
  startNum: number;
}

function parseListLine(line: string): ListLineInfo | null {
  // Only match bullet when followed by whitespace or end of line (requiring a space or space-only)
  const isBulletDashOrStar = new RegExp(String.raw`^([ \t]*)(${BULLET_CLASS})(?:\s+(.*)|\s+$)`).exec(line);
  if (isBulletDashOrStar) {
    const indent = isBulletDashOrStar[1];
    const itemText = isBulletDashOrStar[3] !== undefined ? isBulletDashOrStar[3].trim() : "";
    return {
      type: "ul",
      indent: indentLen(indent),
      text: itemText,
      startNum: 1,
    };
  }

  const numItem = parseNumberedItem(line);
  if (numItem) {
    const startNum = numItem.numbers[numItem.numbers.length - 1];
    return {
      type: "ol",
      indent: indentLen(numItem.indent),
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
  const stack: { type: "ul" | "ol"; indent: number }[] = [];

  function closeDownTo(targetIndent: number) {
    while (stack.length > 0 && stack[stack.length - 1].indent > targetIndent) {
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
      if (line.trim() === "") {
        closeAll();
        output += "<div><br></div>";
        continue;
      }
      const lineIndent = indentLen(line.match(/^[ \t]*/)![0]);
      if (stack.length > 0 && lineIndent > stack[0].indent) {
        // Continuation line inside the current item (or an ancestor item if inner lists were deeper, rule 13).
        while (stack.length > 0 && stack[stack.length - 1].indent >= lineIndent) {
          const top = stack.pop()!;
          output += `</li></${top.type}>`;
        }
        output += `<br>${escapeHtml(line.trim())}`;
      } else {
        closeAll();
        const rest = line.replace(/^[ \t]*/, "");
        const leadingNbsp = "&nbsp;".repeat(lineIndent);
        output += `<div>${leadingNbsp}${escapeHtml(rest)}</div>`;
      }
    } else {
      // List line
      closeDownTo(item.indent);

      if (stack.length > 0 && stack[stack.length - 1].indent === item.indent) {
        if (stack[stack.length - 1].type === item.type) {
          output += "</li>";
        } else {
          const top = stack.pop()!;
          output += `</li></${top.type}>`;
        }
      }

      if (stack.length === 0 || stack[stack.length - 1].indent < item.indent) {
        if (item.type === "ol" && item.startNum !== 1) {
          output += `<ol start="${item.startNum}">`;
        } else {
          output += `<${item.type}>`;
        }
        stack.push({ type: item.type, indent: item.indent });
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
  const rawLines: { text: string; pre: boolean }[] = [];
  let current = "";

  function flush() {
    rawLines.push({ text: current, pre: false });
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
    if (tag === "PRE") {
      if (current.trim() !== "") {
        flush();
      } else {
        current = "";
      }
      const preText = (el.textContent || "").replace(/\r/g, "");
      for (const preLine of preText.split("\n")) {
        rawLines.push({ text: preLine.replace(/\u00a0/g, " "), pre: true });
      }
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
      } else if (rawLines.length === 0 || rawLines[rawLines.length - 1].text !== "") {
        if (el.childNodes.length === 0 || el.textContent?.trim() === "") {
          rawLines.push({ text: "", pre: false });
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

  return rawLines.map(({ text, pre }) => {
    if (pre) return text.replace(/\r/g, "");
    let l = text.replace(/\r/g, "");
    l = l.replace(/[ \t\n]+/g, " ");
    l = l.replace(/\u00a0/g, " ");
    l = l.replace(/^[ ]+/, "");
    return l.trimEnd();
  });
}

function hasDirectCheckbox(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toUpperCase();
    if (tag === "UL" || tag === "OL" || tag === "LI") continue;
    if (tag === "INPUT" && (child.getAttribute("type") || "").toLowerCase() === "checkbox") return true;
    if (hasDirectCheckbox(child)) return true;
  }
  return false;
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
  interface ParentListItem {
    isNumbered: boolean;
    number: number;
    indent: string;
  }
  const parentStack: ParentListItem[] = [];
  let wordParents: ParentListItem[] = [];
  let ariaParents: ParentListItem[] = [];

  function indentForDepth(depth: number): string {
    if (depth <= 0) return "";
    for (let k = depth - 1; k >= 0; k--) {
      const p = ariaParents[k];
      if (p) {
        const step = p.isNumbered ? " ".repeat(String(p.number).length + 2) : "  ";
        return p.indent + step + "  ".repeat(depth - 1 - k);
      }
    }
    return "  ".repeat(depth);
  }

  function processListContainer(listEl: Element) {
    wordCounters = [];
    wordParents = [];
    const isOl = listEl.tagName === "OL";
    const startAttr = listEl.getAttribute("start");
    let counter = isOl ? (startAttr && !isNaN(parseInt(startAttr, 10)) ? parseInt(startAttr, 10) : 1) : 1;
    const ariaCounters: number[] = [];
    let lastAriaDepth = 0;

    let lastLiItem: ParentListItem | null = null;

    for (const child of Array.from(listEl.children)) {
      if (child.tagName === "LI") {
        const ariaRaw = child.getAttribute("aria-level");
        const ariaParsed = ariaRaw !== null ? parseInt(ariaRaw, 10) : NaN;
        if (!isNaN(ariaParsed) && ariaParsed >= 1) {
          const ariaDepth = ariaParsed - 1;
          if (ariaDepth < lastAriaDepth) {
            ariaCounters.length = ariaDepth + 1;
          }
          lastAriaDepth = ariaDepth;
          if (ariaCounters[ariaDepth] === undefined) {
            ariaCounters[ariaDepth] = ariaDepth === 0 ? counter : 1;
          }
          const itemCounter = ariaCounters[ariaDepth];
          lastLiItem = processLi(child as Element, isOl, itemCounter, ariaDepth);
          if (isOl) {
            const valAttr = child.getAttribute("value");
            const nextVal = valAttr && !isNaN(parseInt(valAttr, 10)) ? parseInt(valAttr, 10) + 1 : lastLiItem.number + 1;
            ariaCounters[ariaDepth] = nextVal;
            if (ariaDepth === 0) counter = nextVal;
          }
        } else {
          lastLiItem = processLi(child as Element, isOl, counter);
          if (isOl) {
            if (child.hasAttribute("value") && !isNaN(parseInt(child.getAttribute("value")!, 10))) {
              counter = parseInt(child.getAttribute("value")!, 10) + 1;
            } else {
              counter++;
            }
          }
        }
      } else if (child.tagName === "UL" || child.tagName === "OL") {
        if (lastLiItem !== null) {
          parentStack.push(lastLiItem);
          processListContainer(child as Element);
          parentStack.pop();
        } else {
          processListContainer(child as Element);
        }
      } else {
        walkNode(child);
      }
    }
  }

  function processLi(li: Element, isParentOl: boolean, currentCounter: number, ariaDepth?: number): ParentListItem {
    const isCheckbox = hasDirectCheckbox(li);
    const isNumbered = !isCheckbox && isParentOl;
    let number = currentCounter;
    if (isNumbered && li.hasAttribute("value") && !isNaN(parseInt(li.getAttribute("value")!, 10))) {
      number = parseInt(li.getAttribute("value")!, 10);
    }

    let indent = "";
    if (ariaDepth !== undefined) {
      indent = indentForDepth(ariaDepth);
    } else if (parentStack.length > 0) {
      const p = parentStack[parentStack.length - 1];
      if (p.isNumbered) {
        indent = p.indent + " ".repeat(String(p.number).length + 2);
      } else {
        indent = p.indent + "  ";
      }
    }

    const markerStr = isNumbered ? `${number}. ` : "- ";
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

    const currentItemInfo: ParentListItem = { isNumbered, number, indent };
    const effectiveDepth = ariaDepth ?? parentStack.length;
    ariaParents[effectiveDepth] = currentItemInfo;
    ariaParents.length = effectiveDepth + 1;

    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child.nodeName === "UL" || child.nodeName === "OL")) {
        flushItemNodes();
        parentStack.push(currentItemInfo);
        processListContainer(child as Element);
        parentStack.pop();
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

    return currentItemInfo;
  }

  function walkNode(node: Node) {
    if (node.nodeType === Node.COMMENT_NODE) return;
    if (node.nodeType === Node.TEXT_NODE) {
      let t = node.nodeValue || "";
      t = t.replace(/<!?\[(?:if|endif)[^\]]*\]>?/gi, "");
      t = t.replace(/[ \t\n]+/g, " ").replace(/\u00a0/g, " ").replace(/^[ ]+/, "").trimEnd();
      if (t !== "") {
        wordCounters = [];
        wordParents = [];
        ariaParents = [];
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
      ariaParents = [];
      const level = parseInt(msoMatch[1], 10);
      const depth = Math.max(0, level - 1);

      const ignoreSpan = Array.from(el.querySelectorAll("span")).find(s =>
        /mso-list:[^;"']*ignore/i.test(s.getAttribute("style") || "")
      );

      const itemLines = extractLines(el, { ignoreSpan });
      let markerRaw = ignoreSpan ? (ignoreSpan.textContent || "").trim() : "";
      if (!ignoreSpan && itemLines.length > 0) {
        const visibleNum = itemLines[0].match(/^(\(?([0-9]+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)])(?:[ ]+(.*)|$)$/);
        if (visibleNum) {
          markerRaw = visibleNum[1];
          const rest = (visibleNum[3] ?? "").replace(/^[ ]+/, "");
          if (rest !== "" || itemLines.length > 1) {
            itemLines[0] = rest;
          } else {
            itemLines.shift();
          }
        } else {
          const visibleBullet = itemLines[0].match(/^(?:[•·‣◦▪▫\-*\uF0B7\uF0A7]|o(?=[ ]{2,}))(?:[ ]+(.*)|$)$/);
          if (visibleBullet) {
            const rest = (visibleBullet[1] ?? "").replace(/^[ ]+/, "");
            if (rest !== "" || itemLines.length > 1) {
              itemLines[0] = rest;
            } else {
              itemLines.shift();
            }
          }
        }
      }
      const numMatch = markerRaw.match(/^\(?([0-9]+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)]$/);

      let markerStr = "- ";
      let isNumbered = false;
      let itemNumber = 1;

      wordCounters.length = depth + 1;
      wordParents.length = depth + 1;

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

      let indent = "";
      if (depth > 0) {
        const p = wordParents[depth - 1];
        if (p && p.isNumbered) {
          indent = p.indent + " ".repeat(String(p.number).length + 2);
        } else {
          indent = (p ? p.indent : "") + "  ";
        }
      }
      wordParents[depth] = { isNumbered, number: itemNumber, indent };

      const continuationIndent = isNumbered
        ? indent + " ".repeat(String(itemNumber).length + 2)
        : indent + "  ";

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
      wordParents = [];
      ariaParents = [];
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
      ariaParents = [];
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
