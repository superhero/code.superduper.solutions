// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { renderCommitMarkdown } from "./commit-markdown.ts";

const tags = html => [...html.matchAll(/<span class="commit-tag">([^<]*)<\/span>/g)].map(match => match[1]);

Then("commit hashtags support words numbers and internal separators without replacing headings", function () {
  const html = renderCommitMarkdown("#123-45 #work_item #révision #日本語 #e\u0301tape\n\n# Heading\n\n## Smaller\n\n**#fix** (#456) word#ignored ##ignored");
  assert.deepEqual(tags(html), ["#123-45", "#work_item", "#révision", "#日本語", "#e\u0301tape", "#fix", "#456"]);
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<h2>Smaller<\/h2>/);
  assert.match(html, /<strong><span class="commit-tag">#fix<\/span><\/strong>/);
  assert.match(html, /word#ignored ##ignored/);
});

Then("escaped hashes code URLs and link labels stay outside commit tag styling", function () {
  const html = renderCommitMarkdown("\\#escaped `#code` https://example.invalid/#fragment https://example.invalid/a(#nested) [#label](https://example.invalid/#target) #real\n\n```text\n#fenced\n```");
  assert.deepEqual(tags(html), ["#real"]);
  assert.match(html, /#escaped <code>#code<\/code>/);
  assert.match(html, /https:\/\/example.invalid\/#fragment/);
  assert.match(html, /<a [^>]*>#label<\/a>/);
  assert.match(html, /<pre><code class="language-text">#fenced\n<\/code><\/pre>/);
});

Then("commit Markdown preserves emphasis lists quotations and fenced code", function () {
  const html = renderCommitMarkdown("A **strong** and *soft* message with ~~old~~ code.\n\n- first\n- second\n\n1. numbered\n2. next\n\n> quoted\n\n```ts\nconst value = '<safe>';\n```");
  for (const expected of ["<strong>strong</strong>", "<em>soft</em>", "<s>old</s>", "<ul>", "<li>first</li>", "<ol>", "<li>numbered</li>", "<blockquote>"])
    assert.ok(html.includes(expected), expected);
  assert.match(html, /<pre><code class="language-ts">const value = '&lt;safe&gt;';\n<\/code><\/pre>/);
});

Then("commit Markdown escapes HTML blocks unsafe URLs and image markup", function () {
  const html = renderCommitMarkdown('<script>alert(1)</script>\n\n<img src="https://example.invalid/tracker" onerror="alert(1)">\n\n[bad](javascript:alert(1)) [data](data:text/html,test) [file](file:///etc/passwd)\n\n![<img> **alt** #123](https://example.invalid/remote.png)');
  assert.doesNotMatch(html, /<(?:script|img|iframe)\b/i);
  assert.doesNotMatch(html, /<a\b/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img&gt; alt #123/);
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('src="https://example.invalid/remote.png"'));
  assert.doesNotMatch(renderCommitMarkdown('[bad](jav&#x61;script:alert(1))'), /<a\b/);
});

Then("commit Markdown permits safe external links without inventing local routes", function () {
  const html = renderCommitMarkdown('[site](https://example.invalid/a?q=1&b=2) [mail](mailto:editor@example.invalid) [short](https:example.invalid) [local](./README.md) [anchor](#section) [network](//example.invalid)');
  assert.match(html, /href="https:\/\/example.invalid\/a\?q=1&amp;b=2" target="_blank" rel="noopener noreferrer">site<\/a>/);
  assert.match(html, /href="mailto:editor@example.invalid" target="_blank" rel="noopener noreferrer">mail<\/a>/);
  assert.match(html, /href="https:\/\/example.invalid\/" target="_blank" rel="noopener noreferrer">short<\/a>/);
  assert.equal((html.match(/<a\b/g) ?? []).length, 3);
  assert.match(html, /local anchor network/);
});

Then("commit Markdown separates paragraphs while preserving code and single line breaks", function () {
  const html = renderCommitMarkdown("first  spaces\nnext\n\n \n\t\nlast\r\nline");
  assert.match(html, /<p>first  spaces<br>next<\/p>/);
  assert.match(html, /<p>last<br>line<\/p>/);
  assert.equal(html, "<p>first  spaces<br>next</p>\n<p>last<br>line</p>\n");
  assert.ok(!html.includes("<br>\n"));
  assert.equal(renderCommitMarkdown("first\n\nsecond"), "<p>first</p>\n<p>second</p>\n");
  const code = renderCommitMarkdown("```text\nfirst\n\n\nlast\n```\n\nend");
  assert.match(code, /<code class="language-text">first\n\n\nlast\n<\/code>/);
  assert.ok(code.endsWith("</code></pre>\n<p>end</p>\n"));
  const list = renderCommitMarkdown("- first\n\n- second\n\n\nend");
  assert.equal(list, "<ul>\n<li>\n<p>first</p>\n</li>\n<li>\n<p>second</p>\n</li>\n</ul>\n<p>end</p>\n");
  assert.equal(renderCommitMarkdown(""), "");
});
