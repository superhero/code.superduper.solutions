# Browser speech input

Speech recognition uses ONNX Runtime Web through parakeet.js. Its entry in
Settings → AI → Inference engines opens the Speech input settings card.

Parakeet dictation augments the existing AI draft for every connection provider.
It never sends a message automatically. Open **Settings → AI → Speech input**,
choose a recognizer row and install it explicitly. Each compact row matches the LLM list, with parameter
count, encoder precision, total download size and install/load/remove controls.
Browser compatibility, settings and detailed information expand independently
below each row. Licenses remain available under **Detailed info**. The
**Speech model** menu beside **Dictate** lists every recognizer with
installation state and download size. Selecting one installs missing files and
queues its load after active browser inference or dictation; it never opens the
microphone. The separate **Dictate** button prepares the selected model if
needed and starts microphone capture. That button also stops dictation or cancels
preparation; the adjacent arrow only opens model selection. Both controls live
in the composer's existing framed footer. Confirmed sentences are
appended to the originating conversation; provisional words remain a preview.
Changing conversation or closing the pane stops capture and finalizes its tail.

The default recognizer is **WebGPU continuous**, using NR's original dynamic FP32
encoder and NQ's GPU-resident decoder/grouped control. Encoder neural operators
use GPU; audited indexing/layout, capture, features and scheduling use CPU.
TEN remains an explicitly labeled CPU/Wasm speech detector. Its settings card
also offers FireRed, FSMN and MarbleNet GPU frontend/model adapters; no
unsupported GPU path silently substitutes a CPU model.

The original WebGPU FP32 encoder + INT8 CPU decoder and CPU INT8 recognizer
remain explicit legacy options with their earlier recording limits.
WebGPU FP16 is an explicit experimental choice requiring `shader-f16`. No mode
silently substitutes another backend. Download sizes do not establish RAM/VRAM
requirements or browser/device qualification. Microphone access requires an
explicit Record action in a secure context; deployments retain COOP/COEP headers.

## Ownership and initialization

`controller.ts` owns installation, a dedicated inference worker, capture and
the current conversation callback. A main-thread 120-second deadline includes
cache restoration and session compilation. Failure terminates this inference
worker, releases capture/features and offers a clean manual Retry. Retry creates
a fresh worker and retains verified cached artifacts. Stop flushes the worklet
before ending recognition and has a separate completion deadline.

Continuous capture coalesces cancellation, failure and unload for the original
worker. A replacement load waits for microphone, feature and segment cleanup;
stale worker messages, archive continuations and microphone-permission failures
cannot tear down the replacement. Repeated callers await the same cleanup.

For legacy recognizers, `capture.ts` owns microphone tracks, a 16 kHz AudioContext and the worklet's
flush acknowledgement. Late permission grants are closed after cancellation.
Recording stops after 55 seconds; the pipeline bounds audio at 60 seconds.

The `runtime/` modules adapt the user-owned AO streaming example from
`llm-sds-01/inference/attempts/ao-browser-parakeet-streaming/runtime/src`.
They retain TEN-VAD's 256-sample hops, 0.5 threshold, onset/tail context,
continuous 128-bin features and conservative sentence merging. Inference stays
serial and skips silence. A sustained pause or Stop matures provisional words.
Every recording gets fresh feature state and reset VAD/model caches.

The legacy build applies BS's sequential-session approach to **both** CPU and
WebGPU encoder paths: encoder creation completes before decoder creation starts, with named
startup stages. These legacy paths retain the reference's CPU decoder bootstrap; the default
continuous mode uses the independent GPU decoder described below.
The transform checks the exact parakeet.js 1.4.4 source digest and fails if its
shape changes. It does not edit `node_modules` or claim an upstream fix.

## Downloads and local data

`model.lock.json` preserves AO's publisher/conversion revisions, sizes and hashes.
The vocabulary's added SHA256 was derived from the pinned file after verifying
its recorded Git blob ID. NVIDIA publishes the original model; ysdede maintains
the ONNX conversion and quantization. No weights ship in Git or core HTML. The optional immutable decoder and GPU VAD
compatibility assets are staged separately for distribution; original large
Parakeet weights remain pinned publisher downloads.

