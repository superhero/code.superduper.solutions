<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import "../ui/menu.css";
  import { ContextMenu } from "bits-ui";
  import type { Snippet } from "svelte";
  import MaterialIcon from "../MaterialIcon.svelte";

  let { disabled = false, oncreate, child: renderTrigger }: {
    disabled?: boolean;
    oncreate(): void;
    child: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();

  let open = $state(false);
  let trigger = $state<HTMLElement | null>(null);
  let restoreFocus = true;

  $effect(() => { if (disabled) open = false; });

  function isBackground(event: Event) {
    const target = event.target;
    if (!(target instanceof Element) || !trigger?.contains(target)) return false;
    // Existing controls retain their own menus, including native text-input actions.
    if (target.closest('a, button, input, textarea, select, [contenteditable], [role="treeitem"], [data-file-context-target]')) return false;
    const nestedTrigger = target.closest("[data-context-menu-trigger]");
    return !nestedTrigger || nestedTrigger === trigger;
  }

  function triggerProps(props: Record<string, unknown>) {
    return {
      ...props,
      oncontextmenu(event: MouseEvent) {
        if (disabled || event.defaultPrevented || !isBackground(event)) return;
        restoreFocus = true;
        event.stopPropagation();
        (props.oncontextmenu as (event: MouseEvent) => void)(event);
      },
      onpointerdown(event: PointerEvent) {
        if (!isBackground(event)) return;
        restoreFocus = true;
        (props.onpointerdown as (event: PointerEvent) => void)(event);
      },
      onkeydown(event: KeyboardEvent) {
        if (disabled || !trigger || event.target !== trigger || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = trigger.getBoundingClientRect();
        trigger.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true, cancelable: true, button: 2,
          clientX: bounds.left + 12, clientY: bounds.top + 12,
        }));
      },
    };
  }
</script>

<ContextMenu.Root bind:open>
  <ContextMenu.Trigger bind:ref={trigger} {disabled} tabindex={-1} aria-label="Repository explorer">
    {#snippet child({ props })}
      {@render renderTrigger({ props: triggerProps(props) })}
    {/snippet}
  </ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Content class="menu-content repository-context-menu" aria-label="Repository actions"
      collisionPadding={8} sideOffset={4}
      onInteractOutside={() => { restoreFocus = false; }}
      onCloseAutoFocus={event => { if (!restoreFocus || disabled) event.preventDefault(); }}>
      <ContextMenu.Item class="menu-item" {disabled} onSelect={() => {
        restoreFocus = false;
        oncreate();
      }}>
        <MaterialIcon name="note_add" size={16} />New file
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
