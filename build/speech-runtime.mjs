// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';
import { publishPackageArtifact } from './package-artifacts.mjs';
import { collectInlineWorkerLicenses } from './license-notices.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let generated;
/** BS's serial initialization patch, asserted against the exact npm source. */
export function serialParakeet(source) {
  if (digest(source) !== '74e175f9e4d6adbcd77572cb84aba79570f1f80cc76e4deb6c34c12286b9b636')
    throw new Error('Parakeet 1.4.4 source changed; review the serial session patch.');
  const before = `if (backend === 'webgpu-hybrid') {\n      // avoid parallel create`;
  let code = source.toString().replaceAll('\r\n', '\n');
  if (code.split(before).length !== 2) throw new Error('Parakeet session patch no longer matches.');
  code = code.replace(before, `if (['webgpu-hybrid', 'webgpu-strict', 'wasm'].includes(backend)) {\n      // avoid parallel create`);
  for (const [name, statement] of [
    ['encoder', 'encoderSession = await createSession(encoderUrl, encoderSessionOptions);'],
    ['decoder', 'joinerSession = await createSession(decoderUrl, decoderSessionOptions);'],
  ]) {
    if (code.split(statement).length !== 2) throw new Error('Parakeet stage patch no longer matches.');
    code = code.replace(statement, `cfg.onSessionStage?.('${name}_session_start');\n      ${statement}\n      cfg.onSessionStage?.('${name}_session_ready');`);
  }
  return code;
}
export function createSpeechRuntime() { return generated ??= generate().catch(error => { generated = undefined; throw error; }); }
async function generate() {
  for (const [name, version] of [['parakeet.js', '1.4.4'], ['onnxruntime-web', '1.30.0']]) {
    if (JSON.parse(await readFile(`node_modules/${name}/package.json`)).version !== version)
      throw new Error(`Speech runtime requires ${name} ${version}.`);
  }
  const assets = new Map(), catalog = [];
  const notices = await Promise.all(['LICENSE', 'LICENSE-ADDITIONAL-TERMS'].map(async name => ({ name, version: 'application', text: await readFile(name, 'utf8') })));
  notices.push({ name: 'ONNX Runtime third-party notices', version: '1.30.0', text: await readFile('build/licenses/onnxruntime-1.30.0-ThirdPartyNotices.txt', 'utf8') });
  function publish(id, bytes, type) {
    const sha256 = digest(bytes), filename = `speech/${id}-${sha256.slice(0, 12)}.${type}`;
    catalog.push({ id, bytes: bytes.length, sha256, type, ...publishPackageArtifact(assets, filename, bytes) });
  }
  for (const id of ['worker', 'features-worker']) {
    const bundle = await rolldown({ input: `src/lib/assistant/speech/runtime/${id}.js`, platform: 'browser',
      plugins: [{ name: 'pinned-speech-runtime',
        resolveId(source) { if (source === 'onnxruntime-web') return resolve('node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs'); },
        async load(id) { if (id === resolve('node_modules/parakeet.js/src/parakeet.js')) return serialParakeet(await readFile(id)); },
      }, collectInlineWorkerLicenses(notices)] });
    try {
      const { output } = await bundle.generate({ format: 'es', minify: true, codeSplitting: false });
      const chunks = output.filter(item => item.type === 'chunk');
      if (chunks.length !== 1 || chunks[0].imports.length) throw new Error('Speech worker has external static imports.');
      publish(id, Buffer.from(chunks[0].code), 'js');
    } finally { await bundle.close(); }
  }
  publish('capture-worklet', await readFile('src/lib/assistant/speech/runtime/capture-worklet.js'), 'js');
  // ORT 1.30 exposes WebGPU initialization in its matching Asyncify pair.
  for (const type of ['mjs', 'wasm']) publish(`ort-${type}`, await readFile(`node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.${type}`), type);
  publish('notices', Buffer.from(JSON.stringify(notices)), 'json');
  return { assets, catalog };
}
export function speechRuntime() { return {
  name: 'code-optional-speech', enforce: 'pre',
  resolveId(id) { if (id === 'virtual:code-speech') return '\0code-speech'; },
  async load(id) { if (id === '\0code-speech') return `export default ${JSON.stringify((await createSpeechRuntime()).catalog)}`; },
  async configureServer(server) {
    const directory = resolve('src/lib/assistant/speech/runtime');
    server.watcher.add(directory);
    const regenerate = file => { if (file.startsWith(directory + '/')) { generated = undefined; void server.restart(); } };
    server.watcher.on('change', regenerate);
    server.httpServer?.once('close', () => server.watcher.off('change', regenerate));
    const { assets } = await createSpeechRuntime();
    server.middlewares.use((request, response, next) => {
      const path = (request.url ?? '').split('?')[0].replace(/^\//, '');
      const bytes = assets.get(path); if (!bytes) return next();
      response.setHeader('Content-Type', /\.(?:m?js)$/.test(path) ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : 'application/octet-stream');
      response.end(bytes);
    });
  },
  generateBundle: { order: 'post', async handler() { for (const [fileName, source] of (await createSpeechRuntime()).assets) this.emitFile({ type: 'asset', fileName, source }); } },
}; }
