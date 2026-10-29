#!/usr/bin/env bash
set -euo pipefail
cd /work
git init upstream
git -C upstream remote add origin https://github.com/mudler/parakeet.cpp.git
git -C upstream fetch --depth 1 origin 4fbf4d92b49a44bc4a24bc373ca12cf252919ca6
git -C upstream checkout --detach FETCH_HEAD
git -C upstream submodule update --init --depth 1 third_party/ggml
cp bridge.cpp upstream/phonon_browser.cpp
python3 - <<'PY'
from pathlib import Path
p=Path('upstream/src/model_loader.cpp');s=p.read_text()
old='const size_t nth = std::min<size_t>(hc ? hc : 1u, 8u);'
assert s.count(old)==1
p.write_text(s.replace(old,'const size_t nth = 1; // Browser WebGPU objects belong to the owning worker.\n        (void)hc;'))
PY
mkdir -p emdawn
curl --fail --location --retry 2 -o emdawn.zip https://github.com/google/dawn/releases/download/v20260317.182325/emdawnwebgpu_pkg-v20260317.182325.zip
python3 - <<'PY'
import hashlib,pathlib,zipfile
assert hashlib.sha256(pathlib.Path('emdawn.zip').read_bytes()).hexdigest()=='8dcae86c630d76b6794b271c6572becba36f4237d132bee121a56638c3d76575'
with zipfile.ZipFile('emdawn.zip') as z:z.extractall('emdawn')
PY
cat >> upstream/CMakeLists.txt <<'CMAKE'

add_executable(phonon_browser phonon_browser.cpp)
target_link_libraries(phonon_browser PRIVATE parakeet)
target_include_directories(phonon_browser PRIVATE src third_party/ggml/include)
target_link_options(phonon_browser PRIVATE
  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sEXPORT_NAME=createPhonon"
  "-sENVIRONMENT=worker" "-sALLOW_MEMORY_GROWTH=1"
  "-sINITIAL_MEMORY=134217728" "-sMAXIMUM_MEMORY=4294967296"
  "-sSTACK_SIZE=8388608" "-sFORCE_FILESYSTEM=1"
  "-sPTHREAD_POOL_SIZE=8" "-sEXIT_RUNTIME=0"
  "-sJSPI" "-sJSPI_EXPORTS=['phonon_load','phonon_transcribe']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','FS','UTF8ToString','HEAPF32','HEAPU8']"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_phonon_load','_phonon_transcribe','_phonon_error','_phonon_release','_phonon_free_string','_phonon_gpu_info']")
set_target_properties(phonon_browser PROPERTIES SUFFIX ".mjs")
CMAKE
emcmake cmake -S upstream -B build -DCMAKE_BUILD_TYPE=Release \
  -DPARAKEET_BUILD_CLI=OFF -DPARAKEET_BUILD_SERVER=OFF \
  -DPARAKEET_WITH_CED=OFF -DPARAKEET_WITH_VOICEDETECT=OFF \
  -DGGML_NATIVE=OFF -DGGML_LLAMAFILE=OFF -DGGML_OPENMP=OFF \
  -DGGML_BLAS=OFF -DGGML_CPU_ALL_VARIANTS=OFF \
  -DGGML_WEBGPU=ON -DGGML_WEBGPU_JSPI=ON \
  -DEMDAWNWEBGPU_DIR=/work/emdawn/emdawnwebgpu_pkg \
  -DCMAKE_C_FLAGS='-O3 -msimd128 -pthread -fwasm-exceptions' \
  -DCMAKE_CXX_FLAGS='-O3 -msimd128 -pthread -fwasm-exceptions'
cmake --build build --target phonon_browser -j 6
mkdir artifacts
cp build/phonon_browser.* artifacts/
cp upstream/LICENSE artifacts/LICENSE-parakeet.cpp
cp upstream/third_party/ggml/LICENSE artifacts/LICENSE-ggml
git -C upstream diff --binary > artifacts/browser.patch
python3 - <<'PY'
import hashlib,json,pathlib,subprocess
p=pathlib.Path('/work/artifacts')
d={'runtime':'parakeet.cpp WebGPU browser adapter','host':'sds-01','upstream':subprocess.check_output(['git','-C','upstream','rev-parse','HEAD'],text=True).strip(),'ggml':subprocess.check_output(['git','-C','upstream/third_party/ggml','rev-parse','HEAD'],text=True).strip(),'image':'emscripten/emsdk:4.0.20@sha256:33e992367f721747d8008c9141c04fa017139e3557a60e0c80be93a0870fe462','threads':8,'simd':True,'jspi':True,'memory_max_bytes':4294967296,'weight_upload_threads':1,'weights':'Unchanged packed input expanded to F16/F32 at GPU upload','dawn_sha256':hashlib.sha256(pathlib.Path('emdawn.zip').read_bytes()).hexdigest(),'inputs':{n:hashlib.sha256(pathlib.Path(n).read_bytes()).hexdigest() for n in ['build.sh','bridge.cpp']},'files':{x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in p.iterdir() if x.is_file()}}
(p/'build-receipt.json').write_text(json.dumps(d,indent=2)+'\n')
PY
