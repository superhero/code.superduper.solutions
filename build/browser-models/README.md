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
