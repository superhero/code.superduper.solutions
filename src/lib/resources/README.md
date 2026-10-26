# Browser resources

The **Resources** pane adapts Operations' browser resource cards, storage/heap
counters, long-task observer and manual page-memory measurement. Presentation
lives in [`components/resources`](../components/resources/ResourcesPage.svelte).
It slides into the far-right dock after Vault, using the shared three header
rows, palette, controls and reduced-motion transition. The editor toolbar
opens it independently of the main view. Visibility, opening priority,
preferred width (320–1,600px) and scroll position are workspace metadata.
Narrow screens close older panes while retaining Resources and the editor;
container queries adapt cards to the actual pane width.

`browser.ts` samples origin storage estimates, persistence status and the optional
JavaScript heap counters. Opening Resources requests persistent origin storage if
it is not already granted; the browser can decline. Best-effort storage notes
are shown only when the reported persistence status is false. `processing.ts` observes this page's main-thread tasks
lasting at least 50 ms; blocking time is only their duration beyond 50 ms, not
CPU utilization. Each sample resets the task counters and identifies its actual
observation interval. Unsupported or failed observations remain `null`.

Sampling runs after the previous cycle completes, with two seconds between
cycles. Only the latest 1,024 samples remain in memory. Opening Resources starts
monitoring, which continues across main views while the pane is open. Closing
the pane, hiding the document and application teardown stop the observer and
scheduled sampling and abort unfinished measurements. Reopening keeps the
bounded session buffer; reloading clears it. Monitoring is automatic, with no Pause or Refresh controls. The view has
no recording worker, cross-tab recorder, persisted metrics or network reporting.

`history.ts` maps real sample ages onto a logarithmic horizontal axis measured
in CSS pixels. New readings are roughly twelve pixels apart at the normal
sampling interval; spacing decreases until the oldest interval is one pixel.
The measured chart width determines the visible age limit. Older readings are
outside the plot; the bounded session buffer allows resizing without immediately
losing that detail. Within a shared pixel column, first/last and minimum/maximum
readings retain spike order. Missing measurements still break the line.
Time labels use the same scale and stay separated on narrow layouts. No repeated
geometry reads or unbounded recording are needed.

`databases.ts` inspects existing IndexedDB schema and record counts once on
opening, then only on Refresh. It never reads record values or repository
content, and does not invoke repository recovery or filesystem/Git operations.
Transactions are read-only, an unexpected database upgrade is aborted, late
connections close, and version-change blocking releases the connection. Scans
are serial, capped at 32 databases / 64 stores each and a five-second total
deadline, with 1.5-second limits on individual opens/counts. Partial results and
errors are explicit. Browsers without database enumeration show unavailable
counts; inspection does not open guessed database names.

Repository counts use the already loaded snapshot, including the loaded history
window, rather than scanning Git or reporting estimated bytes as logical file
sizes. Origin quota/usage, database record counts, JavaScript heap and optional
page memory are distinct. None represents total browser-process or OS usage.

`page-memory.ts` measures only on request, checking secure context, isolation and
the actual API. Categories aggregate byte counts without retaining attribution
URLs. Native storage and page-memory promises are shared until settled, including
after a caller aborts or times out; those APIs cannot be cancelled by aborting
the caller. This prevents repeated native measurements when a view reopens.

Named source and browser scenarios cover missing/invalid APIs, failures, shared
requests, read-only inspection, observer lifecycle, privacy, reload, keyboard and
narrow layouts. The production browser scenario also compares live and paused
page performance counters in three alternating pairs, without trace snapshots
inside its timed windows. It writes its observations into ignored test artifacts;
there is no arbitrary timing gate or claim of whole-browser CPU measurement.

A local production check on 2026-10-19 used Chromium 155.0.8059.39, 1280×900,
dark Bonfire, reduced motion and an empty repository list, under a 150% CPU /
2 GiB test scope. Across three alternating 4.25-second pairs, page task time
was 17.2 ms median live (12.1–26.1 ms), versus 1.5 ms paused (0.1–1.9 ms).
Each live window produced two samples and paused windows produced none. These
are local collector/rendering observations, not a whole-browser CPU benchmark.
Raw values: `tmp/test/browser/live-monitoring-has-bounded-observable-page-overhead-c743977b/resource-monitoring-cost.json`.
