// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Then} from '@cucumber/cucumber';
import {prepareGitFixture,writeFixtureCommit as commit,gitFixtureFetch as backend} from '../../../tests/fixtures/git-transport.mjs';
import * as git from 'isomorphic-git';
import {createRepositoryEngine} from './core.ts';
import {repositoryPaths} from './paths.ts';
const author={name:'Remote fixture',email:'fixture@example.invalid',timestamp:1700000000,timezoneOffset:0};
const access={provider:'gitlab',host:'https://git.example.test',relay:'',token:'remote-fixture-token'};
const url='https://git.example.test/owner/repository.git';
async function fixture(world){
 await prepareGitFixture(world);world.options.fetch=(input,init)=>backend(world,input,init);world.engine=createRepositoryEngine(world.options);
 return world.engine.cloneRemote({name:'Remote fixture',url,access,operationId:crypto.randomUUID()});
}
const source=(world,state)=>({fs:world.fs,dir:repositoryPaths(state.id,world.root).dir});
async function advance(world){const before=await git.resolveRef({...world.upstream,ref:'main'});const oid=await commit(world.upstream,'const value = 3;',[before],true);await git.writeRef({...world.upstream,ref:'refs/heads/main',value:oid,force:true});return oid;}
const fetchRequest=()=>({kind:'fetch',remote:'origin',access,operationId:crypto.randomUUID()});
const pushRequest=(state,expectedOid,extra={})=>({kind:'push',remote:'origin',branch:'main',localBranch:'main',expectedOid,expectedLocalOid:state.head,access,operationId:crypto.randomUUID(),...extra});
Then('remote clone preserves full history binary files and independent editor history',async function(){
 const state=await fixture(this),context=source(this,state);assert.equal(state.head,this.second);assert.equal(state.branch,'main');
 assert.deepEqual((await this.engine.remoteStatus(state.id)).remotes[0].branches.map(item=>item.name),['feature/nested','main']);
 assert.deepEqual(await git.listTags(context),['v1']);assert.equal((await git.readTag({...context,oid:await git.resolveRef({...context,ref:'v1'})})).tag.object,this.first);
 for(const oid of [this.first,this.second,this.feature])assert.equal((await git.readCommit({...context,oid})).oid,oid);
 assert.deepEqual((await git.readBlob({...context,oid:this.first,filepath:'asset.bin'})).blob,new Uint8Array([0,255,3,4]));
 assert.equal(await this.engine.read(state.id,'main.js'),'const value = 2;');assert.equal(state.canUndo,false);
 assert.deepEqual(await git.listRefs({...context,filepath:'refs/editor'}),[]);
 assert.ok(this.remoteRequests.every(item=>!item.path.endsWith('/git-receive-pack')));
 assert.ok(!(await readFile(`${context.dir}/.git/config`,'utf8')).includes(access.token));
 assert.ok(!JSON.stringify([...this.records.values()]).includes(access.token));
});
Then('remote fetch preserves edits and fast-forward pull records one reversible file change',async function(){
 let state=await fixture(this);const baseline=state.historyHead,head=state.head;
 state=await this.engine.createFile(state.id,'draft.txt','unsaved to Git',state.revision);const privateHead=state.historyHead;
 const incoming=await advance(this);state=await this.engine.remoteAction(state.id,fetchRequest(),state.revision);
 assert.equal(state.historyHead,privateHead);assert.equal(state.head,head);assert.equal(await this.engine.read(state.id,'main.js'),'const value = 2;');assert.equal(await this.engine.read(state.id,'draft.txt'),'unsaved to Git');
 const info=await this.engine.remoteStatus(state.id);assert.equal(info.upstream.oid,incoming);assert.equal(info.behind,1);
 state=await this.engine.gitAction(state.id,{kind:'merge',target:'refs/remotes/origin/main',mode:'ff-only'},state.revision);
 assert.equal(state.head,incoming);assert.equal(await this.engine.read(state.id,'main.js'),'const value = 3;');assert.equal(await this.engine.read(state.id,'draft.txt'),'unsaved to Git');
 state=await this.engine.undo(state.id,state.revision);assert.equal(state.historyHead,privateHead);assert.equal(state.head,incoming);assert.equal(await this.engine.read(state.id,'main.js'),'const value = 2;');assert.notEqual(privateHead,baseline);
});
Then('remote push publishes only source refs and a changed lease prevents upload',async function(){
 let state=await fixture(this);const old=state.head;
 state=await this.engine.write(state.id,'main.js','const pushed = true;',state.revision);state=await this.engine.commit(state.id,'Publish source',author,state.revision);
 state=await this.engine.remoteAction(state.id,pushRequest(state,old),state.revision);assert.equal(await git.resolveRef({...this.upstream,ref:'main'}),state.head);
 assert.deepEqual(await git.listRefs({...this.upstream,filepath:'refs/editor'}),[]);
 assert.equal((await git.log({...this.upstream,ref:'main'})).length,3);
 const reviewed=state.head;await advance(this);const before=this.remoteRequests.filter(item=>item.path.endsWith('/git-receive-pack')).length;
 await assert.rejects(this.engine.remoteAction(state.id,pushRequest(state,reviewed,{lease:true}),state.revision),/tip changed since review/);
 assert.equal(this.remoteRequests.filter(item=>item.path.endsWith('/git-receive-pack')).length,before);
 assert.notEqual(await git.resolveRef({...this.upstream,ref:'main'}),state.head);
});
Then('a remote change after advertisement rejects the push atomically',async function(){
 let state=await fixture(this);const old=state.head;state=await this.engine.write(state.id,'main.js','new source',state.revision);state=await this.engine.commit(state.id,'New source',author,state.revision);
 let raced;this.beforeRemoteRequest=async request=>{if(request.method==='POST'&&request.url.endsWith('/git-receive-pack')){this.beforeRemoteRequest=undefined;raced=await advance(this);}};
 await assert.rejects(this.engine.remoteAction(state.id,pushRequest(state,old,{lease:true}),state.revision));
 assert.equal(await git.resolveRef({...this.upstream,ref:'main'}),raced);assert.equal((await this.engine.open(state.id)).revision,state.revision);
});
Then('remote fetch interrupted at {string} recovers without another network request',async function(stage){
 let state=await fixture(this);const incoming=await advance(this),history=state.historyHead,request=fetchRequest(),expected=state.revision;
 this.failAt=stage;await assert.rejects(this.engine.remoteAction(state.id,request,expected),/interrupted/);
 this.options.fetch=async()=>{throw Error('Recovery must not access the network');};this.engine=this.open();
 state=await this.engine.open(state.id);assert.equal(state.historyHead,history);assert.equal((await this.engine.remoteStatus(state.id)).upstream.oid,incoming);
 const retry=await this.engine.remoteAction(state.id,request,expected);assert.equal(retry.revision,state.revision);
 assert.equal(await this.engine.read(state.id,'main.js'),'const value = 2;');assert.ok(!JSON.stringify([...this.records.values()]).includes(access.token));
});
Then('interrupted remote push recovery never replays the upstream write',async function(){
 let state=await fixture(this),old=state.head;state=await this.engine.write(state.id,'main.js','pushed once',state.revision);state=await this.engine.commit(state.id,'Push once',author,state.revision);
 const request=pushRequest(state,old),expected=state.revision;this.failAt='prepared';await assert.rejects(this.engine.remoteAction(state.id,request,expected),/interrupted/);
 assert.equal(await git.resolveRef({...this.upstream,ref:'main'}),state.head);assert.ok(!JSON.stringify([...this.journals.values()]).includes(access.token));
 this.options.fetch=async()=>{throw Error('Do not replay pushes');};this.engine=this.open();state=await this.engine.open(state.id);
 assert.equal((await this.engine.remoteStatus(state.id)).upstream.oid,state.head);assert.equal((await this.engine.remoteAction(state.id,request,expected)).revision,state.revision);
});
Then('remote fetch replaces unsafe imported refspecs and never changes local heads',async function(){
 let state=await fixture(this),head=state.head;const context=source(this,state);await git.setConfig({...context,path:'remote.origin.fetch',value:'+refs/heads/*:refs/heads/*'});await advance(this);
 state=await this.engine.remoteAction(state.id,fetchRequest(),state.revision);assert.equal(state.head,head);assert.equal(await git.getConfig({...context,path:'remote.origin.fetch'}),'+refs/heads/*:refs/remotes/origin/*');
});
Then('a cancelled remote clone cleans up its unpublished filesystem',async function(){
 const request={name:'Cancelled',url,access,operationId:crypto.randomUUID()};let started;
 const signalReady=new Promise(resolve=>started=resolve);
 this.options.fetch=async(_url,init)=>{started();await new Promise((resolve,reject)=>{if(init.signal.aborted)reject(init.signal.reason);else init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});};
 this.engine=createRepositoryEngine(this.options);const pending=this.engine.cloneRemote(request);await signalReady;await this.engine.cancelRemote(request.operationId);await assert.rejects(pending,/cancelled/i);
 assert.deepEqual(await this.engine.list(),[]);assert.deepEqual(await readdir(join(this.root,'repositories')),[]);assert.deepEqual(await readdir(join(this.root,'history')),[]);
});
Then('checking out a remote branch preserves files history and tracking configuration',async function(){
 let state=await fixture(this),before=state.historyHead;state=await this.engine.gitAction(state.id,{kind:'track-branch',target:'refs/remotes/origin/feature/nested',name:'local-feature'},state.revision);
 assert.equal(state.branch,'local-feature');assert.equal(state.head,this.feature);assert.equal(await this.engine.read(state.id,'main.js'),'const feature = true;');assert.equal((await this.engine.remoteStatus(state.id)).upstream.branch,'feature/nested');
 state=await this.engine.undo(state.id,state.revision);assert.equal(state.historyHead,before);assert.equal(state.branch,'local-feature');assert.equal(state.head,this.feature);assert.equal(await this.engine.read(state.id,'main.js'),'const value = 2;');
});
Then('remote branch and tag pushes and deletions preserve local refs and file history',async function(){
 let state=await fixture(this),history=state.historyHead;
 state=await this.engine.createBranch(state.id,'publish',state.revision);
 state=await this.engine.remoteAction(state.id,{...pushRequest(state,null),branch:'publish',localBranch:'publish',setUpstream:true},state.revision);
 assert.equal((await this.engine.remoteStatus(state.id)).upstream.branch,'publish');assert.equal(await git.resolveRef({...this.upstream,ref:'refs/heads/publish'}),state.head);
 state=await this.engine.gitAction(state.id,{kind:'tag',name:'v2',target:'HEAD'},state.revision);
 state=await this.engine.remoteAction(state.id,{...pushRequest(state,null),kind:'push-tag',branch:'v2',localBranch:'v2'},state.revision);
 assert.equal(await git.resolveRef({...this.upstream,ref:'refs/tags/v2'}),state.head);
 state=await this.engine.remoteAction(state.id,{...pushRequest(state,state.head),kind:'delete-tag',branch:'v2',localBranch:'v2'},state.revision);
 await assert.rejects(git.resolveRef({...this.upstream,ref:'refs/tags/v2'}));assert.equal(await git.resolveRef({...source(this,state),ref:'refs/tags/v2'}),state.head);
 state=await this.engine.remoteAction(state.id,{...pushRequest(state,state.head),kind:'delete-branch',branch:'publish',localBranch:'publish'},state.revision);
 await assert.rejects(git.resolveRef({...this.upstream,ref:'refs/heads/publish'}));assert.equal(await git.resolveRef({...source(this,state),ref:'refs/heads/publish'}),state.head);assert.equal(state.historyHead,history);
});
Then('a matching lease replaces the upstream tip and rejects unknown operations',async function(){
 let state=await fixture(this);state=await this.engine.write(state.id,'main.js','divergent local change',state.revision);state=await this.engine.commit(state.id,'Local divergence',author,state.revision);
 const upstream=await advance(this);
 state=await this.engine.remoteAction(state.id,pushRequest(state,upstream,{lease:true}),state.revision);assert.equal(await git.resolveRef({...this.upstream,ref:'main'}),state.head);
 const count=this.remoteRequests.length;await assert.rejects(this.engine.remoteAction(state.id,{...pushRequest(state,state.head),kind:'unknown'},state.revision),/Unknown remote Git operation/);assert.equal(this.remoteRequests.length,count);
});
Then('imported URL credentials are hidden and unsafe transfers are refused',async function(){
 const state=await fixture(this),secret='credential-in-imported-url',context=source(this,state),count=this.remoteRequests.length;
 await git.setConfig({...context,path:'remote.origin.url',value:`https://user:${secret}@git.example.test/owner/repository.git?access_token=${secret}`});
 const result=await this.engine.remoteStatus(state.id);assert.equal(result.remotes[0].url,url);assert.equal(result.remotes[0].needsUrl,true);assert.ok(!JSON.stringify(result).includes(secret));
 await assert.rejects(this.engine.remoteAction(state.id,fetchRequest(),state.revision),error=>!error.message.includes(secret));assert.equal(this.remoteRequests.length,count);
});
