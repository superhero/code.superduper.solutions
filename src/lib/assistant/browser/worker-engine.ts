// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Artifact, BrowserProfile, LocalEngine, Progress } from './types.ts';
import { readArtifact } from './storage.ts';
import { modelProgress } from './progress.ts';
export interface WorkerEngine extends LocalEngine {
  generate(messages: unknown[], options: { tools?: unknown[]; signal?: AbortSignal; maxTokens: number; onText: (value: string) => void; onThinking?: (value: string) => void; image?: unknown; generation?: BrowserProfile['settings'] }): Promise<Record<string, unknown>>;
  request(type: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}
export async function verifiedRuntimeURLs(files: Artifact[], urls: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const file of files.filter(file => file.kind === 'runtime')) {
    const bytes = await readArtifact(file), actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    if (actual !== file.sha256) throw new Error('Installed runtime checksum differs. Remove and reinstall this model.');
    const url = URL.createObjectURL(new Blob([bytes], {type: file.id.endsWith('.wasm') || file.id === 'ort-wasm' ? 'application/wasm' : 'text/javascript'}));
    urls.push(url); result[file.id] = url;
  }
  return result;
}
/** Termination settles every pending request before the runtime lease is released. */
export async function createWorkerEngine(profile: BrowserProfile, files: Artifact[], runtimeURLs: Record<string, string>, progress: (event: Progress) => void, signal: AbortSignal): Promise<WorkerEngine> {
  signal.throwIfAborted();
  const worker = new Worker(runtimeURLs.worker!, {type: 'classic'});
  let sequence = 0, invalidated = false, busy = false;
  const pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: unknown) => void; cleanup: () => void; onText?: ((text: string) => void) | undefined; onThinking?: ((text: string) => void) | undefined}>();
  function shutdown(error: Error) {
    invalidated = true; worker.terminate();
    for (const task of pending.values()) {task.cleanup(); task.reject(error);} pending.clear();
  }
  worker.onerror = event => {event.preventDefault(); shutdown(new Error(event.message || 'Local model worker failed.'));};
  worker.onmessageerror = () => shutdown(new Error('Local model worker returned unreadable data.'));
  worker.onmessage = ({data}) => {
    if (data.type === 'progress') {progress(modelProgress(data.progress)); return;}
    const task = pending.get(data.id); if (!task) return;
    if (data.type === 'text') {task.onText?.(data.text); return;}
    if (data.type === 'thinking') {task.onThinking?.(data.text); return;}
    if (!['result','error'].includes(data.type)) return;
    pending.delete(data.id); task.cleanup();
    data.type === 'error' ? task.reject(new Error(data.error?.message ?? data.message ?? 'Local model operation failed.')) : task.resolve(data.result);
  };
  function request(type: string, payload: Record<string, unknown>, abortSignal?: AbortSignal, onText?: (text: string) => void, onThinking?: (text: string) => void): Promise<unknown> {
    if (invalidated) return Promise.reject(new Error('The local model is unloaded. Reload to continue.'));
    abortSignal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const stop = () => shutdown(new Error('Local model operation cancelled or timed out; model unloaded.'));
      const timeoutKey = type === 'load' ? 'load_timeout_ms' : type === 'dispose' ? 'dispose_timeout_ms' : type === 'decide' ? 'decision_timeout_ms' : 'turn_timeout_ms';
      const timer = setTimeout(stop, Number(profile.settings[timeoutKey] ?? (type === 'dispose' ? 10000 : 180000)));
      const cleanup = () => {clearTimeout(timer); abortSignal?.removeEventListener('abort', stop);};
      pending.set(id, {resolve, reject, cleanup, onText, onThinking});
      abortSignal?.addEventListener('abort', stop, {once: true});
      try {worker.postMessage({id, type, ...payload});} catch (error) {shutdown(error instanceof Error ? error : new Error(String(error)));}
    });
  }
  let info: unknown;
  try {
    const assets = {files, runtimeURLs};
    info = await request('load', profile.category === 'vision' ? {assets, pin: {
      repo: profile.model, revision: profile.revision, loader: 'published-session-names', dtype: {embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: 'q4'},
      sessionFiles: {embed_tokens: 'embed_tokens', vision_encoder: 'embed_images', decoder_model_merged: 'decoder'},
      chatTemplate: {filename: 'chat_template.jinja', bytes: 434, sha256: 'cf0af741b36248dfe460af825b0b3acb3c651cf7dd40a74c29447f60b75d2b9b'},
    }, contextTokens: 1024, outputTokens: 256, preprocessing: 'letterbox-white-square-v1', textOnly: false}
      : {assets, profile: JSON.parse(JSON.stringify(profile)), contextTokens: profile.settings.context_tokens, outputTokens: profile.settings.max_new_tokens}, signal);
  } catch (error) {shutdown(new Error('Model loading failed.')); throw error;}
  return {kind: profile.engine, info, get invalidated() {return invalidated;}, reset() {}, request,
    async generate(messages, {maxTokens, tools = [], signal: operationSignal, onText, onThinking, image}) {
      if (busy) throw new Error('One local generation at a time.');
      busy = true;
      try {
        const raw = await request('generate', profile.category === 'vision' ? {messages, image, maxTokens} : {messages, options: {maxTokens, tools, enableThinking: false, temperature: 0}}, operationSignal, onText, onThinking) as Record<string, unknown>;
        if (Array.isArray(raw.parse_errors) && raw.parse_errors.length) throw new Error('The native tool parser rejected this response.');
        return { ...raw, message: {role: 'assistant', content: raw.text ?? '', tool_calls: raw.tool_calls ?? [], reasoning_content: raw.reasoning ?? ''} };
      } finally {busy = false;}
    },
    async dispose() {
      if (invalidated) return;
      try {if (!busy) await request('dispose', {});}
      finally {shutdown(new Error('Model unloaded.'));}
    },
  };
}
