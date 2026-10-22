# Assistant connections

The AI pane supports saved Ollama and OpenAI connections and a credential-free
[Browser models connection](browser/README.md) for six explicit on-device
installations. Browser models use the same Pi tool and skill loop as Ollama. `ollama.ts` calls the
user's runtime for local discovery. `harness.ts` connects its native chat stream
to Pi's browser agent loop through a `BrowserConnectionPlugin`. `openai.ts` runs inside the
[secrets worker](../secrets/README.md), resolving an opaque vault entry ID before
model discovery or streaming Responses API text. Connect and Send are explicit
actions; choosing a connection menu item also connects. There is no application
backend, automatic model download or provider fallback. The Ollama Pi harness
can use the explicitly enabled read-only repository tools. Language services remain in
`intelligence/`.

## Connections and credentials

`connections.ts` persists public profiles in `code-ai-connections`, outside
repository/settings history. Records contain a name, provider, endpoint and vault
entry ID, never a key. The initial Local Ollama profile needs no vault; its name
and settings can be edited and persist under the same ID. It remains the default
profile after reload and cannot be removed. OpenAI
is pinned to `https://api.openai.com`; save its API key under Page → Vault, select
that guarded value in Connections, then connect a conversation. Key names can be
selected while locked; using the value requires unlocking. Each thread owns its
connection, model, transcript, draft, scroll context and requests independently.
Reconnection and model changes preserve messages. New threads suggest the current profile but start disconnected so the user can
choose another connection. Each has its own Pi transcript, history and choices.

Reload retains saved profiles and encrypted vault data, clears conversations and
locks access. Closing/reopening the pane retains conversations. Stop cancels the
selected request. Closing a thread aborts its requests; closing the pane aborts
all conversations' requests. Switching tabs lets replies finish in their own
threads. Editing/removing a saved profile disconnects affected threads without
discarding their messages. Vault changes stop credentialed requests before
changing values; locking does not affect Ollama requests.

## Reference and adaptation

The verified references are
`/home/erik/Development/llm-sds-01-remote/remote/llm/ollama-local/` and the adjacent
`openai/`. Their READMEs and `src/lib/ollama.ts`, `src/lib/connection.ts` and OpenAI
`src/lib/harness.ts` supply browser connection, discovery and Responses behavior.
The editor reuses the Pi agent/tool-loop pattern from the Ollama reference with
its own browser connection adapter, native bounded stream parser and repository
tools. It does not reuse the demo layout. Pi agent-core and pi-ai are pinned to
1.3.0; connection adapters implement `BrowserConnectionPlugin`, while tools
implement Pi `AgentTool`. The harness uses Pi event, validation, before-tool and
finish-turn hooks; it does not load the Node coding-agent extension runtime. Vault cryptography/lifecycle comes from Operations as documented in
its owning guide. Reference worktrees, services and credentials are preserved.
No old API key is retrieved; live OpenAI use requires fresh user input.

## Bounds and processing

Ollama defaults to `http://localhost:11434` and installed `ornith:9b-q8_0` (another
installed Ornith 9B alias, then the first local model as alternatives). Runtime
root URLs reject credentials, API paths and query strings. Non-loopback runtimes
require HTTPS. Cloud model entries are excluded. OpenAI discovery uses the
account's model list, excluding known non-text models, and prefers the verified
reference's `gpt-5.4-mini` when available. Unsupported model capabilities remain
provider errors rather than claims inferred from model-list membership.

Ollama input is bounded to 256 visible messages and 1 MiB of chat text; the full
Pi transcript, tool declarations and results must also fit the configured token
budget. OpenAI retains its 32-message/10,000-character transport cap; output to 131,072 characters
and stream events to 65,536 characters. Limits are checked without silently
removing client-side messages. Ollama uses thinking off and output 1,024 tokens. On selection, `/api/show` supplies the architecture-specific
`model_info` context maximum. That maximum becomes the default budget when no
explicit preference exists; saved smaller budgets are preserved and larger
ones are capped. Missing metadata stays unknown and uses the 4,096 fallback.
Only selected models are queried; successful metadata is reused within the
connection, and cancelled/stale selections cannot overwrite newer choices.
The model row exposes an editable context budget, saved separately
for each provider/model in settings (up to 1,048,576, bounded by the detected model maximum). Ollama treats it as a ceiling and allocates `num_ctx` from the actual serialized
prompt/tool payload, with UTF-8 byte sizing, output/headroom allowance and
power-of-two buckets starting at 8,192 (or a smaller configured ceiling). This
avoids reserving a 262k KV cache for a short prompt and forcing model layers
onto the CPU. Buckets grow as the conversation grows; the full configured
budget remains available, and no transcript is removed to fit a smaller bucket;
OpenAI uses it as an application budget, not as a claim about model capacity.
Usage is approximate before a request and becomes the last runtime prompt plus
output token count when supplied. It is never a sum of all tool rounds. A cheap
JSON-length estimate reserves output space before each request; it is not an
exact tokenizer. Full contexts stop explicitly without removing messages. OpenAI uses output 1,024, `store: false`, no tools and no reasoning
override. A character limit is not exact token accounting. Discovery allows ten
seconds for Ollama and thirty for OpenAI; turns allow five minutes. Native
transport cancellation retains partial replies in open threads. Failed or
incomplete streams remain explicit failures or reported output limits.

