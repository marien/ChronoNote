<script lang="ts">
  import { onMount } from "svelte";
  import { initialKeyTipState, next, type KeyTipEvent, type KeyTipState } from "../keyTips";
  import {
    modal,
    oneDriveFolderPickerOpen,
    syncHealthPopoverOpen,
    editorContextMenu,
  } from "../controller";
  import { overlays } from "../overlays";

  interface BadgeInfo {
    key: string;
    top: number;
    left: number;
  }

  let tipState = $state<KeyTipState>(initialKeyTipState);
  let badges = $state<BadgeInfo[]>([]);

  function updateBadges() {
    const elements = document.querySelectorAll<HTMLElement>("#top-bar [data-keytip]");
    const list: BadgeInfo[] = [];
    for (const el of elements) {
      const key = el.getAttribute("data-keytip");
      if (!key) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;

      list.push({
        key,
        top: rect.bottom,
        left: rect.right,
      });
    }
    badges = list;
  }

  $effect(() => {
    const hasOverlay =
      $modal !== "none" ||
      $overlays.length > 0 ||
      $oneDriveFolderPickerOpen ||
      $syncHealthPopoverOpen ||
      Boolean($editorContextMenu);

    if (hasOverlay && tipState.active) {
      tipState = { active: false, armed: false };
      badges = [];
    }
  });

  $effect(() => {
    if (tipState.active) {
      updateBadges();
    } else {
      badges = [];
    }
  });

  onMount(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (tipState.active) {
        // While tips are on, the key is handled exclusively in capture phase
        e.preventDefault();
        e.stopImmediatePropagation();

        const isAlt = e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight";
        const event: KeyTipEvent = isAlt
          ? {
              type: "altDown",
              code: e.code,
              repeat: e.repeat,
              ctrlKey: e.ctrlKey,
              shiftKey: e.shiftKey,
              metaKey: e.metaKey,
            }
          : {
              type: "otherKeyDown",
              key: e.key,
            };

        const res = next(tipState, event);
        tipState = res.state;

        if (res.action.type === "click") {
          const letter = res.action.letter;
          const target = document.querySelector<HTMLElement>(`#top-bar [data-keytip="${letter}" i]`);
          if (target) {
            target.click();
          }
        }
        return;
      }

      // While tips are off:
      if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") {
        const res = next(tipState, {
          type: "altDown",
          code: e.code,
          repeat: e.repeat,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
        });
        tipState = res.state;
      } else if (tipState.armed) {
        const res = next(tipState, {
          type: "otherKeyDown",
          key: e.key,
        });
        tipState = res.state;
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") {
        // Prevent WebView2 menu focus on Alt release
        if (e.code === "AltLeft" && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
          e.preventDefault();
        }

        const res = next(tipState, {
          type: "altUp",
          code: e.code,
        });
        tipState = res.state;
        if (res.action.type === "show") {
          updateBadges();
        }
      }
    }

    function handleMouseDown() {
      if (tipState.active || tipState.armed) {
        const res = next(tipState, { type: "mouseDown" });
        tipState = res.state;
      }
    }

    function handleBlur() {
      if (tipState.active || tipState.armed) {
        const res = next(tipState, { type: "blur" });
        tipState = res.state;
      }
    }

    function handleResize() {
      if (tipState.active) {
        updateBadges();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("resize", handleResize);
    };
  });
</script>

{#if tipState.active}
  {#each badges as badge (badge.key)}
    <span
      class="keytip"
      style="top: {badge.top}px; left: {badge.left}px; transform: translate(-50%, -50%);"
    >
      {badge.key}
    </span>
  {/each}
{/if}
