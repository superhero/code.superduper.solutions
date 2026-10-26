# Browser inference models install independently of the application

> [!IMPORTANT]
> Browser-local inference is an explicit optional installation. Model and engine
> revisions remain pinned, with measured feature checks and scoped model results.

## Context

The developer requested the six-model preferred-engine collection from the
browser inference handoff. The editor already uses Pi 1.3.0 with conversation
connections, repository tools and progressive skills. Multi-GB GGUF files cannot
use the small optional package installer's whole-file buffers or enter the core
standalone HTML. The reference WebML bundle's redistribution license is not
established; Wllama's selected source build carries MIT licensing.

## Decision

List credential-free WebML and Wllama engines separately beside user-added Ollama and OpenAI connections. Reuse
the existing Pi harness, captured repository readers, tool controls, skills and
semantic UI. Select engines by the explicit catalog engine: WebML for the four
Bonsai 2 sizes and the reviewed source-built Wllama/llama.cpp for Ornith 1.5 Q4/Q8.
Preserve official model/projector revisions, digests and result identities.

Install only on explicit user action into an independent IndexedDB chunk store.
Hash bounded downloads in a dedicated worker, publish complete metadata only
after verification, and serve local byte ranges without a network fallback.
Keep model weights outside repository files and the application distribution.
Distribute the exact Wllama runtime and its MIT notice as optional static files;
fetch the pinned WebML bundle directly during installation. Verify all executable
runtime bytes before creating a local Blob import. Preserve the standalone
packaging guard rather than permitting arbitrary external module imports.

Serialize installation and runtime ownership across tabs. Retain shared files
until their last model is removed. One model can be loaded per origin, and one
conversation owns an entire Pi turn. Cancellation must not leave partial models
marked installed or free resources still used by another conversation.
Queue model changes and generation requests rather than rejecting a busy local
runtime. Capture the selected model per request and retain ownership through
tool work and reply cleanup. Await Web Lock release before reacquiring it;
cross-tab handoffs release idle models or wait until the owner's active turn
finishes, without exchanging conversation contents.

Probe actual browser GPU FP32/FP16 and Wasm features. Do not treat advertised
WebGPU or system memory as evidence of model memory fit. Preserve GPU-only WebML,
the selected Wllama CPU heap limit, memory-only fallback and the absence of mobile
qualification. Keep OCR failures and untested OCR distinct from basic image
support. Configurable sampling, image/context limits and tool bounds do not
alter official model or runtime pins.

## Language, image-tool and decision expansion

Reuse the verified reference profiles for Gemma 4 E2B and MiniCPM5 2.52B.
Keep these text-only engines separate from their on-demand LFM2.5-VL 1.6B
`inspect_image` tool. Retain the existing Bonsai/Ornith native projectors.
The image tool owns release/load/release/restore within the same queued Pi turn;
the stable connection facade resolves the restored engine on every model turn.
Pixel data stays transient and is represented by IDs/dimensions in text prompts.

Package LiteRT-LM 0.18.0 and Transformers.js 4.3.1 as verified optional SDKs.
Transformers keeps its pinned ORT 1.31 development runtime separate from
Parakeet/Strands ORT 1.30. LiteRT's owned loader patch passes its feature-selected
verified JavaScript Blob and a Wasm `locateFile` map through the upstream factory
in a classic Blob worker. All dependencies remain bundled in the optional SDK;
installed file readers prohibit network fallback. Split large SDK assets into
16 MiB pieces, aligned with the existing 8 MiB database blocks, and verify their
whole-file digest. No service worker or inference backend is introduced.

Expose only the reference's nine accepted decision execution profiles in a
separate settings section. Preserve native SystemOne, causal-label, two-block,
inline-marker and pointer-head scoring instead of parsing generated text.
Use D3's dedicated exact-preflight context build; keep the accepted input cap
at 1,024 tokens. Availability does not activate automatic decision features.
The catalog distinguishes the Strands contributor source and excludes failed
or cached-CPU experimental profiles and LFM450M. Runtime/source receipts and
model-specific license files accompany explicit installations.

## Status

Implemented in the browser connection, optional runtime, chunk store and
Connections controls. Named source/browser fixtures qualify application behavior;
the referenced per-model runs remain separate hardware and generation evidence.
