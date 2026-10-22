// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { requestOpenAI, readOpenAIReply, guardSecretText, validateOpenAIRequest } from './openai.ts';
import { validateConnection, OPENAI_ADDRESS } from './connections.ts';
const key='sk-fixture-only-DO-NOT-SEND-42',id='e5be7096-0f02-419f-a629-91f614640614';
const signal=()=>new AbortController().signal;
const event=delta=>({type:'response.output_text.delta',delta});
const completed={type:'response.completed',response:{status:'completed',output:[{type:'message'}],usage:{output_tokens:3}}};
const wire=events=>events.map(entry=>`event: ${entry.type}\r\ndata: ${JSON.stringify(entry)}\r\n\r\n`).join('');
function response(events,fragment=17){const bytes=new TextEncoder().encode(wire(events));let offset=0;return new Response(new ReadableStream({pull(controller){if(offset>=bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+=fragment));}}));}
Then('OpenAI requests pin credentials to the official origin and exclude persistence and tools',async function(){
  const original=globalThis.fetch;let calls=0;
  try{globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.headers.Authorization,`Bearer ${key}`);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    if(url.endsWith('/models')){assert.equal(url,'https://api.openai.com/v1/models');return Response.json({data:[{id:'gpt-5.4-mini'},{id:'text-embedding-3-small'}]});}
    assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.max_output_tokens,1024);assert.equal(body.tools,undefined);assert.equal(body.input[0].content,'hello');assert.equal(body.instructions,'Configured instructions');return response([event('hé🙂\n'),completed]);};
    const models=await requestOpenAI({action:'models',credentialId:id},key,signal(),()=>{},async()=>{});assert.deepEqual(models.map(model=>model.id),['gpt-5.4-mini']);
    let text='';await requestOpenAI({action:'chat',credentialId:id,model:'gpt-5.4-mini',instructions:'Configured instructions',contextWindow:8192,messages:[{role:'user',content:'hello'}]},key,signal(),delta=>text+=delta,async()=>{});assert.equal(text,'hé🙂\n');assert.equal(calls,2);
    assert.throws(()=>validateOpenAIRequest({action:'models',credentialId:id,address:'https://elsewhere.example'}));
    await assert.rejects(()=>requestOpenAI({action:'models',credentialId:id},key+'\n',signal(),()=>{},async()=>{}));assert.equal(calls,2);
    globalThis.fetch=async()=>new Response('',{status:401});await assert.rejects(()=>requestOpenAI({action:'models',credentialId:id},key,signal(),()=>{},async()=>{}),error=>error.code==='API_AUTH'&&!error.message.includes(key));
  }finally{globalThis.fetch=original;}
});
Then('OpenAI replies decode split SSE frames and report incomplete failed or missing completion',async function(){
  for(const fragment of [1,3,17,4096]){let text='';const result=await readOpenAIReply(response([event('hé🙂\n'),event('line'),completed],fragment),delta=>text+=delta,signal(),async()=>{});assert.equal(text,'hé🙂\nline');assert.equal(result.tokens,3);}
  for(const events of [[event('partial')],[{type:'response.failed',response:{error:{message:key}}}]])await assert.rejects(()=>readOpenAIReply(response(events),()=>{},signal(),async()=>{}));
  const result=await readOpenAIReply(response([{type:'response.incomplete',response:{status:'incomplete'}}]),()=>{},signal(),async()=>{});assert.equal(result.reason,'length');
});
Then('OpenAI credential redaction rejects split raw and encoded echoes',async function(){
  for(const secret of [key,'key/with+symbols'])for(const encoded of [secret,encodeURIComponent(secret),new URLSearchParams({v:secret}).toString().slice(2)]){
    const guard=guardSecretText(secret);let sent='';let failed=false;
    for(const part of ('safe prefix '+encoded+' end')){try{sent+=guard(part);}catch(error){assert.equal(error.code,'REDACTED');failed=true;break;}}
    assert.equal(failed,true);assert.equal(sent.includes(secret),false);assert.equal(sent.includes(encoded),false);
  }
  const guard=guardSecretText(key);assert.equal(guard('a short safe answer')+guard('',true),'a short safe answer');
});
Then('AI profiles reject credential URLs and retain opaque vault references only',async function(){
  const profile=validateConnection({id:crypto.randomUUID(),label:'OpenAI test',provider:'openai',address:OPENAI_ADDRESS,credentialId:id,token:key});assert.equal(profile.token,undefined);assert.equal(profile.credentialId,id);
  for(const address of ['https://elsewhere.example','http://api.openai.com','https://api.openai.com/?key='+key])assert.throws(()=>validateConnection({...profile,address}));
  for(const address of ['http://user:password@localhost:11434','http://localhost:11434/?key='+key])assert.throws(()=>validateConnection({...profile,provider:'ollama',address}));
});
