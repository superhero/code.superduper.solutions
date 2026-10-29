#include "parakeet_capi.h"
#include <cstdlib>
#include <string>
#include <exception>
#include <vector>
#include <cstring>
#include "ternary.hpp"
#include "ternary_kernels.hpp"
#include "ggml.h"

static parakeet_ctx* model = nullptr;
static std::string error;

extern "C" {
const char* phonon_check_kernel() {
    auto kernel = pk::ternary_kernel_wasm_simd();
    if (!kernel) return "{\"pass\":false,\"error\":\"SIMD kernel absent\"}";
    int checks = 0;
    bool nonzero = false;
    for (int N : {1, 7, 16, 37}) for (int K : {128, 256, 1024}) for (int T : {1, 3}) {
        std::vector<uint8_t> trits((size_t)N * ((K + 4) / 5));
        for (size_t i=0; i<trits.size(); ++i) trits[i] = (i * 71 + 13) % 243;
        std::vector<uint16_t> scales((size_t)N * (K / 128));
        for (size_t i=0; i<scales.size(); ++i) scales[i] = ggml_fp32_to_fp16((i % 29 + 1) * 0.00371f);
        pk::TernaryWeight w; pk::ternary_repack(trits.data(), scales.data(), N, K, w);
        std::vector<float> x((size_t)T * K);
        for (size_t i=0; i<x.size(); ++i) x[i] = ((int)(i * 37 % 241) - 120) * 0.017f;
        x[0] = 0; if (T>1) { std::fill(x.begin(),x.begin()+K,0); x[K] = 100; }
        std::vector<uint8_t> act((size_t)T * pk::ternary_act_row_bytes(K));
        pk::ternary_quant_rows_ref(x.data(),K,0,T,act.data());
        for (int start : {0, 1, 3}) {
            if (start>=N) continue;
            int end = N > 3 && start ? N - 1 : N;
            std::vector<float> a((size_t)T*N,-999), b=a;
            pk::ternary_matmul_rows_ref(w,act.data(),T,a.data(),start,end);
            kernel->fn(w,act.data(),T,b.data(),start,end);
            if (std::memcmp(a.data(),b.data(),a.size()*sizeof(float)))
                return "{\"pass\":false,\"error\":\"SIMD output differs from scalar reference\"}";
            ++checks;
            for (float value : a) if (value != 0 && value != -999) nonzero = true;
        }
    }
    if (!nonzero) return "{\"pass\":false,\"error\":\"Reference unexpectedly all zero\"}";
    static std::string result;
    result = std::string("{\"pass\":true,\"kernel\":\"") + pk::ternary_kernel_name() +
        "\",\"shapes\":24,\"checks\":" + std::to_string(checks) +
        ",\"comparison\":\"bit-exact against scalar, partial rows, zero rows, outlier\"}";
    return result.c_str();
}
int phonon_load(const char* path) {
    if (model) { error = "Unload the existing model first"; return 0; }
    setenv("PARAKEET_DEVICE", "cpu", 1);
    try {
        model = parakeet_capi_load(path);
        if (!model) { error = parakeet_capi_load_error(); return 0; }
        error.clear();
        return 1;
    } catch (const std::exception& e) { error = e.what(); return 0; }
}
char* phonon_transcribe(const char* path) {
    if (!model) { error = "Load Phonon first"; return nullptr; }
    try {
        char* out = parakeet_capi_transcribe_path_json(model, path, 2);
        if (!out) error = parakeet_capi_last_error(model);
        return out;
    } catch (const std::exception& e) { error = e.what(); return nullptr; }
}
const char* phonon_error() { return error.c_str(); }
void phonon_free_string(char* p) { parakeet_capi_free_string(p); }
void phonon_release() {
    if (model) parakeet_capi_free(model);
    model = nullptr;
    error.clear();
}
}
