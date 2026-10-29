// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { BrowserConnectionPlugin, ContextUsage } from '../harness.ts';
import { estimateContext } from '../configuration.ts';
import { artifactsFor, profileById, VISION_PROFILES } from './catalog.ts';
import { installedModels, installedFetch, readArtifact, readModelSettings } from './storage.ts';
import { configuredProfile, defaultSettings } from './settings.js';
import { probeBrowser, compatibilityFor } from './compatibility.js';
import { loadEngine, localStream } from './reference/adapters.js';
import type { BrowserOptions, BrowserProfile, LocalEngine, Progress } from './types.ts';
import { createWorkerEngine, verifiedRuntimeURLs, type WorkerEngine } from './worker-engine.ts';
import {validateDecisionRequest} from './decision-contract.js';
import type { ChatImage, ChatMessage } from '../ollama.ts';
import { modelProgress } from './progress.ts';
import { BrowserWorkQueue } from './queue.ts';
import { browserLease } from './ownership.ts';

export const DEFAULT_EXECUTION: BrowserOptions = { mode: 'auto', gpuLayers: 24, visionGpu: true };
export function executionSettings(value: unknown, profile?: BrowserProfile): BrowserOptions {
  const input = value && typeof value === 'object' ? value as Partial<BrowserOptions> : {};
  if (input.mode !== undefined && !['auto','gpu','hybrid','cpu'].includes(input.mode)) throw new Error('Unknown browser execution mode.');
  const maximum = (profile?.gguf_block_count ?? profile?.model_layers ?? 33) + 1;
  if (input.gpuLayers !== undefined && (!Number.isInteger(input.gpuLayers) || input.gpuLayers < 1 || input.gpuLayers > maximum)) throw new Error(`Use a GPU layer budget from 1 to ${maximum}.`);
  if (input.visionGpu !== undefined && typeof input.visionGpu !== 'boolean') throw new Error('Choose a valid vision placement.');
  return { ...DEFAULT_EXECUTION, gpuLayers: Number(profile?.settings.gpu_fallback_layers ?? DEFAULT_EXECUTION.gpuLayers), ...input };
}
type FrozenModel = { key: string; profile: BrowserProfile; execution: BrowserOptions };
let loaded: FrozenModel & { id: string; engine: LocalEngine; urls: string[]; release: () => Promise<void> } | undefined;
let loading = false, generating = false, yieldRequested = false, ownsRuntime = false;
const listeners = new Set<() => void>();
const publish = () => { for (const listener of listeners) listener(); };
const work = new BrowserWorkQueue(publish);
let ownership: BroadcastChannel | undefined;
function requestOwnership() {
  if (typeof BroadcastChannel === 'undefined') return;
  ownership ??= new BroadcastChannel('code-browser-runtime');
  ownership.onmessage = event => {
    if (event.data?.type !== 'request' || !ownsRuntime) return;
    yieldRequested = true;
    // An idle model also hands off; active turns release only after their tools finish.
    void schedule(async () => {}).catch(() => {});
  };
  ownership.postMessage({ type: 'request' });
}
function schedule<T>(run: () => Promise<T>, signal?: AbortSignal, onQueued?: () => void): Promise<T> {
  return work.run(async () => {
    try { return await run(); }
    finally { if (yieldRequested) { yieldRequested = false; await unloadModelNow(); } }
  }, signal, onQueued);
}
import.meta.hot?.dispose(() => {
  yieldRequested = true;
  void schedule(async () => {}).finally(() => ownership?.close()).catch(() => {});
});
export const loadedModel = () => loaded?.id;
export const runtimeBusy = () => work.busy || loading || generating;
/** The scoped loader shares this turn's ownership, without a second queue entry. */
export function runBrowserTurn<T>(run: (loadModel: typeof loadModelNow, unloadModel: typeof unloadModelNow) => Promise<T>, signal?: AbortSignal, onQueued?: () => void): Promise<T> {
  return schedule(() => run(loadModelNow, unloadModelNow), signal, onQueued);
}
export async function configuredBrowserProfile(id: string) {
  const profile = profileById(id), saved = await readModelSettings(id);
  return configuredProfile(profile, defaultSettings(profile, saved.generation as Record<string, unknown> | undefined));
}
export function subscribeRuntime(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function unloadBrowserModel(): Promise<void> { return schedule(unloadModelNow); }
async function unloadModelNow(): Promise<void> {
  const previous = loaded; loaded = undefined;
  if (!previous) return;
  try { await previous.engine.dispose(); }
  finally { for (const url of previous.urls) URL.revokeObjectURL(url); await previous.release(); publish(); }
}
export function loadBrowserModel(id: string, progress: (event: Progress) => void, signal: AbortSignal, context?: number): Promise<void> {
  return schedule(() => loadModelNow(id, progress, signal, context), signal, () => progress({ message: 'Queued after the current model operation…' }));
}
async function loadModelNow(id: string, progress: (event: Progress) => void, signal: AbortSignal, context?: number, frozen?: FrozenModel): Promise<void> {
  loading = true; publish();
  const urls: string[] = []; let release: (() => Promise<void>) | undefined, engine: LocalEngine | undefined;
  try {
    const pinned = profileById(id), saved = await readModelSettings(id);
    const settings = defaultSettings(pinned, saved.generation as Record<string, unknown> | undefined);
    if (context !== undefined) settings.context_tokens = context;
    const chosenVision = pinned.vision_tool && VISION_PROFILES.some(p => p.id === saved.visionTool) ? String(saved.visionTool) : pinned.vision_tool;
    const configured = configuredProfile(pinned, settings);
    if (chosenVision) configured.vision_tool = chosenVision;
    const profile = frozen?.profile ?? configured, execution = frozen?.execution ?? executionSettings(saved.execution, pinned);
    const key = frozen?.key ?? JSON.stringify([id, settings, execution, profile.vision_tool]);
    if (loaded?.key === key && !loaded.engine.invalidated) return;
    signal.throwIfAborted();
    if (!(await installedModels()).includes(id)) throw new Error('Install this model in Settings → AI first.');
    const {speech} = await import('../speech/controller');
    await speech.releaseForLanguage(signal);
    await unloadModelNow();
    requestOwnership();
    progress({ message: 'Waiting for browser runtime…' });
    const relinquish = await browserLease('code-browser-model-runtime', signal);
    ownsRuntime = true;
    release = async () => { try { await relinquish(); } finally { ownsRuntime = false; } };
    const releaseModel = await browserLease(`code-browser-model-use:${id}`, signal);
    const releaseRuntime = release; release = async () => { await releaseModel(); await releaseRuntime(); };
    progress({ message: 'Checking browser GPU and WebAssembly…' });
    const facts = await probeBrowser(), compatibility = compatibilityFor(facts, profile, execution.mode);
    signal.throwIfAborted();
    if (!compatibility.ready) throw new Error(compatibility.rows.filter(row => row.required && row.state === 'fail').map(row => `${row.title}: ${row.detail}`).join('\n'));
    const files = artifactsFor(profile).map(file => ({...file, url: new URL(file.url, globalThis.document?.baseURI ?? globalThis.location?.href).href}));
    async function verifiedBytes(fileId: string) {
      const file = files.find(item => item.id === fileId)!;
      const bytes = await readArtifact(file);
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== file.sha256) throw new Error('Installed runtime checksum differs. Remove and reinstall this model.');
      return bytes;
    }
    if (['litert-lm','transformers','strands-onnx','lfm3-onnx'].includes(profile.engine)) {
      const runtimeURLs = await verifiedRuntimeURLs(files, urls);
      engine = await createWorkerEngine(profile, files, runtimeURLs, progress, signal);
    } else {
    const moduleBytes = await verifiedBytes(profile.engine === 'webml' ? 'webml-js' : 'wllama-js');
    let runtimeUrl = '';
    // Keep this fresh-Blob expression recognizable by the standalone packaging guard.
    let runtimeModule: { Wllama?: unknown };
    try { runtimeModule = await import(/* @vite-ignore */ (runtimeUrl = URL.createObjectURL(new Blob([moduleBytes], { type: 'text/javascript' })))); }
    finally { if (runtimeUrl) urls.push(runtimeUrl); }
    const wasmUrl = profile.engine !== 'webml' ? URL.createObjectURL(new Blob([await verifiedBytes('wllama-wasm')], { type: 'application/wasm' })) : undefined;
    if (wasmUrl) urls.push(wasmUrl);
    if (profile.category === 'decision') {
      let helperURL = '';
      try {
        const helperBytes = await verifiedBytes('decision-helpers');
        const helpers = await import(/* @vite-ignore */ (helperURL = URL.createObjectURL(new Blob([helperBytes], {type: 'text/javascript'}))));
        engine = await helpers.createDecisionEngine(profile, {Wllama: runtimeModule.Wllama, wasmUrl, files, readArtifact, localFetch: installedFetch(files), signal, onProgress: progress});
      } finally { if (helperURL) urls.push(helperURL); }
    } else engine = await loadEngine(profile, (value: unknown) => progress(modelProgress(value)), { ...execution, capabilities: facts,
      ...(profile.engine === 'wllama' ? { Wllama: runtimeModule.Wllama, wasmUrl: wasmUrl! } : { webmlModule: runtimeModule }), localFetch: installedFetch(files), files, readArtifact, signal });
    }
    signal.throwIfAborted();
    if (!engine) throw new Error('The browser runtime did not create a model.');
    loaded = { id, key, engine, profile, execution, urls, release }; engine = undefined; release = undefined;
  } finally {
    if (release) { await engine?.dispose().catch(() => {}); for (const url of urls) URL.revokeObjectURL(url); await release(); }
    loading = false; publish();
  }
}
export function browserPlugin(id: string, onUsage: (usage: ContextUsage) => void, imageReference?: (image: ChatImage) => string): BrowserConnectionPlugin {
  const current = loaded;
  if (!current || current.id !== id || current.engine.invalidated) throw new Error('Load this browser model before sending.');
  const profile = current.profile;
  return {
    model: (modelId, contextWindow) => ({ id: modelId, name: profile.title, provider: 'browser', api: 'openai-completions', baseUrl: '',
      input: ['text', 'image'], reasoning: Boolean(profile.settings.thinking), contextWindow, maxTokens: Number(profile.settings.max_new_tokens),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }),
    stream: async (model, context, options) => {
      const active = loaded;
      if (!active || active.id !== id || active.key !== current.key || active.engine.invalidated) throw new Error('Load this browser model before sending.');
      if (imageReference) context = {...context, messages: context.messages.map(message => message.role === 'user' && Array.isArray(message.content) ? {...message, content: message.content.map(part => part.type === 'image' ? {type: 'text' as const, text: imageReference(part)} : part)} : message)};
      // Pi replays all tools, skills and images. Bound the request without dropping history.
      const used = estimateContext(context.messages.map(message => ({ ...message, content: Array.isArray(message.content)
        ? message.content.map(part => part.type === 'image' ? { type: 'text', text: ' '.repeat(Number(profile.settings.image_max_tokens ?? 1024) * 3) } : part)
        : message.content })));
      const wrapped: BrowserConnectionPlugin['stream'] = (nextModel, nextContext, nextOptions) => {
        const allowance = model.contextWindow - used - 128;
        const stream = localStream(active.engine, { maxTokens: Math.max(1, Math.min(Number(profile.settings.max_new_tokens), allowance)),
          responseTimeoutMs: Number(profile.settings.turn_timeout_ms), generation: profile.settings }, []);
        return stream(nextModel, nextContext, nextOptions);
      };
      if (generating || used >= model.contextWindow - 128) throw new Error(generating ? 'Another browser conversation is generating.' : 'Context limit reached. Start a new session or increase the context. No messages were removed.');
      generating = true; publish(); onUsage({ used, measured: false });
      try {
        const stream = await wrapped(model, context, options);
        void stream.result().then(message => { if (message.usage.totalTokens) onUsage({ used: message.usage.totalTokens, measured: true }); }, () => {}).finally(() => { generating = false; publish(); });
        return stream;
      } catch (error) { generating = false; publish(); throw error; }
    },
  };
}

