# Shared optional package storage

`registry.ts` provides verified installation, bounded downloads, metadata listing,
removal, export/import reads and cross-tab change notifications. Each caller
supplies an embedded trusted catalog and a separate IndexedDB database name.

Language engines and syntax parsers share this storage behavior without sharing
their payloads or activation settings. Package envelope validation and sizes remain
in `../formatting/packages.ts`; reusable controls live in
`../components/editor/OptionalPackages.svelte`.
