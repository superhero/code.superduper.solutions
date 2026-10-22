<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { MergeView, getChunks } from "@codemirror/merge";
  import { history, historyKeymap } from "@codemirror/commands";
  import { EditorState } from "@codemirror/state";
  import { EditorView, drawSelection, lineNumbers, keymap } from "@codemirror/view";
  import { editorTheme } from "$lib/editor/configuration";
  import { syntaxColors } from "$lib/editor/highlighting";
  import { joinedSelectionBackground } from "$lib/editor/selection-background";
  import { loadLanguage } from "$lib/editor/languages";
  import { Button } from "$lib/components/ui/button";
  import type { EditorSettings } from "$lib/editor/settings";
  import type { GitDiff } from "$lib/repository/local-git-types";
  let { diff, settings, editable = false, disabled = false, onchange, onstage }:
    { diff: GitDiff; settings: EditorSettings; editable?: boolean; disabled?: boolean;
      onchange?(value: string): void; onstage?(value: string): void } = $props();
  let container = $state<HTMLDivElement>();
  let mounted = $state(false);
  let hunks = $state<{ fromA: number; toA: number; fromB: number; toB: number; line: number }[]>([]);
  let failure = $state("");
  onMount(() => { mounted = true; });
  $effect(() => {
    const current = diff, options = settings, edit = editable;
    if (!mounted || current.binary) return;
    return untrack(() => {
      let cancelled = false, merge: MergeView | undefined;
      failure = "";
      void loadLanguage(current.path, "auto", options.syntaxPackages, options.languageMappings).then(syntax => {
        if (cancelled) return;
        const extensions = (right: boolean) => [editorTheme(options), syntaxColors(options), syntax, drawSelection(),
          joinedSelectionBackground, lineNumbers(), EditorState.readOnly.of(!right || !edit),
          EditorView.editable.of(right && edit), EditorView.contentAttributes.of({ "aria-label": right ? "Git result" : "Git original", "data-git-draft": "true" }),
          ...(right && edit ? [history(), keymap.of(historyKeymap), EditorView.updateListener.of(update => { if (update.docChanged) onchange?.(update.state.doc.toString()); })] : [])];
        merge = new MergeView({ parent: container!, a: { doc: current.before, extensions: extensions(false) },
          b: { doc: current.after, extensions: extensions(true) }, highlightChanges: true, gutter: true });
        const chunks = getChunks(merge.b.state);
        hunks = chunks?.chunks.map(chunk => ({ fromA: chunk.fromA, toA: chunk.toA,
          fromB: chunk.fromB, toB: chunk.toB, line: merge!.b.state.doc.lineAt(Math.min(chunk.fromB, merge!.b.state.doc.length)).number })) ?? [];
      }).catch(error => { if (!cancelled) failure = String(error); });
      return () => { cancelled = true; merge?.destroy(); };
    });
  });
  function stageHunk(hunk: typeof hunks[number]) {
    onstage?.(diff.before.slice(0, hunk.fromA) + diff.after.slice(hunk.fromB, hunk.toB) + diff.before.slice(hunk.toA));
  }
</script>
{#if diff.binary}<p>Binary file. Stage or restore the complete file.</p>
{:else}
  {#if failure}<p role="alert">{failure}</p>{/if}
  <div class="git-comparison" bind:this={container}></div>
  {#if onstage && hunks.length}<div class="hunk-actions">{#each hunks as hunk}<Button variant="secondary" size="sm" {disabled} onclick={() => stageHunk(hunk)}>Stage hunk · line {hunk.line}</Button>{/each}</div>{/if}
{/if}
<style>
  .git-comparison { min-height: 240px; height: min(45vh, 480px); min-width: 0; overflow: hidden; }
  .git-comparison :global(.cm-mergeView), .git-comparison :global(.cm-editor) { height: 100%; }
  .git-comparison :global(.cm-mergeViewEditor) { min-width: 0; overflow: hidden; }
  .git-comparison :global(.cm-mergeViewEditors) { gap: 2px; background: var(--color-surface); height: 100%; }
  .git-comparison :global(.cm-mergeViewEditor + .cm-mergeViewEditor) { border-left: 2px solid color-mix(in srgb,var(--color-surface) 20%,var(--color-background)); box-sizing: border-box; }
  .git-comparison :global(.cm-merge-a) { background-image: repeating-linear-gradient(45deg, transparent 0 15px, var(--color-surface) 15px 16px); }
  .git-comparison :global(.cm-merge-a .cm-changedLine) { background: color-mix(in srgb,var(--color-git-removed) 15%,transparent); }
  .git-comparison :global(.cm-merge-b .cm-changedLine) { background: color-mix(in srgb,var(--color-git-added) 15%,transparent); }
  .git-comparison :global(.cm-merge-a .cm-changedText) { background: color-mix(in srgb,var(--color-git-removed) 35%,transparent); border-radius: 4px; }
  .git-comparison :global(.cm-merge-b .cm-changedText) { background: color-mix(in srgb,var(--color-git-added) 35%,transparent); border-radius: 4px; }
  .git-comparison :global(.cm-merge-a .cm-changedLineGutter) { background: var(--color-git-removed); }
  .git-comparison :global(.cm-merge-b .cm-changedLineGutter) { background: var(--color-git-added); }
  .git-comparison :global(.cm-scroller) { overflow: auto; }
  .hunk-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  p { font-size: .75rem; }
</style>
