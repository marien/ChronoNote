// @vitest-environment jsdom
/** §535: the website's previews (`website/site.js`, `CN.render`) are drawn by a small renderer of their own, not the
 * app's code. This keeps it to the app's rules: for every line below, the marks it draws, in order, must be the tokens
 * `tokenizeLine` finds (boxes, circles, bullets, arrows, names, topic tags, due dates, forward links, emphasis). */
import { beforeAll, describe, expect, it } from "vitest";
import { tokenizeLine } from "./grammar/tokenize";
import siteScript from "../../website/site.js?raw";

type Render = (line: string) => DocumentFragment;
let render: Render;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  // Indirect eval: run the site script at global scope, as a <script> tag would.
  (0, eval)(siteScript);
  render = (window as unknown as { CN: { render: Render } }).CN.render;
});

const BOX = new Set(["#", "v", ">", "x"]);

/** The app's tokens as a list of marks. `paren` and `dueWord` are plain text in the app too. */
function appMarks(line: string): string[] {
  const out: string[] = [];
  for (const t of tokenizeLine(line)) {
    const text = line.slice(t.from, t.to);
    switch (t.kind) {
      case "action":
      case "topic":
      case "consequence":
      case "consequenceTopic":
        out.push(`${BOX.has(t.symbol!) ? "box" : "ring"}:${t.symbol}`);
        break;
      case "bullet": out.push("bullet"); break;
      case "arrow": out.push("arrow"); break;
      case "assignee": out.push(`name:${text.replace(/^=>\s+/, "")}`); break;
      case "topicTag": out.push(`tag:${text.slice(1, -1)}`); break;
      case "due": out.push(`due:${t.date}`); break;
      case "forwardLink": out.push(`fwd:${t.dir}${t.date}${t.section !== undefined ? "#" + t.section : ""}`); break;
      case "emphasis": out.push("emph"); break;
      case "escape": out.push("escape"); break;
    }
  }
  return out;
}

/** The marks the website draws, in document order. */
function siteMarks(line: string): string[] {
  const host = document.createElement("div");
  host.append(render(line));
  const out: string[] = [];
  host.querySelectorAll("*").forEach((el) => {
    const c = el.classList;
    const ink = el.querySelector(".ink")?.textContent ?? "";
    if (c.contains("g-open") || c.contains("g-done") || c.contains("g-defer") || c.contains("g-cancel")) out.push(`box:${ink}`);
    else if ([...c].some((k) => k.startsWith("g-topic-"))) out.push(`ring:${ink}`);
    else if (c.contains("g-bullet")) out.push("bullet");
    else if (c.contains("g-follow")) out.push("arrow");
    else if (c.contains("badge")) out.push(`name:${el.textContent}`);
    else if (c.contains("tag")) out.push(`tag:${el.textContent!.slice(1, -1)}`);
    else if (c.contains("due")) out.push(`due:${el.textContent!.slice(3)}`);
    else if (c.contains("fwd")) out.push(`fwd:${el.textContent!.slice(1, 2)}${el.textContent!.slice(2, -1)}`);
    else if (c.contains("emph")) out.push("emph");
    else if (c.contains("esc")) out.push("escape");
  });
  return out;
}

const LINES = [
  "# call the printer",
  "v call the printer",
  "> call the printer",
  "x call the printer",
  "  # indented action",
  "=> they agreed on May",
  "=> @Joan finds referees",
  "=>  @Joan two spaces",
  "o coffee rota (@Ruth, @Ben)",
  "o sync (@Dana/@Lee)",
  "=> # send the minutes",
  "=> v sent",
  "=> o raise it next time",
  "# (market) stall rota",
  "x (market) dropped",
  "# order the kit by:2026-11-26",
  "v order the kit by:2026-11-20",
  "o budget by:2026-11-26",
  "plain note by:2026-11-26",
  "! The pitch is ours until 16:00",
  "! - bring chairs",
  "# ! urgent action",
  "o spring tournament",
  ". spring tournament",
  ", spring tournament",
  "- bring the keys",
  "* a star bullet",
  "# - an action bullet",
  "1. welcome and agenda",
  "> call Sam (>2026-12-01#Committee)",
  "# book the hall (<2026-10-27#Committee)",
  "see (>2026-12-01)",
  "\\# not an action",
  ". budget => # send figures",
  ". budget by:2026-11-20 => # send by:2026-11-20",
  "=> follow-up by:2026-11-20",
  "# ask @René => @Zoë/@Ann",
  "mail dana@example.com, see x.y/@a/@b and/@c",
  "# task => @dana check",
  "a (word) here and (two words) there",
  "# (a) (b) second paren",
];

describe("website preview renderer (§535)", () => {
  it.each(LINES)("draws the app's marks for %j", (line) => {
    expect(siteMarks(line)).toEqual(appMarks(line));
  });

  it("keeps markup typed into a line as text: the lines are built as DOM nodes, never parsed as HTML", () => {
    const host = document.createElement("div");
    host.append(render('# <img src=x onerror="alert(1)"> & <b>bold</b> @a'));
    expect(host.querySelector("img, b")).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror="alert(1)"> & <b>bold</b>');
  });

  it("colours a due date as the app does: later, today, overdue, and grey once its action is resolved", () => {
    const iso = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const status = (line: string) => {
      const host = document.createElement("div");
      host.append(render(line));
      return [...host.querySelectorAll(".due")].map((el) => [...el.classList].find((c) => c !== "due"));
    };
    expect(status(`# a by:${iso(3)}`)).toEqual(["due-later"]);
    expect(status(`# a by:${iso(0)}`)).toEqual(["due-today"]);
    expect(status(`# a by:${iso(-1)}`)).toEqual(["due-overdue"]);
    expect(status(`v a by:${iso(-1)}`)).toEqual(["due-resolved"]);
    expect(status(`. budget by:${iso(-1)} => # send by:${iso(-1)}`)).toEqual(["due-overdue"]);
  });
});
