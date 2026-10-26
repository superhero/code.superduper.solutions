// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export type SpeechMode = 'cpu' | 'gpu-fp32' | 'gpu-fp16';
export interface SpeechArtifact {
  id: string; url: string; bytes: number; sha256: string; type: string;
  parts?: { url: string; bytes: number; sha256: string }[];
}
export interface SpeechProgress { file: string; received: number; total: number }
export interface Transcript {
  text: string; stableText: string; draftText: string; seconds: number;
  [key: string]: unknown;
}
export type SpeechPhase = 'idle' | 'installing' | 'removing' | 'loading' | 'ready' | 'permission' | 'recording' | 'stopping' | 'failed';
export interface SpeechState {
  mode: SpeechMode; phase: SpeechPhase; stage: string; error: string; transcript: string;
  seconds: number; progress: SpeechProgress | undefined; installed: SpeechMode[];
}
