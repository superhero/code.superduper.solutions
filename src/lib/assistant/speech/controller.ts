// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {lfmSpeechProfile, isBatchSpeech, isAdditionalSpeech} from './catalog';
import { cachedSpeechURLs, installedSpeech, installSpeech, removeSpeech } from './storage';
import {phononCompatibility} from './phonon-compatibility.js';
import {probeBrowser} from '../browser/reference/compatibility.js';
import { SpeechCapture } from './capture';
import { LiveFeatures } from './runtime/live-features.js';
import { clearLegacySpeechDiagnostics } from './diagnostics';
import type { SpeechMode, SpeechState, Transcript } from './types';
export const STARTUP_DEADLINE = 120_000;
const stages: Record<string, string> = {
  requesting_gpu: 'Checking WebGPU', decoder_bootstrap_start: 'Starting CPU decoder runtime',
  decoder_bootstrap_ready: 'CPU decoder runtime ready', encoder_session_start: 'Compiling encoder',
  encoder_session_ready: 'Encoder ready', decoder_session_start: 'Compiling decoder',
  decoder_session_ready: 'Decoder ready', speech_detector_start: 'Starting speech detector',
};
const browserAdapters = { checkPhonon: async () => phononCompatibility(await probeBrowser()), cachedSpeechURLs, installedSpeech, installSpeech, removeSpeech,
  createWorker: (url: string) => new Worker(url, { type: 'module' }),
  createCapture: () => new SpeechCapture() };
