// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import runtime from 'virtual:code-speech';
import { downloadPackage } from '../../packages/download';
import type { FormatterNotice } from '../../formatting/packages';
import {cachedSpeechNotice} from './storage';
export async function speechNotices(): Promise<FormatterNotice[]> {
  const file = runtime.find(file => file.id === 'notices');
  if (!file) throw new Error('Speech runtime notices are missing from this build.');
  const cached=await cachedSpeechNotice(file);
  const bytes = cached?new Uint8Array(await cached.arrayBuffer()):await downloadPackage(file, location.href, () => {});
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (sha256 !== file.sha256) throw new Error('Speech runtime notices failed verification.');
  const notices: FormatterNotice[] = JSON.parse(new TextDecoder().decode(bytes));
  notices.push({ name: 'NVIDIA Parakeet TDT 0.6B v3 · weights and conversion', version: 'v3', text:
    'Original weights © NVIDIA, CC BY 4.0: https://creativecommons.org/licenses/by/4.0/\n' +
    'Source: https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3/tree/541d1f99c6b0c3cd0b11a95167540bb8edefd82b\n' +
    'ONNX conversion/quantization by ysdede: https://huggingface.co/ysdede/parakeet-tdt-0.6b-v3-onnx/tree/f88260fa0777fe0868dda6df85d1a98f012a4a7a\n' +
    'Selected encoder precision changes the converted artifact. Weights and TEN-VAD engine are optional publisher downloads, outside the application bundle.' });
  return notices;
}
