# Installable browser models

Settings → AI groups nine browser language models in the LLM pane. Each joined row shows
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
| Ornith 1.5 9B Q4_K_M | strict GPU Wllama/llama.cpp | 5.78 GB text; 0.92 GB optional projector | Separate original image runtime; OCR untested |
| Ornith 1.5 9B Q8_0 | strict GPU Wllama/llama.cpp | 9.79 GB text; 0.92 GB optional projector | Separate original image runtime; OCR untested |

Small runtime and publisher notice downloads are additional; shared files are installed only once.
These are file sizes, **not** measured RAM/VRAM requirements. The recorded model
results come from the referenced trials, not an editor hardware qualification.
Mobile remains unqualified. Browser API checks cannot establish free memory or
driver version. No browser flags are changed automatically.

## Additional verified profiles

The LLM menu includes **Gemma 4 E2B** (LiteRT-LM 0.18.0 GPU_ARTISAN,
2.01 GB weights) and **MiniCPM5 2.52B Q4_K_M** (the paired strict GPU Wllama,
1.56 GB weights). Both use their verified text-only paths. Gemma uses greedy
decoding with reasoning and prompt caching off; its supported context is
512–4,096 tokens. Ornith Q4/Q8, MiniCPM and LFM3 text use their exact FP32-compatible
GPU builds, 4,096 context/256 output ceilings, FP32 KV, 128/64 batches, greedy
decoding and no prompt caching or CPU model fallback. They do not require
shader-f16. Bonsai retains its native projector. Ornith's original paired
image-capable runtime/projector remains a separate on-demand vision profile;
the strict text runtime never requests that projector.

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

The additional **LFM2.5-VL · 1.6B · Q4/FP32** image option uses five
unmodified files at that same official revision (2.024 GB of model files): Q4
image/decoder matrices and FP32 token embeddings, activations and state. It
works without shader-f16 and requires at least nine storage buffers per shader
stage. Choose it under the text model's **Model settings → Image inspection
model**. Existing FP16 and native image choices keep their own settings.

Each ONNX session receives one explicitly owned GPUDevice. Positive completed
dispatches are required before returning observations; a request or an adapter
label alone is insufficient. Reference node assignment puts weighted neural
operators on GPU. CPU shapes, masks, indexing, Compress feature packing, image
preprocessing and sampling remain enabled. This is not an all-operator GPU
pipeline. The profile uses a 1,024-token context, 128-token greedy output and
512 px white letterbox. It is a separate image interpreter, not a fixed native
Ornith projector. Observations can be wrong; phone and large-document OCR
acceptance remain open.

Settings → AI → Decision models offers these separate native profiles:

| Profile | Format | Native readout |
| --- | --- | --- |
| D3 lite 0.8B | BF16 GGUF | Noncausal SystemOne |
| D3 nano 2B, mini 4B, flash 9B | Q8_0 GGUF | Noncausal SystemOne |
| Strands 2B WebGPU | INT4/FP16 ONNX | Explicit FP16 GPU device, FP32 JavaScript pointer head |
| Strands 2B WebGPU FP32 | INT4/FP32 ONNX | Local compatibility graph, unchanged trained pointer head |
| KnowLine Gen5.5 4B | Q8_0 GGUF | Original native numeric-label logprobs, top 64 with complete-label guard |
| Elephant-1 9B | Q4_K_M GGUF | Dedicated two-block noncausal readout |
| Perplexity Flash 4B | Q8_0 GGUF | Dedicated protocol-v3 inline-marker readout |

Decision models can be installed/loaded now. `scoreBrowserDecision` supplies a
queued native scoring API for future editor/workflow features; there is no
automatic decision routing. They never appear as chat LLMs. Requests are text-only,
serial, one question named `q`, at most 255 choices, with an exact 1,024-token
input cap (KnowLine reserves one context position for its discarded sample).
Incomplete label probabilities are rejected. Native GGUF profiles share the pinned
FP32 GPU runtime with exact no-forward D3 `inspectSystemOne` preflight and the
original KnowLine, Elephant and Perplexity APIs. CPU execution is not offered.
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
the whole downloaded file before marking an installation complete.
Continuous Parakeet now uses a grouped GPU decoder and retains private recovery
audio; legacy recognizers keep their separate behavior. See the
[speech guide](../speech/README.md).

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

