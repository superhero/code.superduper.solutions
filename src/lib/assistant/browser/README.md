# Installable browser models

Settings → AI groups eight browser language models in the LLM pane. Each joined row shows
the model name, parameter size, weight quantization and download size, followed by
installation/loading controls and buttons that expand compatibility, settings and
detailed information below that model. Remove uses the Delete icon.
Browser chat opens directly in the composer, with the complete WebML/Wllama/LiteRT-LM
catalog in its model menu. Entries show installation state and download size.
Selecting a profile installs missing files and loads its pinned engine, checking
browser compatibility before allocating the model. Opening the pane only reads
local metadata. Preparation can be cancelled while preserving the draft. Send
can reload an installed model when necessary. Remove frees files that no other
installed profile needs. Unload releases
the active model's GPU/Wasm resources while keeping its installation.

Loading progress normalizes the native runtime's `loaded`/`total` events. Streamed
weights use bytes; GPU uploads use tensor counts. The composer and Settings share
one progress indicator: measured progress animates between updates, while stages
without counts show an animated activity bar. Reduced motion keeps the activity
indicator stationary.

| Profile | Engine | Language + vision download | Recorded image result |
| --- | --- | --- | --- |
| Bonsai 2 2B | WebML WebGPU | 0.79 GB | OCR cards failed |
| Bonsai 2 4B | WebML WebGPU | 1.32 GB | OCR cards failed |
| Bonsai 2 9B | WebML WebGPU | 2.62 GB | OCR cards failed |
| Bonsai 2 27B | WebML WebGPU | 6.58 GB | OCR cards passed |
| Ornith 1.5 9B Q4_K_M | source-built Wllama/llama.cpp | 6.70 GB | Simple image passed; OCR untested |
| Ornith 1.5 9B Q8_0 | source-built Wllama/llama.cpp | 10.71 GB | Simple image passed; OCR untested |

Small runtime and publisher notice downloads are additional; shared files are installed only once.
These are file sizes, **not** measured RAM/VRAM requirements. The recorded model
results come from the referenced trials, not an editor hardware qualification.
Mobile remains unqualified. Browser API checks cannot establish free memory or
driver version. No browser flags are changed automatically.

## Additional verified profiles

The LLM menu includes **Gemma 4 E2B** (LiteRT-LM 0.18.0 GPU_ARTISAN,
2.01 GB weights) and **MiniCPM5 2.52B Q4_K_M** (the same pinned source Wllama,
1.56 GB weights). Both use their verified text-only paths. Gemma uses greedy
decoding with reasoning and prompt caching off; its supported context is
512–4,096 tokens. MiniCPM requests all GPU layers first, then an eight-layer
hybrid allocation fallback and, when necessary, its supported CPU path.
The original Bonsai/Ornith profiles retain their native projectors.

Settings → AI → Vision offers **LFM2.5-VL 1.6B**, official LiquidAI ONNX
revision `d0e00ca26cc42892d9f3c4380faa631927218209`, FP16 image/token
embeddings plus Q4 decoder (2.34 GB weights). It is a separate on-demand
`inspect_image` Pi tool for Gemma/MiniCPM, with white square letterboxing,
1,024 context tokens and 256 output tokens. The text model receives image IDs
and dimensions, never pixels. The tool installs missing files only when invoked,
releases the text allocation, inspects local pixels, releases vision and reloads
the exact text configuration while Pi keeps its transcript, tools and skills.
Up to three images remain in transient conversation memory; PNG/JPEG/WebP,
10 MiB and 16 megapixel limits apply. Cancelling settles the worker and leaves
text unloaded when restoration cannot safely finish. LFM450M is excluded.

Settings → AI → Decision models offers these separate native profiles:

| Profile | Format | Native readout |
| --- | --- | --- |
| D3 lite 0.8B | BF16 GGUF | Noncausal SystemOne |
| D3 nano 2B, mini 4B, flash 9B | Q8_0 GGUF | Noncausal SystemOne |
| Strands 2B WebGPU | INT4/FP16 ONNX | Explicit FP16 GPU device, FP32 JavaScript pointer head |
| Strands 2B CPU | Same INT4/FP16 ONNX | Original Wasm CPU profile and pointer head |
| KnowLine Gen5.5 4B | Q8_0 GGUF | Original native numeric-label logprobs, top 64 with complete-label guard |
| Elephant-1 9B | Q4_K_M GGUF | Dedicated two-block noncausal readout |
| Perplexity Flash 4B | Q8_0 GGUF | Dedicated protocol-v3 inline-marker readout |

