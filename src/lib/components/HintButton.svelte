<!--
Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS.
-->

<script lang="ts">
  import { Tooltip } from "bits-ui";
  import { flushSync, onMount, type ComponentProps, type Snippet } from "svelte";
  let { label, bottomLabel, rightLabel, rightLabelContent, plain = false, passive = false, labelAsName = true, tooltipEnabled = true, tooltipSide = "top", children, child, disabled, ref = $bindable(null), ...props }:
    Omit<ComponentProps<typeof Tooltip.Trigger>, "children"> & { label: string; bottomLabel?: string; rightLabel?: string | undefined; rightLabelContent?: Snippet; plain?: boolean; passive?: boolean; labelAsName?: boolean; tooltipEnabled?: boolean; tooltipSide?: ComponentProps<typeof Tooltip.Content>["side"]; children?: Snippet } = $props();
  const tether = Tooltip.createTether();
  let open = $state(false);
  const paired = $derived(Boolean(bottomLabel || rightLabel));
  let leftRoom = $state(0), rightRoom = $state(0);
  function passiveAttributes(trigger: Record<string, unknown>) {
    const attributes = { ...trigger };
    for (const name of ["type", "disabled", "onclick", "onpointerdown", "onpointerup"]) delete attributes[name];
    return attributes;
  }
  $effect(() => { if (!tooltipEnabled) tether.close(); });
  $effect(() => {
    if (!open || !rightLabel || !ref) return;
    const anchor = ref.getBoundingClientRect();
    leftRoom = Math.max(0, anchor.left - 16);
    rightRoom = Math.max(0, window.innerWidth - anchor.right - 16);
  });
  onMount(() => {
    const dismiss = () => tether.close();
    const navigate = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        event.preventDefault(); event.stopPropagation(); flushSync(dismiss);
      }
      // Release the tooltip's focus scope before a dialog handles Tab wrapping.
      if (event.key === "Tab" && open) flushSync(dismiss);
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", navigate, true);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", navigate, true);
    };
  });
