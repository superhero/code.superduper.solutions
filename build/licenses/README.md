# Explicit package notice fallbacks

The build normally reads bundled packages' own license files. A fallback here
applies only to the exact package name, version and declared license registered
in `../license-notices.mjs`. Missing or changed declarations fail the build.
There is no general replacement for missing package notices.

## locate-character 3.0.0

The npm manifest identifies Rich Harris as author and declares MIT; its README
also declares MIT. The published archive contains no license file. The source
is pinned by SHA-256 in the packager. Upstream's manifest points to GitLab;
attempts to retrieve a release or default-branch license returned 404 on
2026-10-16. The npm release records Git commit
`4f08a59ec248121f7002abd02ee7b94e8eda06bc`.

`locate-character-3.0.0.txt` preserves the package attribution and the unmodified
[SPDX MIT template](https://github.com/spdx/license-list-data/blob/main/text/MIT.txt).
It explicitly identifies the template placeholders and does not invent an
upstream year or copyright statement. This bounded fallback is needed for
Svelte's compiler inside the browser formatter.

The browser npm declaration installer also reuses this same notice for
Svelte's required `locate-character` types. It requires version 3.0.0, MIT in
both manifests and the exact published archive integrity recorded in the local
lockfile; other releases or missing notices still fail installation.

## clean-git-ref 2.0.1

The installed npm package and the [pinned upstream manifest](https://github.com/elicwhite/clean-git-ref/blob/bf3c8afc8032bcdc6a53634c18b601dc6df478fb/package.json)
identify Eli White as author and declare `Apache-2.0`. The repository formerly
used `TheSavior/clean-git-ref`; GitHub redirects it to `elicwhite/clean-git-ref`.
Annotated tag `v2.0.1` (`732a2322076e0657f2eead4ec5ea965bcb4ca9ac`)
peels to commit `bf3c8afc8032bcdc6a53634c18b601dc6df478fb`.

The complete [release tree](https://github.com/elicwhite/clean-git-ref/tree/bf3c8afc8032bcdc6a53634c18b601dc6df478fb)
has no LICENSE or NOTICE file, and its implementation contains no additional
copyright notice. The npm archive likewise contains only its manifest, README
and compiled implementation. These were checked on 2026-10-14.

`clean-git-ref-2.0.1.txt` preserves the package's author attribution and identifies
its release, followed by the unmodified [official Apache License 2.0 text](https://www.apache.org/licenses/LICENSE-2.0.txt).
Its appendix remains the standard template; no copyright holder or year has
been invented. This is an explicitly documented license-copy fallback, not a
claim that upstream shipped this assembled notice file.

SHA-256 of the official Apache text:
`cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`.
SHA-256 of the assembled notice:
`9186a408c27c15dd007170bfc8c91b12cdbe5773d9f636c79941119dc3be743d`.

## diff3 0.0.3

The published npm archive has no separate license file. Its `diff3.js` and
`onp.js` implementations each begin with a complete MIT license notice;
`diff3-0.0.3.txt` copies both source headers verbatim, retaining Tony
Garnock-Jones, LShift Ltd. and Tatsuhiko Kubo's separate attributions.
The build checks the installed source files against these reviewed SHA-256
digests before using the fallback:

- `diff3.js`: `a2cf76d0acfaae0e098434307a1180d24ebf86451b70cbfc81704df55c54896f`
- `onp.js`: `6970cf6907e5f3e62a95cf6942eb4199858ce9d42af866e064901f6183319a70`

The package's published source repository is
[`axosoft/diff3`](https://github.com/axosoft/diff3); this notice is based on the
exact installed npm release, not an assumed matching upstream Git revision.
The lockfile's npm archive integrity is
`sha512-iSq8ngPOt0K53A6eVr4d5Kn6GNrM2nQZtC740pzIriHtn4pOQ2lyzEXQMBeVcWERN0ye7fhBsk9PbLLQOnUx/g==`.
SHA-256 of the assembled notice:
`607c0a989ffa49f581fdc1ee4e420ec6e7fa685f9a7d91586aa56b78b4fb229c`.

## Roslyn compiler/runtime notices

`roslyn-0.23.2.json` supplements the wrapper-only license returned by
`@dprint/roslyn`'s Wasm export. It preserves the complete upstream Roslyn,
NativeAOT-LLVM runtime and Humanizer license/notice texts. Upstream's
[0.23.2 project](https://github.com/dprint/dprint-plugin-roslyn/blob/0.23.2/DprintPluginRoslyn/DprintPluginRoslyn.csproj)
pins Roslyn 5.9.0 and Microsoft.DotNet.ILCompiler.LLVM 10.0.0-rc.1.26357.1.
Roslyn Workspaces' NuGet metadata identifies Roslyn commit
`35d9211b841e7613c1d2f8f5af6d628ace696c4c` and its Humanizer.Core 2.14.1 dependency;
Humanizer's metadata identifies commit `3ebc38de585fc641a04b0e78ed69468453b0f8a1`.
The compiler package from upstream's dotnet-experimental NuGet feed identifies
runtimelab commit `9954350a58ede8b8eaaeb24112ca4f1e78cc527c` and includes the retained
`THIRD-PARTY-NOTICES.TXT`. Per-text source locations and original byte digests
are recorded in the JSON, inspected 2026-10-16. Complete upstream third-party
notices may describe components removed by trimming; retaining them does not
claim every component is present.

The packager checks the exact Roslyn package version and Wasm SHA-256 before
using this supplement. Review dependency identity and notices before updating
Roslyn; never silently apply these texts to another binary. These records are
build inputs and require no runtime NuGet downloads or .NET installation.

## Community Wasm artifacts and LLVM

Community npm packages retain the complete notice text exposed by their dprint
Wasm API. Non-npm releases are pinned by URL, size and SHA-256 in
`build/formatter-artifacts.json`; package construction preserves those original
bytes and their exported notices. No native executable is installed or run.

`clang-format-0.1.0.json` supplements the wrapper MIT notice with LLVM and Clang
22.1.8's complete Apache-2.0/LLVM-exception notices. The adapter's release commit
`dc353d943d48c999d547846f92bcc45809c77b15` pins that LLVM version in
`scripts/fetch_llvm.sh`. Original URLs/text digests are retained, and the build
checks the exact Wasm digest before applying the supplement. Review compiler
identity and notices before upgrading the binary.

Language-engine builds also preserve missing npm license files with guarded
fallbacks: `@vscode/l10n@0.0.18` uses the upstream Microsoft MIT notice from
https://raw.githubusercontent.com/microsoft/vscode-l10n/main/LICENSE, and
`boolbase@1.0.0` uses the upstream ISC notice from
https://raw.githubusercontent.com/fb55/boolbase/master/LICENSE (retrieved
2026-10-16). `license-notices.mjs` pins package versions and shipped source hashes
before applying these local complete texts. Neither fallback permits silently
changing the dependency version or source.

`fourmolu-0.21.0.0.json` pins the official website Wasm SHA-256, its deployment
revision (`1f9f64e6dfb51544a5bb0fc5cf2edf80e44b8a12`) and Fourmolu source revision
(`cae291b3363c9a404a16caeba79f704683b96c1a`). Its notice inventory uses the linked
unit identifiers recovered from the Wasm `name` section, plus array's embedded
unit string and the GHC 9.12 runtime/standard-library and WASI libc notice
families. Hackage license files identify exact package versions; the themed
highlighter notice uses the source revision pinned by upstream's Cabal project.
The `choice` release omits its license file, so the complete upstream BSD notice
is retained from the recorded revision. Source URLs accompany every notice.

The upstream website does not publish a complete reproducible toolchain plan.
Do not infer unknown compiler/libc patch versions from this inventory. Its
frozen notice texts and exact binary digest bound this redistribution; a new
binary requires reviewing linked units and runtime notices again. The owned
JavaScript adapter bundles the separately pinned browser WASI shim and inert
HTML parser, with their full notices collected from the module graph. No
upstream Haskell or WASI program is installed on the host machine.

Browser language notice fallbacks come from npm gitHead revisions:
- @postgres-language-server/wasm: `supabase-community/postgres-language-server@5c2f5d7140b7a9c99654f889c58b49f2d692ad77` (`LICENSE`), guarded by published payload digest.
- @taplo/lsp: `tamasfe/taplo@48e4c083e6a98891e3d6b2b65450970a3779e8cb` (`LICENSE.md`), guarded by published payload digest.
- wgslender-lsp: `HugoDaniel/wgslender@17bddb3a4c02e2b692feea01e80325918fd23402` (`LICENSE`), guarded by published payload digest.

## Shopify Liquid support data and isarray 1.0.0

`shopify-liquid-docs.txt` preserves `LICENSE.md` from
`Shopify/theme-liquid-docs@e729cbf736095ecca9ec84a2fff658e155c8e54f`.
The manifest pins that license and all bundled data by size and SHA-256.
`isarray-1.0.0.txt` extracts the complete MIT notice from its published README;
the fallback guards both that README and `index.js` by digest.

## Language-engine notice controls audit — 2026-10-17

Scope: the 12 generated `dist/languages/*.language.json` artifacts from the pinned
local build, their complete `notices` arrays, the worker license collector,
TypeScript's published third-party notice file, and the three Wasm notice
fallbacks above. This assesses whether each engine needs a dedicated license
button; it is not a complete license clearance of every optional formatter,
syntax package, or compiled Rust dependency.

**Finding:** no inspected license requires a separate per-engine control.
Retaining and delivering notices is still necessary. A shared, user-readable
notices view can replace individual engine license buttons. GitHub links alone
are not a replacement for notices supplied with the distributed artifacts.

The artifacts contain 85 unique third-party name/version notice records,
excluding application LICENSE and additional terms. Declared identifiers are
MIT (67), BSD-2-Clause (8), ISC (5), BSD-3-Clause (1), Apache-2.0 (1),
BlueOak-1.0.0 (1), and CC0-1.0 (1). One further Shopify documentation record
has no identifier but contains the standard MIT text. These counts describe
records, not every license contained within their texts: for example the JSON
service's MIT notice also retains a BSD notice.

| Engine | Version | Third-party notice records | Artifact SHA-256 prefix |
| --- | --- | ---: | --- |
| css | 6.3.10 | 5 | `a8617b4bf7bf` |
| dockerfile | 0.16.1 | 7 | `7a5474758405` |
| graphql | 5.7.0 | 5 | `0cc3621f2db3` |
| html | 5.6.2 | 5 | `1ac738d878f1` |
| json | 5.7.2 | 6 | `b9d81bf418d7` |
| liquid | 2.23.1 | 37 | `367adbdcc5d4` |
| markdown | 0.5.0 | 27 | `382a26014bef` |
| postgres | 0.28.2 | 2 | `929c728279db` |
| toml | 0.8.0 | 2 | `c6d1a6789f60` |
| typescript | 6.0.3 | 2 | `9363690721fa` |
| wgsl | 1.5.1 | 2 | `f67db3e879d4` |
| yaml | 2.0.0 | 22 | `415a40835416` |

The MIT/ISC and BSD texts require retention with distributed copies or related
materials. Apache 2.0 section 4 requires the license and applicable notices and
permits NOTICE attribution in a distributed notice file, source/documentation,
or an appropriate display. Blue Oak requires delivery of the text or a link.
None of those prescribes one button per engine. CC0 itself has no attribution
condition. Sources: [MIT](https://opensource.org/license/mit),
[ISC](https://opensource.org/license/isc),
[BSD 2-clause](https://opensource.org/license/bsd-2-clause),
[BSD 3-clause](https://opensource.org/license/bsd-3-clause),
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0),
[Blue Oak](https://blueoakcouncil.org/license/1.0.0), and
[CC0](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

The audit found material limits in the current preservation evidence:

- TypeScript 6.0.3 ships `ThirdPartyNoticeText.txt`, but its optional artifact
  currently contains only the application notices, path-browserify's MIT notice,
  and TypeScript's Apache license. The collector finds LICENSE/COPYING files and
  does not collect this supplemental file. It must be preserved for the bundled
  libraries. In particular its W3C DOM notice requests a location viewable to
  users, supporting a shared readable notice view, not a per-engine button.
  The file also includes DefinitelyTyped, Unicode and WHATWG/CC-BY attribution.
  [Upstream text](https://raw.githubusercontent.com/microsoft/TypeScript/v6.0.3/ThirdPartyNoticeText.txt).
- PostgreSQL 0.28.2, Taplo 0.8.0 and wgslender 1.5.1 carry digest-guarded upstream
  root-license fallbacks. The JavaScript module-graph collector does not inspect
  linked dependencies inside their precompiled Wasm. These records therefore do
  not establish full transitive license compatibility or complete binary notices.
- Core notices are embedded in an inert `license-notices` HTML template.
  Optional engine notices are inside their own downloaded packages and are read
  by the current individual controls; they are not automatically consolidated
  into the core template. Removing those controls does not itself create a shared
  readable view. The application's own AGPL section 5(d) and Section 7 notice
  policy are separate from third-party compatibility and should be addressed at
  application level, rather than repeated beside each engine.

No incompatible license was identified in the inspected notice records. Full
compatibility is **not certified** by this bounded audit: the missing TypeScript
supplement and precompiled-Wasm dependency provenance remain unresolved.
A dedicated per-engine license button would not fix those packaging gaps.
No package payload, UI control, or installation behavior was changed in this audit.

### Remediation following this audit

The TypeScript language artifact now includes the published package's complete
`ThirdPartyNoticeText.txt` in addition to its main license. A shared, user-readable
**Licenses and notices** settings section reads production core notices and
verified installed formatter, syntax and language-engine notices on demand.
Individual engine license controls have been replaced by that shared view.
The PostgreSQL/Taplo/WGSL precompiled-dependency inventory limitation above remains
unresolved; these UI and TypeScript packaging changes do not certify those binaries.
The artifact hashes in the audit table describe the pre-remediation build.

## @replit/codemirror-minimap 0.5.2

The npm manifest declares MIT and identifies Brady Madden as author. Neither
the npm archive nor the upstream root inspected on 2026-10-17 contains a license
file. npm records release commit `eb03174ce67e177bb86297c84c0389491350ff21`.
`codemirror-minimap-0.5.2.txt` preserves that attribution and the unmodified SPDX
MIT template, explicitly retaining template placeholders rather than inventing
a copyright statement. The fallback checks the exact release manifest and
compiled JavaScript digests; changes require review.
