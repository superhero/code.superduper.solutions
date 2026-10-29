// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01/inference/evaluations/pi-browser/runtime/src/adapters.js.
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import {getCurrentSystemPrompt, getCurrentTools} from '@earendil-works/pi-ai/utils/transcript';
import {splitLFM3Reasoning} from './lfm3-reasoning.js';
import {executionPlans, loadWithFallback, abortableGeneration} from './execution.js';
import {isWebML, isWllama, webmlLoadOptions, samplingOptions} from './settings.js';

export const textOf = message => typeof message.content === 'string' ? message.content : (message.content ?? []).filter(p => p.type === 'text').map(p => p.text).join('');
export const toolDefinitions = context => getCurrentTools(context.messages).map(t => ({type: 'function', function: {name: t.name, description: t.description, parameters: JSON.parse(JSON.stringify(t.parameters))}}));

async function imageOf(part, kind) {
  const bytes = Uint8Array.from(atob(part.data), c => c.charCodeAt(0));
  if (isWllama(kind)) return {type: 'image', data: bytes.buffer};
  const bitmap = await createImageBitmap(new Blob([bytes], {type: part.mimeType}));
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    return {type: 'image', image: {data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height, channels: 4}};
  } finally { bitmap.close(); }
}

export async function wireMessages(context, kind) {
  const result = [], system = getCurrentSystemPrompt(context.messages);
  if (system) result.push({role: 'system', content: system});
  for (const m of context.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'toolResult') { result.push({role: 'tool', tool_call_id: m.toolCallId, content: textOf(m)}); continue; }
    const message = {role: m.role, content: textOf(m)};
    const reasoning = Array.isArray(m.content) ? m.content.filter(p => p.type === 'thinking').map(p => p.thinking).join('') : '';
    if (reasoning) message.reasoning_content = reasoning;
    if (m.role === 'user' && Array.isArray(m.content) && m.content.some(p => p.type === 'image')) {
      message.content = await Promise.all(m.content.map(p => p.type === 'image' ? imageOf(p, kind) : {type: 'text', text: p.text}));
    }
    if (m.role === 'assistant') {
      const calls = m.content.filter(p => p.type === 'toolCall');
      if (calls.length) message.tool_calls = calls.map(c => ({id: c.id, type: 'function', function: {name: c.name, arguments: isWllama(kind) ? JSON.stringify(c.arguments) : c.arguments}}));
    }
    result.push(message);
  }
  return result;
}

export function mergeToolDeltas(calls, deltas = []) {
  for (const delta of deltas) {
    const index = delta.index ?? 0;
    calls[index] ??= {id: '', type: 'function', function: {name: '', arguments: ''}};
    const c = calls[index];
    if (delta.id) c.id = delta.id;
    c.function.name += delta.function?.name ?? '';
    c.function.arguments += delta.function?.arguments ?? '';
  }
}

export function piCalls(calls = []) {
  return calls.map(c => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(c.function?.name ?? '')) throw Error('Invalid tool name from the model');
    const args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments) : c.function.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('Tool arguments must be a JSON object');
    return {type: 'toolCall', id: c.id || crypto.randomUUID(), name: c.function.name, arguments: args, ...(c.errors?.length ? {nativeErrors: c.errors} : {})};
  });
}

