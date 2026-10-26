// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Given, When, Then, After } from 'quickpickle';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { speechBrowserFixture, fakeAI, openComposer, openSpeechSettings, observeSpeechMessages } from '../browser-harness.mjs';
import { selectPage } from '../../browser/navigation.helpers.mjs';
const output = resolve('tmp/test/speech-live');
const reference = 'And so my fellow Americans ask not what your country can do for you ask what you can do for your country';
function wordErrorRate(reference, actual) {
  const words=text=>text.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim().split(/\s+/), a=words(reference), b=words(actual);
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]!==b[j-1]));previous=next;}
  return previous[b.length]/a.length;
}
async function pinnedFile(path, expected) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk);
  expect((await stat(path)).size).toBe(expected.bytes); expect(hash.digest('hex')).toBe(expected.sha256);
}
async function setup(world, silent) {
  await mkdir(output, { recursive: true });
  const directory = process.env.SPEECH_MODEL_DIRECTORY;
  if (!directory || !process.env.SPEECH_AUDIO_FIXTURE || !process.env.SPEECH_TEN_DIRECTORY) throw new Error('Set SPEECH_MODEL_DIRECTORY, SPEECH_AUDIO_FIXTURE and SPEECH_TEN_DIRECTORY to the pinned local fixtures.');
  const lock = JSON.parse(await readFile('src/lib/assistant/speech/model.lock.json', 'utf8')), paths = new Map();
  for (const name of ['encoder-model.int8.onnx','decoder_joint-model.int8.onnx','vocab.txt']) {
    const file = lock.files.find(file => file.file === name), path = join(directory, name); await pinnedFile(path, file); paths.set(name, path);
  }
  for (const [id, name] of [['ten-js','ten_vad.js'],['ten-wasm','ten_vad.wasm']]) paths.set(id, join(process.env.SPEECH_TEN_DIRECTORY, name));
  const server = world.data.server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let path = paths.get(url.pathname.slice('/__fixtures/'.length));
    if (!url.pathname.startsWith('/__fixtures/')) path = resolve('dist', url.pathname === '/' ? 'index.html' : '.' + url.pathname);
    if (!path || (!url.pathname.startsWith('/__fixtures/') && !path.startsWith(resolve('dist') + '/'))) { response.writeHead(404).end(); return; }
    try {
      const info = await stat(path); if (!info.isFile()) throw new Error('Not a file');
      response.writeHead(200, { 'Content-Length': info.size, 'Content-Type': path.endsWith('.html') ? 'text/html' : /\.m?js$/.test(path) ? 'text/javascript' : path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' });
      createReadStream(path).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  world.data.origin = `http://127.0.0.1:${server.address().port}`;
  world.data.profile = join(output, `profile-${randomUUID()}`);
  const context = world.data.context = await chromium.launchPersistentContext(world.data.profile, { executablePath: process.env.BROWSER_EXECUTABLE_PATH || '/opt/google/chrome/chrome',
    args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${silent===true ? process.env.SPEECH_SILENCE_FIXTURE : silent==='pause' ? process.env.SPEECH_PAUSE_FIXTURE : process.env.SPEECH_AUDIO_FIXTURE}`],
    viewport: { width: 1280, height: 1000 }, permissions: ['microphone'] });
  world.data.browser = context.browser();
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = world.data.page = await context.newPage(); world.data.requests = []; world.data.errors = [];
  await observeSpeechMessages(page);
  page.on('request', request => world.data.requests.push({ url: request.url(), method: request.method(), body: request.method()==='POST'?request.postDataJSON():null }));
  page.on('pageerror', error => { world.data.errors.push(error.message); console.error('Browser error:',error.message.slice(0,300)); });
  page.on('console', message => { if (message.type() === 'error') console.error(message.text().slice(0,300)); });
  await fakeAI(page); await page.goto(world.data.origin); await selectPage(page, 'Editor'); await page.getByRole('button', { name: 'AI chat', exact: true }).click();
  expect(await page.evaluate(() => crossOriginIsolated && isSecureContext)).toBe(true);
  await page.addScriptTag({ content: await speechBrowserFixture() });
  await page.evaluate(async () => {
    const cache = await caches.open('code-speech-artifacts-v1'), signal = new AbortController().signal;
    for (const file of speechTest.speechArtifacts('cpu')) {
      console.log('Verifying speech artifact',file.id);
      try { await speechTest.cacheSpeechArtifact(cache, file, () => {}, signal,
        (url, options) => fetch(file.type === 'model' || file.id.startsWith('ten-') ? `/__fixtures/${file.id}` : url, options)); }
      catch(error){throw new Error(`${file.id}: ${error.message}`);}
    }
  });
}
async function initialize(world) {
  const card = (await openSpeechSettings(world.data.page)).locator('[data-speech-mode="cpu"]');
  await card.getByRole('button', { name: /Load speech model|Retry speech startup/ }).click();
  const monitor = setInterval(async () => console.log('Speech startup:', await card.getByRole('status').textContent().catch(() => 'view closed')), 15000);
  try {
    await Promise.race([card.getByText('Speech ready',{exact:true}).waitFor({timeout:125000}),card.getByRole('alert').waitFor({timeout:125000}).then(async()=>{throw new Error(await card.getByRole('alert').innerText());})]);
  }
  finally { clearInterval(monitor); }
}
async function record(world, seconds = 6) {
  const page = world.data.page; await openComposer(page);
  await page.getByRole('button', { name: 'Speech input', exact: true }).click();
  const stop=page.getByRole('button',{name:'Stop dictation',exact:true});
  await expect(stop).toBeVisible();
  await expect.poll(async () => { const text = await stop.textContent(); return Number(text.match(/(\d+)s/)?.[1] ?? 0); }, { timeout: (seconds + 10) * 1000 }).toBeGreaterThanOrEqual(seconds);
  await stop.click();
  await expect(page.getByRole('button',{name:'Speech input',exact:true})).toBeEnabled({ timeout: 125000 });
}
Given('the pinned CPU speech artifacts and a public speech microphone fixture', world => setup(world, false));
Given('the pinned CPU speech artifacts and a silent microphone fixture', world => setup(world, true));
Given('the pinned CPU speech artifacts and a microphone fixture with two utterances',world=>{if(!process.env.SPEECH_PAUSE_FIXTURE)throw new Error('Set SPEECH_PAUSE_FIXTURE to the two-utterance WAV.');return setup(world,'pause');});
When('the CPU speech model is initialized from verified browser storage', world => initialize(world));
When('I record speech into two separate AI conversations', async world => {
  await record(world, 11); world.data.first = await world.data.page.getByRole('textbox', { name:'Message AI', exact:true }).innerText();
  await world.data.page.getByRole('button',{name:'New chat',exact:true}).click(); await record(world, 2.8);
  world.data.second = await world.data.page.getByRole('textbox', { name:'Message AI', exact:true }).innerText();
});
Then('both conversations receive recognized words without saved recordings', async world => {
  expect(wordErrorRate(reference,world.data.first)).toBeLessThanOrEqual(.25); expect(world.data.second).toMatch(/fellow|Americans/i);
  const events = await world.data.page.evaluate(() => speechRecognitionEvents);
  expect(events.filter(event=>event.type==='result')).toHaveLength(2);
  expect(events.some(event=>event.preprocessing?.cachedFrames>0)).toBe(true);
  expect(await world.data.page.evaluate(async()=>(await indexedDB.databases()).some(db=>db.name==='code-speech-diagnostics'))).toBe(false);
  await world.data.page.screenshot({ path: join(output,'composer.png') });
  const card = await openSpeechSettings(world.data.page);
  await expect(card.getByText('Local recording diagnostics',{exact:true})).toHaveCount(0);
});
When('the editor reloads with model downloads blocked', async world => {
  await world.data.context.route('https://huggingface.co/**', route=>route.abort()); await world.data.context.route('https://raw.githubusercontent.com/**',route=>route.abort());
  world.data.reloadIndex=world.data.requests.length; await world.data.page.reload(); await selectPage(world.data.page,'Editor');
  if(await world.data.page.getByRole('button',{name:'AI chat',exact:true}).getAttribute('aria-expanded')!=='true')await world.data.page.getByRole('button',{name:'AI chat',exact:true}).click();
});
Then('the installed speech model starts again from cache', world => initialize(world));
When('microphone permission is denied and then restored', async world => {
  const {page,context,origin}=world.data; await openComposer(page); await context.grantPermissions([],{origin});
  await page.getByRole('button',{name:'Speech input',exact:true}).click(); await expect(page.getByRole('alert')).toContainText(/denied|not allowed|Permission/i);
  await context.grantPermissions(['microphone'],{origin});
});
Then('a manual retry records speech successfully', async world => { await initialize(world); await record(world,5); await expect(world.data.page.getByRole('textbox',{name:'Message AI',exact:true})).not.toBeEmpty(); });
Then('the browser has uploaded no audio or transcript', world => {
  const writes=world.data.requests.filter(request=>!['GET','HEAD'].includes(request.method));
  for(const request of writes){expect(new URL(request.url).pathname).toBe('/api/show');expect(request.body).toEqual({model:'speech-fixture:1b',verbose:false});}
  expect(world.data.requests.slice(world.data.reloadIndex).filter(request=>/huggingface\.co|raw\.githubusercontent\.com/.test(request.url))).toHaveLength(0);
  expect(world.data.errors).toEqual([]);
});
When('I record silence and press Stop', world => record(world,3));
Then('no speech is inserted and recognition performs no passes', async world => {
  const text=await world.data.page.getByRole('textbox',{name:'Message AI',exact:true}).evaluate(element=>{const copy=element.cloneNode(true);copy.querySelectorAll('.cm-placeholder').forEach(node=>node.remove());return copy.textContent;});
  expect(text.trim()).toBe('');
  const results=await world.data.page.evaluate(()=>speechRecognitionEvents.filter(event=>event.type==='result'));expect(results).toHaveLength(1);
  expect(results[0].text).toBe(''); expect(results[0].speech.inferenceCalls).toBe(0);
});
When('I record the speech pause and second utterance before pressing Stop',world=>record(world,29));
Then('the pause finalized pending words and both utterances remain in the draft',async world=>{
  const events=await world.data.page.evaluate(()=>speechRecognitionEvents),results=events.filter(event=>event.type==='result');expect(results).toHaveLength(1);
  expect(events.some(event=>event.paused&&event.stableText&&!event.draftText)).toBe(true);
  const result=results[0];expect(result.speech.completedIntervals).toBeGreaterThanOrEqual(2);
  expect((result.text.match(/fellow/gi)||[]).length).toBeGreaterThanOrEqual(2);
  expect(wordErrorRate(reference+' '+reference,result.text)).toBeLessThanOrEqual(.25);
});
After(async world => {
  const {page,context,browser,server}=world.data;
  if (page) await page.screenshot({path:join(output,`${world.info.scenario.replace(/[^a-z0-9]+/gi,'-')}.png`)}).catch(()=>{});
  if (context) await context.tracing.stop({path:join(output,`${world.info.scenario.replace(/[^a-z0-9]+/gi,'-')}.zip`)}).catch(()=>{});
  await context?.close(); await browser?.close(); if(server)await new Promise(done=>server.close(done));
});
