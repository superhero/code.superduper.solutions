// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { StreamFn } from '@earendil-works/pi-agent-core';
export interface Artifact { id: string; url: string; bytes: number; sha256: string; kind: 'weights' | 'runtime' | 'notice' }
export interface BrowserProfile {
  id: string; title: string; engine: 'webml' | 'wllama'; model: string; revision: string; file: string;
  weight_bytes: number; weight_sha256: string;
  projector: { model: string; revision: string; file: string; bytes: number; sha256: string };
  settings: Record<string, number | boolean | string | null | string[]>;
  runtime_source: Record<string, string>; model_layers?: number; gguf_block_count?: number;
  limitations: string; evidence: { attempt: string; run_id: string | null; scope: string };
}
export interface BrowserFacts {
  secure: boolean; isolated: boolean; wasm: boolean; simd: boolean; memory64: boolean; threads: boolean; jspi: boolean;
  browser: { name: string; version: string }; gpu: { compute: boolean; f16_compute: boolean };
}
export interface Compatibility { ready: boolean; summary: string; rows: { id: string; title: string; state: string; required: boolean; detail: string }[] }
export interface LocalEngine {
  kind: string; invalidated?: boolean; info: unknown; reset(): void | Promise<void>; dispose(): Promise<void>;
}
export interface BrowserOptions { mode: 'auto' | 'gpu' | 'hybrid' | 'cpu'; gpuLayers: number; visionGpu: boolean }
export interface Progress { message: string; received?: number; total?: number }
export interface SettingsModule {
  defaultSettings(profile: BrowserProfile, overrides?: Record<string, unknown>): Record<string, number | boolean | string>;
  configuredProfile(profile: BrowserProfile, settings: Record<string, unknown>): BrowserProfile;
}
export type LocalStream = (engine: LocalEngine, limits: { maxTokens: number; responseTimeoutMs: number; generation: BrowserProfile['settings'] }, rounds: unknown[]) => StreamFn;
