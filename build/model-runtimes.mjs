// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';
import {collectInlineWorkerLicenses} from './license-notices.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = 'src/lib/assistant/browser/reference/expanded/';
const pinFile = new URL('../src/lib/assistant/browser/runtime-artifacts.json', import.meta.url);
let generated;
export function installedLiteRT(source) {
  if (digest(source) !== 'f5471b9c94e38fcc0a984111e0b0216e5fb38df6460e588b0d13a8d39fc56f71') throw Error('LiteRT 0.18.0 loader changed. Review the installed-asset patch.');
  const before = 'return createWasmLib(LiteRtLm, jsFilePath);';
  if (source.toString().split(before).length !== 2) throw Error('LiteRT loader patch context changed.');
  return source.toString().replace(before, 'return createWasmLib(LiteRtLm, globalThis.__codeRuntimeURL(fileName), undefined, undefined, {locateFile: globalThis.__codeRuntimeURL});');
}
export function createModelRuntimes() {return generated ??= generate().catch(error => {generated = undefined; throw error;});}
async function generate() {
  for (const [name, version] of [['@litert-lm/core','0.18.0'],['@huggingface/transformers','4.3.1'],['@huggingface/tokenizers','0.2.0'],['@huggingface/jinja','0.5.3']]) {
    if (JSON.parse(await readFile(resolve(root,'node_modules',name,'package.json'))).version !== version) throw Error('Unreviewed browser runtime: '+name);
  }
  const assets = new Map(), catalog = {};
  const commonNotices = await Promise.all(['LICENSE','LICENSE-ADDITIONAL-TERMS'].map(async name => ({name, version:'application', text: await readFile(resolve(root,name),'utf8')})));
  function publish(group, id, bytes, type, kind = 'runtime') {
    const sha256 = digest(bytes), filename = `browser-models/runtimes/${group}/${id}-${sha256.slice(0,12)}.${type}`, partSize = 16 * 1024 * 1024;
    const file = {id, bytes: bytes.length, sha256, kind, url: filename};
    if (bytes.length <= partSize) assets.set(filename,bytes);
    else {
      file.parts = [];
      for (let offset = 0; offset < bytes.length; offset += partSize) {
        const part = bytes.subarray(offset,offset+partSize), url = `${filename}.part-${String(file.parts.length+1).padStart(3,'0')}`;
        assets.set(url,part); file.parts.push({url,bytes:part.length});
      }
      file.url = file.parts[0].url;
    }
    (catalog[group] ??= []).push(file);
  }
  for (const [group, entry, format] of [['litert','litert-worker.js','iife'],['vision','vision-worker.js','iife'],['strands-cpu','strands-worker.js','iife'],['strands-gpu','strands-native-device-worker.js','iife'],['decision','decisions.js','es']]) {
    const notices = commonNotices.slice();
    const bundle = await rolldown({input:resolve(root,source,entry), platform:'browser', ...(format === 'iife' ? {transform:{define:{'import.meta.url':'self.location.href'}}} : {}),
      plugins:[{name:'installed-model-runtime',
        resolveId(name, importer) {
          if (name === 'onnxruntime-web') return resolve(root, importer?.includes('/@huggingface/transformers/') ? 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs' : 'node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs');
        },
        async load(id) {if (id === resolve(root,'node_modules/@litert-lm/core/dist/load.js')) return installedLiteRT(await readFile(id));},
      },collectInlineWorkerLicenses(notices)]});
    try {
      const {output} = await bundle.generate({format,minify:true,codeSplitting:false});
      const chunks = output.filter(item => item.type === 'chunk');
      if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.some(id => id !== chunks[0].fileName)) throw Error('Optional '+group+' runtime contains external module imports: '+JSON.stringify(chunks.map(chunk => ({imports:chunk.imports,dynamic:chunk.dynamicImports}))));
      publish(group,group === 'decision' ? 'decision-helpers' : 'worker',Buffer.from(chunks[0].code),'js');
    } finally {await bundle.close();}
    // Preserve complete upstream and application notices with every optional engine.
    notices.push({name:'ONNX Runtime third-party notices',version:group === 'vision' ? '1.31.0-dev.20260914-8d85527a0' : '1.30.0',text:await readFile(resolve(root,'build/licenses/'+(group === 'vision' ? 'onnxruntime-1.31.0-dev-ThirdPartyNotices.txt' : 'onnxruntime-1.30.0-ThirdPartyNotices.txt')),'utf8')});
    if (group.startsWith('strands')) notices.push({name:'Strands Decider PR41',version:'0607f4ebc4eb6c5abaefcc5489c373a7411997b1',text:await readFile(resolve(root,'build/licenses/strands-decider-PR41.txt'),'utf8')});
    publish(group,'notices',Buffer.from(JSON.stringify(notices)),'json','notice');
  }
  for (const variant of ['','_asyncify','_compat','_compat_asyncify']) {
    for (const ext of ['js','wasm']) {
      const name = `litertlm_wasm${variant}_internal.${ext}`;
      publish('litert',name,await readFile(resolve(root,'node_modules/@litert-lm/core/wasm',name)),ext);
    }
  }
  for (const group of ['vision','strands-cpu','strands-gpu']) {
    const directory = group === 'vision' ? 'node_modules/@huggingface/transformers/node_modules/onnxruntime-web' : 'node_modules/onnxruntime-web';
    const version = JSON.parse(await readFile(resolve(root,directory,'package.json'))).version;
    if (version !== (group === 'vision' ? '1.31.0-dev.20260914-8d85527a0' : '1.30.0')) throw Error('ONNX engine pin changed.');
    // These reviewed ORT builds expose WebGPU through the Asyncify pair.
    // The legacy JSEP pair lacks webgpuInit in ORT 1.31.
    for (const ext of ['mjs','wasm']) publish(group,'ort-'+ext,await readFile(resolve(root,directory,`dist/ort-wasm-simd-threaded.asyncify.${ext}`)),ext);
  }
  for (const group of ['d3','knowline','elephant','pplx']) {
    const folder = group === 'knowline' ? 'wllama' : 'wllama-'+(group === 'pplx' ? 'pplx-v3' : group), directory = resolve(root,'src/public/browser-models',folder);
    const receipt = JSON.parse(await readFile(resolve(directory,'build-receipt.json')));
    if (group !== 'knowline') for (const [name, sha256] of Object.entries(receipt.inputs_sha256)) {
      const recipe = await readFile(resolve(root,'build/browser-models/native',group === 'pplx' ? 'pplx-v3' : group,name));
      if (digest(recipe) !== sha256) throw Error('Native decision build input differs from its receipt: '+group+'/'+name);
    }
    catalog[group] = [...catalog.decision];
    for (const name of ['index.js','wllama.wasm','LICENCE']) {
      const bytes = await readFile(resolve(directory,name)), sha256 = digest(bytes);
      if (receipt.files[name] !== sha256) throw Error('Native decision runtime differs from its source-build receipt: '+group+'/'+name);
      catalog[group].push({id:name === 'index.js' ? 'wllama-js' : name === 'wllama.wasm' ? 'wllama-wasm' : 'wllama-license', url:`browser-models/${folder}/${name}`,bytes:bytes.length,sha256,kind:name === 'LICENCE' ? 'notice' : 'runtime'});
    }
    if (group === 'elephant' || group === 'pplx') {
      for (const name of group === 'elephant' ? ['elephant-OneJev.LICENSE'] : ['pplx-publisher-LICENSE','pplx-publisher-NOTICE']) {
        const bytes = await readFile(resolve(root,'src/public/browser-models/notices',name));
        catalog[group].push({id:name,url:'browser-models/notices/'+name,bytes:bytes.length,sha256:digest(bytes),kind:'notice'});
      }
    }
  }
  delete catalog.decision;
  return {assets,catalog};
}
export function modelRuntimes() {return {
  name:'code-optional-model-runtimes',
  async buildStart() {
    const {catalog} = await createModelRuntimes(), pins = JSON.parse(await readFile(pinFile));
    if (JSON.stringify(pins) !== JSON.stringify(catalog)) throw Error('Optional model runtime pins are stale. Run npm run models:generate.');
  },
  async configureServer(server) {
    const directory = resolve(root,source);
    server.watcher.add(directory);
    const invalidate = file => {if (file.startsWith(directory+'/')) generated = undefined;};
    server.watcher.on('change',invalidate);
    server.httpServer?.once('close',()=>server.watcher.off('change',invalidate));
    server.middlewares.use(async(request,response,next) => {
      const path = (request.url ?? '').split('?')[0].replace(/^\//,'');
      if (!path.startsWith('browser-models/runtimes/')) return next();
      try {
        const bytes = (await createModelRuntimes()).assets.get(path);
        if (!bytes) return next();
        response.setHeader('Content-Type',/\.m?js$/.test(path) ? 'text/javascript' : 'application/octet-stream'); response.end(bytes);
      } catch (error) {next(error);}
    });
  },
  generateBundle:{order:'post',async handler() {for (const [fileName,source] of (await createModelRuntimes()).assets) this.emitFile({type:'asset',fileName,source});}},
};}
if (process.argv.includes('--generate')) {
  const {catalog} = await createModelRuntimes(); await writeFile(pinFile,JSON.stringify(catalog,null,2)+'\n');
  console.log('Updated optional runtime pins for',Object.keys(catalog).join(', '));
}
