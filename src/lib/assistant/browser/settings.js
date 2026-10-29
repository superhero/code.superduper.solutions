// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {defaultSettings as nativeDefaults, configuredProfile as nativeProfile} from './reference/settings.js';
const liteKeys = ['context_tokens','max_new_tokens','load_timeout_ms','chat_timeout_ms','turn_timeout_ms','max_model_turns','max_tool_calls'];
export function defaultSettings(profile, overrides = {}) {
  if (profile.category === 'vision' || profile.category === 'decision' || profile.category === 'speech') {
    if (Object.keys(overrides).length) throw Error('This profile uses its verified fixed inference settings.');
    return {};
  }
  if (profile.family === 'lfm3') {
    const values = nativeDefaults(profile, overrides);
    if (values.context_tokens > 4096 || values.thinking || values.sampling_mode !== 'greedy') throw Error('LFM3 supports a tested context up to 4,096 tokens, greedy decoding and thinking off.');
    return values;
  }
  if (profile.engine !== 'litert-lm') return nativeDefaults(profile, overrides);
  const values = {context_tokens: 4096, max_new_tokens: 256, load_timeout_ms: 1200000, chat_timeout_ms: 1200000,
    turn_timeout_ms: 180000, max_model_turns: 6, max_tool_calls: 8, ...overrides};
  if (Object.keys(overrides).some(key => !liteKeys.includes(key))) throw Error('Gemma supports greedy GPU execution with reasoning and prompt caching disabled.');
  for (const [key, value] of Object.entries(values)) if (!Number.isInteger(value) || value < 1) throw Error(key + ' must be a positive integer.');
  if (values.context_tokens < 512 || values.context_tokens > 4096 || values.max_new_tokens >= values.context_tokens) throw Error('Gemma requires a 512–4,096-token context with a smaller output budget.');
  if (values.load_timeout_ms > 3600000 || values.chat_timeout_ms > 3600000 || values.turn_timeout_ms > values.chat_timeout_ms || values.max_model_turns > 32 || values.max_tool_calls > 64) throw Error('Unsupported generation or timeout limit.');
  return values;
}
export function configuredProfile(profile, input) {
  const settings = defaultSettings(profile, input);
  if (profile.category === 'vision' || profile.category === 'decision' || profile.category === 'speech') return profile;
  if (profile.engine !== 'litert-lm') return nativeProfile(profile, settings);
  return {...profile, settings: {...profile.settings, ...settings, prefix_cache: false, thinking: false, enable_thinking: false, sampling_mode: 'greedy', temperature: 0, response_timeout_ms: settings.turn_timeout_ms}};
}
