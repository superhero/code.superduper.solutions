// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { rolldown } from 'rolldown';
import { createSpeechRuntime } from '../../build/speech-runtime.mjs';
import { selectPage, addOllamaConnection } from '../browser/navigation.helpers.mjs';
const configuredPages = new WeakSet();
let bundled;
export function speechBrowserFixture() { return bundled ??= bundle(); }
async function bundle() {
  const runtime = await createSpeechRuntime();
  const build = await rolldown({ input: 'tests/fixtures/speech.ts', platform: 'browser', plugins: [{
    name: 'speech-test-catalog', resolveId(id) { if (id === 'virtual:code-speech') return '\0speech-test-catalog'; },
    load(id) { if (id === '\0speech-test-catalog') return `export default ${JSON.stringify(runtime.catalog)}`; },
  }] });
  try { return (await build.generate({ format: 'iife', name: 'speechTest', codeSplitting: false })).output.find(item => item.type === 'chunk').code; }
  finally { await build.close(); }
}
export async function fakeAI(page) {
  await page.route('http://localhost:11434/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/tags' ? { models: [{ name: 'speech-fixture:1b' }] } : path === '/api/show' ? { model_info: { 'general.architecture': 'llama', 'llama.context_length': 8192 } } : { done: true } });
  });
}
export async function openSpeechSettings(page) {
  await selectPage(page, 'Settings', 'AI');
  return page.getByRole('region', { name: 'Speech input settings', exact: true });
}
// Small cached stand-ins verify controls without loading real model weights.
export async function cacheSpeechModels(page, modes, startupDelay = 0) {
  await page.addScriptTag({content:await speechBrowserFixture()});
  await page.evaluate(async({modes,startupDelay})=>{
    const cache=await caches.open('code-speech-artifacts-v1');
    const worker=`self.onmessage=({data})=>{if(data.type==='load'){console.log('speech-fixture-load '+data.mode);setTimeout(()=>self.postMessage({type:'ready'}),${startupDelay});}}`;
    for(const mode of modes)for(const file of speechTest.speechArtifacts(mode)){
      const source=file.id==='worker'?worker:file.id==='features-worker'?'self.onmessage=()=>{};':'fixture';
      await cache.put(new URL(`/__code_speech__/${file.sha256}`,location.origin),new Response(source,{
        headers:{'x-code-sha256':file.sha256,'Content-Type':['worker','features-worker'].includes(file.id)?'text/javascript':'application/octet-stream'},
      }));
    }
  },{modes,startupDelay});
}
// Live assertions observe recognition messages only in test-page memory.
export async function observeSpeechMessages(page) {
  await page.addInitScript(() => {
    const BrowserWorker = globalThis.Worker;
    globalThis.speechRecognitionEvents = [];
    globalThis.Worker = class extends BrowserWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({data}) => {
          if (['partial','result'].includes(data?.type) && typeof data.sessionId === 'string' && typeof data.text === 'string') globalThis.speechRecognitionEvents.push(structuredClone(data));
        });
      }
    };
  });
}
export async function openComposer(page) {
  if (!configuredPages.has(page)) { await addOllamaConnection(page); configuredPages.add(page); }
  else {
    await selectPage(page, 'Settings', 'AI');
    await page.getByRole('button', { name: 'Use Local Ollama', exact: true }).click();
  }
  const connect = page.getByRole('button', { name: 'Connect', exact: true });
  if (await connect.isVisible()) await connect.click();
  await page.getByRole('textbox', { name: 'Message AI', exact: true }).waitFor();
}