export async function loadEngine(profile, onProgress, options = {}) {
  if (!isWebML(profile.engine) && !isWllama(profile.engine)) throw Error('Unknown engine: ' + profile.engine);
  if (isWebML(profile.engine)) {
    const mode = options.mode ?? profile.settings.execution_mode ?? 'auto';
    if (!['auto', 'gpu'].includes(mode)) throw Error('WebML supports GPU execution only; unsupported execution mode: ' + mode);
    if (options.visionGpu === false) throw Error('WebML requires GPU vision execution; CPU vision offload is unsupported');
    if (options.capabilities && !options.capabilities.gpu?.compute) throw Error('WebML requires working WebGPU compute');
    const {Qwen3_5ForConditionalGeneration} = options.webmlModule;
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(Error('Model loading timed out')), profile.settings.load_timeout_ms);
    let raw;
    try { raw = await Qwen3_5ForConditionalGeneration.from_pretrained(profile.model, {...webmlLoadOptions(profile, onProgress), signal: options.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal, fetch: options.localFetch}); }
    finally { clearTimeout(timer); }
    const session = raw.create_session();
    const memoryStats = () => raw.memoryStats?.() ?? null;
    return {kind: 'webml', info: {...raw.deviceInfo(), engine: 'webml', requested_engine: profile.engine,
      family: profile.family ?? (profile.engine === 'bonsai' ? 'bonsai' : null), runtime_source: JSON.parse(JSON.stringify(profile.runtime_source ?? null)),
      context_tokens: raw.contextLength, memory_stats: memoryStats(), execution: {mode: 'gpu', label: 'GPU · WebML WebGPU', cpu_fallback: false}},
      memoryStats, reset: () => session.reset(),
      async generate(messages, {tools, signal, maxTokens, onText, onThinking = () => {}, generation = profile.settings}) {
        if (profile.settings.prefix_cache === false) await session.reset();
        const sampling = samplingOptions(generation, 'webml');
        const turn = session.generate(messages, {tools, signal, max_new_tokens: maxTokens, ...sampling, enable_thinking: !!profile.settings.thinking});
        for await (const event of turn) {
          if (event.type === 'text') onText(event.text);
          if (event.type === 'reasoning') onThinking(event.text);
        }
        return {...await turn.result, memory_stats: memoryStats(), native_settings: {...sampling, enable_thinking: !!profile.settings.thinking, prefix_cache: !!profile.settings.prefix_cache}};
      }, async dispose() { await session.dispose(); await raw.dispose(); }};
  }
  const {BrowserGGUF} = await import('./wllama.js');
  const plans = executionPlans(profile, options.capabilities, options);
  const {instance: base, info} = await loadWithFallback(plans, (plan, remaining) => new BrowserGGUF({...profile,
    settings: {...profile.settings, ...plan, load_timeout_ms: remaining,
      flash_attention: plan.mode === 'cpu' ? false : profile.settings.flash_attention}}, onProgress, options), onProgress, profile.settings.load_timeout_ms);
  info.execution.cpu_threads = profile.settings.cpu_threads;
  info.execution.flash_attention = info.execution.mode === 'cpu' ? false : profile.settings.flash_attention;
  info.execution.placement_log = base.logs.filter(line => /offload|model buffer|compute buffer/.test(line));
  Object.assign(info, {engine: 'wllama', requested_engine: profile.engine, family: profile.family ?? (profile.engine === 'ornith' ? 'ornith' : null),
    runtime_source: JSON.parse(JSON.stringify(profile.runtime_source ?? null))});
  try {
    return {kind: 'wllama', info, invalidated: false, reset() {}, logs: () => base.logs.slice(),
      async generate(messages, {tools, signal, maxTokens, onText, onThinking = () => {}, generation = profile.settings}) {
        const calls = []; let text = '', reasoning = '', finish = null, usage, timings;
        const start = performance.now(); let first = null;
        await abortableGeneration(() => base.raw.createChatCompletion({messages, tools, tool_choice: tools.length ? 'auto' : 'none', stream: true,
          ...samplingOptions(generation, 'wllama'), max_tokens: maxTokens, cache_prompt: !!profile.settings.prefix_cache,
          chat_template_kwargs: {enable_thinking: !!profile.settings.thinking}, abortSignal: signal,
          onData(chunk) {
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) { first ??= performance.now(); text += delta.content; if (profile.family !== 'lfm3') onText(delta.content); }
            if (delta?.reasoning_content) { reasoning += delta.reasoning_content; if (profile.family !== 'lfm3') onThinking(delta.reasoning_content); }
            mergeToolDeltas(calls, delta?.tool_calls);
            finish = chunk.choices?.[0]?.finish_reason || finish;
            usage = chunk.usage || usage; timings = chunk.timings || timings;
          }}), signal, async () => { this.invalidated = true; await base.dispose(); });
        if (profile.family === 'lfm3') {
          const parsed = splitLFM3Reasoning(text, reasoning); text = parsed.text; reasoning = parsed.reasoning;
          if (reasoning) onThinking(reasoning); if (text) onText(text);
        }
        return {message: {role: 'assistant', content: text, ...(reasoning ? {reasoning_content: reasoning} : {}), ...(calls.length ? {tool_calls: calls.filter(Boolean)} : {})},
          finish_reason: signal?.aborted ? 'cancelled' : finish,
          native_settings: {...samplingOptions(generation, 'wllama'), enable_thinking: !!profile.settings.thinking, cache_prompt: !!profile.settings.prefix_cache},
          usage: usage ?? {}, timings: {...timings, browser_first_text_ms: first === null ? null : first - start}, wall_ms: performance.now() - start};
      }, dispose: () => base.dispose()};
  } catch (error) { await base.dispose().catch(() => {}); throw error; }
}

