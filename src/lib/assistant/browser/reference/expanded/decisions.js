import {validateDecisionRequest, validateDecisionAnswer} from '../../decision-contract.js';
export {validateDecisionRequest, validateDecisionAnswer} from '../../decision-contract.js';
// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {prepareKnowLine, scoreKnowLine} from './knowline-browser.mjs';
import {prepareElephant, scoreElephant} from './elephant-browser.mjs';
import {preparePplx, scorePplx} from './pplx-browser.mjs';
import {assertInputBudget} from './context-guard.mjs';
import {setAssetFetch} from './load-progress.mjs';
import {nativeGpuPlacement} from './decision-placement.js';
import {LocalBlob} from '../wllama.js';
import {abortableGeneration} from '../execution.js';
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2,'0')).join('');
export async function createDecisionEngine(profile, {Wllama, wasmUrl, files, readArtifact, localFetch, signal, onProgress}) {
  setAssetFetch(localFetch);
  const family = profile.family, probe = profile.browser_probe;
  if (probe.device !== 'webgpu' || probe.load_options.n_gpu_layers !== 99 || probe.load_options.cache_type_k !== 'f32' || probe.load_options.cache_type_v !== 'f32' || probe.load_options.flash_attn !== false) throw Error('Native decision models require the pinned FP32 GPU settings; CPU execution is not offered.');
  const log = [], gpu = nativeGpuPlacement(probe.expected_weight_kernel);
  const raw = new Wllama({default: wasmUrl}, {logger: Object.fromEntries(['debug','log','warn','error'].map(level => [level, (...args) => {
    const line = args.join(' '); gpu.observe(line); log.push(line.slice(0,2000)); if (log.length>100) log.shift();
  }]))});
  let invalidated = false, disposed = false, prepared;
  const dispose = async () => {if (disposed) return; disposed = true; invalidated = true; await raw.exit();};
  const abort = () => {void dispose().catch(() => {});};
  signal.throwIfAborted(); signal.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, profile.settings.load_timeout_ms);
  try {
    onProgress({message: 'Loading native decision model…'});
    await raw.loadModel(files.filter(file => file.kind === 'weights' && file.id.endsWith('.gguf')).map(file => new LocalBlob(file, readArtifact)), probe.load_options);
    signal.throwIfAborted(); if (disposed) throw Error('Decision model loading timed out.');
    const info = raw.getLoadedContextInfo();
    if (!(info.n_layer > 0 && info.n_ctx >= 1024 && info.n_vocab > 0)) throw Error(log.slice(-8).join('\n') || 'Native context was not created.');
    for (const [key, value] of Object.entries(probe.expected_context ?? {})) if (info[key] !== value) throw Error('Pinned model dimension differs: ' + key);
    const placement = gpu.verify(info.n_layer);
    const metadata = raw.getModelMetadata().meta;
    if (family === 'd3') {
      if (typeof raw.inspectSystemOne !== 'function' || metadata['qwen35.decision.type'] !== 'vllm-d3' || metadata['qwen35.attention.causal'] !== 'false') throw Error('D3 requires its noncausal native scoring and exact preflight APIs.');
      if (probe.systemone_template_sha256 && await digest(metadata['tokenizer.chat_template.systemone']) !== probe.systemone_template_sha256) throw Error('Native D3 prompt template differs.');
      for (const [kind, value] of Object.entries(probe.required_temperatures ?? {})) if (Number(metadata['qwen35.decision.temperature.'+kind]) !== value) throw Error('Native D3 calibration differs.');
    } else if (family === 'knowline') {
      if (metadata['qwen35.attention.causal'] === 'false') throw Error('KnowLine requires causal attention.');
      prepared = await prepareKnowLine(profile, [], null, () => {});
    } else if (family === 'elephant') prepared = await prepareElephant(profile, [], null, () => {});
    else if (family === 'pplx') prepared = await preparePplx(profile, [], null, () => {});
    else throw Error('Unknown native decision protocol.');
    return {kind: profile.engine, info: {context: Object.fromEntries(['n_layer','n_ctx','n_vocab','n_embd'].map(key=>[key,info[key]])), native_protocol: probe.kind, placement}, get invalidated() {return invalidated;}, reset() {}, dispose,
      async score(input, operationSignal) {
        const request = validateDecisionRequest(input);
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(new DOMException('Decision scoring timed out.', 'TimeoutError')), profile.settings.decision_timeout_ms);
        const scoringSignal = AbortSignal.any([operationSignal, deadline.signal]);
        try {return await abortableGeneration(async () => {
          let answer;
          if (family === 'd3') {
            const inspection = await raw.inspectSystemOne(request), task = inspection.tasks?.[0], d = inspection.diagnostics;
            if (inspection.tasks?.length !== 1 || task.question_id !== 'q' || task.variant !== 0 || d?.decode_calls !== 0 || d.tasks_posted !== 0 || d.no_forward !== true || d.text_only !== true || d.format !== 'native-systemone' || task.input_tokens !== task.tokens?.length) throw Error('D3 input preflight did not prove exact tokenization without inference.');
            assertInputBudget(task, {harnessLimit: 1024, contextSize: info.n_ctx, batchSize: 1024, microbatchSize: 1024});
            const result = await raw.createSystemOne(request);
            if (result.usage?.input_tokens !== task.tokens.length) throw Error('Native D3 prompt differs from preflight.');
            answer = result.answers?.q;
          } else {
            const value = await prepared.prepareRequest(request);
            assertInputBudget(value, {harnessLimit: family === 'knowline' ? 1023 : 1024, contextSize: info.n_ctx, ...(family === 'knowline' ? {reservedTokens: 1} : {batchSize: 1024, microbatchSize: 1024})});
            if (family === 'elephant') answer = (await scoreElephant(raw, {request}, value)).answer;
            else if (family === 'pplx') answer = (await scorePplx(raw, {request}, value)).answer;
            else {
              const result = await scoreKnowLine(raw, value, {logprobsLimit: 64}), q = request.questions.q;
              answer = q.type === 'noul' ? {type: 'noul', noul: result.probabilities.true} : q.type === 'choice' ? {type: 'choice', probabilities: result.probabilities, choice: Object.keys(result.probabilities).reduce((a,b) => result.probabilities[a] >= result.probabilities[b] ? a:b), confidence: result.confidence} : {type: 'score', probabilities: result.probabilities, score: Object.entries(result.probabilities).reduce((sum,[key,p]) => sum + Number(key)*p,0), confidence: result.confidence};
            }
          }
          if (!answer) throw Error('Native decision omitted its answer.');
          Object.assign(placement,gpu.verify(info.n_layer,true));
          return validateDecisionAnswer(answer, request);
        }, scoringSignal, dispose);} finally {clearTimeout(timer);}
      }};
  } catch (error) {
    await dispose().catch(() => {});
    if (signal.aborted || !log.length) throw error;
    // Native Wasm aborts otherwise hide the allocator/driver explanation that
    // lets the user recover from a failed load. Retain the bounded native tail.
    const diagnostic = Object.assign(new Error(`${error.message || error}\n${log.slice(-12).join('\n')}`, {cause: error}), {name: error.name || 'Error'});
    if (/VK_ERROR_OUT_OF_DEVICE_MEMORY|GPUOutOfMemoryError/.test(diagnostic.message)) {
      throw Object.assign(new Error('Not enough GPU memory to load this model. Free GPU memory or choose a smaller model.', {cause: diagnostic}), {name: diagnostic.name});
    }
    throw diagnostic;
  }
  finally {clearTimeout(timer); signal.removeEventListener('abort', abort);}
}
