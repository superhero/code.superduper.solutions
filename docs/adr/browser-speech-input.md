# Speech input stays local and augments AI drafts

> [!IMPORTANT]
> Speech is an optional, pinned browser runtime. Confirmed text enters its
> originating AI draft; audio and recognition diagnostics remain local.

## Context

The developer requested NVIDIA Parakeet TDT 0.6B v3 through parakeet.js, using
the working AO streaming pipeline and BS initialization evidence. The editor
already owns AI conversations, optional model downloads and static Pages hosting.
Speech weights are large, microphone permission can resolve after cancellation,
and overlapping hypotheses must not duplicate or rewrite mature sentences.
The successful reference initialization trials do not prove universal reliability.

## Decision

Isolate capture, VAD, continuous features, sentence merging, inference, caching
and diagnostics behind an owned speech controller. Reuse AO's algorithms and
expose controls through the existing AI connections and composer primitives.
Speech augments a conversation draft instead of adding a language-model provider.
Pause and Stop finalize pending words. Session identities protect conversations
from late results, and each recording resets acoustic and feature state.

Pin parakeet.js 1.4.4, ONNX Runtime Web 1.30.0 and the reference's immutable
maintainer-converted model artifacts. Default to CPU INT8; offer explicit
WebGPU FP32 encoder with INT8 CPU decoder and experimental FP16. Do not fall
back silently. Apply an asserted build-local sequential session patch, retain
the GPU CPU-decoder bootstrap, expose startup stages, and enforce a main-thread
120-second deadline. Failure disposes the owned worker and requires manual Retry.

Keep inference and audio entirely in the secure, isolated browser. Download
weights and runtimes only on explicit installation, verify size/digest, retain
them outside repository files and restore them without a network fallback.
Split optional static runtime files to respect Pages' per-file limit. Keep
original audio and diagnostic transcripts in a bounded private browser store
with explicit export and deletion.

Preserve model attribution and complete dependency notices. TEN-VAD's upstream
license has additional restrictions; obtain its unchanged engine as a separate
optional publisher download and retain the exact license and derived notices.
Do not relabel it as ordinary Apache-2.0 or treat this boundary as a general
license-compatibility determination for redistributors.

## Status

Adopted. Named Vitest/QuickPickle lifecycle and streaming scenarios complement
the existing Cucumber/Playwright UI profile and an explicit real-model browser
suite. Hardware/backend qualifications remain limited to recorded verification.