The separate original Ornith image profiles use the exact source build declaring
Wllama 3.12.0-source at
`3bb2a46f0dab0b924e8cd992b85e8881c3d3a859`, llama.cpp
`970b51ce7c9ba5fff0726c5e9994f1c2f0e4eedc`, Emscripten 4.0.20 and Dawn
`v20260317.182325`. The MIT runtime, complete notice and build receipt are static
opt-in files under `src/public/browser-models/wllama/`. Build checks their hashes.
The selected compatibility patch and recipe are under `build/browser-models/`.
Neither npm Wllama 3.8.1 nor the experimental FWHT fork is substituted. Current
strict text profiles use their separately pinned `wllama-chat-gpu` pair; the
original image runtime and projector remain paired and unchanged.

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

Cleanup is a shared promise: repeated disposal waits for the same native exit or
worker shutdown. URLs and the cross-tab lease are released only after confirmed
cleanup. A failed native exit blocks further allocations in this page and asks
for a reload, retaining the ownership and original failure for diagnosis. An
allocation fallback cannot continue after uncertain cleanup. Native tool-parser
errors survive fragmented deltas and reach Pi's validation before tool execution.

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
Strict GPU chat keeps its qualified batches, FP32 cache and placement fixed.
Older saved settings can be reset from its settings card. Changes autosave after validation
and unload that model so the next load applies them. Settings are device-local,
separate from repository-scoped instructions/tool/skill choices. The existing
conversation context budget still applies at send time. Full transcripts are
retained; available context can reduce the requested output ceiling.

WebML is GPU-only. Native chat checks SIMD, shared memory/isolation, JSPI,
Memory64 and actual GPU FP32 computation. Its native build rejects CPU model
operators and weight fallback. Aggregate audits survive ordinary log rollover;
load requires full layer/input-embedding placement and generation requires
positive GPU work with zero CPU model operations. CPU tokenization, sampling,
tools and scheduler scratch are separate from neural computation. Original
native vision checks its own FP16 prerequisites before text is unloaded. A
missing feature keeps the text model active and fetches no projector.

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

## LFM3 additions (2026-10-29)

The reference catalog in llm-sds-01/examples/browser-lfm3/catalog.json
qualifies LFM3 1.7B QAD Q4_0 text, VL 2B image input, Audio 2B speech
input, Omni 2B image/speech input and d1-Omni 2B native text classification.
The text profile keeps its own Wllama build with llama.cpp
19cce6919992fdffd92e0ac152caaf1e2b8f254e. The newer strict text build has its
own `wllama-chat-lfm3-gpu` pair; original image-capable binaries are preserved. Native tool calls survive
unchanged. The first trained
reasoning boundary separates reasoning from visible answers; thinking off is
requested, rather than guaranteed. Context is bounded to 4,096 tokens.

The separate ONNX worker reuses the reference preprocessing, decoder/cache loop
and calibrated native decision readout. Every execution provider receives the
explicit GPUDevice with shader-f16 and available subgroups, without experimental
subgroup-matrix features. Input prefill is capped at 1,024 tokens. Model metadata,
graphs, external data and notices install on demand with pinned checksums.
Codec/depth graphs for speech generation are excluded. Language-model settings
can select any on-demand image inspection profile.

Audio and Omni speech recognition appear in dictation and transcribe after
stopping, up to 30 seconds of mono 16 kHz capture. The original Parakeet streaming
paths remain. Plain d1-2B and Base are excluded from the supported catalog;
speech generation, video, mobile and multimodal tool calling remain unqualified.
Reference qualification is bounded evidence, not acceptance of this editor's
adapter; editor-specific verification must be reported separately.

Editor checks on 2026-10-29 passed real LFM3 text/Pi tool use, VL and Omni
red-square descriptions, the six reference d1-Omni classifications, and
Audio/Omni/Phonon microphone-fixture transcription on sds-01 (Chromium 153,
RTX 3060; this historical Phonon check used CPU). The later Phonon GPU
implementation and qualification are documented in the speech guide. Each added recognizer produced the expected public
JFK speech with about 9.1% word error on this capture. These narrow checks do not
qualify general model quality, real microphone hardware or mobile devices.
ONNX graph tests used checksum-verified prepared reference files through a
test-only streaming delivery override; tokenizers/metadata and Phonon's raw
packed model downloaded from their pinned public URLs.

## GPU-only Brave decision backends (2026-10-31)

All decision choices require GPU execution. D3 lite/nano/mini/flash, KnowLine,
Elephant and Perplexity share the verified experimental core FP32 WebGPU runtime.
Original BF16/Q8_0/Q4_K/Q6_K GGUF weights remain packed and unchanged. The paired
JS/Wasm merges the original D3 inspector/SystemOne, KnowLine causal label
logprobs, Elephant two-block readout and Perplexity protocol-v3 APIs. Native
masks, trained heads, calibration and exact complete-input guards remain intact.
This is a local runtime patch, not stock upstream FP32 support.

