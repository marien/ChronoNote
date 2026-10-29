/** The website's "Try it" links (website redesign, §440): open the live demo straight on one feature.
 *
 * `demo-app/?try=<feature>` runs it once the app has booted; a page that already shows the demo in a frame sends
 * `{ type: "chrononote-try", feature }` (or `{ type: "chrononote-theme", mode }`) with `postMessage` instead, so
 * switching features does not reload the demo. Messages are only taken from the demo's own origin: the website and
 * the demo are served from the same host. Unknown features are ignored. Demo-only (`src/main-demo.ts`). */
import { get } from "svelte/store";
import * as controller from "../controller";
import { openActionDrawer, openActionDrawerDueView } from "../actions";
import { openMeetingHistory } from "../history";
import { openWeekReview } from "../weekReview";
import { openCrossTabSearch } from "../search";
import { openCommandPalette } from "../commandPalette";
import { openDatePicker } from "../tabs";
import { setThemeMode } from "../boot";
import { listSections } from "../tokens";
import { todayISO } from "../date";

export const TRY_FEATURES = ["today", "actions", "history", "week", "search", "palette", "date", "due", "zen"] as const;
export type TryFeature = (typeof TRY_FEATURES)[number];

/** The section the history example opens on (it recurs monthly in the demo notes, `scenarios.ts`). */
const HISTORY_SECTION = "Church community committee";
/** What the search example looks for. */
const SEARCH_QUERY = "has:@Joan is:open";

export function isTryFeature(value: unknown): value is TryFeature {
  return typeof value === "string" && (TRY_FEATURES as readonly string[]).includes(value);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves once the editor is mounted on a tab, or gives up after about five seconds. */
async function whenReady(): Promise<boolean> {
  for (let i = 0; i < 100; i++) {
    if (controller.editorApi && get(controller.tabs).length > 0) return true;
    await sleep(50);
  }
  return false;
}

/** Waits for an element the feature's modal renders. */
async function waitFor<T extends Element>(selector: string): Promise<T | null> {
  for (let i = 0; i < 40; i++) {
    const el = document.querySelector<T>(selector);
    if (el) return el;
    await sleep(25);
  }
  return null;
}

/** The demo's today tab, made active (the visitor may have switched tabs). */
function showToday() {
  const today = get(controller.tabs).find((t) => t.filename === `${todayISO()}.txt`);
  if (today && get(controller.activeTabId) !== today.id) controller.switchTab(today.id);
}

export async function runTryFeature(feature: TryFeature): Promise<void> {
  if (!(await whenReady())) return;
  controller.closeAllModals();
  controller.isZenMode.set(false);
  showToday();
  await sleep(0);
  const api = controller.editorApi;
  if (!api) return;
  switch (feature) {
    case "today": {
      const lines = api.getContent().split("\n");
      api.jumpToLine(lines.length - 1);
      const view = api.getView?.();
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } });
      api.focus();
      return;
    }
    case "actions":
      return openActionDrawer();
    case "due":
      return openActionDrawerDueView();
    case "history": {
      const section = listSections(api.getContent()).find((s) => s.title === HISTORY_SECTION);
      if (section) api.jumpToLine(section.lineIdx);
      return openMeetingHistory();
    }
    case "week":
      return openWeekReview();
    case "search": {
      openCrossTabSearch();
      const input = await waitFor<HTMLInputElement>("[role='dialog'] input.modal-input");
      if (input) {
        input.value = SEARCH_QUERY;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    case "palette":
      return openCommandPalette();
    case "date":
      return openDatePicker();
    case "zen":
      controller.isZenMode.set(true);
      api.focus();
      return;
  }
}

/** Reads `?try=` (`?theme=` is read by `bootMock.ts`), listens for the website's messages, and tells the page around
 * it, when there is one, that it is listening (`chrononote-demo-ready`). */
export function installDemoTry(params: URLSearchParams) {
  const first = params.get("try");
  if (isTryFeature(first)) void runTryFeature(first);
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.origin !== location.origin || !e.data || typeof e.data !== "object") return;
    const { type, feature, mode } = e.data as { type?: string; feature?: unknown; mode?: unknown };
    if (type === "chrononote-try" && isTryFeature(feature)) void runTryFeature(feature);
    if (type === "chrononote-theme" && (mode === "light" || mode === "dark" || mode === "system")) void setThemeMode(mode);
  });
  if (window.parent !== window) window.parent.postMessage({ type: "chrononote-demo-ready" }, location.origin);
}
