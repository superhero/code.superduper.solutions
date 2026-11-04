# Pinned Wllama source build

`build-wllama.sh` and `upstream-api.patch` are copied from the handoff's selected
baseline `inference/evaluations/shared-webgpu/runtime/wllama/` build. The script
expects an isolated `/work` containing `upstream-api.patch`, Emscripten 4.0.20,
Node/npm, CMake, Git and curl. The original builder used
`emscripten/emsdk:4.0.20@sha256:33e992367f721747d8008c9141c04fa017139e3557a60e0c80be93a0870fe462`.
It pins Wllama, llama.cpp and the Dawn release and checks the Dawn zip digest.
Do not provide `fwht.enabled`: that selects the separately evaluated experimental
fork. Do not run the sibling project's remote builder or affect its services.

The already-built baseline's `index.js`, `wllama.wasm`, MIT `LICENCE` and
`build-receipt.json` live under `src/public/browser-models/wllama/` and are copied
as opt-in assets by Vite. `build/browser-models.mjs` verifies source revisions,
heap ceiling and exact artifact/notice digests before every build. The browser
catalog repeats those reviewed digests and sizes for installation verification.
Rebuilding with a different toolchain may change bytes and requires a deliberate
pin/evidence review; do not silently rewrite the receipt.

The WebML runtime is not redistributed. Its direct pinned installation URL,
size and digest live in the browser model catalog. No model weights are read or
downloaded by this build workflow.

Publisher model notices under `src/public/browser-models/notices/` are verified
against `src/lib/assistant/browser/notices.json` and installed with the selected
model. The Ornith pinned model card declares MIT but its linked parent LICENSE
is unavailable; its existing declaration is retained rather than inventing a
copyright notice. The Bonsai Apache license is preserved in full.

The `native/` subdirectory retains the exact additional source-build inputs for
D3's no-forward inspector/8 GiB heap, Elephant's two-block readout and Perplexity's
protocol-v3 inline readout. These are separate Wllama builds, not replacements
for the chat runtime. Their published files and complete MIT license are under
`src/public/browser-models/wllama-{d3,elephant,pplx-v3}/`; each build receipt pins
both executable outputs and the retained recipe/patch hashes. The optional
runtime build verifies them without invoking compilers, Docker or inference.

Reference owners are llm-sds-01's
`inference/evaluations/browser-decisions/runtime/{elephant,pplx}-build.py` and
`inference/evaluations/browser-decision-context/runtime/native/`.
Use the recorded Wllama/llama.cpp/Emscripten/Dawn revisions and container digest;
review those records before rebuilding. No model weights belong in this folder.

LFM3 1.7B uses its isolated wllama-lfm3 directory and the exact native/lfm3
recipe inputs from the reference trial. The original chat and decision binaries
remain separate. build/browser-models.mjs verifies the new executable outputs
and source revision; model-runtimes.mjs publishes its installed-artifact pins.

Phonon uses the separate build/phonon inputs and src/public/speech/phonon
receipt/binaries. These copied GPU bridge/build inputs retain their exact reference
bytes for reproducibility. The speech build verifies each input/output digest.
The owned cache loader adapts the generated module's single relative Wasm URL to
the installed Blob URL; native binaries and packed model weights remain intact.
The bridge is bundled independently from the pinned native module. Its runtime
MIT notices and model CC BY 4.0 notice travel with the optional installation.

## Brave GPU decision compatibility

`native/shared-fp32/` retains the exact combined native build recipe, patches,
context manifest and pins from the reference's current working tree. The paired
`src/public/browser-models/wllama-decision-fp32/{index.js,wllama.wasm}` merges the
four original decision API families with core FP32 GPU kernels. Original packed
GGUF parameters remain unchanged. Native device creation requests no shader-f16;
K/V caches are F32 and flash attention is disabled. Source and output digests
are verified before generating the shared `decision-fp32` installation group.
The inherited D3-only build-receipt description is superseded by its explicit
`context_variant` and four merged patch hashes. This experimental local patch
is qualified only with the 1,024-token complete-request guard.

There are no decision CPU options or CPU-only distribution groups. Superseded
CPU-only additions from the earlier preparation are removed; the previously
committed chat and native reference binaries remain intact. Runtime/model
backend failures cannot silently fall back to CPU.

