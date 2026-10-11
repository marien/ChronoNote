<script lang="ts">
  import { onMount } from "svelte";
  import { focusTrap } from "../../actions/focusTrap";
  import { closeOnOutsideClick } from "../../actions/closeOnOutsideClick";
  import Segmented from "../Segmented.svelte";
  import { t } from "../../i18n";
  import { activeTabId, tabs } from "../../stores";
  import {
    closeExportModal,
    copyExportMarkdown,
    exportTargetTab,
    saveExport,
  } from "../../exportNotes";
  import { todayISO } from "../../date";

  let saveBtn = $state<HTMLButtonElement>();

  let scope = $state<"note" | "range">("note");
  let format = $state<"md" | "html">("md");

  const currentTargetTab = $derived(
    $exportTargetTab ?? $tabs.find((t) => t.id === $activeTabId) ?? $tabs[0],
  );

  function computeInitialRange(): { from: string; to: string } {
    const fn = currentTargetTab?.filename ?? "";
    const m = fn.match(/^(\d{4})-(\d{2})/);
    const dateStr = m ? `${m[1]}-${m[2]}-01` : todayISO();
    const [yStr, mStr] = dateStr.slice(0, 7).split("-");
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      from: `${year}-${String(month).padStart(2, "0")}-01`,
      to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }

  const initialRange = computeInitialRange();
  let fromDate = $state(initialRange.from);
  let toDate = $state(initialRange.to);

  onMount(() => {
    saveBtn?.focus();
  });

  const scopeOptions = $derived([
    { value: "note", label: $t("export.scope.note") },
    { value: "range", label: $t("export.scope.range") },
  ]);

  const formatOptions = [
    { value: "md", label: "Markdown" },
    { value: "html", label: "HTML" },
  ];

  async function handleSave() {
    await saveExport({
      scope,
      format,
      fromDate,
      toDate,
      targetTab: currentTargetTab,
    });
  }

  async function handleCopy() {
    await copyExportMarkdown({
      scope,
      fromDate,
      toDate,
      targetTab: currentTargetTab,
    });
  }
</script>

<div class="overlay" role="presentation" use:closeOnOutsideClick={closeExportModal}>
  <div
    class="modal-card modal-sm dialog-card export-modal"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-label={$t("export.title")}
  >
    <div class="dialog-body">
      <h2 class="dialog-title">{$t("export.title")}</h2>

      <div class="export-section">
        <Segmented
          options={scopeOptions}
          value={scope}
          onChange={(v) => (scope = v as "note" | "range")}
        />
      </div>

      {#if scope === "range"}
        <div class="export-range-inputs">
          <label class="export-date-field">
            <span class="export-label">{$t("export.from")}</span>
            <input
              type="date"
              class="modal-input"
              bind:value={fromDate}
              aria-label={$t("export.from")}
            />
          </label>
          <label class="export-date-field">
            <span class="export-label">{$t("export.to")}</span>
            <input
              type="date"
              class="modal-input"
              bind:value={toDate}
              aria-label={$t("export.to")}
            />
          </label>
        </div>
      {/if}

      <div class="export-section">
        <span class="export-label">{$t("export.format")}</span>
        <Segmented
          options={formatOptions}
          value={format}
          onChange={(v) => (format = v as "md" | "html")}
        />
      </div>
    </div>

    <div class="dialog-buttons">
      <button
        type="button"
        class="dialog-btn accent"
        bind:this={saveBtn}
        onclick={handleSave}
      >
        {$t("export.save")}
      </button>
      <button
        type="button"
        class="dialog-btn"
        onclick={handleCopy}
      >
        {$t("export.copyMarkdown")}
      </button>
      <button
        type="button"
        class="dialog-btn"
        onclick={closeExportModal}
      >
        {$t("common.cancel")}
      </button>
    </div>
  </div>
</div>

<style>
  .export-section {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .export-range-inputs {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }

  .export-date-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .export-label {
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .modal-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border-radius: var(--radius-control);
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    font-family: inherit;
    font-size: 13px;
  }
</style>
