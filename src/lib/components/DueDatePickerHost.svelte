<script lang="ts">
  import CompactDatePicker from "./CompactDatePicker.svelte";
  import { activeTabId, dueDatePending, editorApi, tabs } from "../stores";
  import { setDueDateAt } from "../dueDateCommands";
  import { tokenizeLine, getLineActionParts } from "../grammar/tokenize";
  import { dueWordExtra, parseDueWord, todayISO } from "../date";
  import { t, locale } from "../i18n";

  const currentDueDate = $derived.by(() => {
    const pending = $dueDatePending;
    if (!pending) return null;
    let lineText: string | undefined;
    const view = editorApi?.getView?.();
    if (view && pending.tabId === $activeTabId) {
      if (pending.lineIdx >= 0 && pending.lineIdx < view.state.doc.lines) {
        const docLine = view.state.doc.line(pending.lineIdx + 1);
        lineText = docLine.text;
      }
    } else {
      const tab = $tabs.find((t) => t.id === pending.tabId);
      if (tab) {
        lineText = tab.content.split("\n")[pending.lineIdx];
      }
    }
    if (lineText !== undefined) {
      const tokens = tokenizeLine(lineText);
      const parts = getLineActionParts(lineText, tokens);
      const part = parts.find((p) => pending.partFrom >= p.from && pending.partFrom < p.to);
      if (part) {
        const dueTok = tokens.find(
          (t) => (t.kind === "due" || t.kind === "dueWord") && t.from >= part.from && t.from < part.to,
        );
        if (dueTok?.kind === "due" && dueTok.date) {
          return dueTok.date;
        }
        if (dueTok?.kind === "dueWord" && dueTok.word) {
          const extra = dueWordExtra(
            $t("dueDate.words.today", undefined) ?? "",
            $t("dueDate.words.tomorrow", undefined) ?? "",
          );
          const parsed = parseDueWord(dueTok.word, todayISO(), $locale, extra);
          if (parsed) return parsed;
        }
      }
    }
    return null;
  });

  function handlePick(iso: string | null) {
    const pending = $dueDatePending;
    if (!pending) return;
    const { tabId, lineIdx, partFrom } = pending;
    dueDatePending.set(null);
    setDueDateAt(tabId, lineIdx, partFrom, iso);
    editorApi?.focus();
  }

  function handleClose() {
    dueDatePending.set(null);
    editorApi?.focus();
  }
</script>

{#if $dueDatePending}
  <CompactDatePicker
    anchor={$dueDatePending.anchor}
    value={currentDueDate}
    noneLabel={$t("dueDate.picker.none")}
    onPick={handlePick}
    onClose={handleClose}
  />
{/if}
