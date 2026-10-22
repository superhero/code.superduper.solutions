// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { BrowserConnectionPlugin, ContextUsage } from '../harness.ts';
import { estimateContext } from '../configuration.ts';
import { artifactsFor, profileById } from './catalog.ts';
import { installedModels, installedFetch, readArtifact, readModelSettings } from './storage.ts';
import { configuredProfile, defaultSettings } from './reference/settings.js';
import { probeBrowser, compatibilityFor } from './reference/compatibility.js';
import { loadEngine, localStream } from './reference/adapters.js';
import type { BrowserOptions, LocalEngine, Progress } from './types.ts';

export const DEFAULT_EXECUTION: BrowserOptions = { mode: 'auto', gpuLayers: 24, visionGpu: true };
export function executionSettings(value: unknown): BrowserOptions {
  const input = value && typeof value === 'object' ? value as Partial<BrowserOptions> : {};
  if (input.mode !== undefined && !['auto','gpu','hybrid','cpu'].includes(input.mode)) throw new Error('Unknown browser execution mode.');
  if (input.gpuLayers !== undefined && (!Number.isInteger(input.gpuLayers) || input.gpuLayers < 1 || input.gpuLayers > 34)) throw new Error('Use a GPU layer budget from 1 to 34.');
  if (input.visionGpu !== undefined && typeof input.visionGpu !== 'boolean') throw new Error('Choose a valid vision placement.');
  return { ...DEFAULT_EXECUTION, ...input };
}
let loaded: { id: string; key: string; engine: LocalEngine; profile: ReturnType<typeof profileById>; urls: string[]; release: () => void } | undefined;
let loading = false, generating = false, turnActive = false;
const listeners = new Set<() => void>();
const publish = () => { for (const listener of listeners) listener(); };
export const loadedModel = () => loaded?.id;
export const runtimeBusy = () => loading || generating || turnActive;
export async function runBrowserTurn<T>(run: () => Promise<T>): Promise<T> {
  if (runtimeBusy()) throw new Error('Another browser conversation is generating.');
  turnActive = true; publish();
  try { return await run(); } finally { turnActive = false; publish(); }
}
export async function configuredBrowserProfile(id: string) {
  const profile = profileById(id), saved = await readModelSettings(id);
  return configuredProfile(profile, defaultSettings(profile, saved.generation as Record<string, unknown> | undefined));
}
export function subscribeRuntime(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
async function lease(name: string): Promise<() => void> {
  if (!navigator.locks) throw new Error('Browser inference requires Web Locks in a secure page.');
  let release!: () => void;
  const held = new Promise<void>(resolve => release = resolve);
  await new Promise<void>((resolve, reject) => {
    void navigator.locks.request(name, { ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error('A browser model is in use in another tab. Unload it there first.')); return; }
      resolve(); await held;
    }).catch(reject);
  });
  return release;
}
export async function unloadBrowserModel(): Promise<void> {
  if (runtimeBusy()) throw new Error('Stop the current model operation before unloading.');
  const previous = loaded; loaded = undefined;
  if (!previous) return;
  try { await previous.engine.dispose(); }
  finally { for (const url of previous.urls) URL.revokeObjectURL(url); previous.release(); publish(); }
}
export async function loadBrowserModel(id: string, progress: (event: Progress) => void, signal: AbortSignal, context?: number): Promise<void> {
  if (runtimeBusy()) throw new Error('Another browser model operation is running.');
  loading = true; publish();
  const urls: string[] = []; let release: (() => void) | undefined, engine: LocalEngine | undefined;
  try {
    const pinned = profileById(id), saved = await readModelSettings(id);
    const settings = defaultSettings(pinned, saved.generation as Record<string, unknown> | undefined);
    if (context !== undefined) settings.context_tokens = context;
    const profile = configuredProfile(pinned, settings), execution = executionSettings(saved.execution);
    const key = JSON.stringify([id, settings, execution]);
    if (loaded?.key === key && !loaded.engine.invalidated) return;
    signal.throwIfAborted();
    if (!(await installedModels()).includes(id)) throw new Error('Install this model from Browser models first.');
    if (loaded) {
      const previous = loaded; loaded = undefined;
      try { await previous.engine.dispose(); }
      finally { for (const url of previous.urls) URL.revokeObjectURL(url); previous.release(); }
    }
    release = await lease('code-browser-model-runtime');
    const releaseModel = await lease(`code-browser-model-use:${id}`);
    const releaseRuntime = release; release = () => { releaseModel(); releaseRuntime(); };
    progress({ message: 'Checking browser GPU and WebAssembly…' });
    const facts = await probeBrowser(), compatibility = compatibilityFor(facts, profile, execution.mode);
    signal.throwIfAborted();
    if (!compatibility.ready) throw new Error(compatibility.rows.filter(row => row.required && row.state === 'fail').map(row => `${row.title}: ${row.detail}`).join('\n'));
    const files = artifactsFor(profile);
    async function verifiedBytes(fileId: string) {
      const file = files.find(item => item.id === fileId)!;
      const bytes = await readArtifact(file);
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== file.sha256) throw new Error('Installed runtime checksum differs. Remove and reinstall this model.');
      return bytes;
    }
    const moduleBytes = await verifiedBytes(profile.engine === 'webml' ? 'webml-js' : 'wllama-js');
    let runtimeUrl = '';
    // Keep this fresh-Blob expression recognizable by the standalone packaging guard.
    let runtimeModule: { Wllama?: unknown };
    try { runtimeModule = await import(/* @vite-ignore */ (runtimeUrl = URL.createObjectURL(new Blob([moduleBytes], { type: 'text/javascript' })))); }
    finally { if (runtimeUrl) urls.push(runtimeUrl); }
    const wasmUrl = profile.engine === 'wllama' ? URL.createObjectURL(new Blob([await verifiedBytes('wllama-wasm')], { type: 'application/wasm' })) : undefined;
    if (wasmUrl) urls.push(wasmUrl);
    engine = await loadEngine(profile, progress, { ...execution, capabilities: facts,
      ...(profile.engine === 'wllama' ? { Wllama: runtimeModule.Wllama, wasmUrl: wasmUrl! } : { webmlModule: runtimeModule }), localFetch: installedFetch(files), files, readArtifact, signal });
    signal.throwIfAborted();
    loaded = { id, key, engine, profile, urls, release }; engine = undefined; release = undefined;
  } finally {
    if (release) { await engine?.dispose().catch(() => {}); for (const url of urls) URL.revokeObjectURL(url); release(); }
    loading = false; publish();
  }
}
export function browserPlugin(id: string, onUsage: (usage: ContextUsage) => void): BrowserConnectionPlugin {
  const current = loaded;
  if (!current || current.id !== id || current.engine.invalidated) throw new Error('Load this browser model before sending.');
  const profile = current.profile;
  return {
    model: (modelId, contextWindow) => ({ id: modelId, name: profile.title, provider: 'browser', api: 'openai-completions', baseUrl: '',
      input: ['text', 'image'], reasoning: Boolean(profile.settings.thinking), contextWindow, maxTokens: Number(profile.settings.max_new_tokens),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }),
    stream: async (model, context, options) => {
      // Pi replays all tools, skills and images. Bound the request without dropping history.
      const used = estimateContext(context.messages.map(message => ({ ...message, content: Array.isArray(message.content)
        ? message.content.map(part => part.type === 'image' ? { type: 'text', text: ' '.repeat(Number(profile.settings.image_max_tokens ?? 1024) * 3) } : part)
        : message.content })));
      const wrapped: BrowserConnectionPlugin['stream'] = (nextModel, nextContext, nextOptions) => {
        const allowance = model.contextWindow - used - 128;
        const stream = localStream(current.engine, { maxTokens: Math.max(1, Math.min(Number(profile.settings.max_new_tokens), allowance)),
          responseTimeoutMs: Number(profile.settings.turn_timeout_ms), generation: profile.settings }, []);
        return stream(nextModel, nextContext, nextOptions);
      };
      if (generating || loaded !== current || used >= model.contextWindow - 128) throw new Error(generating ? 'Another browser conversation is generating.' : 'Context limit reached. Start a new session or increase the context. No messages were removed.');
      generating = true; publish(); onUsage({ used, measured: false });
      try {
        const stream = await wrapped(model, context, options);
        void stream.result().then(message => { if (message.usage.totalTokens) onUsage({ used: message.usage.totalTokens, measured: true }); }).finally(() => { generating = false; publish(); });
        return stream;
      } catch (error) { generating = false; publish(); throw error; }
    },
  };
}
