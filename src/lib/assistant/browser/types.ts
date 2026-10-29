// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { StreamFn } from '@earendil-works/pi-agent-core';
export interface Artifact { id: string; url: string; bytes: number; sha256: string; kind: 'weights' | 'runtime' | 'notice' | 'data'; parts?: { url: string; bytes: number }[] }
export type BrowserEngine = 'webml' | 'wllama' | 'litert-lm' | 'transformers' | 'strands-onnx' | 'wllama-knowline' | 'wllama-elephant' | 'wllama-pplx' | 'lfm3-onnx';
export interface BrowserProfile {
  id: string; title: string; engine: BrowserEngine; model: string; revision: string; file: string;
  weight_bytes: number; weight_sha256: string;
  projector: { model: string; revision: string; file: string; bytes: number; sha256: string } | null;
  settings: Record<string, number | boolean | string | null | string[]>;
  runtime_source: Record<string, unknown>; model_layers?: number; gguf_block_count?: number;
  category?: 'llm' | 'vision' | 'decision' | 'speech'; runtime_id?: string; artifacts?: Artifact[];
  parameters?: string; quantization?: string; vision_tool?: string; family?: string; input_mode?: 'vision' | 'audio';
  browser_probe?: Record<string, unknown>;
  limitations: string; evidence: { attempt: string; run_id: string | null; scope: string };
}
export interface BrowserFacts {
  secure: boolean; isolated: boolean; wasm: boolean; simd: boolean; memory64: boolean; threads: boolean; jspi: boolean;
  browser: { name: string; version: string }; gpu: { compute: boolean; f16_compute: boolean; limits?: {max_buffer_bytes:number;max_storage_binding_bytes:number} };
}
export interface Compatibility { ready: boolean; summary: string; rows: { id: string; title: string; state: string; required: boolean; detail: string }[] }
export interface LocalEngine {
  kind: string; invalidated?: boolean; info: unknown; reset(): void | Promise<void>; dispose(): Promise<void>;
}
export interface BrowserOptions { mode: 'auto' | 'gpu' | 'hybrid' | 'cpu'; gpuLayers: number; visionGpu: boolean }
export interface Progress { message: string; received?: number; total?: number; unit?: 'bytes' | 'tensors' }
export interface SettingsModule {
  defaultSettings(profile: BrowserProfile, overrides?: Record<string, unknown>): Record<string, number | boolean | string>;
  configuredProfile(profile: BrowserProfile, settings: Record<string, unknown>): BrowserProfile;
}
export type LocalStream = (engine: LocalEngine, limits: { maxTokens: number; responseTimeoutMs: number; generation: BrowserProfile['settings'] }, rounds: unknown[]) => StreamFn;
