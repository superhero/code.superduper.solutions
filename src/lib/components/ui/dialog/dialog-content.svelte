<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { Dialog, mergeProps } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";

  let { ref = $bindable(null), class: className, showClose = true, portalProps, children, ...restProps }:
    WithoutChildrenOrChild<Dialog.ContentProps> & {
      showClose?: boolean;
      portalProps?: WithoutChildrenOrChild<ComponentProps<typeof Dialog.Portal>>;
      children: Snippet;
    } = $props();
</script>

<Dialog.Portal {...portalProps}>
  <Dialog.Overlay>
    {#snippet child({ props: overlayProps })}
      <Dialog.Close>
        {#snippet child({ props: closeProps })}
          <button {...mergeProps(closeProps, overlayProps)} class="dialog-overlay" data-slot="dialog-overlay" type="button" tabindex="-1" aria-label="Close dialog"></button>
        {/snippet}
      </Dialog.Close>
    {/snippet}
  </Dialog.Overlay>
  <div class="dialog-frame" data-slot="dialog-frame">
    <Dialog.Content bind:ref data-slot="dialog-content" data-hover="foreground" class={cn("dialog-content", className)} {...restProps}>
      {@render children()}
      {#if showClose}
        <Dialog.Close>
          {#snippet child({ props })}
            <Button {...mergeProps(props, { "aria-label": "Close" })} variant="ghost" size="icon-sm" class="dialog-close">
              <MaterialIcon name="close" size={18} />
            </Button>
          {/snippet}
        </Dialog.Close>
      {/if}
    </Dialog.Content>
  </div>
</Dialog.Portal>

<style>
  :global(.dialog-overlay) { position:fixed; inset:0; z-index:50; border:0; padding:0; background:color-mix(in srgb, var(--color-background) 65%, transparent); }
  .dialog-frame {
    position:fixed; z-index:50; inset:50% auto auto 50%; transform:translate(-50%, -50%);
    width:max-content; max-width:calc(100vw - 32px); border-radius:6px;
    outline:4px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); outline-offset:0;
    transition:outline-color 120ms ease;
  }
  .dialog-frame:not(:has(> :global(.dialog-content))) { display:none; }
  .dialog-frame:has(> :global(.dialog-content:is([data-starting-style], [data-state="closed"]))) { outline-color:transparent; }
  :global(.dialog-content) {
    position:relative;
    display:flex; flex-direction:column; gap:20px; width:min(28rem, calc(100vw - 32px)); max-height:calc(100dvh - 32px);
    overflow:auto; padding:24px; border:2px solid var(--color-background); border-radius:6px; box-shadow:none;
    outline:2px solid var(--color-toolbar-background); outline-offset:4px;
    background:var(--color-surface); color:var(--color-foreground);
  }
  :global(.dialog-content .dialog-close) { position:absolute; inset-block-start:12px; inset-inline-end:12px; }
  :global(.dialog-content), :global(.dialog-overlay) { opacity:1; transition:opacity 120ms ease; }
  :global(.dialog-content:is([data-starting-style], [data-state="closed"])),
  :global(.dialog-overlay:is([data-starting-style], [data-state="closed"])) { opacity:0; }
  @media (prefers-reduced-motion:reduce) {
    .dialog-frame { transition:none; }
    :global(.dialog-content), :global(.dialog-overlay) { transition:none; }
  }
</style>
