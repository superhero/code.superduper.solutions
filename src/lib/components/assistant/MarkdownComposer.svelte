<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
  import { EditorView, keymap, placeholder } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap, insertNewlineAndIndent, redo, undo } from '@codemirror/commands';
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { tags } from '@lezer/highlight';
  import { composerMarkdown, insertedTag, spoilerTag, mathTag, rubyTag } from '$lib/assistant/markdown/composer';

  let { value, disabled = false, enterAction = 'send', onchange, onsend }: { value: string; disabled?: boolean; enterAction?: 'send' | 'newline'; onchange(value: string): void; onsend(): void } = $props();
  let container: HTMLDivElement, view = $state.raw<EditorView>();
  const editability = new Compartment(), external = Annotation.define<boolean>();
  const formatting = HighlightStyle.define([
    { tag: tags.strong, class: 'ai-md-strong' },
    { tag: tags.emphasis, class: 'ai-md-emphasis' },
    { tag: tags.strikethrough, class: 'ai-md-strike' },
    { tag: tags.heading, class: 'ai-md-heading' },
    { tag: tags.monospace, class: 'ai-md-code' },
    { tag: [tags.link, tags.url], class: 'ai-md-link' },
    { tag: tags.quote, fontStyle: 'italic' },
    { tag: tags.special(tags.string), class: 'ai-md-mark' },
    { tag: insertedTag, class: 'ai-md-inserted' }, { tag: spoilerTag, class: 'ai-md-spoiler' },
    { tag: mathTag, class: 'ai-md-code' }, { tag: rubyTag, class: 'ai-md-ruby' },
    { tag: [tags.processingInstruction, tags.meta], color: 'color-mix(in srgb, var(--color-foreground) 65%, transparent)' },
  ]);
  const editable = () => [EditorState.readOnly.of(disabled), EditorView.editable.of(!disabled), EditorView.contentAttributes.of({ 'aria-disabled': String(disabled) })];
  onMount(() => {
    const editor = new EditorView({ parent: container, state: EditorState.create({ doc: value, extensions: [
      editability.of(editable()), history(), EditorView.lineWrapping, placeholder('Prompt'),
      EditorView.contentAttributes.of({ 'aria-label': 'Message AI', 'aria-multiline': 'true', spellcheck: 'true' }),
      markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false, pasteURLAsLink: false, extensions: composerMarkdown }), syntaxHighlighting(formatting),
      keymap.of([
        { key: 'Enter', run: editor => { if (editor.composing) return false; if (disabled) return true; if (enterAction === 'newline') return insertNewlineAndIndent(editor); onsend(); return true; } },
        { key: 'Shift-Enter', run: insertNewlineAndIndent },
        { key: 'Mod-Enter', run: editor => { if (editor.composing) return false; if (!disabled) onsend(); return true; } },
        { key: 'Mod-s', run: () => true },
        { key: 'Mod-z', run: undo, preventDefault: true },
        { key: 'Mod-Shift-z', run: redo, preventDefault: true },
        { key: 'Mod-y', run: redo, preventDefault: true },
        ...defaultKeymap, ...historyKeymap,
      ]),
      EditorView.updateListener.of(update => { if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(external))) onchange(update.state.doc.toString()); }),
      EditorView.theme({
        '&': { backgroundColor: 'var(--color-surface)', color: 'var(--color-foreground)', borderRadius: '4px', fontSize: 'inherit' },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': { minHeight: '72px', maxHeight: '200px', overflow: 'auto', overscrollBehavior: 'contain', fontFamily: 'inherit', lineHeight: '1.65' },
        '.cm-content': { padding: '10px 12px', caretColor: 'var(--color-foreground)' }, '.cm-line': { padding: '0' },
        '.cm-placeholder': { color: 'color-mix(in srgb, var(--color-foreground) 60%, transparent)' },
        '.cm-content::selection, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--color-background) 50%, transparent)', color: 'currentColor' },
        '&[aria-disabled="true"]': { opacity: '.65' },
      }),
    ] }) });
    view = editor;
    return () => { editor.destroy(); view = undefined; };
  });
  $effect(() => {
    const editor = view, next = value;
    if (editor && editor.state.doc.toString() !== next) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: next }, annotations: [external.of(true), Transaction.addToHistory.of(false)] });
  });
  $effect(() => { disabled; if (view) view.dispatch({ effects: editability.reconfigure(editable()) }); });
</script>

<div class="markdown-composer" data-ai-composer bind:this={container}></div>
<style>
  .markdown-composer { min-width: 0; font-synthesis: weight style; }
  .markdown-composer :global(.ai-md-strong) { font-weight: 700; }
  .markdown-composer :global(.ai-md-emphasis) { font-style: italic; }
  .markdown-composer :global(.ai-md-strike) { text-decoration: line-through; }
  .markdown-composer :global(.ai-md-heading) { font-size: 1.15em; font-weight: 700; }
  .markdown-composer :global(.ai-md-code) { font-family: 'JetBrains Mono', ui-monospace, monospace; color: var(--color-toolbar-background); }
  .markdown-composer :global(.ai-md-link) { text-decoration: underline; text-underline-offset: 2px; }
  .markdown-composer :global(.ai-md-mark) { background: var(--color-foreground); color: var(--color-background); border-radius: 2px; }
  .markdown-composer :global(.ai-md-inserted) { text-decoration: underline; text-underline-offset: 2px; }
  .markdown-composer :global(.ai-md-spoiler) { background: color-mix(in srgb, var(--color-foreground) 15%, transparent); border-radius: 3px; }
  .markdown-composer :global(.ai-md-ruby) { font-size: .85em; vertical-align: .2em; }
</style>