export class SpeechController {
  state: SpeechState = { mode: 'gpu-fp32', phase: 'idle', stage: '', error: '', transcript: '', seconds: 0, progress: undefined, installed: [], runtime:undefined };
  owner: string | undefined;
  private listeners = new Set<(state: SpeechState) => void>();
  private request: AbortController | undefined;
  private worker: Worker | undefined;
  private resources: Awaited<ReturnType<typeof cachedSpeechURLs>> | undefined;
  private features: LiveFeatures | undefined;
  private capture: SpeechCapture | undefined;
  private epoch = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private recordingTimer: ReturnType<typeof setTimeout> | undefined;
  private sessionId = '';
  private chunks: Float32Array[] = [];
  private committed = '';
  private commit: ((text: string) => void) | undefined;
  private adapters: typeof browserAdapters;
  private preparation = Promise.resolve();
  // Dependencies are owned browser adapters; injection permits deterministic lifecycle tests.
  constructor(adapters = browserAdapters) {
    this.adapters = adapters;
    void clearLegacySpeechDiagnostics().catch(error => this.set({ error: `Could not remove previous speech recordings: ${message(error)}` }));
  }
  subscribe = (listener: (state: SpeechState) => void): (() => void) => { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); };
  private set(patch: Partial<SpeechState>): void { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(this.state); }
  async refresh(): Promise<void> { try { this.set({ installed: await this.adapters.installedSpeech() }); } catch (error) { this.set({ error: `Speech storage unavailable: ${message(error)}` }); } }
  /** Model choices wait for capture or another preparation before replacing its worker. */
  prepare(mode: SpeechMode, signal: AbortSignal, onStart?: () => void): Promise<void> {
    const next = this.preparation.then(async () => {
      await this.waitUntilIdle(signal); signal.throwIfAborted(); onStart?.();
      const cancel = () => { if (['installing', 'loading'].includes(this.state.phase)) this.unload(); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        if (this.state.mode !== mode) this.setMode(mode);
        if (this.state.phase === 'ready') return;
        if (!this.state.installed.includes(mode)) await this.install();
        signal.throwIfAborted();
        if (this.state.phase === 'failed') throw new Error(this.state.error);
        await this.initialize(); await this.waitUntilIdle(signal); signal.throwIfAborted();
        if (!['ready'].includes(this.state.phase)) throw new Error(this.state.error || 'Speech model preparation stopped.');
      } finally { signal.removeEventListener('abort', cancel); }
    });
    this.preparation = next.catch(() => {});
    return next;
  }
  private waitUntilIdle(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (['idle', 'ready', 'failed'].includes(this.state.phase)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => { unsubscribe(); signal.removeEventListener('abort', abort); };
      const abort = () => { finish(); reject(signal.reason); };
      const unsubscribe = this.subscribe(value => { if (['idle', 'ready', 'failed'].includes(value.phase)) { finish(); resolve(); } });
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  async releaseForLanguage(signal: AbortSignal): Promise<void> {
    if (!isAdditionalSpeech(this.state.mode)) return;
    await this.waitUntilIdle(signal); this.unload();
  }
  setMode(mode: SpeechMode): void {
    if (!['idle', 'ready', 'failed'].includes(this.state.phase)) return;
    this.unload(); this.set({ mode });
  }
  async install(): Promise<void> {
    if (!['idle', 'failed'].includes(this.state.phase)) return;
    if (!this.environmentReady()) return;
    const epoch = ++this.epoch, request = this.request = new AbortController();
    this.set({ phase: 'installing', error: '', stage: 'Downloading speech model' });
    try {
      await this.adapters.installSpeech(this.state.mode, progress => { if (epoch === this.epoch) this.set({ progress }); }, request.signal);
      if (epoch !== this.epoch) return;
      this.set({ phase: 'idle', stage: 'Installed in this browser', progress: undefined }); await this.refresh();
    } catch (error) { if (epoch === this.epoch) this.fail(error); }
  }
  async initialize(): Promise<void> {
    if (!['idle', 'failed'].includes(this.state.phase)) return;
    if (!this.environmentReady()) return;
    this.unload(); const epoch = ++this.epoch, request = this.request = new AbortController();
    this.set({ phase: 'loading', error: '', stage: 'Restoring cached speech model' });
    this.timer = setTimeout(() => { if (epoch === this.epoch) this.fail(new Error(`Speech startup exceeded ${this.state.mode === 'phonon' ? 60 : 120} seconds during “${this.state.stage}”. Retry starts a fresh worker.`)); }, this.state.mode === 'phonon' ? 60000 : STARTUP_DEADLINE);
    try {
      if (this.state.mode === 'phonon') {
        const checks = await (this.adapters.checkPhonon ?? browserAdapters.checkPhonon)();
        if (epoch !== this.epoch) return;
        if (!checks.ready) throw new Error(checks.rows.filter(row=>!row.passed).map(row=>row.title+': '+row.detail).join('\n'));
      }
      const resources = await this.adapters.cachedSpeechURLs(this.state.mode, request.signal);
      if (epoch !== this.epoch) { resources.close(); return; } this.resources = resources;
      const worker = this.worker = this.adapters.createWorker(resources.urls.worker!);
      worker.onmessage = ({ data }) => {
        if (epoch !== this.epoch || data.sessionId && data.sessionId !== this.sessionId) return;
        if (data.type === 'stage') this.set({ stage: stages[data.stage] ?? data.stage });
        else if (data.type === 'ready') { clearTimeout(this.timer); this.set({ phase: 'ready', stage: 'Speech ready', runtime:data.runtime }); }
        else if (data.type === 'partial' || data.type === 'result') this.transcript(data as Transcript & { type: string });
        else if (data.type === 'error') this.fail(new Error(data.message));
      };
      worker.onerror = event => { event.preventDefault(); if (epoch === this.epoch) this.fail(new Error(event.message || `Speech worker failed during ${this.state.stage}.`)); };
      worker.postMessage({ type: 'load', mode: this.state.mode, urls: resources.urls, baseURL:globalThis.location?.href, ...(lfmSpeechProfile(this.state.mode) ? {speech:true, profile:lfmSpeechProfile(this.state.mode)} : {}) });
    } catch (error) { if (epoch === this.epoch) this.fail(error); }
  }
  async record(owner: string, commit: (text: string) => void): Promise<void> {
    if (this.state.phase !== 'ready' || !this.worker || !this.resources) return;
    this.owner = owner; this.commit = commit; this.committed = ''; this.chunks = [];
    const epoch = this.epoch, id = this.sessionId = crypto.randomUUID();
    this.set({ phase: 'permission', transcript: '', seconds: 0, error: '', stage: 'Allow microphone access' });
    const capture = this.capture = this.adapters.createCapture();
    try {
      const stopped = isBatchSpeech(this.state.mode);
      if (!stopped && this.state.mode !== 'phonon') {
        const featureWorker = this.adapters.createWorker(this.resources.urls['features-worker']!);
        this.features = new LiveFeatures(128, null, featureWorker);
        featureWorker.addEventListener('error', event => { if (id === this.sessionId) this.fail(new Error(event.message || 'Speech feature worker failed.')); });
        const port = this.features.connect(); this.worker.postMessage({ type: 'streamStart', sessionId: id, featurePort: port }, [port]);
      }
      if (this.state.mode === 'phonon') this.worker.postMessage({type:'streamStart',sessionId:id});
      await capture.start(this.resources.urls['capture-worklet']!, pcm => {
        if (id !== this.sessionId || epoch !== this.epoch) return;
        try {
          if (this.chunks.reduce((sum, chunk) => sum + chunk.length, 0) + pcm.length > (stopped ? 30 : 60) * 16000) throw new Error('Recording limit reached.');
          this.chunks.push(pcm.slice()); this.features?.push(pcm);
          if (!stopped) this.worker!.postMessage({ type: 'streamChunk', sessionId: id, pcm }, [pcm.buffer]);
          this.set({ seconds: this.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / 16000 });
        } catch (error) { this.fail(error); }
      }, () => { void this.stop(owner); });
      if (epoch !== this.epoch || id !== this.sessionId) { capture.close(); return; }
      this.set({ phase: 'recording', stage: stopped ? 'Recording · transcribes after stop · up to 30 seconds' : 'Listening · stops after 55 seconds' });
      this.recordingTimer = setTimeout(() => { void this.stop(owner); }, stopped ? 29_000 : 55_000);
    } catch (error) { if (epoch === this.epoch && id === this.sessionId) this.fail(error); }
  }
  async stop(owner: string): Promise<void> {
    if (this.owner !== owner) return;
    if (this.state.phase === 'permission') { this.fail(new Error('Microphone request cancelled. Retry when ready.')); return; }
    if (this.state.phase !== 'recording') return;
    clearTimeout(this.recordingTimer); const id = this.sessionId;
    this.set({ phase: 'stopping', stage: 'Finishing speech' });
    // A deadline also bounds a blocked decoder after capture has already stopped.
    this.timer = setTimeout(() => { if (id === this.sessionId) this.fail(new Error('Finishing speech exceeded 120 seconds. Retry to record again.')); }, STARTUP_DEADLINE);
    try {
      await this.capture?.stop(); this.capture = undefined;
      if (id !== this.sessionId || !this.worker) return;
      const pcm = new Float32Array(this.chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0; for (const chunk of this.chunks) { pcm.set(chunk, offset); offset += chunk.length; }
      this.worker.postMessage({ type: 'streamEnd', sessionId: id, pcm, speech:!!lfmSpeechProfile(this.state.mode) }, [pcm.buffer]);
      this.chunks = [];
    } catch (error) { if (id === this.sessionId) this.fail(error); }
  }
  private transcript(data: Transcript & { type: string }): void {
    if (!this.owner) return;
    const stable = data.type === 'result' ? data.text : data.stableText;
    if (stable.startsWith(this.committed) && stable.length > this.committed.length) {
      const next = stable.slice(this.committed.length).trim(); this.committed = stable; if (next) this.commit?.(next);
    }
    if (data.gpu) this.set({runtime:{...this.state.runtime,gpu:data.gpu}});
    this.set({ transcript: data.draftText || '', stage: this.state.phase === 'recording' ? (data.paused ? 'Pause · speech added to draft' : 'Listening · provisional speech below') : this.state.stage });
    if (data.type === 'result') {
      clearTimeout(this.timer); this.releaseCapture();
      this.set({ phase: 'ready', transcript: '', stage: data.text ? 'Speech added to draft' : 'No speech detected' });
    }
  }
  private releaseCapture(): void {
    clearTimeout(this.recordingTimer); this.capture?.close(); this.capture = undefined;
    this.features?.close(); this.features = undefined; this.owner = undefined; this.commit = undefined; this.sessionId = '';
    this.chunks = []; this.committed = '';
  }
  private fail(error: unknown): void {
    const text = message(error); this.dispose();
    this.set({ phase: 'failed', error: text, progress: undefined, transcript: '' });
  }
  private dispose(): void {
    ++this.epoch; this.request?.abort(); this.request = undefined; clearTimeout(this.timer);
    this.releaseCapture(); this.worker?.terminate(); this.worker = undefined;
    this.resources?.close(); this.resources = undefined;
  }
  unload(): void { this.dispose(); this.set({ phase: 'idle', stage: '', error: '', progress: undefined, transcript: '', runtime:undefined }); }
  async remove(): Promise<void> {
    const mode = this.state.mode; this.unload(); this.set({ phase: 'removing', stage: 'Removing speech download' });
    try { await this.adapters.removeSpeech(mode); this.set({ phase: 'idle', stage: 'Speech download removed' }); await this.refresh(); }
    catch (error) { this.fail(error); }
  }
  private environmentReady(): boolean {
    if (globalThis.isSecureContext === false || globalThis.crossOriginIsolated === false) {
      this.fail(new Error('Speech input requires HTTPS or localhost with COOP/COEP isolation headers.')); return false;
    }
    return true;
  }
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export const speech = new SpeechController();
