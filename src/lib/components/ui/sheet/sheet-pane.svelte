<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import Root from "./sheet.svelte";
  import Content from "./sheet-content.svelte";
  import Title from "./sheet-title.svelte";

  let { open = $bindable(false), docked = false, label, width, divider, children }:
    { open?: boolean; docked?: boolean; label: string; width?: number; divider?: Snippet<[boolean]>; children: Snippet } = $props();
  let moving = $state(false), motionWidth = $state<number>(), dockWidth = $state<number>();
  let paneElement = $state<HTMLDivElement>();
  let previousFocus: HTMLElement | null = null, wasOpen = false;
  let dockedElement: HTMLElement | undefined;
  const duration = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
  function dockMotion(node: HTMLElement): TransitionConfig {
    motionWidth = dockWidth ?? width ?? node.getBoundingClientRect().width;
    // CSS owns all column widths, including reversals. Svelte only retains
    // the outgoing DOM long enough for that shared motion to finish.
    return { duration: duration() };
  }

  $effect.pre(() => {
    // A closing pane still occupies space during its outro. Keep its last
    // open width when the caller stops allocating space to it.
    if (open) dockWidth = width;
    if (docked && open !== wasOpen) moving = duration() > 0;
    if (open && !wasOpen) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!open && wasOpen && (!docked || dockedElement?.contains(document.activeElement))) void tick().then(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
    wasOpen = open;
  });
  $effect(() => {
    const element = paneElement, shown = open, isDocked = docked;
    if (!element || !isDocked) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const dock = element.querySelector<HTMLElement>('[data-slot="sheet-dock"]');
      // HMR and restored branches can suppress Svelte's intro callbacks.
      // Observe the CSS motion itself, including completion and cancellation.
      const animations = dock?.getAnimations().filter(animation =>
        'transitionProperty' in animation && animation.transitionProperty === 'flex-basis') ?? [];
      void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (cancelled) return;
        moving = false;
        if (shown) motionWidth = undefined;
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  });
  function focusHeading(element: HTMLElement) {
    // Focus the heading, leaving every action an explicit keyboard choice.
    void tick().then(() => element.querySelector<HTMLElement>("[data-pane-heading]")?.focus({ preventScroll: true }));
  }
  function focusPane(element: HTMLElement) {
    dockedElement = element;
    focusHeading(element);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (event.target instanceof Element && event.target.closest(".cm-editor"))) return;
      event.preventDefault(); open = false;
    };
    element.addEventListener("keydown", escape);
    return { destroy: () => { element.removeEventListener("keydown", escape); if (dockedElement === element) dockedElement = undefined; } };
  }
</script>

<!-- Keep the motion signal outside the conditional branch: Svelte freezes an
     outgoing branch's bindings while its outro is running. -->
<div class="sheet-pane" bind:this={paneElement} data-pane-moving={docked && moving} style:--pane-open={open ? 1 : 0}>
{#if docked}
  {#if open}
    <div class="sheet-dock" data-slot="sheet-dock" style:--pane-width={dockWidth === undefined ? undefined : `${dockWidth}px`}
      in:dockMotion out:dockMotion>
      <div class="sheet-dock-clip">
      <section class="docked-content" aria-label={label} tabindex="-1" inert={!open} use:focusPane
        style:width={dockWidth ?? motionWidth ? `${dockWidth ?? motionWidth}px` : undefined}>
        {@render children()}
      </section>
      </div>
      {@render divider?.(moving)}
    </div>
  {/if}
{:else}
  <Root bind:open>
    <Content side="right" showClose={false} class="sheet-full-pane" aria-describedby={undefined}
      onOpenAutoFocus={event => { event.preventDefault(); const pane = document.querySelector<HTMLElement>(".sheet-full-pane"); if (pane) focusHeading(pane); }}
      onCloseAutoFocus={event => event.preventDefault()}>
      <Title class="sr-only">{label}</Title>
      {@render children()}
    </Content>
  </Root>
{/if}
</div>

<style>
  .sheet-pane { display: contents; }
  /* One animated flex boundary keeps the main view and the pane synchronized. */
  .sheet-dock { position: relative; flex: 0 0 calc(var(--pane-open) * var(--pane-width, clamp(440px, 45%, 640px))); min-width: 0; height: 100%; }
  @starting-style { .sheet-dock { flex-basis: 0px; } }
  @media (prefers-reduced-motion: no-preference) {
    .sheet-pane[data-pane-moving="true"] .sheet-dock { transition: flex-basis 180ms cubic-bezier(.333333, 1, .666667, 1); }
  }
  .sheet-dock-clip { height: 100%; overflow: clip; }
  .docked-content { width: 100%; height: 100%; }
  :global(.sheet-full-pane) { width: 100vw; max-width: none; height: 100dvh; gap: 0; padding: 0; box-shadow: none; }
</style>
