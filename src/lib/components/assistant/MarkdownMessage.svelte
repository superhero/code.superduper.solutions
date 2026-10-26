<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import 'katex/dist/katex.min.css';
  import { renderChatMarkdown } from '$lib/assistant/markdown';
  import { markdownInteractions } from '$lib/assistant/markdown/interactions';
  import { expandMarkdownImports, resolveMarkdownImports, type MarkdownRepository } from '$lib/assistant/markdown/imports';
  let { content, messageId, hideGeneratedFooter = false, repository, streaming = false }: { content: string; messageId: string; hideGeneratedFooter?: boolean; repository?: MarkdownRepository | undefined; streaming?: boolean } = $props();
  let mathjax = $state.raw<((source: string) => string)>();
  let imported = $state.raw<{ source: string; repository: MarkdownRepository | undefined; text: string }>();
  const source = $derived(content.includes('@include:') || content.includes('<<<')
    ? imported?.source === content && imported.repository === repository ? imported.text : expandMarkdownImports(content, new Map(), new Set()) : content);
  const blocks = $derived(renderChatMarkdown(source, messageId, hideGeneratedFooter, mathjax, streaming));
  $effect(() => {
    const input = content, context = repository;
    if (!input.includes('@include:') && !input.includes('<<<')) return;
    let cancelled = false;
    void resolveMarkdownImports(input, context).then(text => { if (!cancelled) imported = { source: input, repository: context, text }; });
    return () => { cancelled = true; };
  });
  $effect(() => {
    if (!/(?:^|\n)\s*(?:`{3,}|~{3,})mathjax\s*\n/.test(source) || mathjax) return;
    let cancelled = false;
    void import('$lib/assistant/markdown/mathjax').then(module => module.loadMathjax())
      .then(render => { if (!cancelled) mathjax = render; }).catch(() => { /* Readable TeX remains available on initialization failure. */ });
    return () => { cancelled = true; };
  });
</script>

<div class="markdown-message" use:markdownInteractions={blocks}>{#each blocks as html, index (index)}<div class="markdown-block">{@html html}</div>{/each}</div>

<style>
  .markdown-message {
    min-width: 0;
    max-width: 100%;
    isolation: isolate;
    line-height: 1.7;
    text-rendering: optimizeLegibility;
  }
  .markdown-block {
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-wrap: anywhere;
    font-synthesis: weight style;

  }
  .markdown-block + .markdown-block { margin-block-start: .9em; }
  .markdown-block + .markdown-block:has(> :global(:is(h1, h2))) { margin-block-start: 1.7em; }
  .markdown-block + .markdown-block:has(> :global(:is(h3, h4, h5, h6))) { margin-block-start: 1.4em; }
  .markdown-block:has(> :global(:is(h1, h2, h3, h4, h5, h6))) + .markdown-block { margin-block-start: .6em; }

  /* The same document rhythm applies inside lists, callouts and disclosures. */
  .markdown-block :global(:where(p, ul, ol, blockquote, pre, table, dl, figure, details)) { margin-block: 0; }
  .markdown-block :global(:where(p, ul, ol, blockquote, pre, table, dl, figure, details, .markdown-alert, .chat-container, .chat-tabs) + :where(p, ul, ol, blockquote, pre, table, dl, figure, details, .markdown-alert, .chat-container, .chat-tabs)) { margin-block-start: .8em; }
  .markdown-block :global(:where(h1, h2, h3, h4, h5, h6)) { margin-block: 1.5em .6em; font-weight: 700; line-height: 1.35; text-wrap: pretty; }
  .markdown-block :global(h1) { font-size: 1.6em; letter-spacing: -.025em; }
  .markdown-block :global(h2) { font-size: 1.35em; letter-spacing: -.015em; }
  .markdown-block :global(h3) { font-size: 1.2em; }
  .markdown-block :global(h4) { font-size: 1.12em; }
  .markdown-block :global(h5) { font-size: 1.06em; }
  .markdown-block :global(h6) { font-size: 1em; letter-spacing: .025em; }
  .markdown-block :global(:where(h1, h2, h3, h4, h5, h6):first-child) { margin-block-start: 0; }
  .markdown-block :global(:where(p, ul, ol, blockquote, pre, table, dl, figure, details, h1, h2, h3, h4, h5, h6):last-child) { margin-block-end: 0; }
  .markdown-block :global(strong) { font-weight: 700; }

  .markdown-block :global(ul), .markdown-block :global(ol) { padding-inline-start: 1.65em; text-align: start; }
  .markdown-block :global(ul) { list-style: disc outside; }
  .markdown-block :global(ol) { list-style: decimal outside; }
  .markdown-block :global(li > ul) { list-style-type: circle; }
  .markdown-block :global(li > ul ul) { list-style-type: square; }
  .markdown-block :global(li > ol) { list-style-type: lower-alpha; }
  .markdown-block :global(li + li) { margin-block-start: .3em; }
  .markdown-block :global(li::marker) { font-weight: 600; }
  .markdown-block :global(li > :is(ul, ol)) { margin-block-start: .4em; }
  .markdown-block :global(li > p + p) { margin-block-start: .6em; }
  .markdown-block :global(.task-list-item) { list-style: none; }
  .markdown-block :global(.task-list-item-checkbox) {
    margin: 2px .55em 2px -1.55em;
    vertical-align: -.1em;
    font: inherit;
    opacity: 1;
  }

  .markdown-block :global(blockquote) { padding: .8em 1em; border: 0; border-radius: 4px; background: var(--color-background); text-align: start; }
  .markdown-block :global(code), .markdown-block :global(kbd) { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: .9em; }
  .markdown-block :global(:not(pre) > code) { padding: 0; background: transparent; color: var(--color-toolbar-background); }
  .markdown-block :global(pre) { max-width: 100%; padding: .9em 1em; border-radius: 4px; background: var(--color-background); white-space: pre; overflow-x: auto; text-align: start; tab-size: 2;  }
  .markdown-block :global(pre code) { display: block; padding: 0; background: transparent; color: inherit; line-height: 1.65; overflow-wrap: normal; }
  .markdown-block :global(.chat-code-line-highlight) { display: inline-block; min-width: 100%; background: color-mix(in srgb, var(--color-foreground) 12%, transparent); }
  .markdown-block :global(a) { color: inherit; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 50%, transparent); text-underline-offset: .18em; text-decoration-thickness: 1px; }
  .markdown-block :global(a:hover) { text-decoration-color: currentColor; }
  .markdown-block :global(mark) { padding-inline: .15em; border-radius: 2px; background: var(--color-foreground); color: var(--color-background); }
  .markdown-block :global(ins) { text-underline-offset: .18em; }
  .markdown-block :global(abbr[title]) { cursor: help; text-decoration: underline dotted; text-underline-offset: .2em; }
  .markdown-block :global(rt) { font-size: .65em; }
  .markdown-block :global(hr) { height: 1px; margin-block: 1.1em; border: 0; background: color-mix(in srgb, var(--color-foreground) 20%, transparent); }

  .markdown-block :global(table) { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .92em; line-height: 1.55; text-align: start; overflow-wrap: normal; }
  .markdown-block :global(th), .markdown-block :global(td) { padding: .65em .8em; text-align: start; vertical-align: top; }
  .markdown-block :global(th) { background: var(--color-background); font-weight: 700; white-space: nowrap; }
  .markdown-block :global(th:first-child) { border-start-start-radius: 4px; }
  .markdown-block :global(th:last-child) { border-start-end-radius: 4px; }
  .markdown-block :global(tbody tr:nth-child(even)) { background: var(--color-background); }
  .markdown-block :global(tbody tr:last-child td:first-child) { border-end-start-radius: 4px; }
  .markdown-block :global(tbody tr:last-child td:last-child) { border-end-end-radius: 4px; }

  .markdown-block :global(.markdown-alert), .markdown-block :global(.chat-container), .markdown-block :global(.chat-demo) { padding: .85em 1em; border-radius: 4px; background: var(--color-background); text-align: start; }
  .markdown-block :global(.markdown-alert-title) { margin-block-end: .65em; font-size: .8em; font-weight: 700; line-height: 1.5; letter-spacing: .06em; }
  .markdown-block :global(.chat-container-title) { margin-block-end: .6em; font-weight: 700; line-height: 1.5; }
  .markdown-block :global(.markdown-alert > p:first-of-type + *) { margin-block-start: .6em; }
  .markdown-block :global(summary) { cursor: pointer; font-weight: 650; line-height: 1.6; list-style-position: inside; }
  .markdown-block :global(summary::marker) { font-size: .8em; }
  .markdown-block :global(details[open] > summary) { margin-block-end: .8em; }
  .markdown-block :global(.demo-content) { margin-block-end: .8em; }
  .markdown-block :global(.spoiler) { padding-inline: .1em; border-radius: 3px; cursor: pointer; }
  .markdown-block :global(.spoiler[aria-expanded="false"]) { color: transparent; background: color-mix(in srgb, var(--color-foreground) 25%, transparent); }
  .markdown-block :global(.spoiler[aria-expanded="false"] *) { visibility: hidden; }
  .markdown-block :global(.spoiler[aria-expanded="true"]) { background: var(--color-background); }

  .markdown-block :global(.chat-tab-list) { display: flex; gap: .2em; max-width: 100%; padding: .25em; border-radius: 4px; background: var(--color-background); overflow-x: auto;  }
  .markdown-block :global(.chat-tab-list button), .markdown-block :global(.chat-resource-load) { flex: 0 0 auto; padding: .35em .7em; border: 0; border-radius: 3px; background: var(--color-background); color: inherit; font: inherit; font-size: .9em; line-height: 1.6; cursor: pointer; }
  .markdown-block :global(.chat-tab-list button) { background: transparent; }
  .markdown-block :global(.chat-tab-list [aria-selected="true"]) { background: var(--color-surface); font-weight: 650; }
  .markdown-block :global(.chat-tab-panel) { padding-block-start: .8em; text-align: start; }
  .markdown-block :global([hidden]) { display: none !important; }
  .markdown-block :global(:is(button, summary, .spoiler, a):focus-visible) { outline: none; background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .markdown-block :global(:is(button, summary, .spoiler, a)) { transition: color 120ms ease, background-color 120ms ease, text-decoration-color 120ms ease; }

  .markdown-block :global(dl) { text-align: start; }
  .markdown-block :global(dt) { font-weight: 650; }
  .markdown-block :global(dd) { margin: .3em 0 0 1em; }
  .markdown-block :global(dd + dt) { margin-block-start: 1.1em; }
  .markdown-block :global(.field-name) { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: .9em; }
  .markdown-block :global(.field-content) { margin-inline-start: 0; }
  .markdown-block :global(.field-attr), .markdown-block :global(.chat-badge) { display: inline-block; margin-inline-end: .4em; padding: .15em .5em; border-radius: 3px; background: var(--color-background); font-size: .85em; line-height: 1.5; vertical-align: .05em; }
  .markdown-block :global(.field-attr) { margin-block-end: .55em; }
  .markdown-block :global(.field-content > p:first-of-type) { margin-block-start: .25em; }
  .markdown-block :global(.field-name[data-level="2"]), .markdown-block :global(.field-content[data-level="2"]) { margin-inline-start: 1em; }
  .markdown-block :global(.field-name[data-level="3"]), .markdown-block :global(.field-content[data-level="3"]) { margin-inline-start: 2em; }

  .markdown-block :global(figure) { text-align: center; }
  .markdown-block :global(figcaption) { margin-block-start: .6em; font-size: .875em; line-height: 1.5; }
  .markdown-block :global(.chat-resource) { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: .6em; max-width: 100%; }
  .markdown-block :global(.chat-resource:has(.chat-resource-content)) { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; width: 100%; }
  :global(:root[data-theme="dark"]) .markdown-block :global(.chat-resource[data-mode="lightmode-only"]), :global(:root:not([data-theme="dark"])) .markdown-block :global(.chat-resource[data-mode="darkmode-only"]) { display: none; }
  .markdown-block :global(.chat-resource-content) { display: block; max-width: 100%; height: auto; border: 0; border-radius: 4px; }
  .markdown-block :global(iframe.chat-resource-content) { width: 100%; min-height: 240px; }
  .markdown-block :global(.chat-icon) { vertical-align: -.2em; font-size: 1.2em; }

  .markdown-block :global(.footnotes) { font-size: .875em; line-height: 1.65; text-align: start; }
  .markdown-block :global(.footnotes-list) { padding-inline-start: 1.6em; }
  .markdown-block :global(.footnote-ref) { font-size: .8em; line-height: 0; }
  .markdown-block :global(.footnote-anchor), .markdown-block :global(.footnote-backref) { text-decoration: none; }
  .markdown-block :global(.footnote-backref) { margin-inline-start: .3em; }
  .markdown-block :global(.katex-display) { margin-block: .6em; padding-block: .1em; overflow-x: auto; overflow-y: hidden; }
  .markdown-block:has(:global(.katex)) { overflow-y: hidden; padding-block: 2px; }
  .markdown-block :global(mjx-container) { display: inline-block; max-width: 100%; overflow-x: auto; overflow-y: hidden; direction: ltr; text-align: center; }
  .markdown-block :global(mjx-container[display="true"]) { display: block; padding-block: .5em; }
  .markdown-block :global(mjx-container > svg) { overflow: visible; min-width: 1px; }
  .markdown-block :global(mjx-container path) { stroke-width: 3; }
  .markdown-block :global(mjx-assistive-mml) { position: absolute; width: 1px; height: 1px; padding: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { .markdown-block :global(:is(button, summary, .spoiler, a)) { transition: none; } }
</style>