</script>
  {#snippet tooltipText(text: string | undefined)}
    {#if plain}<span class="plain-tooltip-text"><kbd>{text}</kbd></span>{:else}{text}{/if}
  {/snippet}
  <Tooltip.Root {tether} bind:open disabled={!tooltipEnabled} disableHoverableContent disableCloseOnTriggerClick={passive}>
    {#if passive}
      <Tooltip.Trigger bind:ref {...props} aria-label={props["aria-label"] ?? (labelAsName ? label : undefined)}>
        {#snippet child({ props: triggerProps })}
          <span {...passiveAttributes(triggerProps)}>{@render children?.()}</span>
        {/snippet}
      </Tooltip.Trigger>
    {:else if disabled && !child}
      <Tooltip.Trigger bind:ref {...props} tabindex={-1} aria-label={props["aria-label"] ?? (labelAsName ? label : undefined)}>
        {#snippet child({ props: triggerProps })}
          <button {...triggerProps} class={[triggerProps.class, "disabled-hint-trigger"]} disabled>{@render children?.()}</button>
        {/snippet}
      </Tooltip.Trigger>
    {:else}
      <Tooltip.Trigger bind:ref {...props} {...(child ? { child } : {})} {disabled} aria-label={props["aria-label"] ?? (labelAsName ? label : undefined)}>
        {@render children?.()}
      </Tooltip.Trigger>
    {/if}
    <Tooltip.Portal><Tooltip.Content role={paired ? "presentation" : "tooltip"} aria-hidden={!open} class={["app-tooltip", paired && "paired-tooltip", rightLabel && "side-tooltips", plain && "plain-tooltip"]} side={paired ? "top" : tooltipSide} sideOffset={8} collisionPadding={8}
      style={rightLabel ? `--hint-left-room: ${leftRoom}px; --hint-right-room: ${rightRoom}px;` : undefined}>
      {#if paired}
        <div role="tooltip" class="app-tooltip tooltip-primary" data-side={rightLabel ? "left" : "top"}>{@render tooltipText(label)}</div>
        <div role="tooltip" class="app-tooltip tooltip-secondary" data-side={rightLabel ? "right" : "bottom"}>{#if rightLabelContent}<span class:plain-tooltip-text={plain}>{@render rightLabelContent()}</span>{:else}{@render tooltipText(rightLabel || bottomLabel)}{/if}</div>
      {:else}
        {@render tooltipText(label)}<Tooltip.Arrow class="tooltip-arrow" />
      {/if}
    </Tooltip.Content></Tooltip.Portal>
  </Tooltip.Root>

<style>
  /* Native disabled buttons can explain their state on hover without activation. */
  .disabled-hint-trigger { pointer-events: auto; }
  :global(.app-tooltip.paired-tooltip) { padding: 0; background: transparent; }
  :global(.paired-tooltip[data-side="bottom"]) { transform: translateY(calc(-100% - var(--bits-tooltip-anchor-height) - 16px)); }
  .tooltip-primary { position: relative; }
  .tooltip-secondary { position: absolute; top: calc(100% + var(--bits-tooltip-anchor-height) + 16px); left: 50%; width: max-content; transform: translateX(-50%); box-sizing: border-box; }
  .tooltip-primary::after, .tooltip-secondary::after { content: ""; position: absolute; left: calc(50% - 5px); width: 10px; height: 5px; background: var(--color-badge-background); }
  .tooltip-primary::after { top: 100%; clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .tooltip-secondary::after { bottom: 100%; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  :global(.app-tooltip.side-tooltips) { width: var(--bits-tooltip-anchor-width); height: 0; transform: translateY(calc(var(--bits-tooltip-anchor-height) / 2 + 8px)); }
  :global(.app-tooltip.side-tooltips[data-side="bottom"]) { transform: translateY(calc(var(--bits-tooltip-anchor-height) / -2 - 8px)); }
  :global(.side-tooltips) .tooltip-primary, :global(.side-tooltips) .tooltip-secondary { position: absolute; top: 0; width: max-content; transform: translateY(-50%); }
  :global(.side-tooltips) .tooltip-primary { left: auto; right: calc(100% + 8px); max-width: min(280px, var(--hint-left-room)); text-align: right; }
  :global(.side-tooltips) .tooltip-secondary { left: calc(100% + 8px); max-width: min(280px, var(--hint-right-room)); text-align: left; }
  :global(.side-tooltips) .tooltip-primary::after, :global(.side-tooltips) .tooltip-secondary::after { top: calc(50% - 5px); bottom: auto; width: 5px; height: 10px; }
  :global(.side-tooltips) .tooltip-primary::after { left: 100%; clip-path: polygon(0 0, 100% 50%, 0 100%); }
  :global(.side-tooltips) .tooltip-secondary::after { left: auto; right: 100%; clip-path: polygon(100% 0, 100% 100%, 0 50%); }
  :global(.app-tooltip.plain-tooltip), :global(.plain-tooltip) .app-tooltip { background: transparent; border: 0; box-shadow: none; color: var(--color-foreground); }
  :global(.plain-tooltip) .tooltip-primary, :global(.plain-tooltip) .tooltip-secondary { background: var(--color-background); }
  .plain-tooltip-text { font-size: .9em; font-weight: 400; opacity: .6; }
  :global(.plain-tooltip) .tooltip-primary::after, :global(.plain-tooltip) .tooltip-secondary::after, :global(.plain-tooltip .tooltip-arrow) { display: none; }
  :global(.app-tooltip) { --tooltip-x: 0px; --tooltip-y: 4px; pointer-events: none; }
  :global(.app-tooltip[data-side="bottom"]) { --tooltip-y: -4px; }
  :global(.app-tooltip[data-side="left"]) { --tooltip-x: 4px; --tooltip-y: 0px; }
  :global(.app-tooltip[data-side="right"]) { --tooltip-x: -4px; --tooltip-y: 0px; }
  @media (prefers-reduced-motion: no-preference) {
    :global(.app-tooltip[data-state="delayed-open"]), :global(.app-tooltip[data-state="instant-open"]) { animation: tooltip-in 200ms ease-in both; }
    :global(.app-tooltip[data-state="closed"]) { animation: tooltip-out 200ms ease-in 75ms both; }
  }
  @keyframes tooltip-in { from { opacity: 0; translate: var(--tooltip-x) var(--tooltip-y); } to { opacity: 1; translate: 0 0; } }
  @keyframes tooltip-out { from { opacity: 1; translate: 0 0; } to { opacity: 0; translate: var(--tooltip-x) var(--tooltip-y); } }
</style>
