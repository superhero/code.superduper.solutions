#include "parakeet_capi.h"
#include "backend.hpp"
#include "ggml_graph.hpp"
#include "ggml-backend.h"
#include <cstdlib>
#include <exception>
#include <string>
static parakeet_ctx* model = nullptr;
static std::string error, info;
extern "C" {
int phonon_load(const char* path) {
    if (model) { error = "Unload the existing model first"; return 0; }
    try {
        ggml_backend_load_all();
        const char* selected = nullptr;
        for (size_t i = 0; i < ggml_backend_dev_count(); ++i) {
            auto dev = ggml_backend_dev_get(i);
            auto type = ggml_backend_dev_type(dev);
            if (type == GGML_BACKEND_DEVICE_TYPE_GPU || type == GGML_BACKEND_DEVICE_TYPE_IGPU) {
                selected = ggml_backend_dev_name(dev); break;
            }
        }
        if (!selected) { error = "No WebGPU compute device; this trial refuses CPU-only inference"; return 0; }
        setenv("PARAKEET_DEVICE", selected, 1);
        model = parakeet_capi_load(path);
        if (!model) { error = parakeet_capi_load_error(); return 0; }
        auto& backend = pk::global_backend();
        if (backend.is_cpu()) { error = "Runtime fell back to CPU-only execution"; return 0; }
        info = std::string("{\"gpu\":true,\"backend\":\"") + ggml_backend_name(backend.handle()) + "\"}";
        error.clear(); return 1;
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
const char* phonon_gpu_info() { return info.c_str(); }
void phonon_free_string(char* p) { parakeet_capi_free_string(p); }
void phonon_release() { if (model) parakeet_capi_free(model); model = nullptr; error.clear(); }
}
