#!/usr/bin/env bash
set -euo pipefail
cd /work
git init upstream
git -C upstream remote add origin https://github.com/mudler/parakeet.cpp.git
git -C upstream fetch --depth 1 origin 43dce03cb3c36849d5e5a504076be3d9bea7b6c4
git -C upstream checkout --detach FETCH_HEAD
git -C upstream submodule update --init --depth 1 third_party/ggml
cp bridge.cpp upstream/phonon_browser.cpp
cp ternary_kernels_wasm.cpp upstream/src/ternary_kernels_wasm.cpp
python3 - <<'PY'
from pathlib import Path
p=Path('upstream/src/ternary_kernels.hpp');s=p.read_text();s=s.replace('const TernaryKernel* ternary_kernel_x86_vnni();','const TernaryKernel* ternary_kernel_wasm_simd();\nconst TernaryKernel* ternary_kernel_x86_vnni();');p.write_text(s)
p=Path('upstream/src/ternary.cpp');s=p.read_text();anchor='        if (const TernaryKernel* k = ternary_kernel_x86_vnni()) return k;';assert s.count(anchor)==1;s=s.replace(anchor,'        if (const TernaryKernel* k = ternary_kernel_wasm_simd()) return k;\n'+anchor);p.write_text(s)
PY
cat >>upstream/CMakeLists.txt <<'CMAKE'

add_executable(phonon_browser phonon_browser.cpp)
target_link_libraries(phonon_browser PRIVATE parakeet)
target_include_directories(phonon_browser PRIVATE src third_party/ggml/include)
target_sources(parakeet PRIVATE src/ternary_kernels_wasm.cpp)
set_source_files_properties(src/ternary_kernels_wasm.cpp PROPERTIES COMPILE_OPTIONS "-ffp-contract=off")
target_link_options(phonon_browser PRIVATE
  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sEXPORT_NAME=createPhonon"
  "-sENVIRONMENT=worker" "-sALLOW_MEMORY_GROWTH=1"
  "-sINITIAL_MEMORY=134217728" "-sMAXIMUM_MEMORY=2147483648"
  "-sSTACK_SIZE=5242880" "-sFORCE_FILESYSTEM=1"
  "-sPTHREAD_POOL_SIZE=8" "-sEXIT_RUNTIME=0"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','FS','UTF8ToString','HEAPF32','HEAPU8']"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_phonon_load','_phonon_transcribe','_phonon_error','_phonon_release','_phonon_free_string','_phonon_check_kernel']")
set_target_properties(phonon_browser PROPERTIES SUFFIX ".mjs")
CMAKE
emcmake cmake -S upstream -B build -DCMAKE_BUILD_TYPE=Release \
  -DPARAKEET_BUILD_CLI=OFF -DPARAKEET_BUILD_SERVER=OFF \
  -DPARAKEET_WITH_CED=OFF -DPARAKEET_WITH_VOICEDETECT=OFF \
  -DGGML_NATIVE=OFF -DGGML_LLAMAFILE=OFF -DGGML_OPENMP=OFF \
  -DGGML_BLAS=OFF -DGGML_CPU_ALL_VARIANTS=OFF \
  -DCMAKE_C_FLAGS='-O3 -msimd128 -pthread -fexceptions' \
  -DCMAKE_CXX_FLAGS='-O3 -msimd128 -pthread -fexceptions'
cmake --build build --target phonon_browser -j 6
mkdir artifacts
cp build/phonon_browser.* artifacts/
cp upstream/LICENSE artifacts/LICENSE-parakeet.cpp
cp upstream/third_party/ggml/LICENSE artifacts/LICENSE-ggml
python3 - <<'PY'
import hashlib,json,pathlib,subprocess
p=pathlib.Path('/work/artifacts')
d={'runtime':'parakeet.cpp WebAssembly CPU adapter','host':'sds-01','upstream':subprocess.check_output(['git','-C','upstream','rev-parse','HEAD'],text=True).strip(),'ggml':subprocess.check_output(['git','-C','upstream/third_party/ggml','rev-parse','HEAD'],text=True).strip(),'image':'emscripten/emsdk:4.0.20@sha256:33e992367f721747d8008c9141c04fa017139e3557a60e0c80be93a0870fe462','threads':8,'simd':True,'packed_kernel':'local wasm-simd128; reference checked in the browser','memory_max_bytes':2147483648,'inputs':{n:hashlib.sha256(pathlib.Path(n).read_bytes()).hexdigest() for n in ['build.sh','bridge.cpp','ternary_kernels_wasm.cpp']},'files':{x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in p.iterdir() if x.is_file()}}
(p/'build-receipt.json').write_text(json.dumps(d,indent=2)+'\n')
PY
