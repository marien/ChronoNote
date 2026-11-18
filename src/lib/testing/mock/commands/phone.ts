import type { MockBackend } from "../../mockBackend";
import type { CommandArgs, CommandReturn } from "../../../tauriCommands";

export function writePhoneMeetings(
  backend: MockBackend,
  { content }: CommandArgs<"write_phone_meetings">,
): CommandReturn<"write_phone_meetings"> {
  backend.phoneMeetings = content;
}

export function writePhoneOutbox(
  backend: MockBackend,
  { content }: CommandArgs<"write_phone_outbox">,
): CommandReturn<"write_phone_outbox"> {
  backend.phoneOutbox = content;
}

export function readPhoneInbox(backend: MockBackend): CommandReturn<"read_phone_inbox"> {
  return backend.phoneInbox;
}

export function readSavedSearches(backend: MockBackend): CommandReturn<"read_saved_searches"> {
  const content = backend.dir().savedSearches;
  if (content === null) return null;
  if (new TextEncoder().encode(content).length > 64 * 1024) {
    throw new Error("saved searches too large");
  }
  return content;
}

export function writeSavedSearches(
  backend: MockBackend,
  { content }: CommandArgs<"write_saved_searches">,
): CommandReturn<"write_saved_searches"> {
  backend.dir().savedSearches = content;
}

export function readPhoneLedger(backend: MockBackend): CommandReturn<"read_phone_ledger"> {
  return backend.phoneLedger;
}

export function writePhoneLedger(
  backend: MockBackend,
  { content }: CommandArgs<"write_phone_ledger">,
): CommandReturn<"write_phone_ledger"> {
  backend.phoneLedger = content;
}
