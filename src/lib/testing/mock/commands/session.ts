import type { MockBackend } from "../../mockBackend";
import { pruneAutoAddedMeetings } from "../../../sessionMeetings";
import type { CommandArgs, CommandReturn } from "../../../tauriCommands";
import type { TabSession } from "../../../types";

export function readTabSession(backend: MockBackend): CommandReturn<"read_tab_session"> {
  return backend.dir().session;
}

export function writeTabSession(
  backend: MockBackend,
  { openTabs, activeTab, lastOpenedDate, autoAddedMeetings }: CommandArgs<"write_tab_session">,
): CommandReturn<"write_tab_session"> {
  const pruned = pruneAutoAddedMeetings(autoAddedMeetings, lastOpenedDate);
  const session: TabSession = {
    schemaVersion: 1,
    openTabs: openTabs ?? [],
    activeTab: activeTab ?? null,
    lastOpenedDate: lastOpenedDate ?? null,
  };
  if (pruned) {
    session.autoAddedMeetings = pruned;
  }
  backend.dir().session = session;
}

export function saveScratchpadDrafts(
  backend: MockBackend,
  { drafts }: CommandArgs<"save_scratchpad_drafts">,
): CommandReturn<"save_scratchpad_drafts"> {
  backend.scratchpadDrafts = { ...drafts };
}

export function loadScratchpadDrafts(backend: MockBackend): CommandReturn<"load_scratchpad_drafts"> {
  return { ...backend.scratchpadDrafts };
}
