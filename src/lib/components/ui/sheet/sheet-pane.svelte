<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Root from "./sheet.svelte";
  import Content from "./sheet-content.svelte";
  import Title from "./sheet-title.svelte";

  let { open = $bindable(false), docked = false, label, width, divider, children }:
    { open?: boolean; docked?: boolean; label: string; width?: number; divider?: Snippet<[boolean]>; children: Snippet } = $props();
  let moving = $state(false), motionWidth = $state<number>();
  let previousFocus: HTMLElement | null = null, wasOpen = false;
  const duration = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
  function dockMotion(node: HTMLElement): TransitionConfig {
    const size = width ?? node.getBoundingClientRect().width;
    motionWidth = size;
    // The shared boundary moves both siblings. Keep the pane's contents at
    // their target width so its form does not rewrap while entering.
    return { duration: duration(), easing: cubicOut, css: t => `flex-basis: ${Math.max(0, t * size)}px` };
  }

  $effect.pre(() => {
    if (open && !wasOpen) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!open && wasOpen) void tick().then(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
    wasOpen = open;
  });
  function focusHeading(element: HTMLElement) {
    // Focus the heading, leaving every action an explicit keyboard choice.
    void tick().then(() => element.querySelector<HTMLElement>("[data-pane-heading]")?.focus({ preventScroll: true }));
  }
  function focusPane(element: HTMLElement) {
    focusHeading(element);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (event.target instanceof Element && event.target.closest(".cm-editor"))) return;
      event.preventDefault(); open = false;
    };
    element.addEventListener("keydown", escape);
    return { destroy: () => element.removeEventListener("keydown", escape) };
  }
</script>

{#if docked}
  {#if open}
    <div class="sheet-dock" data-slot="sheet-dock" style:flex-basis={width === undefined ? undefined : `${width}px`}
      transition:dockMotion onintrostart={() => moving = true} onintroend={() => { moving = false; motionWidth = undefined; }}
      onoutrostart={() => moving = true} onoutroend={() => moving = false}>
      <div class="sheet-dock-clip">
      <section class="docked-content" aria-label={label} tabindex="-1" use:focusPane
        style:width={width ?? motionWidth ? `${width ?? motionWidth}px` : undefined}>
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

<style>
  /* One animated flex boundary keeps the main view and the pane synchronized. */
  .sheet-dock { position: relative; flex: 0 0 clamp(440px, 45%, 640px); min-width: 0; height: 100%; }
  .sheet-dock-clip { height: 100%; overflow: clip; }
  .docked-content { width: 100%; height: 100%; }
  :global(.sheet-full-pane) { width: 100vw; max-width: none; height: 100dvh; gap: 0; padding: 0; box-shadow: none; }
</style>