/** Called while the enclosing Pi turn owns the queue; swaps never enqueue themselves. */
export async function browserVisionTool(id: string, conversation: readonly ChatMessage[], progress: (event: Progress) => void) {
  const original = loaded;
  if (!original || original.id !== id || !original.profile.vision_tool) return undefined;
  const [{createVisionTool}, {imageReferences}] = await Promise.all([import('./reference/expanded/vision-tool.js'), import('./image-references.ts')]);
  const references = imageReferences(conversation), vision = profileById(original.profile.vision_tool);
  const frozen: FrozenModel = {key: original.key, profile: original.profile, execution: original.execution};
  const control = createVisionTool({profile: vision, getImage: references.getImage,
    onState: state => {if (state.busy) progress({message: state.status ?? 'Inspecting image…'});},
    suspendText: async () => {await unloadModelNow();},
    resumeText: async ({signal}) => {
      if (signal.aborted) return false;
      await loadModelNow(id, progress, signal, undefined, frozen); return true;
    },
    loadVision: async (_profile, {signal}) => {
      const {ensureBrowserModelInstalled} = await import('./selection.ts');
      await ensureBrowserModelInstalled(vision.id, progress, signal);
      await loadModelNow(vision.id, progress, signal);
      const current = loaded;
      if (!current || current.id !== vision.id) throw new Error('The vision model did not load.');
      const engine = current.engine as WorkerEngine;
      return {generate: engine.generate.bind(engine), async dispose() {if (loaded === current) await unloadModelNow();}};
    },
  });
  return {...control, reference: references.reference};
}

