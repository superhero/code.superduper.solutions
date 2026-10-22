# Report asset notices

The standalone reports embed full first-party licenses and the finite vendor
inventory declared in [`report-notices.mjs`](../scripts/report-notices.mjs).
The inert `license-notices` template makes the text inspectable in each HTML
artifact without adding a report panel or a network request. Vendor licenses
remain separate from the first-party AGPL license and additional terms.

## Reviewed inputs

| Component | Artifact content | Notice source |
| --- | --- | --- |
| First-party report wrapper | Both report shells | Root `LICENSE` and `LICENSE-ADDITIONAL-TERMS`, read during generation |
| multiple-cucumber-html-reporter 4.4.2 | Test report pages, scripts and logo | Installed package `LICENSE` (MIT) |
| Tailwind CSS 4.3.3 | Test report styles | Installed package `LICENSE` (MIT); version matches the reporter's stylesheet header |
| Font Awesome Free 7.2.0 | Test report CSS and WOFF2 icon fonts | [Pinned upstream license](https://github.com/FortAwesome/Font-Awesome/blob/337dd2045d5621ce0f8567c33c256f3dedeed55d/LICENSE.txt), preserved as [`Font-Awesome-7.2.0-LICENSE.txt`](Font-Awesome-7.2.0-LICENSE.txt) |
| istanbul-reports 3.2.0 | Coverage pages, styles and navigation scripts | Installed package `LICENSE` (BSD-3-Clause), preserved as [`istanbul-reports-3.2.0-LICENSE.txt`](istanbul-reports-3.2.0-LICENSE.txt) |
| Google Code Prettify | Istanbul's bundled highlighting JavaScript and CSS | [Pinned upstream COPYING](https://github.com/google/code-prettify/blob/e006587b4a893f0281e9dc9a53001c7ed584d4e7/COPYING), preserved as [`google-code-prettify-COPYING.txt`](google-code-prettify-COPYING.txt) |

Font Awesome's complete upstream notice includes its icon license reference;
the embedded assets here are fonts (OFL-1.1) and CSS (MIT). Existing asset
headers remain intact. Istanbul does not identify a Code Prettify version;
the pinned upstream license is a legal-text source, not a claim that its code
revision matches the bundled minified file. The embedded attribution also
retains Google's 2006 JavaScript and 2015 CSS notices from that upstream tree.

The Istanbul notice is checked in so the production-only dependency install
used for coverage publication does not need the development test toolchain.
Generation checks the lockfile's reviewed reporter, Tailwind and Istanbul
versions. Dependency upgrades must review asset versions, notices and the
chart-removal transformations before updating those checks.

## Chart-free adaptation

The reporter's separate ApexCharts 5.14.0 asset uses
[Community/Commercial/OEM terms](https://github.com/apexcharts/apexcharts.js/blob/v5.14.0/LICENSE).
This project does not assume entitlement to redistribute it. Report generation
excludes that asset, its chart runtime and graphical chart panels. It adapts
the reporter's main/theme initialization so feature tables, filtering, sorting,
scenario details, attachments, theme controls and navigation continue working.
Feature summary cards and complete result data remain; graphical charts are
omitted.

## Snapshot verification

These SHA-256 values describe the unmodified upstream/package notice bytes:

```text
20c6f40715a567c97b80f6944beb8bb325835cab47ea7dcab89ee3b8e077eced  Font-Awesome-7.2.0-LICENSE.txt
deec98192f710d6e6aa8aba33f67087199e62c2db7f9d793b0ad465248ca3d05  google-code-prettify-COPYING.txt
e09f9b52c6ce5c17ba8103cd0cbf446c33b5448b0c1d01d711b36a1f15a501ba  istanbul-reports-3.2.0-LICENSE.txt
```
