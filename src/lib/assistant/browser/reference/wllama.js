// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from the handoff's ornith-engine.mjs; files come from verified local storage.
import {wllamaLoadOptions} from './settings.js';
export class LocalBlob extends Blob {
  constructor(file, reader, start = 0, end = file.bytes) { super([]); this.file = file; this.reader = reader; this.first = start; this.end = end; }
  get size() { return this.end - this.first; }
  get type() { return 'application/octet-stream'; }
  slice(start = 0, end = this.size) {
    const clamp = value => Math.max(0, Math.min(this.size, value < 0 ? this.size + value : value));
    return new LocalBlob(this.file, this.reader, this.first + clamp(start), this.first + Math.max(clamp(start), clamp(end)));
  }
  arrayBuffer() { return this.reader(this.file, this.first, this.end); }
}
export class BrowserGGUF {
  constructor(manifest, onProgress, options) {
    this.manifest = manifest; this.logs = []; this.abort = new AbortController(); this.options = options;
    const logger = Object.fromEntries(['debug','log','warn','error'].map(level => [level, (...args) => {
      const line = args.map(v => typeof v === 'string' ? v : String(v)).join(' ').slice(0,1500);
      this.logs.push(line); if (this.logs.length > 200) this.logs.shift();
      if (/offload|buffer size|WebGPU|loading model/.test(line)) onProgress({message: line});
    }]));
    this.raw = new options.Wllama({default: options.wasmUrl}, {logger, parallelDownloads: 1});
  }
  async load() {
    const signal = this.options.signal;
    const stop = () => { this.abort.abort(); void this.raw.exit().catch(() => {}); };
    signal?.throwIfAborted(); signal?.addEventListener('abort', stop, {once:true});
    const timeout = setTimeout(stop, this.manifest.settings.load_timeout_ms);
    try {
      const files = this.options.files.filter(file => file.kind === 'weights');
      await this.raw.loadModel(files.map(file => new LocalBlob(file, this.options.readArtifact)), wllamaLoadOptions(this.manifest.settings));
      signal?.throwIfAborted(); this.abort.signal.throwIfAborted();
      const info = this.raw.getLoadedContextInfo();
      if (!(info.n_layer > 0 && info.n_vocab > 0 && info.n_ctx > 0 && (!this.manifest.projector || info.has_image_input)))
        throw Error(this.logs.filter(line => /error|failed|allocate/i.test(line)).slice(-8).join('\n') || 'The runtime did not create a usable model context.');
      return {context: Object.fromEntries(['n_layer','n_ctx','n_vocab','has_image_input'].map(key => [key,info[key]]))};
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort',stop); }
  }
  async dispose() { this.abort.abort(); await this.raw.exit(); }
}
