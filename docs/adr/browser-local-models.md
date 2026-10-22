# Browser models install independently of the application

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

Add a credential-free Browser models connection beside Ollama and OpenAI. Reuse
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

Probe actual browser GPU FP32/FP16 and Wasm features. Do not treat advertised
WebGPU or system memory as evidence of model memory fit. Preserve GPU-only WebML,
the selected Wllama CPU heap limit, memory-only fallback and the absence of mobile
qualification. Keep OCR failures and untested OCR distinct from basic image
support. Configurable sampling, image/context limits and tool bounds do not
alter official model or runtime pins.

## Status

Implemented in the browser connection, optional runtime, chunk store and
Connections controls. Named source/browser fixtures qualify application behavior;
the referenced per-model runs remain separate hardware and generation evidence.
