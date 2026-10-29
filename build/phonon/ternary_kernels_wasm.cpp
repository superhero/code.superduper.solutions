#include "ternary_kernels.hpp"
#include <algorithm>
#include <cstdint>
#include <cstring>
#if defined(__wasm_simd128__)
#include <wasm_simd128.h>
#endif

namespace pk {
#if defined(__wasm_simd128__)
// The existing row-block layout holds four 2-bit codes in each byte. Decode
// four output rows together, keep exact int32 sums per 128-wide group, then
// perform the same float scale/add sequence as ternary_matmul_rows_ref.
static void rows_wasm(const TernaryWeight& w, const uint8_t* act, int T,
                      float* y, int r0, int r1) {
    if (r0 >= r1 || T <= 0) return;
    const int G = w.groups(), K = w.K, N = w.N;
    const size_t rb = ternary_act_row_bytes(K);
    const v128_t mask = wasm_i8x16_splat(3);
    for (int n = (r0 / 4) * 4; n < r1; n += 4) {
        const int block = n / kTernaryRowBlock, row = n % kTernaryRowBlock;
        for (int t = 0; t < T; ++t) {
            const uint8_t* a = act + (size_t)t * rb;
            const float sa = *reinterpret_cast<const float*>(a + K);
            const int32_t* gs = reinterpret_cast<const int32_t*>(a + K + 4);
            v128_t acc = wasm_f32x4_splat(0);
            for (int g = 0; g < G; ++g) {
                const uint8_t* packed = w.planes.data() + ((size_t)block * G + g) * 512 + 4 * row;
                v128_t sum = wasm_i32x4_splat(0);
                for (int step = 0; step < 8; ++step) {
                    const v128_t codes = wasm_v128_load(packed + step * 64);
                    for (int p = 0; p < 4; ++p) {
                        int32_t q4;
                        std::memcpy(&q4, a + g * kTernaryGroup + step * 16 + p * 4, 4);
                        const v128_t q = wasm_i32x4_splat(q4);
                        const v128_t c = wasm_v128_and(wasm_u8x16_shr(codes, p * 2), mask);
                        const v128_t lo = wasm_i32x4_extadd_pairwise_i16x8(wasm_i16x8_extmul_low_i8x16(c, q));
                        const v128_t hi = wasm_i32x4_extadd_pairwise_i16x8(wasm_i16x8_extmul_high_i8x16(c, q));
                        sum = wasm_i32x4_add(sum, wasm_i32x4_add(
                            wasm_i32x4_shuffle(lo, hi, 0, 2, 4, 6),
                            wasm_i32x4_shuffle(lo, hi, 1, 3, 5, 7)));
                    }
                }
                sum = wasm_i32x4_sub(sum, wasm_i32x4_splat(gs[g]));
                const v128_t scales = wasm_v128_load(w.scales.data() + ((size_t)block * G + g) * kTernaryRowBlock + row);
                acc = wasm_f32x4_add(acc, wasm_f32x4_mul(scales, wasm_f32x4_convert_i32x4(sum)));
            }
            float values[4];
            wasm_v128_store(values, wasm_f32x4_mul(acc, wasm_f32x4_splat(sa)));
            for (int r = std::max(n, r0); r < std::min(n + 4, r1); ++r)
                y[(size_t)t * N + r] = values[r - n];
        }
    }
}
#endif
const TernaryKernel* ternary_kernel_wasm_simd() {
#if defined(__wasm_simd128__)
    static const TernaryKernel kernel{"wasm-simd128", rows_wasm};
    return &kernel;
#else
    return nullptr;
#endif
}
} // namespace pk
