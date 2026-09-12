/** Cross-tab search (Ctrl/Cmd+Shift+F). Split out of `controller.ts` in the
 * v0.5.0 refactor. "Open" scope scans the live tab contents; "all" scope
 * scans `allNotesCache` (populated by whichever drawer last refreshed it —
 * the Search modal refreshes it before switching scope). */
import { get } from "svelte/store";
import { allNotesCache, modal, searchResultsStore, tabs } from "./stores";
import { compareTabsByRecency, sortFilenamesByRecency } from "./tabSort";
import type { SearchResultItem } from "./types";

export function openCrossTabSearch() {
  searchResultsStore.set([]);
  modal.set("search");
}

export function runSearch(query: string, scope: "open" | "all" = "open") {
  const q = query.trim();
  if (!q) {
    searchResultsStore.set([]);
    return;
  }
  const results: SearchResultItem[] = [];
  if (scope === "open") {
    for (const tab of [...get(tabs)].sort(compareTabsByRecency)) {
      const lines = tab.content.split("\n");
      lines.forEach((line, lineIdx) => {
        if (line.toLowerCase().includes(q.toLowerCase())) {
          results.push({ tabId: tab.id, tabFilename: tab.filename, lineIdx, line });
        }
      });
    }
  } else {
    const allSources = get(allNotesCache);
    const openTabIdByFilename = new Map(get(tabs).filter((t) => !t.isScratchpad).map((t) => [t.filename, t.id]));
    for (const filename of sortFilenamesByRecency(Object.keys(allSources))) {
      const lines = allSources[filename].split("\n");
      lines.forEach((line, lineIdx) => {
        if (line.toLowerCase().includes(q.toLowerCase())) {
          results.push({ tabId: openTabIdByFilename.get(filename), tabFilename: filename, lineIdx, line });
        }
      });
    }
  }
  searchResultsStore.set(results);
}