export function localStream(engine, limits, rounds) {
  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    const output = {role: 'assistant', content: [{type: 'text', text: ''}], api: model.api, provider: model.provider,
      model: model.id, timestamp: Date.now(), stopReason: 'stop',
      usage: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}}};
    void (async () => {
      try {
        const signal = AbortSignal.any([options?.signal ?? new AbortController().signal, AbortSignal.timeout(limits.responseTimeoutMs)]);
        stream.push({type: 'start', partial: output});
        const timing = {engine_started_at_ms: performance.now(), first_output_at_ms: null, first_text_at_ms: null, first_reasoning_at_ms: null,
          last_output_at_ms: null, text_characters: 0, reasoning_characters: 0};
        const round = {browser_timing: timing}; rounds.push(round);
        let native;
        try { native = await engine.generate(await wireMessages(context, engine.kind), {tools: toolDefinitions(context), signal, maxTokens: limits.maxTokens, generation: limits.generation,
          onText(delta) { if (delta) { timing.last_output_at_ms = performance.now(); timing.first_text_at_ms ??= timing.last_output_at_ms; timing.first_output_at_ms ??= timing.first_text_at_ms; timing.text_characters += delta.length; }
            output.content[0].text += delta; stream.push({type: 'text_delta', contentIndex: 0, delta, partial: output}); },
          onThinking(delta) {
            if (delta) { timing.last_output_at_ms = performance.now(); timing.first_reasoning_at_ms ??= timing.last_output_at_ms; timing.first_output_at_ms ??= timing.first_reasoning_at_ms; timing.reasoning_characters += delta.length; }
            let index = output.content.findIndex(p => p.type === 'thinking');
            if (index < 0) { index = output.content.length; output.content.push({type: 'thinking', thinking: ''}); stream.push({type: 'thinking_start', contentIndex: index, partial: output}); }
            output.content[index].thinking += delta; stream.push({type: 'thinking_delta', contentIndex: index, delta, partial: output});
          }});
          Object.assign(round, structuredClone(native));
        } catch (error) { round.error = error.message; throw error; }
        finally { timing.finished_at_ms = performance.now(); }
        if (signal.aborted || native.finish_reason === 'cancelled') throw Error('Generation cancelled or timed out');
        const calls = piCalls(native.message.tool_calls);
        output.content = [...(native.message.reasoning_content ? [{type: 'thinking', thinking: native.message.reasoning_content}] : []), ...(native.message.content ? [{type: 'text', text: native.message.content}] : []), ...calls];
        const u = native.usage, cached = u.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
        output.usage.input = Math.max(0, (u.prompt_tokens ?? 0) - cached);
        output.usage.cacheRead = cached; output.usage.output = u.completion_tokens ?? 0;
        output.usage.totalTokens = output.usage.input + output.usage.cacheRead + output.usage.output;
        output.stopReason = calls.length ? 'toolUse' : native.finish_reason === 'length' ? 'length' : 'stop';
        stream.push({type: 'done', reason: output.stopReason, message: output});
      } catch (error) {
        output.stopReason = options?.signal?.aborted ? 'aborted' : 'error'; output.errorMessage = error.message;
        stream.push({type: 'error', reason: output.stopReason, error: output});
      } finally { stream.end(); }
    })();
    return stream;
  };
}
