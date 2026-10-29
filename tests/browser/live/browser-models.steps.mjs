// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {BeforeAll, Before, After, AfterAll, Then, setDefaultTimeout} from '@cucumber/cucumber';
import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {get as httpsGet} from 'node:https';
setDefaultTimeout(1800000);
const directory = resolve(process.env.MODEL_LIVE_ARTIFACTS ?? 'tmp/test/model-live');
let context, page, imports, fixtureServer, result = {cases: []};
function record(type, value) {console.log(JSON.stringify({type, ...value}));}
async function save() {await writeFile(resolve(directory,'model-results.json'),JSON.stringify(result,null,2)+'\n');}
BeforeAll({timeout:120000},async()=>{
  if(process.env.BROWSER_MODELS_LIVE!=='1')throw Error('Real model tests require BROWSER_MODELS_LIVE=1.');
  await mkdir(directory,{recursive:true});
  if(process.env.MODEL_LIVE_SPEECH_FIXTURE){
    const bytes=await readFile(process.env.MODEL_LIVE_SPEECH_FIXTURE),sha256=createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256,'aa81c2552465568567e670f3823117e633900d16bd6202346a72f3c8464c74c8','Use the pinned public JFK microphone fixture.');
    result.microphoneFixture={sha256,bytes:bytes.length};
  }
  context=await chromium.launchPersistentContext(resolve(directory,'profile'),{channel:'chromium',headless:false,viewport:{width:1280,height:1000},reducedMotion:'reduce',args:['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan,VulkanFromANGLE','--use-angle=vulkan','--ozone-platform=x11','--disk-cache-size=1','--enable-dawn-features=allow_unsafe_apis,vulkan_enable_f16_on_nvidia',...(process.env.MODEL_LIVE_SPEECH_FIXTURE?['--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${process.env.MODEL_LIVE_SPEECH_FIXTURE}`]:[])]});
  // Long model checks retain one application version while independent source
  // edits can continue in the development server. Mock only its HMR transport.
  const origin=new URL(process.env.MODEL_LIVE_URL??'http://127.0.0.1:5175');
  await context.routeWebSocket(url=>url.host===origin.host,route=>{route.send(JSON.stringify({type:'connected'}));route.onMessage(()=>{});});
  page=context.pages()[0]??await context.newPage();
  if(process.env.MODEL_LIVE_PINNED_CACHE==='1') {
    fixtureServer=createServer((request,response)=>{
      const match=request.url.match(/^\/(LFM3-(?:VL|Audio|Omni)-2B-ONNX|d1-Omni-2B-ONNX)\/(onnx\/[\w./-]+)$/);
      if(!match||match[2].includes('..')){response.writeHead(404).end();return;}
      const port=match[1].startsWith('d1-')?8449:8448;
      const upstream=httpsGet('https://192.168.1.173:'+port+'/models/'+match[1]+'/'+match[2],{rejectUnauthorized:false,headers:request.headers.range?{range:request.headers.range}:{}},source=>{
        record('fixture-stream-start',{model:match[1],path:match[2],status:source.statusCode});
        response.writeHead(source.statusCode,{...source.headers,'access-control-allow-origin':'*','access-control-expose-headers':'content-range, content-length, accept-ranges','cross-origin-resource-policy':'cross-origin'});
        let bytes=0,last=0;source.on('data',chunk=>{bytes+=chunk.length;if(bytes-last>128*1024*1024){last=bytes;record('fixture-stream-progress',{model:match[1],path:match[2],bytes});}});
        source.on('error',error=>response.destroy(error));
        source.pipe(response);
      });
      upstream.setTimeout(30000,()=>upstream.destroy(Error('Pinned fixture stream stalled.')));
      upstream.on('error',error=>{response.destroy(error);});response.on('close',()=>upstream.destroy());
    });
    await new Promise(resolve=>fixtureServer.listen(0,'127.0.0.1',resolve));
    const revisions={'LFM3-VL-2B-ONNX':'51ee393407d30ca84fb9b37bef4d0459f6803b2b','LFM3-Audio-2B-ONNX':'df2b3ed2ea10824030b3ff29ee46705754e72b99','LFM3-Omni-2B-ONNX':'7d6bd3fd59a0622e5ce7fefc141145a8bba1435a','d1-Omni-2B-ONNX':'2552a495cd0fc6d82f7911110f07bca7a05c11c6'};
    await context.route('https://huggingface.co/LiquidAI/**/resolve/**/onnx/**',async route=>{
      const url=new URL(route.request().url()),match=url.pathname.match(/^\/LiquidAI\/(LFM3-(?:VL|Audio|Omni)-2B-ONNX|d1-Omni-2B-ONNX)\/resolve\/([a-f0-9]{40})\/(onnx\/.+)$/);
      if(!match||revisions[match[1]]!==match[2]){await route.continue();return;}
      const port=match[1].startsWith('d1-')?8449:8448;
      const source='https://192.168.1.173:'+port+'/models/'+match[1]+'/'+match[3];
      record('pinned-fixture-delivery',{model:match[1],revision:match[2],path:match[3],source});
      await route.fulfill({status:307,headers:{location:'http://127.0.0.1:'+fixtureServer.address().port+'/'+match[1]+'/'+match[3],'access-control-allow-origin':'*'}});
    });
  }
  const requests=[],speechRequests=[];page.on('request',request=>{if(request.url().includes('/assistant/browser/runtime.ts'))requests.push(request.url());if(request.url().includes('/assistant/speech/controller.ts'))speechRequests.push(request.url());});
  result.pageErrors=[];result.networkErrors=[];result.uploads=[];page.on('pageerror',error=>result.pageErrors.push(error.message));
  page.on('request',request=>{if(request.method()==='POST'){const url=new URL(request.url());result.uploads.push({host:url.hostname,path:url.pathname});}});
  page.on('requestfailed',request=>{const url=new URL(request.url());if(url.hostname.includes('hf.co')||url.hostname.includes('huggingface.co')){const error={host:url.hostname,path:url.pathname,error:request.failure()?.errorText};result.networkErrors.push(error);record('network-error',error);}});
  await page.exposeFunction('modelLiveProgress',event=>record('progress',event));
  await page.goto(process.env.MODEL_LIVE_URL??'http://127.0.0.1:5175',{waitUntil:'networkidle'});
  await expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await page.getByRole('button',{name:'AI chat',exact:true}).click();
  for(let attempt=0;;attempt++){
    const runtime=requests.at(-1)??new URL('/lib/assistant/browser/runtime.ts',page.url()).href;
    imports={runtime,speech:speechRequests.at(-1)??new URL('/lib/assistant/speech/controller.ts',page.url()).href};
    try{
      await page.evaluate(async({runtime})=>{
        const [{BrowserAgentHarness},catalog,selection]=await Promise.all([import('/lib/assistant/harness.ts'),import('/lib/assistant/browser/catalog.ts'),import('/lib/assistant/browser/selection.ts')]);
        globalThis.modelLive={runtime:await import(runtime),BrowserAgentHarness,...catalog,...selection};
      },imports);
      // A first optional dependency import may trigger Vite's optimizer reload.
      // Finish that development-only warmup before beginning model work.
      await page.waitForLoadState('networkidle');await page.waitForTimeout(1500);
      if(!await page.evaluate(()=>Boolean(globalThis.modelLive)))throw Error('Execution context was destroyed during dependency warmup');
      break;
    }catch(error){
      if(attempt>=2 || !/Execution context was destroyed|Failed to fetch dynamically imported module/.test(error.message))throw error;
      if(/Failed to fetch dynamically imported module/.test(error.message)) await page.reload({waitUntil:'networkidle'});
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
      if(!(await page.getByRole('textbox',{name:'Message AI',exact:true}).isVisible()))await page.getByRole('button',{name:'AI chat',exact:true}).click();
    }
  }
  result.browser={version:context.browser()?.version(),url:page.url(),node:process.version};await save();
});
Before(async function({pickle}){
  this.case={name:pickle.name,status:'running',startedAt:new Date().toISOString()};result.cases.push(this.case);record('case-start',{name:this.case.name});
  if(await page.getByRole('button',{name:'AI chat',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('button',{name:'AI chat',exact:true}).click();
  await save();
});
After(async function({result:status}){
  this.case.status=status.status.toLowerCase();this.case.finishedAt=new Date().toISOString();
  if(status.status!=='PASSED')this.case.error=status.message??status.exception?.message;
  if(status.status!=='PASSED'){
    this.case.alerts=await page.getByRole('alert').allTextContents().catch(()=>[]);
    this.case.body=(await page.locator('body').innerText().catch(()=>'' )).slice(-7000);
    this.case.tools=await page.locator('.tool-activity').allTextContents().catch(()=>[]);
    await page.screenshot({path:resolve(directory,'failure-'+result.cases.length+'.png')}).catch(()=>{});
    await page.getByRole('button',{name:'Close AI',exact:true}).click().catch(()=>{});
  }
  await page.evaluate(async()=>{globalThis.modelLiveController?.abort();globalThis.modelLive?.speech?.unload();await globalThis.modelLive?.runtime.unloadBrowserModel();}).catch(()=>{});
  record('case-result',this.case);await save();
});
AfterAll(async()=>{await context?.close();fixtureServer?.closeAllConnections();if(fixtureServer)await new Promise(resolve=>fixtureServer.close(resolve));await save();});
async function choose(id){
  if(await page.evaluate(id=>modelLive.runtime.loadedModel()===id,id))return;
  await page.getByRole('button',{name:'AI model',exact:true}).click();
  await page.getByRole('menu',{name:'AI model',exact:true}).locator(`[data-value="${id}"]`).click();
  const deadline=Date.now()+1500000;let last='';
  while(Date.now()<deadline){
    if(await page.evaluate(id=>modelLive.runtime.loadedModel()===id,id))return;
    const text=(await page.locator('.model-loading, [aria-label="AI status"]').allTextContents()).join(' ');
    if(text!==last){record('model-status',{id,text});last=text;}
    const errors=await page.getByRole('alert').allTextContents();if(errors.length)throw Error(errors.join('\n'));
    await page.waitForTimeout(1000);
  }
  throw Error('Model preparation exceeded 25 minutes.');
}
async function send(prompt,expected){
  const replies=page.locator('.conversation-panel .message:not(.question)');const previous=await replies.count();
  const input=page.getByRole('textbox',{name:'Message AI',exact:true});await input.fill(prompt);await input.press('Enter');
  const deadline=Date.now()+1200000;
  while(Date.now()<deadline){
    const errors=await page.getByRole('alert').allTextContents();if(errors.length)throw Error(errors.join('\n'));
    if(await replies.count()>previous && !(await page.locator('.generation-stop').count()) && (await page.locator('[aria-label="AI status"]').allTextContents()).join('')==='Completed'){
      const text=await replies.last().innerText();assert.ok(text.includes(expected),`Expected ${expected}; actual reply: ${text}`);return text;
    }
    await page.waitForTimeout(500);
  }
  throw Error('The composer did not finish its model response.');
}
Then('the live editor browser passes real GPU and WebAssembly checks',async function(){
  const facts=await page.evaluate(async()=>{const{probeBrowser}=await import('/lib/assistant/browser/compatibility.js');return probeBrowser();});
  this.case.facts=facts;assert.ok(facts.secure&&facts.isolated&&facts.jspi&&facts.memory64&&facts.gpu.compute&&facts.gpu.f16_compute,JSON.stringify(facts));
  assert.ok(/nvidia|ampere|10de/i.test(JSON.stringify(facts.gpu.info)),JSON.stringify(facts.gpu));
});
Then('the live editor prepares {string} and completes a text and native tool exchange',async function(id){
  this.case.model=id;await choose(id);this.case.reply=await send('Reply with exactly READY.','READY');
  const secret='PROBE-'+randomUUID().slice(0,8);
  const reply=await page.evaluate(async({id,secret})=>{
    const m=modelLive;globalThis.modelLiveController=new AbortController();let calls=0,text='';
    await m.runtime.runBrowserTurn(async load=>{
      await load(id,()=>{},modelLiveController.signal);
      await new m.BrowserAgentHarness().run(m.runtime.browserPlugin(id,()=>{}),id,[{role:'user',content:'Call read_probe, then return its exact code. The code is only available from that tool.'}],modelLiveController.signal,part=>text+=part,{instructions:'Use the offered tool when requested. Return the tool result faithfully.',contextWindow:4096,tools:[{name:'read_probe',label:'Read probe',description:'Read the fresh test code.',parameters:{type:'object',properties:{},additionalProperties:false},async execute(){calls++;return{content:[{type:'text',text:secret}],details:{}};}}],onTool:()=>{},onUsage:()=>{},maxModelTurns:4,maxToolCalls:4});
    },modelLiveController.signal);return{calls,text};
  },{id,secret});
  this.case.nativeTool=reply;assert.ok(reply.calls>=1&&reply.calls<=4,JSON.stringify(reply));assert.ok(reply.text.includes(secret),JSON.stringify(reply));
});
Then('the live {string} reads a fresh image code and continues after vision cleanup',async function(id){
  this.case.model=id;await page.getByRole('button',{name:'New chat',exact:true}).click();await choose(id);const code='PINE-'+String(Math.floor(Math.random()*9000)+1000);
  const data=await page.evaluate(code=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,512,256);c.fillStyle='black';c.font='bold 64px sans-serif';c.fillText(code,24,150);return canvas.toDataURL('image/png').split(',')[1];},code);
  await page.locator('input[type=file][aria-label="Attach image"]').setInputFiles({name:'code.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await expect(page.getByRole('img',{name:'Ready to send',exact:true})).toBeVisible();
  this.case.reply=await send('Use inspect_image to read the exact code visible in the attached image. Return the code.',code);
  assert.equal(await page.evaluate(()=>modelLive.runtime.loadedModel()),id);
  this.case.followup=await send('Now reply with exactly RESTORED.','RESTORED');
  await page.screenshot({path:resolve(directory,'vision-'+id+'.png')});
});
Then('the live decision profile {string} scores a known routing question',async function(id){
  this.case.model=id;const answer=await page.evaluate(async id=>{
    const m=modelLive;globalThis.modelLiveController=new AbortController();let last='';
    const progress=event=>{const key=event.total?Math.floor((event.received??0)/134217728):event.message;if(key!==last){last=key;void modelLiveProgress({id,...event});}};
    await m.ensureBrowserModelInstalled(id,progress,modelLiveController.signal);
    return m.runtime.scoreBrowserDecision(id,{state:'Translate good morning into Swedish.',questions:{q:{type:'choice',instructions:'Which task is requested?',criteria:{translate:'Translate between languages',summarize:'Shorten a document',code:'Write software'}}}},modelLiveController.signal,progress);
  },id);
  const actual=answer.answer??answer;assert.ok(actual.probabilities);const keys=Object.keys(actual.probabilities);assert.deepEqual(keys.sort(),['code','summarize','translate']);
  assert.ok(Object.values(actual.probabilities).every(p=>Number.isFinite(p)&&p>=0&&p<=1));assert.ok(Math.abs(Object.values(actual.probabilities).reduce((a,b)=>a+b,0)-1)<1e-4);
  assert.equal(keys.reduce((a,b)=>actual.probabilities[a]>actual.probabilities[b]?a:b),'translate');this.case.answer=answer;
});
Then('loading the live auxiliary profile {string} leaves a fresh chat without an LLM',async function(id){
  this.case.model=id;await page.getByRole('button',{name:'New chat',exact:true}).click();
  await expect(page.getByRole('button',{name:'AI model',exact:true})).toContainText('Choose LLM');
  await page.evaluate(async id=>{const m=modelLive;globalThis.modelLiveController=new AbortController();await m.ensureBrowserModelInstalled(id,()=>{},modelLiveController.signal);await m.runtime.loadBrowserModel(id,()=>{},modelLiveController.signal);},id);
  await expect(page.getByRole('button',{name:'AI model',exact:true})).toContainText('Choose LLM');
  await expect(page.getByRole('button',{name:'Attach image',exact:true})).toBeDisabled();
});
Then('the live speech profile {string} dictates a known recording into the composer',async function(mode){
  if(!process.env.MODEL_LIVE_SPEECH_FIXTURE)throw Error('Real speech checks require MODEL_LIVE_SPEECH_FIXTURE: the public-domain JFK WAV.');
  this.case.model='parakeet-'+mode;await context.grantPermissions(['microphone']);
  await page.evaluate(async url=>{Object.assign(modelLive,await import(url));},imports.speech);
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await page.getByRole('button',{name:'Speech model',exact:true}).click();
  await page.getByRole('menu',{name:'Speech model',exact:true}).locator(`[data-value="${mode}"]`).click();
  async function ready(timeout){
    const end=Date.now()+timeout;let previous='';
    while(Date.now()<end){
      const state=await page.evaluate(()=>{const s=modelLive.speech.state;return{phase:s.phase,stage:s.stage,error:s.error,received:s.progress?.received,total:s.progress?.total};});
      const key=JSON.stringify([state.phase,state.stage,Math.floor((state.received??0)/134217728)]);
      if(key!==previous){record('speech-status',{mode,...state});previous=key;}
      if(state.phase==='failed')throw Error(state.error);if(state.phase==='ready')return;
      await page.waitForTimeout(1000);
    }
    throw Error('Speech preparation or recognition exceeded its test deadline.');
  }
  await ready(['lfm3-audio','lfm3-omni','phonon'].includes(mode)?300000:1500000);
  await page.getByRole('button',{name:'Speech input',exact:true}).click();
  const stop=page.getByRole('button',{name:'Stop dictation',exact:true});await expect(stop).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>modelLive.speech.state.seconds),{timeout:25000}).toBeGreaterThanOrEqual(11);
  await stop.click();await ready(125000);
  const text=await page.getByRole('textbox',{name:'Message AI',exact:true}).innerText();this.case.transcript=text;
  const words=t=>t.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim().split(/\s+/);
  const expected=words('And so my fellow Americans ask not what your country can do for you ask what you can do for your country'),actual=words(text);
  let previous=Array.from({length:actual.length+1},(_,i)=>i);
  for(let i=1;i<=expected.length;i++){const row=[i];for(let j=1;j<=actual.length;j++)row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(expected[i-1]!==actual[j-1]));previous=row;}
  this.case.wordErrorRate=previous[actual.length]/expected.length;assert.ok(this.case.wordErrorRate<=.25,JSON.stringify(this.case));
  assert.ok(!await page.evaluate(async()=>(await indexedDB.databases()).some(db=>db.name==='code-speech-diagnostics')));
  assert.deepEqual(result.uploads,[]);await page.screenshot({path:resolve(directory,'speech-'+mode+'.png')});
});

Then('the live LFM3 image profile {string} describes a colored shape',async function(id){
  this.case.model=id;
  const image=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
    const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,256,256);c.fillStyle='red';c.fillRect(32,32,192,192);
    return {type:'image',mimeType:'image/png',data:canvas.toDataURL('image/png').split(',')[1],width:256,height:256};
  });
  const answer=await page.evaluate(async({id,image})=>{
    globalThis.modelLiveController=new AbortController();
    return modelLive.runtime.inspectBrowserImage(id,image,'Name the color and shape shown. Answer in one short sentence.',modelLiveController.signal,event=>void modelLiveProgress({id,...event}));
  },{id,image});
  this.case.answer=answer;assert.match(answer.text??answer.message?.content,/red/i);assert.match(answer.text??answer.message?.content,/square/i);
  assert.equal(await page.evaluate(()=>modelLive.runtime.loadedModel()),undefined);
});
Then('the live d1-Omni profile passes the six reference classification checks',async function(){
  const cases=JSON.parse(await readFile('/workspace/tests/models/d1-cases.json','utf8'));
  this.case.model='lk-browser-lfm3-d1-omni';
  const answers=await page.evaluate(async cases=>{
    const id='lk-browser-lfm3-d1-omni',controller=globalThis.modelLiveController=new AbortController();
    await modelLive.ensureBrowserModelInstalled(id,event=>void modelLiveProgress({id,...event}),controller.signal);
    const answers=[];
    for(const c of cases){
      const actual=c.repeat?cases.find(x=>x.id===c.repeat):c;
      const answer=await modelLive.runtime.scoreBrowserDecision(id,{state:actual.state,questions:{q:actual.question}},controller.signal,event=>void modelLiveProgress({id,...event}));
      answers.push({id:c.id,expected:actual.expected,answer});
    }
    await modelLive.runtime.unloadBrowserModel();return answers;
  },cases);
  this.case.answers=answers;
  for(const {expected,answer} of answers){
    assert.equal(answer.choice,expected);assert.equal(answer.output_tokens,0);
    assert.ok(Math.abs(Object.values(answer.probabilities).reduce((a,b)=>a+b,0)-1)<1e-6);
  }
});
