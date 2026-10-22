# Installable browser models

AI → Connections → **Browser models** offers six explicit installations. Select a
profile, review its download size, then Install. Load checks the visiting browser
before allocating a model. Choose **Browser models** as the conversation's
connection to discover installed profiles; Send loads the selected installed
model when necessary. No model is downloaded by opening the pane or selecting a
profile. Remove frees files that no other installed profile needs. Unload releases
the active model's GPU/Wasm resources while keeping its installation.

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
Installation is serialized across tabs with Web Locks. Complete shared files
remain reference-counted through model metadata. Listing installations never
clones model payloads.

WebML receives an HTTP-shaped reader backed only by installed chunks. Wllama
receives lazy Blob slices backed by those same chunks. Native tensor requests
can exceed 128 MiB and need a transient tensor-sized buffer, as in the selected
upstream loader; installation still uses 8 MiB chunks. Neither reader falls back
to the network. Runtime JavaScript and Wasm are rechecked before loading; dynamic
imports create only fresh local Blobs that satisfy the standalone build guard.
Models, runtime bytes, settings and installation metadata do not enter repository
files, source Git, private editor history, the vault, or source archives. Model
weights are never included in this Git repository or the application build.

A per-origin runtime lease permits one loaded model across tabs. The editor
serializes whole Pi turns across conversations, including tool execution. Model
switching disposes the previous instance and revokes its resource URLs. Removal
refuses a live model lease in another tab. Stop cancels generation; Wllama's
unresponsive native worker is terminated and must be reloaded. Leaving Connections
cancels its unfinished installation. Reload keeps installations and model
settings, but not a loaded model or in-memory conversations. Storage quota and
eviction remain browser policy; Resources can inspect the database counts.

## Configuration and capabilities

Model settings preserve the reference's validation, per-engine supported
controls and initial settings. Context, output budget, sampler, reasoning,
prefix reuse, image pixels, timeouts and Pi round/call limits are configurable.
Wllama additionally exposes CPU threads, batches, KV cache types, vision tokens,
flash attention and GPU/partial CPU placement. Save validates controls and
unloads that model so the next load applies them. Settings are device-local,
separate from repository-scoped instructions/tool/skill choices. The existing
conversation context budget still applies at send time. Full transcripts are
retained; available context can reduce the requested output ceiling.

WebML is GPU-only. Wllama checks SIMD, shared memory/isolation, JSPI, Memory64 and
real GPU FP32/FP16 computations. GPU allocation errors alone permit the configured
Auto partial CPU fallback. The selected 4 GiB Wasm CPU heap cannot hold either
Ornith 9B variant entirely on the CPU, regardless of system RAM. Network/template
failures do not cause repeated loads or silent engine changes.

Browser-model messages accept one PNG/JPEG/WebP up to 10 MiB and 16 megapixels,
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
