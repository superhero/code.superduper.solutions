# Shared optional package storage

`registry.ts` provides verified installation, bounded downloads, metadata listing,
removal, export/import reads and cross-tab change notifications. Each caller
supplies an embedded trusted catalog and a separate IndexedDB database name.

Language engines and syntax parsers share this storage behavior without sharing
their payloads or activation settings. Package envelope validation and sizes remain
in `../formatting/packages.ts`; reusable controls live in
`../components/editor/OptionalPackages.svelte`.

`download.ts` streams either one file or the trusted catalog's ordered parts.
It enforces each expected size, verifies part SHA-256 values, preserves aggregate
progress and cancellation, and reassembles the unchanged logical package before
the existing whole-package checksum and IndexedDB transaction. Package files
larger than 20 MiB are emitted as static parts by `build/package-artifacts.mjs`,
keeping them below Cloudflare Pages' 25 MiB file limit without a backend or an
external asset bucket. Stored packages and offline exports keep their original
envelope, complete notices, and checksum.
