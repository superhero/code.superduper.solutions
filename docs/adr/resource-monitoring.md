# Resource monitoring

> [!IMPORTANT]
> Distinguish measured browser resource observations from unavailable or inferred values.

## Current implementation

**Resources**, available from the Page dropdown, adapts Operations' browser
dashboard into the editor. It shows a bounded live chart, JavaScript heap,
origin storage/quota and persistence, main-thread long tasks and blocking time,
read-only IndexedDB record counts, and counts from the loaded repository.
Full page-memory measurement is a separate explicit action, when supported.
The opt-in development toolbar still provides deeper performance/timeline tools.

## Measurement contract

Resource inspection helps explain large repositories, indexing, and
storage pressure without reading file contents into diagnostics. Keep origin
storage estimates, logical filesystem sizes, record counts, main-thread stalls,
and any supported memory measurements distinct. Missing or unsupported values
remain unavailable, not zero. Browser measurements are not complete operating
system process accounting.

## Collection and privacy

After Resources is first opened, monitoring continues across application views and collects after each prior cycle, with two seconds
between samples and at most 1,024 in-memory observations. Its logarithmic time
axis expands recent readings and compresses older readings into pixel columns,
retaining extrema and gaps. The visible age limit follows the measured chart
width and reaches a one-pixel interval at the oldest edge. Hiding the document stops the observer and timer. Database counts refresh on
opening, with a five-second scan budget and bounded schema
inspection. Opening Resources requests persistent storage when not already granted;
the browser decides whether to grant it. The UI reports the actual status and only
shows best-effort storage notes while persistence is false. Native storage/page-memory requests remain shared until settled even
after a caller stops waiting. No record values, Git data or file contents are
scanned. The [module guide](../../src/lib/resources/README.md) owns exact bounds.

There is no persistent metric history, recording worker or background recorder.
Future recording must coordinate ownership across tabs. Repository inspection must be read-only and
respect writer locks; it must not trigger commits, checkout, recovery, or remote
access. Persist only the explicitly selected aggregate data and keep it outside
repository histories. Do not copy Operations' workflow metrics namespaces or
retention semantics without an editor-specific requirement.

## Verification

Source and production-browser scenarios cover unavailable APIs, storage failure,
teardown, nonmutation, responsive layout and keyboard navigation. A bounded
live/paused comparison records page rendering costs with tracing disabled in its
measurement windows. Cross-origin
isolation enables some APIs but does not establish their availability or the
correctness of a measurement; test the actual supported browser environment.
