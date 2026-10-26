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
import {LocalBlob} from '../wllama.js';
import {abortableGeneration} from '../execution.js';
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2,'0')).join('');
export async function createDecisionEngine(profile, {Wllama, wasmUrl, files, readArtifact, localFetch, signal, onProgress}) {
  setAssetFetch(localFetch);
  const probe = profile.browser_probe, log = [], raw = new Wllama({default: wasmUrl}, {logger: Object.fromEntries(['debug','log','warn','error'].map(level => [level, (...args) => {log.push(args.join(' ')); if (log.length > 100) log.shift();}]))});
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
    const metadata = raw.getModelMetadata().meta;
    if (profile.runtime_id === 'd3') {
      if (typeof raw.inspectSystemOne !== 'function' || metadata['qwen35.decision.type'] !== 'vllm-d3' || metadata['qwen35.attention.causal'] !== 'false') throw Error('D3 requires its noncausal native scoring and exact preflight APIs.');
      if (probe.systemone_template_sha256 && await digest(metadata['tokenizer.chat_template.systemone']) !== probe.systemone_template_sha256) throw Error('Native D3 prompt template differs.');
      for (const [kind, value] of Object.entries(probe.required_temperatures ?? {})) if (Number(metadata['qwen35.decision.temperature.'+kind]) !== value) throw Error('Native D3 calibration differs.');
    } else if (profile.runtime_id === 'knowline') {
      if (metadata['qwen35.attention.causal'] === 'false') throw Error('KnowLine requires causal attention.');
      prepared = await prepareKnowLine(profile, [], null, () => {});
    } else if (profile.runtime_id === 'elephant') prepared = await prepareElephant(profile, [], null, () => {});
    else if (profile.runtime_id === 'pplx') prepared = await preparePplx(profile, [], null, () => {});
    else throw Error('Unknown native decision protocol.');
    return {kind: profile.engine, info: {context: info, native_protocol: probe.kind}, get invalidated() {return invalidated;}, reset() {}, dispose,
      async score(input, operationSignal) {
        const request = validateDecisionRequest(input);
        const deadline = new AbortController();
        const timer = setTimeout(() => deadline.abort(new DOMException('Decision scoring timed out.', 'TimeoutError')), profile.settings.decision_timeout_ms);
        const scoringSignal = AbortSignal.any([operationSignal, deadline.signal]);
        try {return await abortableGeneration(async () => {
          let answer;
          if (profile.runtime_id === 'd3') {
            const inspection = await raw.inspectSystemOne(request), task = inspection.tasks?.[0], d = inspection.diagnostics;
            if (inspection.tasks?.length !== 1 || task.question_id !== 'q' || task.variant !== 0 || d?.decode_calls !== 0 || d.tasks_posted !== 0 || d.no_forward !== true || d.text_only !== true || d.format !== 'native-systemone' || task.input_tokens !== task.tokens?.length) throw Error('D3 input preflight did not prove exact tokenization without inference.');
            assertInputBudget(task, {harnessLimit: 1024, contextSize: info.n_ctx, batchSize: 1024, microbatchSize: 1024});
            const result = await raw.createSystemOne(request);
            if (result.usage?.input_tokens !== task.tokens.length) throw Error('Native D3 prompt differs from preflight.');
            answer = result.answers?.q;
          } else {
            const value = await prepared.prepareRequest(request);
            assertInputBudget(value, {harnessLimit: profile.runtime_id === 'knowline' ? 1023 : 1024, contextSize: info.n_ctx, ...(profile.runtime_id === 'knowline' ? {reservedTokens: 1} : {batchSize: 1024, microbatchSize: 1024})});
            if (profile.runtime_id === 'elephant') answer = (await scoreElephant(raw, {request}, value)).answer;
            else if (profile.runtime_id === 'pplx') answer = (await scorePplx(raw, {request}, value)).answer;
            else {
              const result = await scoreKnowLine(raw, value, {logprobsLimit: 64}), q = request.questions.q;
              answer = q.type === 'noul' ? {type: 'noul', noul: result.probabilities.true} : q.type === 'choice' ? {type: 'choice', probabilities: result.probabilities, choice: Object.keys(result.probabilities).reduce((a,b) => result.probabilities[a] >= result.probabilities[b] ? a:b), confidence: result.confidence} : {type: 'score', probabilities: result.probabilities, score: Object.entries(result.probabilities).reduce((sum,[key,p]) => sum + Number(key)*p,0), confidence: result.confidence};
            }
          }
          if (!answer) throw Error('Native decision omitted its answer.');
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
