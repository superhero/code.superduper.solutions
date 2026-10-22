# Bundled assets

Application artwork, local [fonts](fonts/README.md), and their notices live here.
Fonts are consumed by `@font-face` declarations in [app.css](../app.css).

## Canonical favicon

[`favicon.svg`](favicon.svg) is original project artwork: a curved cream `f`
and small amber `x` on a navy rounded tile, inspired by function notation in the
provided `f_x` reference. Its paths are authored for Code; no Google icon path
or font glyph is copied. The source retains Erik Landvall's copyright and
AGPL-3.0-only notice, subject to the project's additional terms.

The Operations sibling keeps its own canonical SVG in the same asset location:
connected square schema entities in navy on an amber tile. Three entities share
a vertical spine on the left, and the middle one connects to an entity on the
right. Shared palette colors and rounded geometry relate the applications while
their marks and backgrounds distinguish tabs. Keep both marks legible at 16 pixels.

The 64×64 Code SVG source has SHA-256
`5b8f2de47ad4693c9ca661ab675d02da38006c2a10d046e9226e2df35ee1b8a3`.
Update this record when the artwork changes.

## Favicon outputs

[`build/favicons.mjs`](../../build/favicons.mjs) derives every compatibility file
from the canonical SVG using pinned Sharp 0.35.5. Run `npm run icons:generate`
after editing the SVG; `npm run icons:check` checks exact bytes without writing.
The build runs this check before packaging. Do not edit generated files directly.

| Files under `src/public/` | Size and purpose |
| --- | --- |
| `favicon.svg` | Unchanged 64×64 source copy for a stable hosted SVG URL. |
| `favicon.ico` | 16, 32 and 48 pixel uncompressed BMP/DIB entries for older clients. |
| `favicon.png` | 96×96 PNG for the declared raster fallback and crawling. |
| `favicon.bmp`, `favicon.gif`, `favicon.jpg`, `favicon.ppm`, `favicon.tiff` | 96×96 compatibility exports; BMP, JPEG and PPM flatten transparency onto cream `#eee9df`. |
| `apple-touch-icon.png` | 180×180 Apple touch icon. |

[`index.html`](../index.html) declares ordinary favicon choices in ICO, PNG,
then SVG order, followed by the Apple touch PNG. Its SVG reference uses Vite's
explicit `?inline` option and is embedded in the production HTML; the external
ICO/PNG links remain available to clients and crawlers. The other exported
formats are compatibility downloads, not additional universal browser choices.
There is no web manifest or installable PWA.

[Google's favicon guidance](https://developers.google.com/search/docs/appearance/favicon-in-search),
checked on 2026-10-14, lists BMP, GIF, ICO, PNG, JPEG, PPM and TIFF. All seven
formats are provided. Search eligibility also requires a crawlable home page
and icon URL; these local files do not imply publication or search inclusion.
Recheck that guidance when changing crawler compatibility.

## Adding or replacing resources

Use HTML asset references, imports or CSS URLs so Vite embeds application
resources in the HTML. `src/public` contains unchanged hosting metadata and the
nine generated favicon files; other resources remain imported from `assets`.

Preserve each asset's source, license, variant/subset, and checksum when adding
or replacing it. Retain applicable notices and verify declared font weight/style
against the consumer. Build acceptance checks packaging, and browser scenarios
check actual loading. Keep unrelated product data out of this directory.