`storage.ts` verifies SHA256 and exact sizes before publishing installed cache
entries. Large files stream into browser CacheStorage, outside repository files.
Restoration creates local Blob URLs and has no download fallback. Downloads are
serialized with Web Locks; shared artifacts survive removal of another mode.
Downloads can be cancelled. Browser eviction or an incomplete cache requires an
explicit installation again.
Installation uses actual storage writes rather than rejecting a download from
`navigator.storage.estimate()`: Brave can mask that quota as 2 GiB even when
more capacity is available. Real `QuotaExceededError` failures remove the
incomplete artifact and explain how to free space. Temporary/private browser
contexts can impose tighter storage limits than an ordinary persistent profile.

Continuous Parakeet keeps original 16 kHz PCM and segment/transcript metadata in
the separate private `code-speech-segments-v1` IndexedDB database. Pending audio
survives reload; completed audio remains until explicitly removed under
**Local recordings**. WAV export reconstructs unique cores without duplicated
overlap and reads one stored segment at a time. Quota/backpressure errors stop
capture explicitly and expose any unsaved recovery audio for export. Nothing is
uploaded. Other recognizers retain their in-memory-only recording behavior.
Unsaved PCM remains available across subsequent recordings in the same tab.
Local recordings groups its export and explicit discard controls by recording,
so separate recordings cannot be interleaved into one recovery WAV. Discard is
blocked during recording and cleanup. Unsaved audio is not durable across page
closure; exporting keeps the recovery copy and warning until explicit discard.
Confirmed text is appended to the originating AI draft. `diagnostics.ts` removes the obsolete
`code-speech-diagnostics` database on application startup, including any earlier
recordings. Downloaded model files remain cached separately. Nothing is uploaded
by the speech service; normal AI message submission remains the user's action.

## Runtime packaging and notices

`build/speech-runtime.mjs` bundles parakeet.js **1.4.4** and ONNX Runtime Web
**1.30.0** into optional workers under `speech/`. The ONNX Runtime dependency is
overridden to that same version throughout the dependency tree. ORT's matching
JSEP MJS/Wasm, the capture worklet and complete package notices accompany them.
Files over 20 MiB use the existing verified static-part transport, retaining
Cloudflare Pages' 25 MiB per-file limit. These payloads are outside core HTML.

TEN-VAD JS/Wasm is downloaded unchanged directly from the immutable upstream
revision recorded in `catalog.ts` and verified against AO's hashes. Its engine
is not redistributed in the app bundle. `src/public/speech/notices` preserves
its exact license, derived-code notices and source receipt. TEN-VAD's license
includes additional deployment restrictions involving Agora; do not describe it
as unqualified Apache-2.0. Model attribution includes NVIDIA, the maintainer
conversion, and CC BY 4.0. The runtime's separate notices include ONNX Runtime's
upstream third-party notices as well as the bundled dependency graph.

## Verification

`npm run test:speech` runs named Gherkin scenarios through Vitest/QuickPickle.
It covers silence, pause/Stop finalization, repeated words, continuous feature
parity/reuse, serial inference, initialization timeout/Retry, cache restoration,
repeated sessions without recording retention, permission denial and late
cancellation. A scenario-level adapter writes `tmp/test/cucumber-speech.json`
for the combined report; it does
not invent per-step Cucumber timings. UI/cache-stream scenarios belong to the
ordinary Playwright browser profile.

`npm run test:speech:live` is an explicit real-model Chromium suite. Build first.
Set `SPEECH_MODEL_DIRECTORY` to the three pinned CPU files, `SPEECH_TEN_DIRECTORY`
to the pinned TEN-VAD JS/Wasm, `SPEECH_AUDIO_FIXTURE` to the public-domain JFK WAV,
and `SPEECH_SILENCE_FIXTURE` to a silent WAV. `SPEECH_PAUSE_FIXTURE` supplies two
copies of the speech fixture separated by two seconds of silence, with two
seconds of silence at each end, for the real pause/restart scenario. Optional
`BROWSER_EXECUTABLE_PATH` selects Chrome. The suite verifies model bytes, serves
only local fixtures, uses an owned persistent browser profile, and exercises
the actual composer and workers. It never launches or alters the reference
experiment's browser profile or service. Results/traces live under
`tmp/test/speech-live`; model tests are not substituted with simulated output.

Successful runs establish the tested browser/mode and cases, not universal
startup reliability. FP16 remains experimental even after a successful run.

Verification on 2026-10-24 used Linux Chrome 155 with the actual CPU INT8 model:
repeated recordings, cached reload with upstream downloads blocked, denied and
restored permission, silence with zero recognition passes, and
pause/second-utterance finalization passed. The complete speech and
pause fixtures used the reference's word-error-rate ceiling of 0.25. GPU FP32
and experimental FP16 were not exercised in this editor verification.