Visible text updates are batched per animation frame. Hidden threads retain
buffers without mounted transcripts; selection or completion flushes them.
Completed messages and completed Markdown blocks remain stable. OpenAI parsing, credential checks, echo
protection and batched IPC belong to the vault worker; Ollama's small bounded
NDJSON parser stays in the page. Pi is initialized lazily on first send;
only text deltas and bounded tool lifecycle events update the selected UI. `markdown.ts` uses the existing markdown-it parser
with the complete mdit catalog. The [Markdown guide](../../../docs/markdown.md)
owns the supported syntax and host configurations, browser include/snippet adapters,
resource activation and local math renderers. Both roles render the same extensions;
source HTML remains escaped. Images/media/embeds/PlantUML load only on explicit
reader activation. Include/snippet read the selected browser repository with
bounded expansion and caching, without exposing expanded files to inference.
Message-scoped anchors, footnotes, task IDs and tabs remain stable. KaTeX is the
default math renderer; explicit MathJax fences use embedded SVG glyphs with lazy
initialization. Both reset macros and bound expansion. Parsing runs at most once
per visible stream flush; unchanged top-level blocks keep their DOM and selections,
including when a live reply becomes a completed message. Completed messages are
not parsed again on each incoming delta. Known raw/URL/form-encoded credential echoes, including
split deltas, stop OpenAI output before the credential reaches the page.
Requests omit cookies/referrers, reject redirects and are never automatically
retried. Browser local-network/CORS policy and provider permissions still apply.

The composer keeps Markdown source visible and styles it inline through a small
owned CodeMirror field. It retains markers, normal selection, IME input, plain
text paste and independent draft undo; it sends the original source. Drafts
never enter repository history. Settings → AI controls Send button visibility
(off by default) and whether Enter sends (the default) or inserts a newline.
Shift+Enter always inserts a newline; Ctrl/Cmd+Enter always sends. These settings
support personal defaults and repository overrides, persist through reload and
apply live without replacing the draft. File overrides do not include them.
Source-editor shortcuts and wheel zoom ignore this draft field.

## Instructions and read-only tools

Settings → AI exposes system instructions and individual tool switches with
personal defaults and repository overrides. Instructions are captured at send
and applied on the next request, including vault-backed OpenAI requests. Tool
execution in this slice is Ollama-only; OpenAI still has no tool declarations
or tool execution. Repository file tools are absent when no repository is selected;
`read_settings` remains available for personal/effective preferences.

`tools.ts` receives only the selected repository's path allowlist and text reader.
It has no filesystem mutation, Git mutation, vault, shell or network API.
`list_files` returns up to 200 paths. `read_file` reads up to 200 numbered lines
from a text file no larger than 256 KiB. `search_text` uses literal case-sensitive
matching, scans at most 100 files/1 MiB and returns up to 50 lines. All output is
bounded to 12,000 characters, and incomplete searches/ranges are labelled.
Paths outside the allowlist and Git metadata are excluded. Repository selection
is captured for the turn; files are read from that repository's current working
contents. Closing/changing a conversation cannot redirect a pending read to a
different repository. File contents remain untrusted data in the instructions.

`settings-tool.ts` adds `read_settings` as a separate Pi tool, controlled by its
own Settings → AI switch. It captures editor preferences at send time: personal
defaults, the selected repository's explicit overrides, and effective values
without file overrides. Omit `keys` to list names, or request up to 16 keys with
`scope: "effective" | "personal" | "repository"`. Effective values include their
personal/repository source; repository reads identify inherited keys. Unknown
fields are excluded through the settings normalizer and requested unknown keys
are rejected. The tool receives no vault, connection profiles or other repositories.
It works without an open repository for personal/effective settings and reports
that repository scope is unavailable. Output uses the same 12,000-character bound
and is visible alongside other tool results. It cannot change settings.

`git-tools.ts` adds five individually configurable read-only capabilities:
`git_log` pages ordinary repository commits across the captured source graph;
`git_commit` returns message/author/parents and changed paths; `git_branches` lists
local branch names; `git_status` reads live working/index changes; `git_diff`
returns numbered before/after text for one working, staged or committed path.
Log pages are capped at 50 commits, other lists at 100 entries, and diff ranges
at 100 lines per side. All output retains the 12,000-character tool bound.