These profiles request `n_gpu_layers: 99`, F32 K/V caches, flash attention off,
and context/batch/microbatch 1,024. The loader requires native evidence of a
shader-f16-free device, GPU model buffers and full layer offload. Scoring also
requires a matching packed-weight GPU matrix pipeline. An adapter request,
requested mode, partial offload or CPU model buffers alone cannot qualify a GPU
result. CPU input embedding and small host readout can remain; there is no CPU
model option or automatic CPU fallback. Missing WebGPU and allocation failures
are actionable errors. Larger contexts, phones and broad accuracy remain
unqualified. D3 flash now has a reference-qualified GPU path at this same guard.

Strands retains two GPU choices: MU's INT4/FP32 compatibility graph and the
original INT4/FP16 graph. Both bind the actual device through ORT 1.30's
`executionProviders: [{name: 'webgpu', device}]`. The FP32 device requests no
shader-f16 and must create native compute pipelines; the original GPU graph
still requires shader-f16. Packed integer parameters, tokenizer, trained FP32
pointer head and calibration are unchanged by MU's support-tensor upcast.
The former Strands Wasm CPU choice and its distribution group are removed.

Backend labels appear in the shared model rows/settings. `loadedModelInfo()`
returns a snapshot of native placement evidence; it cannot mutate the active
input guard. Each queued `scoreBrowserDecision(id, request, ...)` owns its
explicit profile/result; consumers showing scores must clear them on selection
changes. There is no saved live-result panel or automatic workflow routing.
No generated-text parsing substitutes for native probabilities.

Elephant pins the approved mradermacher export; the earlier source returned
HTTP401. Tensor parity with that older export is not claimed. Existing matching
GGUF installations reuse cached weight hashes when installing the new runtime.
The native CPU-only additions from the earlier preparation have been superseded
by one shared GPU pair. Changed chat profiles are strict GPU; legacy speech
choices remain explicitly labeled and never act as automatic fallbacks.

MU's converted assets have no upstream public URL. The installation catalog uses
the immutable same-origin `browser-models/strands-fp32/<manifest-sha256>/` prefix.
Stage that exact optional 1.283 GB tree before an explicitly authorized release
as described in the source-build guide. Weights are never embedded in HTML or
committed to Git; a code-only build does not contain them. Split static weight
parts download as complete files, then verify the assembled original checksum
before a complete IndexedDB installation is recorded. Workers read installed
files only, including offline.

The six native reference requests live in
`tests/models/native-decision-cases.json`. Run only the selected Brave outline
inside an owned serial job on sds-01, retaining other sessions' workloads:

```sh
BROWSER_MODELS_LIVE=1 MODEL_LIVE_BRAVE=1 MODEL_LIVE_BRAVE_PATH=/path/to/brave \
node node_modules/@cucumber/cucumber/bin/cucumber.js --config cucumber.config.mjs \
  --profile modelsLive --tags '@browser-brave-decisions-live'
```

Browser versions and exact launch flags are recorded with results. Container
GPU activation flags do not enable shader-f16. Normal Chromium model checks
exclude the Brave-only outline unless explicitly enabled.
`MODEL_LIVE_DECISION_FIXTURES=1` uses a static fixture server; optional
`MODEL_LIVE_DECISION_CACHE` supplies an explicitly mounted read-only cache of
`<sha256>.blob` files. Each complete pinned file is SHA256/size-verified before
serving any byte, then the actual browser installer verifies it again in
IndexedDB. Static delivery runs no inference and changes no reference cache.


Editor qualification on 2026-10-31 passed six native checks for each of the
eight changed GPU profiles (48 forwards) in Brave 1.96.61 / Chromium
154.0.8037.98 on sds-01, RTX 3060 12 GiB. Every GGUF profile proved full layer
offload, GPU model buffers, shader_f16=0 and matching packed-weight matrix
pipelines. Strands proved its bound ORT device and actual compute pipelines.

| GPU profile | Median decision |
| --- | ---: |
| Strands INT4/FP32 | 0.128 s |
| D3 lite BF16 | 0.201 s |
| D3 nano Q8 | 0.436 s |
| D3 mini Q8 | 1.023 s |
| D3 flash Q8 | 1.999 s |
| KnowLine Gen5.5 Q8 | 2.414 s |
| Elephant mradermacher Q4 | 2.058 s |
| Perplexity Flash Q8 | 1.253 s |

