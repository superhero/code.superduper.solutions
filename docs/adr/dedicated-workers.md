# Dedicated workers

> [!IMPORTANT]
> Keep substantial repository, parsing, and indexing work away from the rendering thread.

## Adopted boundary

Git operations, large directory processing, future search/index construction,
and resource aggregation should use dedicated workers where their APIs permit.
Svelte rendering and Window-only APIs remain on the page, with asynchronous
bridges for necessary calls. Workers are bundled inline to preserve the
self-contained application artifact.

## Reliability contract

Serialize persistent mutations across callers and tabs. Preserve native error
causes across worker boundaries, expose real progress, and provide cancellation
where an operation can safely stop. Obsolete search results must not replace a
newer editor state. Drain accepted writes before development hot replacement;
do not create a fallback storage copy after worker failure.

## Implementation status

The repository service runs through an inline dedicated worker. Its dependencies
are included in the standalone application's license inventory. Browser scenarios
exercise the real worker and IndexedDB. A worker is not a promise of smooth
rendering or unlimited memory.

Explicit document formatting runs in a separate inline worker. Formatter payloads
are optional, explicitly installed static packages stored in IndexedDB; the worker
loads and verifies them locally. Prettier packages have no external module graph.
Formatting serializes pure requests and has no repository filesystem access. The
UI validates document generation and context before applying one transaction
through existing history. Formatter workers start on demand and terminate on
timeout, package installation/removal or hot disposal. The core worker remains
embedded; optional provider payloads and their complete notices remain separate.
