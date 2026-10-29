# Browser speech input

Speech recognition uses ONNX Runtime Web through parakeet.js. Its entry in
Settings → AI → Inference engines opens the Speech input settings card.

Parakeet dictation augments the existing AI draft for every connection provider.
It never sends a message automatically. Open **Settings → AI → Speech input**,
choose the CPU INT8, WebGPU FP32 or experimental WebGPU FP16 row, install it
explicitly. Each compact row matches the LLM list, with parameter
count, encoder precision, total download size and install/load/remove controls.
Browser compatibility, settings and detailed information expand independently
below each row. Licenses remain available under **Detailed info**. The
**Speech model** menu beside **Dictate** always lists all three variants with
installation state and download size. Selecting one installs missing files and
queues its load after active browser inference or dictation; it never opens the
microphone. The separate **Dictate** button prepares the selected model if
needed and starts microphone capture. That button also stops dictation or cancels
preparation; the adjacent arrow only opens model selection. Both controls live
in the composer's existing framed footer. Confirmed sentences are
appended to the originating conversation; provisional words remain a preview.
Changing conversation or closing the pane stops capture and finalizes its tail.

The default is WebGPU FP32, with an FP32 encoder and INT8 CPU decoder.
CPU INT8 remains an explicit option.
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

`capture.ts` owns microphone tracks, a 16 kHz AudioContext and the worklet's
flush acknowledgement. Late permission grants are closed after cancellation.
Recording stops after 55 seconds; the pipeline bounds audio at 60 seconds.

The `runtime/` modules adapt the user-owned AO streaming example from
`llm-sds-01/inference/attempts/ao-browser-parakeet-streaming/runtime/src`.
They retain TEN-VAD's 256-sample hops, 0.5 threshold, onset/tail context,
continuous 128-bin features and conservative sentence merging. Inference stays
serial and skips silence. A sustained pause or Stop matures provisional words.
Every recording gets fresh feature state and reset VAD/model caches.

The build applies BS's sequential-session approach to **both** CPU and strict
WebGPU: encoder creation completes before decoder creation starts, with named
startup stages. Strict GPU retains the reference's CPU decoder bootstrap.
The transform checks the exact parakeet.js 1.4.4 source digest and fails if its
shape changes. It does not edit `node_modules` or claim an upstream fix.

## Downloads and local data

`model.lock.json` preserves AO's publisher/conversion revisions, sizes and hashes.
The vocabulary's added SHA256 was derived from the pinned file after verifying
its recorded Git blob ID. NVIDIA publishes the original model; ysdede maintains
the ONNX conversion and quantization. No weights ship in Git or the distribution.

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

Speech audio stays in memory for transcription; no recording, transcript archive
or recognition diagnostics are saved. Only confirmed text is appended to the
originating AI draft. `diagnostics.ts` removes the obsolete
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
