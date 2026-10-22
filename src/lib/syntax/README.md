# Optional syntax support

`catalog.ts` owns selectable optional language identifiers and settings validation.
`registry.ts` binds the shared verified package registry to the syntax database.
`loader.ts` supplies the editor's CodeMirror/Lezer modules to an installed parser
factory; never bundle duplicate host facets or tags into optional packages.

The trusted artifact catalog comes from `build/syntax-packages.mjs`. Included
languages and filename routing remain in `../editor/languages.ts`; UI lives under
`../components/editor/`. See the [decision](../../../docs/adr/optional-syntax-packages.md)
for installation, execution and offline boundaries.

`syntaxAlternatives` records optional replacements for included parsers separately
from additional languages. `handlebars-beta.ts` wraps the Gentrace parser with the
same block-behavior adapter as the included stable provider. It is built only into
its optional package; core language code must never import it directly.
