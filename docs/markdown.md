# Conversation Markdown

Both user and AI messages use markdown-it with the complete documented
[mdit plugin catalog](https://mdit-plugins.github.io/). The composer keeps the
original source and markers visible, with incremental inline formatting. Sending
always uses that source; previews, imports, IDs and timings never become provider
messages. There are 36 capabilities across 38 pinned npm packages: the KaTeX and
MathJax `-slim` packages are alternate integration wrappers, not additional syntax
that should be parsed twice.

## Available extensions

| Plugin | Syntax / behavior in this editor |
| --- | --- |
| abbr | `*[HTML]: Hyper Text Markup Language` defines abbreviations with hover explanations. |
| advanced-links | `@[video title="Clip"](https://…)`; image, audio, embed and inline `badge` are also configured. |
| alert | GitHub blockquote alerts such as `> [!TIP]`, including nested alerts. |
| align | `::: left`, `center`, `right` or `justify` containers. |
| anchor | Heading anchors and document-local `[Jump](#heading)` navigation; duplicate heading IDs stay unique. |
| attrs | `{#anchor .class title="Hint" style="color:red"}` on supported blocks/inline elements. IDs are message scoped, custom classes prefixed `md-`, and styles restricted to document presentation. |
| container | `::: note Optional title` and other named containers; `::: details Summary` is a disclosure. |
| demo | `::: demo Title` shows rendered Markdown and its literal source in a disclosure. Source HTML remains escaped. |
| dl | Definition lists: a term followed by `: Definition`. |
| embed | `{% youtube ID %}`, `vimeo`, `video`, `audio`, `iframe`, plus inline `{% icon verified %}`. |
| emoji | Full bundled emoji names, for example `:smile:` and `:rocket:`. |
| field | `::: fields` with `@` followed by a backticked field name, attributes such as `type=string required`, and a description. |
| figure | Standalone images have captions from their alt text. |
| footnote | `Note[^id]` and `[^id]: Footnote`; links navigate within the message. |
| icon | `::verified =24 /red::` uses the bundled Material Symbols font; optional size and color. |
| img-lazyload | Activated image previews use native lazy loading. |
| img-mark | `#dark` and `#light` image suffixes select the matching editor appearance. |
| img-size | New `![Alt =120x80](url)`, Obsidian `![Alt\|120x80](url)` and legacy `![Alt](url =120x80)` forms; new/legacy percentage dimensions also work. |
| include | `<!-- @include: docs/example.md -->`, with `{2-5}` line ranges, `#region`, nested includes and frontmatter removal. Plain `@include:` lines also work. |
| inline-rule | Shared inline engine used by insertion, highlight, spoilers, subscript and superscript. |
| ins | `++inserted++`. |
| katex / katex-slim | Default `$inline$`, `$$display$$`, `\(inline\)`, `\[display\]` and fenced `math`; embedded fonts and chemical equations through mhchem. |
| layout | `@flexs`/`@flex`, `@grids`/`@grid`, `@columns`/`@column`, closed with `@end`; nested directives and upstream layout utilities. |
| mark | `==highlight==`. |
| mathjax / mathjax-slim | Explicit fenced `mathjax` uses local accessible SVG output. Ordinary math stays on KaTeX to avoid parsing the same delimiters twice. |
| plantuml | `@startuml`…`@enduml` or fenced `plantuml`; an explicit image preview loads the encoded diagram from PlantUML. |
| ruby | `{中国:zhōng\|guó}` supplies pronunciation annotations. |
| snippet | `<<< src/example.ts#region{2,4-6 ts}` reads repository code, selects a region and highlights lines. |
| spoiler | `!!hidden content!!`; click, Enter or Space toggles the disclosure. |
| stylize | Emphasized `Recommended`, `Deprecated` and `Experimental` become badges. |
| sub | `H~2~O`. |
| sup | `x^2^`. |
| tab | `::: tabs` or `::: code-tabs`, with `@tab Title` sections. Click or use Left/Right/Home/End. Optional `#group` synchronizes groups within the message. |
| tasklist | `- [x] Done` and `- [ ] Pending`, displayed as read-only checkboxes. |
| tex | Common TeX syntax engine used by both local math renderers. |
| uml | Generic UML factory powers PlantUML; `@starttext`…`@endtext` also displays escaped diagram text locally. |

Containers close with `:::`. Code spans and fenced code keep extension syntax
literal. Advanced links, embeds, icons, stylize and UML are configurable plugin
factories; the table records this application's concrete configuration, rather
than claiming every possible third-party renderer is installed.

## Document presentation

Rendered messages use six distinct heading sizes, explicit ordered/unordered list
markers and consistent spacing between sections. Nested paragraphs, lists,
callouts, disclosures and tab panels follow the same document rhythm. Tables
fill the available width, preserve column alignment and use alternating row
surfaces. Code and wide content scroll within the message. Inline code uses its
foreground color without a background pill.

All document styles follow the selected semantic palette and interface text
size. Blocks and controls stay borderless, task checkboxes remain read-only, and
interactive links, spoilers, tabs and disclosures retain keyboard focus and
reduced-motion support. User message paragraphs retain their right alignment;
structured lists, tables and code use their natural reading alignment.

## Repository files and resources

Include and snippet use owned browser adapters for the upstream Node filesystem
plugins. A message retains the repository context selected when it was sent.
References resolve from the repository root, and nested includes from their
containing directory. Only listed working files can be read; `.git`, path escapes,
URLs and host filesystem paths cannot reach the reader. A missing file, missing
region, cycle or limit produces readable preview information. This grants the
Markdown preview read access, not the inference model. Expanded contents never
enter a request. Files are read from browser storage on first use; this is not a
historical filesystem snapshot or a repository tool for the model.

Expansion is bounded to eight nested files, 64 referenced files, 262,144 characters per file
and 1,048,576 expanded characters (UTF-16 code units). Each message reads files in batches of four, sharing a revision-keyed
cache bounded to 128 entries / 4M code units across repositories. Source is never changed.

Rendering starts no media requests. External images, audio, video, embeds and
PlantUML remain links with an explicit Load control. An activated iframe is
sandboxed; links and activated image/iframe previews use no referrer. Only HTTP(S) resources and HTTP(S)
or mail links are accepted. Image theme, dimensions and lazy-loading metadata
survive activation. PlantUML previews and external media need network access;
local formatting, emoji, icons, KaTeX and MathJax work offline. Following a link
or activating an external preview is an explicit reader action.

While streaming, MathJax waits for the closing fence before conversion.
MathJax initializes only after a `mathjax` fence is encountered; its engine and
classic TeX SVG glyphs are embedded, without a CDN loader. The renderer reuses up
to 32 identical block results within a 2M-code-unit cache. Both math engines bound macro
expansion and reset user macros between documents; MathJax blocks are independent
documents. HTML, resource and runtime-loader TeX extensions are unavailable.

## Ownership and verification

[`markdown.ts`](../src/lib/assistant/markdown.ts) owns message rendering and stable
block boundaries. Its `markdown/` modules own plugin configuration, browser file
imports, local MathJax, the incremental composer grammar and delegated document
interactions. Unchanged blocks retain DOM and selection during streaming. Tab
choices and spoiler disclosure survive later deltas and completion. The composer
never runs the HTML renderer, reads repository files or initializes TeX engines
while typing.

Run `npm run test:source -- --tags @ai-markdown-source` for the catalog, escaping,
syntax collisions, upstream include/snippet comparison, bounds and composer
syntax. Browser tags `@ai-mdit-catalog`, `@ai-mdit-imports`, `@ai-markdown-ui` and
`@ai-math-ui` cover actual interactions and offline rendering. Existing streaming,
growth and layout scenarios retain the previous presentation contracts. These
checks use synthetic local responses, with no paid inference or credentials.