GGUF medians use the five subsequent API calls, excluding the first call that
loads the model. Strands uses its native readout timer excluding setup. Setup
uses verified static caches, not cold-network download timings. Measurements
are provisional and nonisolated. All available same-weight historical CPU
pairings kept their winning answers; maximum per-option difference was
0.007712 (D3 nano), 0.005628 (Elephant), and at most 0.001166 for other GGUF
pairings. Strands differed by at most 0.0001. D3 flash has no qualifying CPU
baseline. These six easy requests establish compatibility, not bit-identical
floating-point results, broad quality or larger-context qualification.

The run reported no page errors or prompt uploads. The owned test service was
removed and foreign work/reference files were untouched. Also passed: 37 source
scenarios, six QuickPickle scenarios, three Brave UI scenarios, typechecking
with zero warnings, and the production build. The UI check verifies that the
CPU choice is absent and native rows show WebGPU. Existing original FP16
Strands and d1-Omni GPU qualification remain separate; they require shader-f16.
No deployment or converted-weight publication was performed.

## Editor GPU qualification (2026-11-02)

Actual Brave 1.96.61 / Chromium 154.0.8037.98 on sds-01 (RTX 3060 12 GB)
passed Ornith Q4/Q8, MiniCPM5 and LFM3 text generation plus genuine Pi
`load_skill` → `repository.read_file` round trips against an IndexedDB repository.
Native audits reported positive GPU computation and zero CPU model operations.
The owned container used recorded NVIDIA/Vulkan activation flags without a
shader-f16 override; these are scoped desktop checks.

Brave does not expose shader-f16 here. Both original Ornith image choices
therefore fail capability checks before unloading text or requesting projector
bytes. Resource-ordering tests cover image success, failure and cancellation;
new native image generation through this adapter remains unqualified on this
Brave device. The original image SDK/projector pair stays available on capable
browsers, separately from strict text.

The preceding decision qualification covers eight changed profiles with six
native scoring checks each. No generated-text parsing substitutes for scoring.
Continuous speech has its own integrated evidence in the speech guide. Neither
these tests nor reference results qualify mobile, personal browser profiles,
large decision inputs or simultaneous ASR/LLM residency. GPU speech releases
chat allocations through the existing serial turn queue before loading.

## Compatible vision editor evidence (2026-11-02)

Actual Brave 1.96.61 / Chromium 154.0.8037.98 on sds-01 (RTX 3060 12 GB)
installed the official Q4/FP32 profile through the editor and read a red square
and a fresh image code. Each response confirmed positive completed work on the
explicitly owned device without shader-f16. Native model bytes, metadata,
Transformers.js and ORT still pass the normal installer/runtime checks.

A genuine MiniCPM5 Pi turn loaded a progressive skill, read a fresh repository
confirmation code, inspected the image, and returned exactly the two actual
codes after restoring strict text. Logical conversation and saved settings
stayed intact. An earlier looser request retained the actual tool values but
also invented an extra note code; that raw result remains evidence of model
fallibility. The accepted ordered one-line protocol is a narrower claim than
arbitrary combined-flow accuracy.

An eight-buffer adapter was rejected before text suspension. Cancellation after
first model text terminated the owned worker and left text unloaded. A fresh
worker then recognized the image from cached Blob assets with publisher
requests blocked. Settings layout and 128-token budget disclosure passed the
ordinary browser check. Phones, large documents, broad model quality and
native Ornith projectors remain unqualified by these checks.

## Reference lifecycle review (2026-11-04)

Reviewed the current `llm-sds-01` working tree against checkpoint `4b7aaf3`,
including `inference/evaluations/inference-review/REPORT.md`. Adaptations preserve
the editor's existing GPU profiles, binaries and weights: coalesced cleanup,
blocked allocation after native disposal failure, parser-error propagation,
vision cancellation during cleanup, and each vision profile's output ceiling.
Source digests are retained in `expanded-provenance.json`; speech capture and
recovery changes are documented in the [speech guide](../speech/README.md).

The reference's same-image feature cache is not enabled here: each image-tool
call unloads vision to restore text, which would clear that cache before reuse.
Its measured warm-call speedup does not describe this editor's model handoff.
Server-side MiMo lease changes do not apply to the browser-only architecture.

Nine focused lifecycle scenarios exercise Pi's actual pre-tool hook, cleanup
ownership, worker disposal/cancellation and image output/cancellation boundaries.
Together with affected chat, decision, vision and speech scenarios, 89
Vitest/QuickPickle cases passed, as did 37 source checks, three browser UI
scenarios, type checking and the build. Injected cleanup/I/O failures establish
error handling, not recovery from an actual GPU-driver disposal fault. The
changed continuous-speech editor also passed its real 75-second and accelerated
ten-minute regression; see the speech guide for resource and recording evidence.
The earlier compatible-vision model evidence above remains separately scoped.