Decision models can be installed/loaded now. `scoreBrowserDecision` supplies a
queued native scoring API for future editor/workflow features; there is no
automatic decision routing. They never appear as chat LLMs. Requests are text-only,
serial, one question named `q`, at most 255 choices, with an exact 1,024-token
input cap (KnowLine reserves one context position for its discarded sample).
Incomplete label probabilities are rejected. D3 uses the reference context-study
build with exact no-forward `inspectSystemOne` preflight and an 8 GiB CPU heap;
Elephant/Perplexity retain their separate accepted native APIs and 4 GiB builds.
Strands is a verified contributor PR41 integration, not an official browser
release. Cached-CPU experiments and failed candidate profiles are excluded.
These desktop functional results do not qualify phones, free memory, broad
model quality or all future decision workloads.

`expanded-catalog.json` owns model/metadata/license hashes and evidence IDs.
`expanded-provenance.json` records original and adapted reference-source digests.
The source is `/home/erik/Development/llm-sds-01/examples/browser-assistant/`
(KG/KH, KI/KJ image pairings) and `inference/evaluations/browser-decisions/`
(`suite.json`'s nine working cases), plus the D3 context-study native build.
Many original weight pins come from publisher LFS metadata; the editor verifies
the whole downloaded file before marking an installation complete. Existing
Parakeet GPU defaults and the no-audio-retention contract remain in effect.

## Runtime and model provenance

The integration follows
`/home/erik/Development/llm-sds-01/inference/evaluations/pi-browser/HANDOFF.md`
and its JB collection. `catalog.json` preserves the six selected attempt IDs,
official publisher revisions, GGUF/projector file names, sizes, SHA-256 values,
runtime pins and per-attempt result IDs. Engine routing follows `engine`, with
the reference's historical `bonsai`/`ornith` aliases retained in the adapter.
The editor's existing Pi agent-core/pi-ai 1.3.0 packages, bounded read-only
repository/settings/Git tools, and progressive SKILL.md loading remain in use.
The demo's unrestricted sample note workspace and UI are not copied.

Bonsai uses WebML's pinned Qwen3.5 bundle at revision
`621e20782f208660f4f58283c2ce58430020f243`, SHA-256
`00c1a72a962a84fee17000a6b1d18b24d75033e56d59996fc504b7c57cfc6488`.
The handoff does not establish permission to redistribute that bundle. It is
downloaded directly from the pinned upstream URL during user installation and
is absent from the editor distribution. Its official weights are not repacked.

Ornith uses the exact source build declaring Wllama 3.12.0-source at
`3bb2a46f0dab0b924e8cd992b85e8881c3d3a859`, llama.cpp
`970b51ce7c9ba5fff0726c5e9994f1c2f0e4eedc`, Emscripten 4.0.20 and Dawn
`v20260317.182325`. The MIT runtime, complete notice and build receipt are static
opt-in files under `src/public/browser-models/wllama/`. Build checks their hashes.
The selected compatibility patch and recipe are under `build/browser-models/`.
Neither npm Wllama 3.8.1 nor the experimental FWHT fork is substituted.

`notices.json` pins the Bonsai Apache license and Ornith publisher model card
retained with installations under `browser-models/notices/`. The pinned Ornith
card declares MIT; its linked parent LICENSE is unavailable, so no replacement
copyright or license text is invented. Wllama retains its own complete MIT text.

## Storage, loading and lifecycle

`storage.ts` owns the independent `code-browser-models` IndexedDB database.
Weights are fetched in exact HTTP 206 ranges of at most 8 MiB, hashed
incrementally, and stored as separate chunks. The dedicated inline installer
worker keeps downloads and hashing off the rendering thread. A file is complete
only after its entire pinned size and SHA-256 match; a model marker follows all
of its files. Cancellation or failure cleans unreferenced partial files.
Transient network/stream failures and HTTP 429/5xx responses retry each range
at most twice with cancellable backoff. Hashing advances only after a complete
range arrives; size, range and checksum failures remain fatal.
Installation is serialized across tabs with Web Locks. Complete shared files
remain reference-counted through model metadata. Listing installations never
clones model payloads.

Quota estimates are informational: privacy protections such as
[Brave's fixed 2 GiB report](https://github.com/brave/brave-core/pull/6622)
must not block installation. Actual browser writes determine
capacity. A real `QuotaExceededError` cleans unreferenced files and reports a
storage failure without replacing network, cancellation or verification errors.

WebML receives an HTTP-shaped reader backed only by installed chunks. Wllama
receives lazy Blob slices backed by those same chunks. Native tensor requests
can exceed 128 MiB and need a transient tensor-sized buffer, as in the selected
upstream loader; installation still uses 8 MiB chunks. Neither reader falls back
to the network. Runtime JavaScript and Wasm are rechecked before loading; dynamic
imports create only fresh local Blobs that satisfy the standalone build guard.
Transformers metadata probes use the installed commit even when its tokenizer
discovery omits the revision option. Unlisted files receive a local 404.
Models, runtime bytes, settings and installation metadata do not enter repository
files, source Git, private editor history, the vault, or source archives. Model
weights are never included in this Git repository or the application build.

A per-origin runtime lease permits one loaded model across tabs. A cancellable
FIFO queue owns loading and whole Pi turns, including tool execution and reply
cleanup. Selecting a different model or sending another prompt leaves the active
turn running; the queued request retains its selected model, unloads the previous
instance and loads its model automatically before generating. Same-chat requests
include replies completed while they waited. Cancelling a waiter never stops the
active turn. Closing a conversation or the pane cancels its waiting requests too.

Runtime lock release is awaited before reacquisition. Another tab requests a
handoff over BroadcastChannel and waits on Web Locks: an idle owner unloads
immediately, while an active owner finishes its entire turn before unloading.
No prompts or model output travel over that channel. Switching also revokes the
previous instance's resource URLs. Removal
refuses a live model lease in another tab. Stop cancels generation; Wllama's
unresponsive native worker is terminated and must be reloaded. Leaving Settings → AI
cancels its unfinished installation. Reload keeps installations and model
settings, but not a loaded model or in-memory conversations. Storage quota and
eviction remain browser policy; Resources can inspect the database counts.
Development hot replacement drains the outgoing runtime and releases its leases;
separate module instances in one tab use the same handoff as separate tabs.

## Configuration and capabilities

Model settings preserve the reference's validation, per-engine supported
controls and initial settings. Context, output budget, sampler, reasoning,
prefix reuse, image pixels, timeouts and Pi round/call limits are configurable.
Wllama additionally exposes CPU threads, batches, KV cache types, vision tokens,
flash attention and GPU/partial CPU placement. Changes autosave after validation
and unload that model so the next load applies them. Settings are device-local,
separate from repository-scoped instructions/tool/skill choices. The existing
conversation context budget still applies at send time. Full transcripts are
retained; available context can reduce the requested output ceiling.

WebML is GPU-only. Wllama checks SIMD, shared memory/isolation, JSPI, Memory64 and
real GPU FP32/FP16 computations. GPU allocation errors alone permit the configured
Auto partial CPU fallback. The selected 4 GiB Wasm CPU heap cannot hold either
Ornith 9B variant entirely on the CPU, regardless of system RAM. Network/template
failures do not cause repeated loads or silent engine changes.

Bonsai/Ornith messages accept one PNG/JPEG/WebP up to 10 MiB and 16 megapixels,
then resize to the configured pixel budget without changing aspect ratio. Pi
retains the image in its conversation. WebML receives decoded RGBA; Wllama
receives encoded image bytes. OCR accuracy remains model-specific, as above.
Ollama/OpenAI behavior and credentials are unchanged.

## Checks

Use the destination project's named Cucumber source/browser scenarios rather
than installing a second runner from the handoff example:

```sh
npm run typecheck
node node_modules/@cucumber/cucumber/bin/cucumber.js --config cucumber.config.mjs --profile source --tags '@browser-models-source or @ai-harness-source'
npm run build
BROWSER_TEST_RUNTIME=local BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome node node_modules/@cucumber/cucumber/bin/cucumber.js --config cucumber.config.mjs --profile browser --parallel 0 --tags '@browser-models-ui'
```

Source fixtures verify pins, configuration, actual Pi tool/skill exchanges,
native translation, fallback and cancellation. Browser scenarios use real
IndexedDB and bounded synthetic byte ranges, exercise controls/settings,
cancellation, shared removal, offline reads and actual image decoding. They do
not download the production multi-GB weights or claim new model/OCR performance.

The separate opt-in `modelsLive` Cucumber profile downloads the pinned models
into a test-owned persistent Chromium profile. Run it against the development
server with `BROWSER_MODELS_LIVE=1` on a qualified WebGPU machine. It checks real
Gemma/MiniCPM/Bonsai replies and Pi tools, both LFM image handoffs and text
restoration, all nine native decision profiles, and auxiliary-model selection.
`MODEL_LIVE_URL` selects the origin; `MODEL_LIVE_ARTIFACTS` selects the isolated
profile and JSON/screenshot evidence directory. These are functional smoke tests,
not broad model-quality or memory benchmarks.
Set `MODEL_LIVE_SPEECH_FIXTURE` to the public JFK WAV to include three real
Parakeet microphone checks (CPU, experimental FP16 and FP32). Chromium supplies
that file as its test microphone; the actual capture path downmixes/resamples it
to 16 kHz. Those cases assert the reference word-error ceiling, no upload and no
retained recording diagnostics. They are excluded when the fixture is absent.

Editor verification on 2026-10-26 passed real Gemma/MiniCPM/Bonsai 2B chat and Pi
tools, both LFM image handoffs and all nine native decision profiles on an RTX
3060 with Chromium 153. All three Parakeet modes passed the public microphone
fixture. Flash initially exhausted GPU memory while another browser held several
GiB, then passed once memory became available. That condition now reports a
recovery message and retains the native allocator cause. Native and worker
decision deadlines terminate stalled scoring and clear invalidated runtime state.
These are scoped functional checks; the larger original Bonsai/Ornith profiles
retain their earlier reference results rather than new editor hardware runs.
