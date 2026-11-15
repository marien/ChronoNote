import { get } from "svelte/store";
import { activeTabId, editorApi, minutesName, showToast, tabs } from "./stores";
import { locale, t } from "./i18n";
import { noteISODate } from "./noteDateLabel";
import { buildMinutes, type MinutesLabels } from "./minutes";
import { copyRich } from "./clipboardWrite";

/** Copies the section at the caret as rich + plain meeting minutes without modifying the note. */
export async function copyAsMinutes(): Promise<boolean> {
  const translate = get(t);
  const tab = get(tabs).find((x) => x.id === get(activeTabId));
  if (!tab) {
    showToast(translate("minutes.toast.noSection", undefined));
    return false;
  }

  const noteText = editorApi ? editorApi.getContent() : tab.content;
  const lineIdx = editorApi ? editorApi.getCursorLineIdx() : 0;
  const dateISO = tab.isScratchpad ? null : noteISODate(tab.filename);
  const labels: MinutesLabels = {
    decisions: translate("minutes.decisions", undefined),
    actions: translate("minutes.actions", undefined),
    done: translate("minutes.done", undefined),
    stillOpen: translate("minutes.stillOpen", undefined),
    remember: translate("minutes.remember", undefined),
    notDiscussed: translate("minutes.notDiscussed", undefined),
    by: translate("minutes.by", undefined),
  };

  const result = buildMinutes({
    noteText,
    lineIdx,
    dateISO,
    locale: get(locale),
    ownerName: get(minutesName),
    labels,
  });

  if (!result) {
    showToast(translate("minutes.toast.noSection", undefined));
    return false;
  }
  if (result.empty) {
    showToast(translate("minutes.toast.empty", undefined));
    return false;
  }

  const ok = await copyRich(result.html, result.plain);
  if (ok) {
    showToast(translate("minutes.toast.copied", undefined));
    return true;
  }
  showToast(translate("minutes.toast.failed", undefined));
  return false;
}
