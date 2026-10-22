# Local interface fonts

The interface fonts were copied unchanged from the local Operations foundation.
Montserrat normal/italic use variable Latin weights 100–900; Rationale uses
normal weight 400. Their SIL Open Font License notices are retained. Material
Symbols Rounded supplies icons through the shared
[MaterialIcon](../../lib/components/MaterialIcon.svelte) and retains Apache 2.0.

The Material Symbols source recorded by Operations is
[Google Fonts v375](https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0&display=block),
with filled glyphs, weight 400, optical size 24, and grade 0. This reference
records provenance; application startup does not contact a font service.

| Asset | Bytes | License |
| --- | ---: | --- |
| `montserrat-latin.woff2` | 35508 | [SIL OFL](Montserrat-OFL.txt) |
| `montserrat-latin-italic.woff2` | 37120 | [SIL OFL](Montserrat-OFL.txt) |
| `rationale-regular.woff2` | 9420 | [SIL OFL](Rationale-OFL.txt) |
| `material-symbols-rounded.woff2` | 459096 | [Apache 2.0](Material-Symbols-Apache-2.0.txt) |
| `devicon.woff` | 1499540 | [MIT and brand notice](Devicon-MIT.txt) |

SHA-256 values of the copied files:

```text
6438d7b8ea9c7c3992d5e2fd2afdb1ff948570a3ef0bedae76247b51632960ba  montserrat-latin.woff2
86589d0b59b311712c3cbaac0b94eb054ecda4be7b52d695588548e4754b3165  montserrat-latin-italic.woff2
a9f9d07bfa674d332b5b99ac388728d98129735e88057c022fc8b03924ce41f5  rationale-regular.woff2
2b8339899e392ce26a96f86da3b4c581e218c4b463ee3b09d9c1431ed96da7b3  material-symbols-rounded.woff2
ea88166c9cfc9d616638df36a84b6dcab1aeeb2ad933c50d2e76f44096b4b258  devicon.woff
```

## Devicon repository file icons

Devicon 2.17.0 is vendored from commit
[`54cfe13ac10eaa1ef817a343ab0a9437eb3c2e08`](https://github.com/devicons/devicon/tree/54cfe13ac10eaa1ef817a343ab0a9437eb3c2e08),
reviewed on 2026-10-14. The complete
[WOFF font](https://raw.githubusercontent.com/devicons/devicon/54cfe13ac10eaa1ef817a343ab0a9437eb3c2e08/fonts/devicon.woff)
is unchanged: upstream supplies WOFF, TTF, EOT and SVG, with no WOFF2 asset in
this release. It uses normal style and weight 400. The application renders it
as monochrome glyphs in the local `Devicon` font family, inheriting interface
colors. No runtime font service or Devicon npm package is needed.

[`devicon-glyphs.json`](devicon-glyphs.json) contains all 1,491 single-glyph
class names from the released
[`devicon.min.css`](https://raw.githubusercontent.com/devicons/devicon/54cfe13ac10eaa1ef817a343ab0a9437eb3c2e08/devicon.min.css),
including 290 aliases for 1,201 distinct glyphs. Each key omits the `devicon-`
prefix and `:before` suffix; its value is the single Unicode character stored
as a JSON escape. To regenerate, read the `content` declaration of every
single-glyph rule, expand comma-separated selectors, decode CSS escapes,
apply later declarations in stylesheet order, then serialize keys in sorted
order with two-space indentation, ASCII escapes and a trailing newline.
Every retained codepoint was checked against this font's character map.
The upstream stylesheet, colors, and unused font formats are not bundled.

[`Devicon-MIT.txt`](Devicon-MIT.txt) preserves the complete upstream
[`LICENSE`](https://raw.githubusercontent.com/devicons/devicon/54cfe13ac10eaa1ef817a343ab0a9437eb3c2e08/LICENSE)
plus the brand notice from its
[`README.md`](https://raw.githubusercontent.com/devicons/devicon/54cfe13ac10eaa1ef817a343ab0a9437eb3c2e08/README.md).
Product names and marks belong to their owners; their use identifies file
technologies and does not imply endorsement. The build embeds this combined
notice in the standalone page's inert license template.

SHA-256 values of the additional upstream inputs and retained derivatives:

```text
fe6b37ed6edcbb9172c0c7739c5dc52f4ca7cc033ed9e8f665ed4ac67a9950fe  upstream devicon.min.css (129752 bytes)
121194741d4a915b9f5890fdd6dd95121f9b1f816517c792358d72d7c838d664  upstream LICENSE (1072 bytes)
2c2eaf4ecefc9b20c36250793b34613638311e098ce20029ad7eb5d39ed3a37d  upstream README.md (13109 bytes)
9631b32bef9f09a26f991c24b9b9d6ba37dbed4f2bb412ff5c56c85be245798f  devicon-glyphs.json (49516 bytes)
d04553420704dfa016e18c14604edde7c15dfe29be1b11a35042bc383752fe64  Devicon-MIT.txt (1450 bytes)
```

## Consumption and updates

[app.css](../../app.css) declares local font faces; Vite embeds them in the
HTML. Update this provenance and the consuming CSS when changing an asset,
then verify packaging and affected glyphs in a browser.

## Bundled editor default

JetBrains Mono is the default editor font, available offline immediately. Its
regular, italic, bold, and bold italic WOFF2 files are copied unchanged from
[`JetBrains/JetBrainsMono` at `19371302b95d218af43299bce79ddbddd0bc364d`](https://github.com/JetBrains/JetBrainsMono/tree/19371302b95d218af43299bce79ddbddd0bc364d/fonts/webfonts).
[JetBrainsMono-OFL.txt](JetBrainsMono-OFL.txt) preserves the full upstream license
and copyright; the build embeds it in the distribution's inert notices template.
The four files total 382,120 bytes and are embedded in the standalone HTML.
Selecting the bundled family or previewing it never contacts Google or requires
an IndexedDB copy. The font control treats it as already installed.

```text
f1a7a03672cdd494ce0d5543fac6e4360fe22403c6de297fdc2e55a815f7baff  JetBrainsMono-Regular.woff2
9f158b85eca345daeee01dfffa602709a905ea08b0cc60dbf6153cbbd97da08f  JetBrainsMono-Italic.woff2
08863c7964612257a90bd821e3127dc5ccb0b5046f881673a1ade5809eb21d0f  JetBrainsMono-Bold.woff2
7a0a901712a0b6b94914ac49c86168b4a0af32e623c7835840338c36e7eceb78  JetBrainsMono-BoldItalic.woff2
```

## Geomini interface default

`Geomini-variable.ttf` is the unchanged upright variable font (weights 200–800)
from the [pinned Google Fonts source](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/geomini/Geomini%5Bwght%5D.ttf).
It contains 180,664 bytes, SHA-256 `baf3fa2b1078c6a5cac05196889c01d63536ed6233e705262c7e6d4fbefffa59`.
[Geomini-OFL.txt](Geomini-OFL.txt) preserves its full upstream license and copyright.
The build embeds both font data and notices in the standalone HTML. Geomini is
available offline immediately and shown as installed in the interface font control.
