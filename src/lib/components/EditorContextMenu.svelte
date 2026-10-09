<script lang="ts">
  import { onMount, tick } from "svelte";
  import { editorContextMenu, editorApi, backendKind, type EditorApi } from "../stores";
  import * as controller from "../controller";
  import { t } from "../i18n";
  import { formatShortcut } from "../shortcuts";
  import Icon from "../icons/Icon.svelte";

  let menuEl = $state<HTMLDivElement>();

  function close() {
    editorContextMenu.set(null);
  }

  const run = (fn: (api: EditorApi) => void) => {
    close();
    editorApi?.focus();
    if (editorApi) fn(editorApi);
  };

  const isSelectionEmpty = $derived.by(() => {
    if (!$editorContextMenu) return true;
    const selRange = editorApi?.getSelectionRange?.();
    return !selRange || selRange.anchor === selRange.head;
  });

  const line = $derived($editorContextMenu?.line ?? "");
  const isAction = $derived(/^\s*(=>\s)?[#vx>]\s/.test(line));
  const isTopic = $derived(/^\s*[o.,]\s/.test(line));

  const lineItemCount = $derived(isAction ? 4 : isTopic ? 3 : 2);
  const otherItemCount = $derived($backendKind === "desktop" ? 4 : 3);
  const itemCount = $derived(1 + lineItemCount + otherItemCount);

  let contextPos = $derived.by(() => {
    if (!$editorContextMenu) return { x: 8, y: 8 };
    const menuWidth = 260;
    const menuHeight = itemCount * 32 + 48;
    const x = Math.min($editorContextMenu.x, window.innerWidth - menuWidth - 8);
    const y = Math.min($editorContextMenu.y, window.innerHeight - menuHeight - 8);
    return { x: Math.max(8, x), y: Math.max(8, y) };
  });

  onMount(() => {
    tick().then(() => {
      const items = Array.from(menuEl?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      items[0]?.focus();
    });

    const scroller = document.querySelector(".cm-scroller");
    scroller?.addEventListener("scroll", close, { passive: true });
    return () => {
      scroller?.removeEventListener("scroll", close);
    };
  });

  function handlePointerDown(e: PointerEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) {
      close();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = Array.from(menuEl?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      if (items.length === 0) return;
      const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);
      let nextIdx = 0;
      if (currentIdx !== -1) {
        nextIdx = e.key === "ArrowDown"
          ? (currentIdx + 1) % items.length
          : (currentIdx - 1 + items.length) % items.length;
      } else {
        nextIdx = e.key === "ArrowDown" ? 0 : items.length - 1;
      }
      items[nextIdx]?.focus();
    }
  }

  async function handlePaste() {
    close();
    try {
      const text = await navigator.clipboard.readText();
      editorApi?.focus();
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      document.querySelector(".cm-content")?.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      );
    } catch {
      // If readText rejects, show nothing and just close.
    }
  }
</script>

<!-- Capture phase: the menu takes Escape before the app's own window handler,
     which would otherwise also leave Zen or Peek on the same key press. -->
<svelte:window
  onkeydowncapture={handleKeydown}
  onpointerdown={handlePointerDown}
  onblur={close}
  onresize={close}
/>

{#if $editorContextMenu}
  <div
    class="editor-context-menu"
    bind:this={menuEl}
    style="top: {contextPos.y}px; left: {contextPos.x}px;"
    role="menu"
    tabindex="-1"
    aria-label={$t("editorMenu.ariaLabel")}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <div class="editor-context-icon-row" role="group" aria-label={$t("editorMenu.clipboard")}>
      <button
        type="button"
        class="editor-context-icon-btn"
        aria-label={$t("editorMenu.cut")}
        title={$t("editorMenu.cut")}
        disabled={isSelectionEmpty}
        onclick={() => {
          close();
          editorApi?.focus();
          document.execCommand("cut");
        }}
      >
        <Icon name="edit" size={14} />
      </button>
      <button
        type="button"
        class="editor-context-icon-btn"
        aria-label={$t("editorMenu.copy")}
        title={$t("editorMenu.copy")}
        disabled={isSelectionEmpty}
        onclick={() => {
          close();
          editorApi?.focus();
          document.execCommand("copy");
        }}
      >
        <Icon name="copy" size={14} />
      </button>
      <button
        type="button"
        class="editor-context-icon-btn"
        aria-label={$t("editorMenu.paste")}
        title={$t("editorMenu.paste")}
        onclick={handlePaste}
      >
        <Icon name="import" size={14} />
      </button>
    </div>

    <div class="editor-context-sep" role="separator"></div>

    {#if isAction}
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setActionStateOnSelection?.("#"))}
      >
        <span class="glyph-open">☐</span>
        <span class="editor-context-label">{$t("commandPalette.line.setOpen")}</span>
        <span class="editor-context-key">{formatShortcut("setActionOpen")}</span>
      </button>
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setActionStateOnSelection?.("v"))}
      >
        <span class="glyph-done">☑</span>
        <span class="editor-context-label">{$t("commandPalette.line.setDone")}</span>
        <span class="editor-context-key">{formatShortcut("setActionDone")}</span>
      </button>
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setActionStateOnSelection?.(">"))}
      >
        <span class="glyph-progress">☐</span>
        <span class="editor-context-label">{$t("commandPalette.line.setDeferred")}</span>
        <span class="editor-context-key">{formatShortcut("setActionDeferred")}</span>
      </button>
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setActionStateOnSelection?.("x"))}
      >
        <span class="glyph-cancelled">☒</span>
        <span class="editor-context-label">{$t("commandPalette.line.setWontDo")}</span>
        <span class="editor-context-key">{formatShortcut("setActionWontDo")}</span>
      </button>
    {:else if isTopic}
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setTopicStateOnSelection?.("o"))}
      >
        <span class="glyph-topic-open">○</span>
        <span class="editor-context-label">{$t("commandPalette.line.setTopicToDiscuss")}</span>
        <span class="editor-context-key">{formatShortcut("setTopicToDiscuss")}</span>
      </button>
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setTopicStateOnSelection?.("."))}
      >
        <span class="glyph-topic-done">◉</span>
        <span class="editor-context-label">{$t("commandPalette.line.setTopicDiscussed")}</span>
        <span class="editor-context-key">{formatShortcut("setTopicDiscussed")}</span>
      </button>
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setTopicStateOnSelection?.(","))}
      >
        <span class="glyph-topic-skipped">◌</span>
        <span class="editor-context-label">{$t("commandPalette.line.setTopicNotDiscussed")}</span>
        <span class="editor-context-key">{formatShortcut("setTopicNotDiscussed")}</span>
      </button>
    {:else}
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setActionStateOnSelection?.("#"))}
      >
        <span class="glyph-open">☐</span>
        <span class="editor-context-label">{$t("commandPalette.line.setOpen")}</span>
        <span class="editor-context-key">{formatShortcut("setActionOpen")}</span>
      </button>
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => run((api) => api.setTopicStateOnSelection?.("o"))}
      >
        <span class="glyph-topic-open">○</span>
        <span class="editor-context-label">{$t("commandPalette.line.setTopicToDiscuss")}</span>
        <span class="editor-context-key">{formatShortcut("setTopicToDiscuss")}</span>
      </button>
    {/if}

    <div class="editor-context-sep" role="separator"></div>

    <button
      type="button"
      class="editor-context-item"
      role="menuitem"
      onclick={() => {
        close();
        controller.openMeetingHistory();
      }}
    >
      <Icon name="section-history" size={14} />
      <span class="editor-context-label">{$t("shortcuts.openHistory.label")}</span>
      <span class="editor-context-key">{formatShortcut("openHistory")}</span>
    </button>
    <button
      type="button"
      class="editor-context-item"
      role="menuitem"
      onclick={() => {
        close();
        controller.copySelectionToNextOccurrence();
      }}
    >
      <Icon name="copy" size={14} />
      <span class="editor-context-label">{$t("shortcuts.copyToNextOccurrence.label")}</span>
      <span class="editor-context-key">{formatShortcut("copyToNextOccurrence")}</span>
    </button>
    <button
      type="button"
      class="editor-context-item"
      role="menuitem"
      onclick={() => run((api) => api.convertCurrentLineToSection?.())}
    >
      <Icon name="edit" size={14} />
      <span class="editor-context-label">{$t("shortcuts.convertToSection.label")}</span>
      <span class="editor-context-key">{formatShortcut("convertToSection")}</span>
    </button>
    {#if $backendKind === "desktop"}
      <button
        type="button"
        class="editor-context-item"
        role="menuitem"
        onclick={() => {
          close();
          controller.togglePeek();
        }}
      >
        <Icon name="peek" size={14} />
        <span class="editor-context-label">{$t("commandPalette.togglePeekMode")}</span>
        <span class="editor-context-key">{formatShortcut("togglePeekMode")}</span>
      </button>
    {/if}
  </div>
{/if}
