<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu } from "bits-ui";
  import MaterialIcon from "./MaterialIcon.svelte";
  import "./ui/menu.css";
  type Action = { label: string; icon: string; onselect(): void };

  let { id, label, value, placeholder, placeholderIcon, items, actions = [], actionGroups = [], disabled = false, matchTriggerWidth = false, searchable = false, side = "bottom", itemLabel, onchoose, onchange }: {
    id?: string;
    label: string;
    value: string;
    placeholder: string;
    placeholderIcon?: string;
    items: { value: string; label: string; icon: string }[];
    itemLabel?: Snippet<[{ value: string; label: string; icon: string }]>;
    actions?: Action[];
    actionGroups?: Action[][];
    disabled?: boolean;
    matchTriggerWidth?: boolean;
    searchable?: boolean;
    side?: "top" | "bottom";
    onchoose?(value: string): void;
    onchange(value: string): void;
  } = $props();
  let open = $state(false);
  let query = $state("");
  const visibleItems = $derived(searchable ? items.filter(item=>item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : items);
  $effect(()=>{if(!open)query="";});
  let trigger = $state<HTMLButtonElement | null>(null);
  let restoreFocus = true;
  const selected = $derived(items.find(item => item.value === value));
  const triggerIcon = $derived(selected?.icon ?? placeholderIcon);
  const groups = $derived([...actionGroups, actions].filter(group => group.length));

  $effect(() => { if (disabled) open = false; });
</script>

<DropdownMenu.Root bind:open onOpenChange={next => { if (next) restoreFocus = true; }}>
  <DropdownMenu.Trigger bind:ref={trigger} {...(id ? { id } : {})} class="navigation-trigger" aria-label={label} data-value={value} {disabled}
    oncontextmenu={event => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      restoreFocus = true;
      open = true;
    }}>
    {#if triggerIcon}<MaterialIcon name={triggerIcon} size={16} />{/if}
    <span class="navigation-label">{selected?.label ?? placeholder}</span><MaterialIcon name={side === "top" ? "expand_less" : "expand_more"} size={16} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class={matchTriggerWidth ? "menu-content navigation-menu match-trigger" : "menu-content navigation-menu"} aria-label={label}
      align="start" {side} sideOffset={6} collisionPadding={8}
      onInteractOutside={event => {
        if (event.target instanceof Node && trigger?.contains(event.target)) {
          event.preventDefault();
          return;
        }
        restoreFocus = false;
      }}
      onCloseAutoFocus={event => { if (!restoreFocus || disabled) event.preventDefault(); }}>
      {#if searchable}<input class="menu-search" aria-label={`Search ${label.toLowerCase()}`} placeholder="Search fonts" bind:value={query} onkeydown={event=>{if(event.key==="Escape"||event.key==="Tab")return;event.stopPropagation();if(event.key==='ArrowDown'){event.preventDefault();event.currentTarget.closest('[role="menu"]')?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus();}}} />{/if}
      <DropdownMenu.RadioGroup bind:value={() => value, next => onchange(next)} aria-label={label}>
        {#each visibleItems as item (item.value)}
          <DropdownMenu.RadioItem class="menu-item" value={item.value} data-value={item.value} textValue={item.label} onSelect={() => onchoose?.(item.value)}>
            <MaterialIcon name={item.icon} size={16} />
            <span class="menu-choice">{#if itemLabel}{@render itemLabel(item)}{:else}{item.label}{/if}</span>
            <span class="menu-check" aria-hidden="true">{#if value === item.value}<MaterialIcon name="check" size={16} />{/if}</span>
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
      {#each groups as group, index}
      {#if items.length || index > 0}<DropdownMenu.Separator class="menu-action-separator" />{/if}
      {#each group as action (action.label)}
        <DropdownMenu.Item class="menu-item" textValue={action.label} onSelect={() => {
          restoreFocus = false;
          action.onselect();
        }}>
          <MaterialIcon name={action.icon} size={16} /><span class="menu-choice">{action.label}</span>
        </DropdownMenu.Item>
      {/each}
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.navigation-trigger) { display: flex; align-items: center; gap: 7px; min-width: 0; width: 100%;
    border: 0; border-radius: 4px; padding: 6px 0; background: transparent; color: inherit;
    font-size: 0.6875rem; font-weight: 700; text-align: left; transition: color 120ms ease; }
  :global(.navigation-trigger:disabled) { background: transparent; color: inherit; }
  /* Keep the open trigger reachable while Bits UI locks background pointer events. */
  :global(.navigation-trigger[data-state="open"]) { pointer-events: auto; }
  .navigation-label { margin-left: 2px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.navigation-trigger .material-symbols-rounded), :global(.navigation-menu .material-symbols-rounded) { flex-shrink: 0; }
  :global(.navigation-menu) { width: max-content; max-width: min(360px, calc(100vw - 16px));
    max-height: var(--bits-dropdown-menu-content-available-height); overflow-y: auto; }
  :global(.navigation-menu.match-trigger) { min-width: var(--bits-floating-anchor-width); max-width: calc(100vw - 16px); }
  .menu-search { position: sticky; top: 0; z-index: 1; display: block; width: 100%; min-height: 36px; padding: 8px 11px; border: 0; border-radius: 4px; background: var(--color-background); color: var(--color-foreground); font: inherit; }
  .menu-search::placeholder { font-style: italic; }
  .menu-choice { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .menu-check { display: flex; width: 16px; flex: 0 0 16px; margin-left: 12px; }
  :global(.menu-action-separator) { height: 2px; margin: 4px 35%; background: radial-gradient(circle, var(--color-menu-foreground) 1px, transparent 1px) center / 10px 2px repeat-x; }
</style>
