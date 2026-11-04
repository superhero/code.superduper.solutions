// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01 brave-vision-gpu/runtime/pins.js; publisher files unchanged.
export const COMPATIBLE_VISION = 'official-q4-fp32-compatible-v1';
export const isCompatibleVision = profile => profile.settings?.precision_variant === COMPATIBLE_VISION;
export function visionPin(profile) {
  if (profile.model !== 'LiquidAI/LFM2.5-VL-1.6B-ONNX' || profile.revision !== 'd0e00ca26cc42892d9f3c4380faa631927218209') throw Error('Unqualified vision checkpoint.');
  const pin = {repo:profile.model,revision:profile.revision,loader:'published-session-names',
    dtype:{embed_tokens:'fp16',vision_encoder:'fp16',decoder_model_merged:'q4'},
    sessionFiles:{embed_tokens:'embed_tokens',vision_encoder:'embed_images',decoder_model_merged:'decoder'},
    chatTemplate:{filename:'chat_template.jinja',bytes:434,sha256:'cf0af741b36248dfe460af825b0b3acb3c651cf7dd40a74c29447f60b75d2b9b'}};
  if (profile.settings?.precision_variant == null) return pin;
  if (!isCompatibleVision(profile)) throw Error('Unqualified vision precision variant.');
  return {...pin,precisionVariant:COMPATIBLE_VISION,dtype:{embed_tokens:'fp32',vision_encoder:'q4',decoder_model_merged:'q4'},
    externalData:{embed_tokens:false,vision_encoder:true,decoder_model_merged:true},
    sessionOptions:{enableGraphCapture:false,logSeverityLevel:3,logVerbosityLevel:0,extra:{session:{disable_cpu_ep_fallback:'0'}}}};
}
export function requireVisionDevice(info) {
  if (info?.execution_provider_device !== 'explicit-owned-gpu-device' || info.device_shader_f16 !== false || !Array.isArray(info.requested_device_features) || info.requested_device_features.length || (info.device_limits?.maxStorageBuffersPerShaderStage ?? 0) < 9) throw Error('The compatible vision runtime did not bind its qualified GPU device.');
}
export function requireVisionDispatch(result) {
  const audit=result?.gpu_execution;
  if (audit?.queue_drain !== 'complete' || !(audit.delta?.queue_drained_dispatches > 0)) throw Error('Vision did not confirm completed GPU computation. Reload the model.');
}
