/** Entry point the dev-only `?mock` branch in `src/main.ts` calls. Kept in
 * one function here (rather than inline in `main.ts`) so `main.ts`'s
 * production path stays a two-liner and the whole `testing/` tree is
 * clearly behind a single dynamic import. Testing-only. */
import { get } from "svelte/store";
import * as controller from "../controller";
import { installMockTauri, type MockBackend, type MockSeed } from "./mockBackend";
import { scenario, SCENARIO_NAMES, type ScenarioName } from "./scenarios";

/** Resolves a seed and installs the mock Tauri backend.
 *
 * Priority:
 *   1. `window.__CHRONO_SEED__` — set by Playwright via `addInitScript`
 *      before any page script runs. Full control, per test.
 *   2. `?scenario=<name>` — a named scenario from `scenarios.ts`, for
 *      driving the app by hand (`npm run dev` then
 *      `localhost:1420/?mock&scenario=busy-week`).
 *   3. nothing — the `empty` scenario (first-launch, no notes).
 */
export function bootMockBackend(params: URLSearchParams): MockBackend {
  let seed: MockSeed | undefined = window.__CHRONO_SEED__;

  if (!seed) {
    const name = params.get("scenario");
    if (name && (SCENARIO_NAMES as string[]).includes(name)) {
      seed = scenario(name as ScenarioName);
    } else {
      if (name) console.warn(`[mock] unknown scenario "${name}" — falling back to "empty"`);
      seed = scenario("empty");
    }
  }

  const backend = installMockTauri(seed);

  // Live app-state snapshots for assertions the DOM can't cleanly express
  // (a scratchpad's raw text — scratchpads never hit the backend; the
  // exact modal kind; a tab's unsaved content). Dev/mock-only.
  backend.debug = {
    tabs: () => get(controller.tabs),
    activeTabId: () => get(controller.activeTabId),
    activeTab: () => {
      const id = get(controller.activeTabId);
      return get(controller.tabs).find((t) => t.id === id) ?? null;
    },
    modal: () => get(controller.modal),
    statusCounts: () => get(controller.statusCounts),
    // Set the active editor's whole document in one shot — for test
    // "arrange" steps, where typing char-by-char would trip the editor's
    // own smart Enter / bullet-continuation handling.
    setEditorContent: (text: string) => controller.editorApi?.setContent(text),
    getEditorContent: () => controller.editorApi?.getContent() ?? "",
    // §94: run the external-modification check for the active tab on
    // demand — the deterministic stand-in for a real tab-activate /
    // window-focus trigger in exit-barrier-free e2e specs.
    checkDrift: () => controller.checkActiveTabForDrift(),
  };

  console.info(
    `[mock] Tauri backend installed — ${backend.listFiles().length} note file(s) in ${backend.notesDir}`,
  );
  return backend;
}