`strands-fp32/` retains MU's exact converter, worker patch, conversion manifest
and per-parameter receipt from the reference's current working tree. The adapted
worker keeps this project's IndexedDB-only fetch/Blob loading and deadlines while
applying MU's explicit FP32 GPUDevice binding and native pipeline evidence.
`expanded-provenance.json` records upstream and adapted digests.

Before the next authorized deployment, stage the complete checksum-verified MU
weight tree into the built distribution on the machine holding it:

```sh
python3 build/browser-models/stage-strands-fp32.py WEIGHTS_DIRECTORY dist
```

On sds-01 the existing input is
`/home/erik/llm-sds-01/brave-decisions/weights/9c3589ba48ec3be7a565b52a2fbd0687e30ffe0222c2b3a29d94b569062daf30/`.
The helper verifies all original file hashes before writing, retains relative
paths, and splits the large shard into 16 MiB immutable static parts. The browser
fetches each part in full and verifies the assembled original file digest before
recording an installation. It then serves the unsplit logical shard to ORT from
IndexedDB, including offline. Do not substitute the old FP16 manifest/shards.
The optional payload is about 1.283 GB; it is separate from the source archive
and HTML. Do not publish a candidate missing these catalog-referenced static
files. Use the existing HTTPS and isolation policy; cross-origin mirrors also
need CORS and Cross-Origin-Resource-Policy: cross-origin. Do not publish the LAN
URL as a production dependency. Staging never uploads or deploys anything.

## Strict GPU chat pairs

`native/chat-gpu` pins Ornith Q4/Q8 and MiniCPM's Wllama3bb2a46/llama970b51c
source build; `native/chat-lfm3-gpu` pins the separate llama19cce691 build.
Each retains the exact reference build/patch inputs, paired JS/Wasm, MIT license
and receipt. Generation validates every input/binary hash before publishing
its runtime group. Keep the original image-capable native binaries separate.

The strict builds force GPU input embedding, prohibit CPU weight fallback and
reject CPU neural graph operators. Keep F32 KV, flash attention off, 128/64
batches, one slot, no prefix cache and the 4,096/256 context/output ceilings.
Tokenization, sampling/control and Pi tools remain CPU work. Ordinary logs may
roll over; aggregate audits must survive. These builds need working WebGPU,
JSPI, Wasm64, SIMD/pthreads and isolation, but not shader-f16.

## Continuous speech source and optional assets

`../speech/nq` retains the four unchanged NR generation recipes.
`../prepare-nq-speech.mjs` changes only their build destinations and resolves
the pinned parakeet.js support modules; it never writes the reference checkout.
`../speech/conversion` preserves decoder lowering, initializer proof and pinned
dependencies. VAD export/calibration recipes and publisher-license provenance
remain under `../speech/`; MarbleNet model weights use NVIDIA's Open Model
License, distinct from NeMo code's Apache license.

Run `stage-speech-assets.py VERIFIED_ASSET_CACHE dist` after building and before
creating the complete delivery manifest. Its source cache uses SHA directories
and original filenames; the script verifies every byte before staging. The
converted models stay outside Git and core HTML. Include every staged file and
full notices; production URLs must never point to the reference LAN service.

## Compatible official LFM image option

`vision-compatible/reference-evidence.json` records the five original publisher
file pins and bounded native node-assignment evidence. No conversion is used.
`reference/expanded/vision-pins.js` resolves the existing FP16 choice separately
from `official-q4-fp32-compatible-v1`; only the latter uses FP32 embedded token
weights and original Q4 image/decoder graphs. Transformers.js 4.3.1 and its
matching ORT 1.31 dev pair remain pinned by the existing package/runtime catalog.

Keep the installed-asset fetch shim, Blob factory/Wasm URLs and tokenizer
revision override when adapting the shared worker. Bind the owned GPUDevice in
each session's execution-provider options; the global env setter alone does not
bind native ORT. Request actual adapter compute/buffer limits, including at
least nine storage buffers per shader stage. Enable the known CPU shape/mask/
index/packing operators, and distinguish their placement from weighted neural
computation. Device instrumentation counts submitted and drained commands; it
does not replace the reference per-node audit or establish universal placement.
Release sessions before draining/destroying the device. Model files remain
opt-in publisher downloads, outside Git and core HTML.