The application supplies only a selected-repository adapter to existing local
Git read APIs. Repository identity, branch names and ordinary commit graph are
captured for the turn; status and working/staged diffs read current contents.
Commit tools accept only full IDs in that captured ordinary graph, including
valid parent indices. Paths reject traversal and Git metadata. Status responses
project only file-state codes, not operation journals, author preferences,
credential profiles or private recovery controls. These tools have no mutation
or remote method and do not expose the editor's private undo/redo history.

Pi validates enabled tool schemas, returns success/error results to the model,
and replays its complete tool transcript on subsequent requests. Each turn has
a six-round/24-call bound and the existing five-minute timeout. The UI retains
up to 192 tool activity records per conversation, shown as expandable arguments
and results below the requesting user message. No tool output is interpreted as
HTML. Cancellation stops subsequent calls and requests; an already-dispatched
repository read can finish without updating a cancelled conversation.

The opt-in named Cucumber `harnessLive` profile calls installed local Ornith
through the same Pi adapter, asking it to read a fresh verification value. It
does not read credentials or use paid inference. Run with the pinned Node/npm:
`node node_modules/@cucumber/cucumber/bin/cucumber.js --config cucumber.config.mjs --profile harnessLive`.
Its ignored receipt is `tmp/test/ai-harness-live.json`. This Node-hosted adapter
probe complements the browser scenario; it does not establish browser CORS.

## Browser skills

Settings → AI → Skills creates, imports, edits, enables and removes standalone
Markdown skills. `skills.ts` validates the portable `SKILL.md` name/description
frontmatter and nonempty body, using the existing YAML parser with bounded
alias expansion. Names follow the lowercase/hyphen convention, descriptions
are at most 1024 characters, bodies at most 64 KiB, and settings retain at most
32 records/1 MiB per scope. Malformed imports produce a visible error before
settings change. Import opens an editable draft; Save is explicit.

Skills live in application settings, with personal defaults and per-repository
overrides/history. A null repository entry hides an inherited skill without
deleting the personal version. Resetting the Skills override restores inherited
entries. File settings do not contain skills. Disabling/removing a skill applies
to the next request and does not rewrite earlier conversation results.

Pi's `BrowserAgentHarness` appends enabled names/descriptions to its system
message. Full instructions are absent until the model calls the `load_skill`
AgentTool; Pi validates, executes and replays that tool result using the same
visible lifecycle as repository tools. The loader reads at most 200 lines and
roughly 10 KiB of escaped content per call, returning continuation information.
Skill metadata/instructions contribute to the existing context budget. Skill
configuration is captured at send time. The catalog marks removed/disabled
skills inactive on subsequent turns and distinguishes user-configured skill
guidance from untrusted repository/other tool content.

This browser adapter follows Pi's progressive-disclosure pattern without loading
the Node coding-agent filesystem/extension runtime. It currently supports
standalone instructions, not bundled references/assets, script execution or
`/skill:` command expansion. `disable-model-invocation: true` imports are rejected
explicitly because command-only skills need that missing command path.
`allowed-tools` metadata never grants permissions; actual enabled tools remain
the only capabilities. Supporting files are not silently imported or executed.
Skills apply to the Ollama Pi harness; OpenAI remains the existing text-only
worker transport. No application backend, npm execution or remote skill loading
is introduced.

The source `@ai-harness-source` scenario covers skill validation, disabled and
inherited entries, metadata-only advertising and full-instruction replay through
Pi. `@ai-skills-ui` covers import/edit/toggle/save/reload/remove and a model-driven
`load_skill` round trip in the built page.

## Validation and manual testing

Run source scenarios with `npm run test:source -- --tags '@ai-vault-source or @ollama-source'`.
After building, `@ai-vault-ui` and `@ollama-ui` use synthetic keys and intercepted
OpenAI/local responses. They cover worker-owned dispatch, encrypted storage,
reload/peer locking, separate threads and bounded rendering. Structural update
counts verify batching rather than an elapsed-time speedup. Chromium's virtual
PRF authenticator qualifies the browser bridge; physical providers remain unverified.

The opt-in `ollamaLive` Cucumber profile sends one short local Ornith prompt and
is excluded from the ordinary offline feature glob. Use the pinned local browser:

```sh
BROWSER_TEST_RUNTIME=local BROWSER_EXECUTABLE_PATH=/opt/google/chrome/chrome \
  node node_modules/@cucumber/cucumber/bin/cucumber.js \
  --config cucumber.config.mjs --profile ollamaLive
```

It needs an already-running runtime with the model installed and CORS allowing
the test origin. It never downloads models or changes runtime settings. Screenshots
and receipts live under ignored `tmp/test/browser/`. Real OpenAI inference is not
run without a freshly supplied key; mocked responses do not establish deployed
CORS, account/model access or live inference. Interaction details remain subject
to the developer's manual testing.

API contracts: [Ollama chat](https://docs.ollama.com/api/chat),
[OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create),
[OpenAI streaming](https://developers.openai.com/api/reference/resources/responses/streaming-events).
