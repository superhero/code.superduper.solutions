# Browser assistant uses Pi for local agent conversations

> [!IMPORTANT]
> AI chat uses explicit per-conversation connections: local Ollama and
> vault-backed OpenAI and explicitly installed browser models, with the editor's shared pane and controls.

## Context

The editor is a static browser application without an application backend. The
developer selected Ollama and Ornith 9B for short, manually reviewed iterations
before adding other providers or agent behavior. A verified sibling implementation
supplies browser connection and streaming experience; its demo aesthetics and
Pi tool loop informed the initial transport slice. The developer subsequently
requested the browser Pi harness, configurable instructions, read-only tools and
per-model context budgets. The developer later
extended the connection UI to OpenAI and requested Operations' guarded key/value
vault approach, retaining the provider-independent AI title and thread tabs.

## Decision

Call Ollama discovery directly and adapt its native bounded stream to the Pi
browser agent harness. Keep OpenAI discovery/Responses in the secret worker.
Pi owns transcript replay, tool validation, lifecycle events and the tool loop.
Connection plugins implement the Pi stream/model contract, and repository tools
implement Pi AgentTool; future adapters use those extension points. Do not load
the Node coding-agent extension runtime into the static browser. Connect and Send are explicit. Ollama discovers local
models, defaults to Ornith 9B and disables thinking. OpenAI receives a selected
vault entry ID; the worker resolves it and injects auth only at the fixed official
HTTPS origin. Saved profiles contain public configuration and opaque key IDs.
No proxy or automatic provider fallback is introduced. Browser-local models
require a separate explicit installation before use. Bound
context, output and turn duration. Settings own system instructions, tool choices and per-provider/model context
budgets, with personal defaults and repository overrides. User-managed standalone
SKILL.md guidance uses those same settings scopes. Advertise only enabled skill
names/descriptions; load bodies through a bounded Pi AgentTool when relevant.
Skills do not grant tools or load the Node extension runtime, scripts or remote
packages. The model row shows
usage and permits editing its budget. Runtime prompt/output counts supersede
approximate local estimates. Do not silently remove transcript history.
The Ollama harness exposes only explicitly enabled read-only repository listing,
file reading, literal search, scoped editor-settings reading and ordinary Git
history/status/branch/diff reads; OpenAI remains text-only in this slice. Tools
receive the selected repository's allowlist/reader or a normalized settings
snapshot rather than general application services or vault access, with bounded input, output, calls and rounds. Show tool
activity/results so the developer can review what the model actually inspected.

Reuse the editor's pane, divider, tabs, dropdowns, controls, semantic palettes and
reduced motion. Conversation tabs are available before connecting and own their
connection, model, draft, transcript and requests independently. Git and AI may
remain open together, with independent persisted visibility and widths. Share
the desktop dock while reserving editor space; close older panes on compact
screens to retain columns. Keep transcripts
and drafts in memory. Persist saved profiles and encrypted vault data separately.
The Connections viewport retains conversation tabs. Guarded values are managed
in the separate far-right Vault pane, opened from the toolbar or header's Page menu.
Batch visible streamed text per animation frame, retaining completed messages.
Render only the selected transcript; background replies remain in their own tab.
Render messages with markdown-it and the complete mdit catalog, with source HTML
disabled and external media activated explicitly. The [Markdown guide](../markdown.md)
owns concrete plugin configurations. Browser adapters read explicit include/snippet
references from repository storage; expanded content remains presentation-only and
does not change inference payloads. Agent tools are a separate explicit capability. Local math renderers stay
inside the standalone distribution. Keep message/block
identity stable through streaming and completion. Style the composer's visible
Markdown source inline with an owned CodeMirror field; send the original source
and keep its ephemeral draft undo independent of repository history.

## Consequences

The runtime must allow the application origin through CORS and satisfy browser
local-network policy. The application reports failures without reconfiguring it.
Bounded transcripts reuse the existing Markdown parser; the developer requested
inline-formatted source input and formatted replies. Completed message blocks
remain stable, while active blocks update with the existing frame batching.
Pi is loaded on first send. Character estimates do not promise exact token counts.
Reloading clears conversations and locks credential access. Thread persistence
and tool-driven editing remain outside this read-only slice.

Focused Cucumber cases cover stream correctness and browser lifecycle. Real
Ornith inference is an explicit opt-in case outside the normal offline suite.
OpenAI validation uses synthetic keys and intercepted responses; live account
access requires a freshly supplied key and remains a manual check here.
Structural rendering counts guard batching; they do not claim a speedup over an
earlier implementation.

## Status

Implemented as the first local chat slice. Interaction details remain subject
to the developer's manual testing.
