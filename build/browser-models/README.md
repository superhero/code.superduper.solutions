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
receipt/binaries. These copied bridge/kernel inputs retain their exact reference
bytes for reproducibility. The speech build verifies each input/output digest.
The owned cache loader adapts the generated module's single relative Wasm URL to
the installed Blob URL; native binaries and packed model weights remain intact.
The bridge is bundled independently from the pinned native module. Its runtime
MIT notices and model CC BY 4.0 notice travel with the optional installation.