Verification on 2026-10-26 exercised the actual composer, capture and installed
workers in Chromium 153 on an RTX 3060. CPU INT8, WebGPU FP16 and WebGPU FP32
each recognized the pinned public 11-second JFK fixture with word-error rate
0.091 (reference ceiling 0.25), without uploads or saved recording diagnostics.
The original stereo/44.1 kHz WAV passed through normal 16 kHz capture conversion.
Offline ORT 1.30 uses its matching Asyncify factory/Wasm pair; the legacy JSEP
factory lacks WebGPU initialization. FP16 remains experimental; one fixture
does not establish broad transcription quality or universal startup reliability.

## Additional recognizers

LFM3-Audio 2B and LFM3-Omni 2B use their pinned ONNX WebGPU assets and explicit
provider GPUDevice. They transcribe after stopping, up to 30 seconds, rather than
using the Parakeet streaming feature pipeline.

Phonon 2.5 now uses the LL WebGPU native build and LM speech-aware repeated
windows. The public packed GGUF remains 241,719,776 bytes with the same checksum
and cache key; existing weights are reused. The reference's 174 MB gzip remains
a LAN-only generated artifact with no public immutable URL. Optional runtime
files are replaced without changing the model or the cache database.

Native load and transcription await JSPI ccall promises. Requirements include
WebGPU FP16, at least 1,440,898,696 bytes per GPU buffer, 128 MiB per storage
binding, JSPI, SIMD, shared memory and cross-origin isolation. The native backend
must report GPU selection, and every recognition window must dispatch real GPU
compute. GPU validation errors fail the operation. File sizes are not free
memory estimates: packed weights expand to about 1.4 GB on GPU.

The existing 16 kHz capture, TEN-VAD, LiveDecoder and SentenceMerger feed Phonon.
Recognition is serial/coalesced while every PCM packet is retained. Native word
times are offset from each window into the session timeline before merging.
Confirmed text is appended once; provisional text remains separate. Stop awaits
the capture flush and drains remaining windows without rewriting the full
recording. Each restart creates a decoder and resets VAD; session and epoch IDs
reject stale callbacks. Capture is capped at 55 seconds and window context at
30 seconds; mobile and longer recordings remain unqualified.

Unloading terminates the owning GPU worker and its pthreads, releases capture
and keeps installed files. Blob URLs stay alive until that worker is terminated.
TEN-VAD license/NOTICES and Fermion/NVIDIA CC BY 4.0 attribution accompany the
optional runtime. phonon-shared-sources.json retains LM shared-source hashes
and the editor adapters' hashes; build/phonon and the shipped build receipt own
the exact LL native inputs and executable checksums.

Editor verification on 2026-10-29 passed the GPU build in Chromium 153 on
sds-01's RTX 3060: two microphone-fixture recordings each produced the exact
normalized 22 expected words and 17 partial updates before Stop. Confirmed text
stayed fixed, native concurrency peaked at one, GPU dispatches occurred and no
GPU validation/page errors were observed. Reloading the installed native module,
Wasm, model and TEN-VAD from Blob/cache URLs with the context offline passed.
Synthetic silence through actual TEN-VAD produced no recognition calls; cancelling
during a GPU window rejected stale updates and a fresh initialization succeeded.
The test used an isolated development server and left the shared Vite service
and foreign workloads unchanged. These are bounded fixture checks, not physical
microphone, mobile or long-recording qualification.

## Continuous Parakeet and GPU speech detection

`runtime/continuous/` adapts the complete OO coordinator, store and global merger.
One AudioWorklet feeds 20-second unique cores plus two seconds of overlap into
one warm serial ASR worker. Pending PCM is durable; only capture and active
inference own feature clients. The final second at a forced seam stays
provisional. Real pauses commit earlier, decoded silence advances its own
horizon, repeated context is reconciled by onset/overlap, and genuine repeated
words survive. Append each sequenced `stableDelta` once; replace only `draftText`.
Only the global merger rebases segment-local timestamps.

Stop flushes the worklet, drains queued segments and commits the tail without
whole-recording transcription. Readiness follows the archive/statistics barrier.
Cancellation and late permission callbacks are fenced by worker/session epochs.
GPU chat waits for capture and complete speech unload; speech waits for an
active Pi turn and unloads its LLM. Joint ASR/LLM residency is unqualified,
especially Ornith Q8 on 12 GiB.

