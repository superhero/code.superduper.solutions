// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { renderChatMarkdown } from './markdown.ts';
const render = (text, id = 'session-1-message-1') => renderChatMarkdown(text, id).join('');
Then('only a trailing generated-date footer is hidden from AI Markdown', () => {
  const body = '# Document\n\nThe actual content.';
  const footer = '\n\n---\n\n*Generated on 2024-06-15*';
  const ai = text => renderChatMarkdown(text, 'reply', true).join('');
  assert.equal(ai(body + footer), ai(body));
  assert.match(render(body + footer), /Generated on 2024-06-15/);
  for (const content of [
    body + footer + '\n\nMore document content.',
    body + '\n\n---\n\n> Generated on 2024-06-15',
    body + '\n\n---\n\n`Generated on 2024-06-15`',
    body + '\n\n---\n\n```text\nGenerated on 2024-06-15\n```',
    body + '\n\n---\n\nGenerated on 2024-06-15 and reviewed later.',
  ]) assert.match(ai(content), /Generated on 2024-06-15/);
});
Then('AI Markdown renders inline and display math while preserving literal code', () => {
  const html = render(String.raw`Here is $E = mc^2$ and $\int_0^1 x\,dx = \frac{1}{2}$.`);
  assert.equal((html.match(/class="katex"/g) ?? []).length,2); assert.match(html, /<math\b/); assert.match(html, /<mfrac>/);
  for(const source of [String.raw`\(x^2\)`,String.raw`\[\frac{1}{2}\]`,'$$\nx^2\n$$','```math\nx^2\n```']) assert.match(render(source), /class="katex/);
  assert.doesNotMatch(render('`$x^2$`\n\n```text\n$x^2$\n```'), /class="katex/);
  assert.doesNotThrow(() => render('$\\invalidCommand{x}$'));
});
Then('AI math stays inert bounded and isolated between messages', () => {
  const html=render(String.raw`$\href{javascript:alert(1)}{bad}$ $\includegraphics{https://example.invalid/tracker.png}$ $\htmlClass{bad}{x}$`);
  assert.doesNotMatch(html, /<(?:a|img|script)\b/);
  assert.match(render(String.raw`$\gdef\chatsecret{42}\chatsecret$`,'first'), /<mn>42<\/mn>/);
  const next=render(String.raw`$\chatsecret$`,'second');
  assert.match(next, /<mtext>\\chatsecret<\/mtext>/); assert.doesNotMatch(next, /<mn>42<\/mn>/);
  assert.doesNotThrow(() => render(String.raw`$\def\loop{\loop}\loop$`));
});
Then('AI Markdown renders its standard block and inline formatting', () => {
  const html = render('# Heading\n\n**bold** *italic* ~~removed~~ `code`\nnext line\n\n> Quote\n\n- first\n- second\n\n1. step\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst value = "<safe>";\n```');
  for (const expected of ['<h1 id="session-1-message-1-heading" tabindex="-1">Heading</h1>', '<strong>bold</strong>', '<em>italic</em>', '<s>removed</s>', '<code>code</code>', '<br>', '<blockquote>', '<ul>', '<ol>', '<table>', '<th>A</th>', 'class="language-js"', '&lt;safe&gt;']) assert.ok(html.includes(expected), expected);
});
Then('AI Markdown renders the selected mdit plugins', () => {
  const html = render('- [x] done\n- [ ] pending\n\n==highlight== Note[^example]\n\n[^example]: **Footnote**');
  assert.match(html, /type="checkbox"[^>]*checked="checked"[^>]*disabled="disabled"/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
  assert.match(html, /<mark>highlight<\/mark>/); assert.match(html, /class="footnote-ref"/); assert.match(html, /<strong>Footnote<\/strong>/);
});
Then('AI Markdown keeps markup URLs and images inert', () => {
  const html = render('<script>window.injected=true</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [data](data:text/html,x) [file](file:///tmp/x) [local](./README.md) [good](https://example.invalid/?x=1&y=2)\n\n![**image**](https://example.invalid/tracker.png)\n\nhttps://example.invalid');
  assert.doesNotMatch(html, /<(?:script|img|iframe|video|style)\b/i); assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /(?:href|src)="(?:javascript:|data:|file:|\.\/)/); assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /class="chat-image-link">image<\/a>/); assert.doesNotMatch(html, /<[^>]+\ssrc=/);
});
Then('AI Markdown identifiers are unique to each message', () => {
  const text = '- [ ] task\n\nNote[^x]\n\n[^x]: detail';
  const first = render(text, 'session-1-message-1'), second = render(text, 'session-1-message-2');
  const ids = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.ok(ids(first).length >= 3); assert.ok(ids(first).every(id => !ids(second).includes(id)));
  assert.doesNotMatch(render(text, '\" onclick=\"bad'), /onclick=/);
});
Then('AI Markdown updates incomplete text without changing completed blocks', () => {
  const first = renderChatMarkdown('## Stable\n\nfirst paragraph\n\n**part', 'stream');
  const next = renderChatMarkdown('## Stable\n\nfirst paragraph\n\n**part complete**', 'stream');
  assert.deepEqual(first.slice(0, 2), next.slice(0, 2)); assert.match(next.at(-1), /<strong>part complete<\/strong>/);
  assert.doesNotMatch(render('[label][target]'), /<a /);
  assert.match(render('[label][target]\n\n[target]: https://example.invalid'), /<a [^>]*>label<\/a>/);
  for (const text of ['', '```js\nconst x = "hé🙂', '[unfinished](', '*', '- [', 'Note[^x]']) assert.doesNotThrow(() => render(text));
});

const catalog = {
  abbr: ['HTML\n\n*[HTML]: Hyper Text Markup Language', /<abbr title="Hyper Text Markup Language">HTML<\/abbr>/],
  'advanced-links': ['@[badge text="Ready"](success)\n\n@[video title="Clip"](https://example.invalid/movie.mp4)', /class="chat-badge">Ready<\/span>[\s\S]*data-chat-resource="video"/],
  alert: ['> [!TIP]\n> **Read** this.', /class="markdown-alert markdown-alert-tip"[\s\S]*<strong>Read<\/strong>/],
  align: ['::: center\nCentered\n:::', /style="text-align:center"/],
  anchor: ['## Target\n\n[Jump](#target)', /id="catalog-target"[\s\S]*href="#catalog-target"/],
  attrs: ['## Target {#mine .custom style="color:red"}', /id="catalog-mine" class="md-custom" style="color:red"/],
  container: ['::: details Read more\n**Body**\n:::', /<details class="chat-container"[^>]*><summary>Read more<\/summary>[\s\S]*<strong>Body<\/strong>/],
  demo: ['::: demo **Example**\n**Body**\n:::', /<summary><strong>Example<\/strong><\/summary>[\s\S]*<strong>Body<\/strong>[\s\S]*language-md/],
  dl: ['Term\n: Definition', /<dt>Term<\/dt>[\s\S]*<dd>Definition<\/dd>/],
  embed: ['{% youtube abcdef12345 %}\n\nInline {% icon verified %}', /data-chat-resource="embed"[\s\S]*youtube-nocookie.com[\s\S]*chat-icon/],
  emoji: [':smile: :rocket:', /😄 🚀/],
  field: ['::: fields\n@`title` type=string required custom="Hello"\nDescription\n:::', /field-name[^>]*>title[\s\S]*Type: string[\s\S]*Required[\s\S]*Custom: Hello[\s\S]*Description/],
  figure: ['![Caption](https://example.invalid/image.png)', /<figure>[\s\S]*<figcaption>Caption<\/figcaption><\/figure>/],
  icon: ['::verified =24 /red::', /chat-icon[^>]*style="font-size:24px;color:red">verified<\/span>/],
  'img-lazyload': ['![Image](https://example.invalid/image.png)', /data-loading="lazy"/],
  'img-mark': ['![Image](https://example.invalid/image.png#dark)', /data-mode="darkmode-only"[\s\S]*data-source="https:\/\/example.invalid\/image.png"/],
  'img-size': ['![Image =120x80](https://example.invalid/image.png)', /data-width="120" data-height="80"/],
  ins: ['++inserted++', /<ins>inserted<\/ins>/],
  layout: ['@grids grid-cols-2 gap-2\n@grid\nOne\n@grid\nTwo\n@end', /display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:0.5rem/],
  plantuml: ['@startuml\nAlice -> Bob\n@enduml', /data-chat-resource="image" data-source="https:\/\/www.plantuml.com\/plantuml\/svg\//],
  ruby: ['{中国:zhōng|guó}', /<ruby>中<rt>zhōng<\/rt>国<rt>guó<\/rt><\/ruby>/],
  spoiler: ['!!hidden **answer**!!', /class="spoiler"[^>]*aria-expanded="false">hidden <strong>answer<\/strong>/],
  stylize: ['*Recommended* *Deprecated* *Experimental*', /chat-badge-recommended[\s\S]*chat-badge-deprecated[\s\S]*chat-badge-experimental/],
  sub: ['H~2~O', /H<sub>2<\/sub>O/],
  sup: ['x^2^', /x<sup>2<\/sup>/],
  tab: ['::: tabs#choice\n@tab First\nOne\n@tab Second\nTwo\n:::', /role="tablist"[\s\S]*aria-selected="true"[\s\S]*aria-selected="false"[\s\S]*role="tabpanel"[\s\S]* hidden>/],
  uml: ['@starttext\n<diagram>\n@endtext', /<pre><code>&lt;diagram&gt;\n?<\/code><\/pre>/],
};
Then('the mdit {string} capability renders its configured syntax', name => {
  const [source, expected] = catalog[name]; const html = render(source, 'catalog'); assert.match(html, expected);
  assert.doesNotMatch(html, /<(?:img|script|iframe|video|audio)\b/i);
});
Then('mdit extensions preserve escaping scoped anchors and bounded attributes', () => {
  const html = render('## Title {#mine .fixed style="color:red;position:fixed;background-image:url(https://example.invalid/a)"}\n\n[Jump](#mine)\n\n::: fields\n@`<name>` evil\\\"onclick=bad="<script>"\nBody\n:::\n\n::: demo [bad](javascript:alert(1))\n<script>alert(1)</script>\n:::', 'safe');
  assert.match(html, /id="safe-mine"/); assert.match(html, /class="md-fixed"/); assert.match(html, /style="color:red"/);
  assert.match(html, /href="#safe-mine"/); assert.doesNotMatch(html, /<ruby>|position:fixed|background-image|<(?:script|img)|\sonclick="/i);
  assert.match(html, /&lt;script&gt;/);
  const ids = render('## A\n\n## A\n\n::: tabs\n@tab X\nBody\n:::\n\n## Custom {#A}', 'ids').match(/\sid="[^"]+"/g);
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotThrow(() => render('::: tabs\n@tab A\n::: details X\n**unfinished'));
});
Then('all mdit image sizing grammars retain dimensions without loading resources', () => {
  for (const source of ['![Alt =120x80](https://example.invalid/a.png)', '![Alt|120x80](https://example.invalid/a.png)', '![Alt](https://example.invalid/a.png =120x80)']) {
    const html = render(source); assert.match(html, /data-width="120" data-height="80"/); assert.doesNotMatch(html, /<img\b/);
  }
  assert.match(render('![Alt =50%x80](https://example.invalid/a.png)'), /data-width="50%"/);
});
Then('the MathJax plugin renders SVG without loading external resources', async () => {
  const { loadMathjax } = await import('./markdown/mathjax.ts'); const math = await loadMathjax();
  const html = renderChatMarkdown('```mathjax\n\\frac{1}{2} + x^2\n```', 'mathjax', false, math).join('');
  assert.match(html, /<mjx-container[^>]*jax="SVG"/); assert.match(html, /<svg\b/); assert.match(html, /<mjx-assistive-mml/);
  assert.doesNotMatch(html, /<(?:script|img|iframe)\b|(?:src|href)="https?:/);
  assert.equal(math('x^2'), math('x^2'));
  math('\\gdef\\secret{42}\\secret'); assert.doesNotMatch(math('\\secret'), /data-c="34"/);
  assert.doesNotThrow(() => math('\\def\\loop{\\loop}\\loop'));
  assert.doesNotMatch(math('\\href{javascript:alert(1)}{bad} \\includegraphics{https://example.invalid/a.png}'), /<(?:a|img|script)\b/);
});
Then('browser Markdown imports preserve upstream line region and nested syntax', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { default: MarkdownIt } = await import('markdown-it'); const { include } = await import('@mdit/plugin-include'); const { snippet } = await import('@mdit/plugin-snippet');
  const { resolveMarkdownImports } = await import('./markdown/imports.ts');
  const files = new Map([['docs/a.md', '---\ntitle: hidden\n---\n## Included\n\n<!-- @include: b.md -->'], ['docs/b.md', '**Nested**'], ['code.ts', '// #region example\n  const first = 1;\n  const second = 2;\n// #endregion example\nconst last = 3;']]);
  const directory = await mkdtemp(join(tmpdir(), 'code-markdown-'));
  try {
    await mkdir(join(directory, 'docs')); for (const [path, text] of files) await writeFile(join(directory, path), text);
    const context = { id: 'one', revision: 'first', files: new Set(files.keys()), read: async path => files.get(path) };
    const md = new MarkdownIt().use(include, { currentPath: () => join(directory, 'root.md'), deep: true }).use(snippet, { currentPath: () => join(directory, 'root.md') });
    for (const source of ['<!-- @include: ./docs/a.md -->', '<!-- @include: ./code.ts{2-3} -->', '<!-- @include: ./code.ts#example -->', '<<< code.ts#example{2 ts}', '```md\n<!-- @include: docs/a.md -->\n<<< code.ts\n```', '    <!-- @include: docs/a.md -->']) {
      const actual = new MarkdownIt().render(await resolveMarkdownImports(source, context)).trim(); const expected = md.render(source).trim();
      // Native snippets can omit the trailing newline carried by a Markdown fence.
      assert.equal(actual.replace(/\n<\/code>/g, '</code>'), expected.replace(/\n<\/code>/g, '</code>'), source);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
Then('Markdown imports stay within their repository and bound cycles and reads', async () => {
  const { resolveMarkdownImports } = await import('./markdown/imports.ts');
  const calls = [], files = new Map([['a.md', '<!-- @include: b.md -->'], ['b.md', '<!-- @include: a.md -->'], ['large.md', 'x'.repeat(262145)]]);
  const repository = { id: 'one', revision: 'one', files: new Set(files.keys()), read: async path => { calls.push(path); return files.get(path); } };
  assert.match(await resolveMarkdownImports('<!-- @include: a.md -->', repository), /Circular include/); assert.deepEqual(calls.sort(), ['a.md','b.md']);
  await resolveMarkdownImports('<!-- @include: a.md -->', repository); assert.equal(calls.length, 2);
  for (const path of ['../secret.md','https://example.invalid/remote.md','.git/config.md','missing.md']) await resolveMarkdownImports(`<!-- @include: ${path} -->`, repository);
  assert.equal(calls.length, 2); assert.match(await resolveMarkdownImports('<!-- @include: large.md -->', repository), /size limit/);
  assert.match(await resolveMarkdownImports('<!-- @include: a.md -->'), /Open a repository/);
  assert.match(await resolveMarkdownImports('<!-- @include: a.md -->', { ...repository, id: 'other', read: async () => 'Different repository' }), /Different repository/);
});
Then('the incremental composer grammar retains all source and recognizes mdit syntax', async () => {
  const { markdownLanguage } = await import('@codemirror/lang-markdown'); const { composerMarkdown } = await import('./markdown/composer.ts');
  const parser = markdownLanguage.parser.configure(composerMarkdown);
  const source = '==marked== ++inserted++ !!spoiler!! $x^2$ {中国:zhōng|guó} ::verified:: [^note] {.custom}\n\n::: tabs\n@tab One\nA\n:::\n\n<!-- @include: a.md -->';
  const tree = parser.parse(source).toString();
  for (const name of ['Highlight','Inserted','Spoiler','MditMath','MditRuby','MditRubyReading','MditReference','MditAttribute','MditDirective']) assert.ok(tree.includes(name), name);
  assert.doesNotMatch(parser.parse('`++literal++ $x$`\n\n```md\n!!literal!!\n```').toString(), /Inserted|Spoiler|MditMath/);
  assert.equal(parser.parse(source).length, source.length);
});

Then('incomplete streamed MathJax fences keep readable source without repeated conversion', () => {
  const calls = [], math = source => { calls.push(source); return '<svg></svg>'; };
  const render = (source, streaming = true) => renderChatMarkdown(source, 'streammath', false, math, streaming).join('');
  assert.match(render('```mathjax\nx^2'), /<code>x\^2/); assert.equal(calls.length, 0);
  assert.match(render('```mathjax\nx^2\n```'), /<svg>/); assert.deepEqual(calls, ['x^2\n']);
  assert.match(render('```mathjax\nx^2', false), /<svg>/); assert.equal(calls.length, 2);
});
Then('headings layouts and tabs retain unique scoped identifiers with repeated source anchors', () => {
  const html = render('## A {#same}\n\n## A {#same}\n\n## same\n\n@grids#same\n@grid\nCell\n@end\n\n## Tabs {#tabs-0-tab-0}\n\n::: tabs\n@tab One\nBody\n:::', 'scope');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size); assert.ok(ids.every(id => id.startsWith('scope-')));
  assert.match(html, /id="scope-same-1"/); assert.match(html, /<h2[^>]*>A<\/h2>/); assert.match(html, /role="tab"/);
});