/** Standalone image inspection shares the runtime queue and releases its allocation. */
export function inspectBrowserImage(id: string, image: ChatImage, question: string, signal: AbortSignal, progress: (event: Progress) => void = () => {}): Promise<unknown> {
  return schedule(async () => {
    if (profileById(id).category !== 'vision') throw new Error('Choose an image inspection model.');
    if (!question.trim() || question.length > 2000 || !['image/png','image/jpeg','image/webp'].includes(image.mimeType) || image.data.length > 14 * 1024 * 1024) throw new Error('Provide a supported image and a question of up to 2,000 characters.');
    const {ensureBrowserModelInstalled} = await import('./selection.ts');
    await ensureBrowserModelInstalled(id, progress, signal);
    await loadModelNow(id, progress, signal);
    const current = loaded!;
    try {return await (current.engine as WorkerEngine).generate([{role:'user',content:question}], {image,maxTokens:256,signal,onText:()=>{}});}
    finally {if (loaded === current) await unloadModelNow();}
  }, signal);
}

/** Native scoring is available for future workflow features; it never calls a chat parser. */
export function scoreBrowserDecision(id: string, request: unknown, signal: AbortSignal, progress: (event: Progress) => void = () => {}): Promise<unknown> {
  return schedule(async () => {
    if (profileById(id).category !== 'decision') throw new Error('Choose a decision model.');
    const input = validateDecisionRequest(request);
    await loadModelNow(id, progress, signal);
    const current = loaded!;
    try {
      if (['strands-onnx','lfm3-onnx'].includes(current.profile.engine)) {
        return await (current.engine as WorkerEngine).request('decide', {state: input.state, question: input.questions!.q}, signal);
      }
      return await (current.engine as LocalEngine & {score(request: unknown, signal: AbortSignal): Promise<unknown>}).score(input, signal);
    } finally {
      if (loaded === current && current.engine.invalidated) await unloadModelNow();
    }
  }, signal);
}