`build/prepare-nq-speech.mjs` runs the four unchanged pinned NR generation recipes
in ignored build storage. Paired ORT 1.30 Asyncify files, generated helpers,
feature workers and caller-verified Blob model URLs form the offline bundle.
The compact decoder is a local FP32-activation compatibility conversion of the
original INT8 initializer bytes; recipes, initializer proofs and dependency pins
remain under `build/speech/`. It is not publisher-native INT8 arithmetic.

FireRed and FSMN retain their original FP32 graphs, preprocessing/cache/reset
contracts and native frontend calibration. MarbleNet retains exact official
tensors in a local FP32 export and roughly 1.45 seconds of future context.
Reference raw-classifier F1 was 84.63%, 95.85% and 97.87%, respectively, on four
held-out clips; this is not a universal ranking or complete dictation score.
FSMN remains experimental pending publisher endpoint/SNR processing. Silero GPU
is explicitly unsupported because tested probabilities/decisions were incorrect.
GPU execution uses the ASR-owned explicit device with CPU neural fallback
disabled; VAD flush/reset occurs per segment and its resources close first.

Optional installations carry publisher licenses and notices. MarbleNet weights
use the NVIDIA Open Model License, including the agreement and required Notice;
its separate NeMo code license does not relabel those weights. TEN's additional
license conditions remain intact. Installed notice text is available offline.
Physical microphones, phones, hours-long recording and actual quota exhaustion
remain outside fixture qualification.

## Integrated editor evidence (2026-11-02)

Actual Brave 1.96.61 / Chromium 154.0.8037.98 on sds-01, RTX 3060 12 GB,
passed the installed continuous worker and AudioWorklet path: 75 seconds
produced the expected 110 words; a ten-minute accelerated replay produced
880 words while draining its durable backlog. Stable prefixes stayed fixed.
All 36 archived audio records retained matching hashes after reload. Stop
waited for pending archive writes and final words. Cancellation during native
inference, a fresh restart, silence, cached Blob model reload with downloads
blocked, and zero tracked GPU buffers after unload passed. These file-backed
checks do not qualify physical microphones or ten minutes of wall-clock capture.

FireRed, FSMN and MarbleNet each passed a full 15-second, 22-word dictation
through the same ASR-owned GPUDevice, with positive detector execution counters
and zero tracked buffers after unload. VAD operations and ASR inference share
a serial compute queue: overlapping ORT Asyncify/JSEP calls caused an observed
FSMN memory fault before this fix. A fatal native failure now rejects queued
operations and requires a fresh worker. TEN remains the visible CPU control;
raw reference classifier scores do not establish a universal production default.

Targeted Vitest/QuickPickle cases cover queue invalidation, transcript seams,
segment ownership, lifecycle and the changed model adapters. Their simulated
resource tests supplement the actual browser results above. Hours-long capture,
quota exhaustion during a real recording, mobile and simultaneous model
residency remain unqualified. Exact decoder reproduction is documented under
`build/speech/conversion/README.md`; publisher licenses and local conversion
notices travel with each selected optional payload.

## Capture lifecycle review evidence (2026-11-04)

The current `llm-sds-01/inference/evaluations/parakeet-long-stream/runtime/capture.js`
informed teardown/replacement isolation and recovery retention. Its exact source
and editor-adaptation hashes are recorded in `continuous-sources.json`.
Three named QuickPickle scenarios passed overlapping cancellation, segment
failure during microphone close and archive failure followed by a new recording.
Browser UI scenarios verified recording-specific WAV export and scoped discard.

The changed editor passed the real continuous-speech scenario again on sds-01:
Brave 1.96.61 / Chromium 154.0.8037.98, RTX 3060 12 GB. AudioWorklet capture
retained 75.176 seconds and produced 110 expected words with 25 stable draft
updates. A 600-second accelerated backlog produced 880 words in 32.441 seconds
of wall time. Cancellation during inference, restart, silence, offline Blob
reload and all 36 archived PCM hashes passed. Unload destroyed all 1,419 tracked
GPU buffers, with no GPU, page, network or upload errors.

The single owned test ran under the shared lease with 4 CPU, 16 GiB RAM, zero
swap and 512 PID limits. Cgroup peak RAM was 11,505,037,312 bytes (10.72 GiB),
peak PIDs 206 and OOM events zero. The service was removed and lease released;
foreign workloads were left untouched. Raw results, launch flags, source
digests and resource receipts are under
`tmp/layout/browser-reference-review-20261104/`. This fixture run retains the
physical-microphone, real quota-exhaustion, mobile and long wall-clock limits
described above; injected lifecycle faults are separate from the neural run.
