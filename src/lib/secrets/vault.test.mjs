// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { VaultSession } from './session.ts';
import { VaultError, passwordProfile } from './types.ts';
import { validateSnapshot } from './format.ts';
import { randomBase64 } from './crypto.ts';
import { publicVaultKeys } from './key-index.ts';
import { createVaultLifecycle } from './lifecycle.ts';
const password='synthetic-vault-password', canary='sk-fixture-only-DO-NOT-SEND-42';
const proof=secret=>({methodId:'auto',secret});
function memory(){
  let state={revision:0,lockEpoch:0,snapshot:null};
  const match=expected=>{if(expected.revision!==state.revision||expected.lockEpoch!==state.lockEpoch)throw new VaultError('CONFLICT');};
  return {read:async()=>structuredClone(state),replace:async(expected,snapshot,keys)=>{match(expected);state={revision:state.revision+1,lockEpoch:state.lockEpoch+1,snapshot:structuredClone(snapshot),...(keys?{keys:structuredClone(keys)}:{})};return structuredClone(state);},indexKeys:async(expected,keys)=>{match(expected);state.keys=structuredClone(keys);return structuredClone(state);},lock:async()=>{state={...state,revision:state.revision+1,lockEpoch:state.lockEpoch+1};return structuredClone(state);},tamper:change=>change(state)};
}
async function created(secret=password){const storage=memory(),session=new VaultSession(storage);const recovery=await session.prepareCreate(secret);await session.confirmCreate(recovery);const entries=await session.put(null,{label:'OpenAI fixture',kind:'apiKey',value:canary});return{storage,session,recovery,id:entries[0].id};}
const rejects=(run,code)=>assert.rejects(run,error=>error instanceof VaultError&&error.code===code);
Then('vault storage contains ciphertext and public key names but no plaintext values',async function(){
  const {storage,session,id}=await created();const raw=JSON.stringify(await storage.read()),backup=await session.backup();
  for(const secret of [password,canary]){assert.equal(raw.includes(secret),false);assert.equal(backup.includes(secret),false);}
  assert.equal(publicVaultKeys(await storage.read()).entries[0].label,'OpenAI fixture');
  assert.equal((await session.list())[0].value,undefined);assert.equal(await session.copyCredential(id),canary);
  session.lock();await rejects(()=>session.copyCredential(id),'LOCKED');assert.equal((await session.keys()).entries.length,1);
});
Then('independent vault unlock methods recover the same guarded values',async function(){
  const {session,recovery,id}=await created();const prf=new Uint8Array(32).fill(7);
  await session.addMethod(proof(password),{kind:'passkey',prf,credentialId:randomBase64(32),prfSalt:randomBase64(32)});
  const method=(await session.status()).methods.find(method=>method.kind==='passkey');
  for(const authentication of [proof(password),proof(recovery),{methodId:method.id,prf}]){session.lock();await session.unlock(authentication);assert.equal(await session.copyCredential(id),canary);}
  session.lock();await rejects(()=>session.unlock({methodId:method.id,prf:new Uint8Array(32)}),'AUTHENTICATION');
});
Then('tampered vault records and unsafe KDF profiles are rejected',async function(){
  const {storage,session}=await created();const before=JSON.parse(await session.backup());
  await session.put(null,{label:'Other',kind:'secret',value:'second-fixture'});
  storage.tamper(state=>state.snapshot.records[0]=before.records[0]);session.lock();
  await rejects(()=>session.unlock(proof(password)),'AUTHENTICATION');
  const unsafe=structuredClone(before);unsafe.envelopes.find(entry=>entry.kind==='password').profile={...passwordProfile,memoryKiB:2**30};
  assert.throws(()=>validateSnapshot(unsafe),error=>error.code==='INVALID');
});
Then('a stale vault session cannot dispatch a credentialed request',async function(){
  const {storage,session,id}=await created(),other=new VaultSession(storage);await other.unlock(proof(password));
  await storage.lock();let sent=0;
  await rejects(()=>other.withCredential(id,async()=>{sent++;}),'CONFLICT');assert.equal(sent,0);
  session.lock();await session.unlock(proof(password));
  await session.withCredential(id,async(value,check)=>{assert.equal(value,canary);await check();sent++;});assert.equal(sent,1);
  let staleDispatch=0;
  await rejects(()=>session.withCredential(id,async(_value,check)=>{await session.put(null,{id,label:'OpenAI fixture',kind:'apiKey',value:'replacement-fixture'});await check();staleDispatch++;}),'CONFLICT');
  assert.equal(staleDispatch,0);
});
Then('replacing a vault requires current authentication and preserves data on failure',async function(){
  const source=await created(),target=await created('different-fixture-password'),backup=await source.session.backup();
  const before=await target.session.backup();await rejects(()=>target.session.restore(backup,proof(password)),'AUTHENTICATION');assert.equal(await target.session.backup(),before);
  await target.session.restore(backup,proof(password),proof('different-fixture-password'));assert.equal(await target.session.copyCredential(source.id),canary);
  const broken=JSON.parse(backup);broken.records=[];await rejects(()=>target.session.restore(JSON.stringify(broken),proof(password),proof(password)),'AUTHENTICATION');
});
Then('vault rotation requires retained proofs and invalidates the old recovery key',async function(){
  const {session,recovery,id}=await created(),before=JSON.parse(await session.backup());
  await rejects(()=>session.rotate([]),'AUTHENTICATION');
  const method=(await session.status()).methods.find(method=>method.kind==='password');
  const result=await session.rotate([{methodId:method.id,secret:password}]);assert.notEqual(result.recovery,recovery);assert.equal(JSON.parse(await session.backup()).epoch,before.epoch+1);
  session.lock();await rejects(()=>session.unlock(proof(recovery)),'AUTHENTICATION');await session.unlock(proof(result.recovery));assert.equal(await session.copyCredential(id),canary);
});
Then('vault management rejects duplicate names invalid headers and late creation',async function(){
  const {session}=await created();await rejects(()=>session.put(null,{label:' OPENAI fixture ',kind:'secret',value:'x'}),'DUPLICATE_KEY');
  await rejects(()=>session.put(null,{label:'bad',kind:'apiKey',value:'header\ninjection'}),'INVALID');
  const entries=await session.put(null,{label:'unicode',kind:'secret',value:'hé🙂\nJSON value'});assert.equal(entries.length,2);
  const empty=new VaultSession(memory()),pending=empty.prepareCreate(password);empty.lock();await rejects(()=>pending,'CANCELLED');assert.equal((await empty.status()).exists,false);
});
Then('vault idle deadlines remain absolute and cannot revive expired access',async function(){
  let now=1000,locks=0;const lifecycle=createVaultLifecycle({now:()=>now,onLock:()=>locks++,onDeadline:()=>{},preferences:{idleLockEnabled:true,idleLockMinutes:1}});
  lifecycle.activate();assert.equal(lifecycle.deadline(),61000);now=59000;assert.equal(lifecycle.check(),true);lifecycle.activity(false,true);assert.equal(lifecycle.deadline(),61000);
  now=61001;lifecycle.activity(true,true);assert.equal(locks,1);assert.equal(lifecycle.check(),false);lifecycle.configure({idleLockEnabled:false,idleLockMinutes:1});assert.equal(lifecycle.check(),false);
  lifecycle.activate();now=1;assert.equal(lifecycle.check(),false);assert.equal(locks,2);
});
