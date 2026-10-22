// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import { modelContextLimit } from './configuration.ts';
import {ollamaAddress, discoverOllama, ollamaContextWindow, readOllamaReply, chatWithOllama} from './ollama.ts';
const signal=()=>new AbortController().signal;
const encoder=new TextEncoder();
const wire=events=>events.map(event=>JSON.stringify(event)).join('\n');
const event=content=>({message:{role:'assistant',content},done:false});
const done={done:true,done_reason:'stop',eval_count:3};
function response(text, fragment=4096, cancelled=()=>{}){
  const bytes=encoder.encode(text);let offset=0;
  return new Response(new ReadableStream({pull(controller){
    if(offset>=bytes.length){controller.close();return;}
    controller.enqueue(bytes.slice(offset,offset+=fragment));
  },cancel:cancelled}));
}
Then('Ollama discovery validates addresses and returns local chat models only',async function(){
  assert.equal(ollamaAddress('http://localhost:11434/'),'http://localhost:11434');
  assert.equal(ollamaAddress('https://runtime.example'),'https://runtime.example');
  for(const address of ['bad','file:///tmp/x','http://name:secret@localhost:11434','http://localhost:11434/api/chat','http://localhost:11434/?token=x','http://192.168.1.2:11434'])assert.throws(()=>ollamaAddress(address));
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'http://localhost:11434/api/tags');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
      return Response.json({models:[{name:'ornith:9b-q8_0',capabilities:['completion']},{name:'remote:cloud'},{name:'remote-alias',remote_host:'https://ollama.com'},{name:'embedding',capabilities:['embedding']}]});
    };
    assert.deepEqual((await discoverOllama('http://localhost:11434',signal())).map(model=>model.id),['ornith:9b-q8_0']);
  }finally{globalThis.fetch=original;}
});
Then('Ollama decodes fragmented native streams without losing text',async function(){
  for(const fragment of [1,3,17,4096]){
    const pieces=[];
    const result=await readOllamaReply(response(wire([event('hé🙂\n'),event('line'),done]),fragment),part=>pieces.push(part),signal());
    assert.equal(pieces.join(''),'hé🙂\nline');assert.deepEqual(result,{reason:'stop',tokens:3});
  }
});
Then('stopping Ollama prevents subsequent text callbacks',async function(){
  const controller=new AbortController();let cancelled=0;const pieces=[];
  await assert.rejects(()=>readOllamaReply(response(wire([event('first'),event('late'),done]),4096,()=>cancelled++),part=>{pieces.push(part);controller.abort();},controller.signal),/abort/i);
  assert.deepEqual(pieces,['first']);assert.equal(cancelled,1);
});
Then('invalid Ollama replies are rejected and their streams are closed',async function(){
  for(const text of ['null','not-json',wire([event('partial')]),wire([{error:'provider rejected'}]),wire([{message:{tool_calls:[{name:'unavailable'}]}}]),'x'.repeat(65537)]){
    await assert.rejects(()=>readOllamaReply(response(text),()=>{},signal()));
  }
  await assert.rejects(()=>readOllamaReply(new Response('',{status:500}),()=>{},signal()),/500/);
});
Then('Ollama requests preserve conversation bounds and use the local native endpoint',async function(){
  const original=globalThis.fetch;let requests=0;
  try{
    globalThis.fetch=async(url,options)=>{
      requests++;assert.equal(url,'http://localhost:11434/api/chat');
      const body=JSON.parse(options.body);assert.equal(body.model,'ornith:9b-q8_0');assert.equal(body.think,false);assert.equal(body.stream,true);
      assert.deepEqual(body.options,{num_ctx:4096,num_predict:1024});assert.equal(body.messages.at(-1).content,'hello');
      return response(wire([event('reply'),done]));
    };
    await assert.rejects(()=>chatWithOllama('http://localhost:11434','paid:cloud',[],signal(),()=>{}),/local/);
    await assert.rejects(()=>chatWithOllama('http://localhost:11434','ornith:9b-q8_0',[{role:'user',content:'x'.repeat(10001)}],signal(),()=>{}),/full/);
    assert.equal(requests,0);
    await chatWithOllama('http://localhost:11434','ornith:9b-q8_0',[{role:'user',content:'hello'}],signal(),()=>{});assert.equal(requests,1);
  }finally{globalThis.fetch=original;}
});

Then('Ollama model context limits use architecture metadata rather than configured defaults', async function() {
  assert.equal(modelContextLimit(undefined,262144),262144);
  assert.equal(modelContextLimit(8192,262144),8192);
  assert.equal(modelContextLimit(65536,16384),16384);
  assert.equal(modelContextLimit(undefined,undefined),4096);
  const original = globalThis.fetch;
  try {
    for (const [info, expected] of [
      [{ 'general.architecture': 'qwen35', 'qwen35.context_length': 262144, 'other.context_length': 999999 }, 262144],
      [{ 'general.architecture': 'llama', 'llama.context_length': 8192 }, 8192],
      [{ 'general.architecture': 'llama', 'llama.context_length': -1 }, undefined],
      [{ 'general.architecture': 'llama', 'llama.context_length': '65536' }, undefined],
      [{ 'llama.context_length': 8192 }, undefined],
    ]) {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, 'http://localhost:11434/api/show'); assert.equal(options.credentials, 'omit');
        assert.deepEqual(JSON.parse(options.body), { model: 'ornith:9b-q8_0', verbose: false });
        return Response.json({ model_info: info, parameters: 'num_ctx 4096' });
      };
      assert.equal(await ollamaContextWindow('http://localhost:11434', 'ornith:9b-q8_0', signal()), expected);
    }
    globalThis.fetch = async () => new Response('', {status: 404});
    await assert.rejects(ollamaContextWindow('http://localhost:11434','missing',signal()), /404/);
  } finally { globalThis.fetch = original; }
});
