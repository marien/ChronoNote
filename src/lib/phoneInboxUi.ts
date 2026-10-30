/** Phone companion phase 2 UI: toasts, command action, modal opener. */
import { get } from "svelte/store";
import { t } from "./i18n";
import { phoneConflicts, phoneInboxRun, processPhoneInbox } from "./phoneInbox";
import { modal, showToast } from "./stores";

let wired = false;

export function openPhoneChanges(): void {
  modal.set("phoneChanges");
}

export function wirePhoneInboxUi(): void {
  if (wired) return;
  wired = true;
  phoneInboxRun.subscribe((run) => {
    if (run && run.applied.length > 0) {
      showToast(get(t)("phoneCompanion.toast.applied", { count: run.applied.length }), {
        action: openPhoneChanges,
      });
    }
  });
}

export async function applyPhoneChangesNow(): Promise<void> {
  const run = await processPhoneInbox();
  if (run && run.applied.length === 0 && run.conflicts.length === 0 && run.rejected.length === 0) {
    showToast(get(t)("phoneCompanion.toast.nothingNew", undefined));
  }
  if (get(phoneConflicts).length > 0) {
    openPhoneChanges();
  }
}

export function resetPhoneInboxUiForTests(): void {
  wired = false;
}
