// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {upstreamApiFixture as fixture} from '../../../tests/fixtures/upstream-api.mjs';
import {apiFetch} from './api-fetch.ts';
import {gitHttp,advertisementRef} from './git-http.ts';
import {apiBase,normalizeHost,normalizeRelay,repositoryUrl,repositoryPath,refName,remoteName,remoteError,requiresGitRelay} from './policy.ts';
const token='only-a-local-fixture-token',sha='1234567890abcdef1234567890abcdef12345678';
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
Then('the {string} adapter maps reads and explicit writes using only injected fixtures',async function(provider){
 const {host,calls,transport}=fixture(provider),baseUrl=apiBase(provider,host);
 const module=await import(`./adapters/${provider}.ts`),api=module.create({host,baseUrl,token,fetch:apiFetch(baseUrl,token,undefined,transport)}),path='owner/repository';
 assert.equal((await api.identity()).username,'fixture');
 for(const query of ['','repository'])assert.equal((await api.repositories(query,1)).items[0].path,path);
 assert.equal((await api.repository(path)).cloneUrl,`${host}/${path}.git`);assert.equal((await api.branches(path,1)).items[0].oid,sha);
 for(const state of ['open','closed']){assert.equal((await api.reviews(path,state,1)).items[0].source,'feature');assert.equal((await api.issues(path,state,1)).items[0].title,'Issue fixture');}
 assert.ok(Array.isArray((await api.reviews(path,'merged',1)).items));
 assert.equal((await api.review(path,1)).oid,sha);
 assert.equal((await api.createReview(path,{title:'New review',body:'Body',source:'feature',target:'main',draft:false})).id,1);
 for(const kind of ['comment','approve','close','merge'])await api.reviewAction(path,{kind,id:1,body:'Fixture comment',oid:sha,method:'squash'});
 assert.equal((await api.createIssue(path,'New issue','Body')).id,1);for(const kind of ['comment','close'])await api.issueAction(path,1,kind,'Fixture comment');
 assert.ok((await api.checks(path,'main')).every(item=>item.name==='CI'||item.name==='Pipeline #1'));
 const namespace=provider==='gitlab'?'42':'fixture-org';assert.equal((await api.createRepository('new-repository',true,namespace)).path,path);assert.equal((await api.fork(path,namespace)).path,path);
 assert.ok(calls.some(call=>call.method==='POST'));assert.ok(calls.every(call=>!call.path.includes(token)&&!call.query.includes(token)));
 if(provider==='github'){
  assert.equal(calls.find(call=>call.path.endsWith('/pulls/1/merge')).body.sha,sha);
  const created=calls.find(call=>call.method==='POST'&&call.path==='/orgs/fixture-org/repos').body;
  assert.deepEqual(created,{name:'new-repository',private:true,auto_init:false});
  assert.equal(calls.find(call=>call.path.endsWith('/forks')).body.organization,'fixture-org');
  const request=calls.find(call=>call.method==='POST'&&call.path.endsWith('/pulls')).body;
  assert.equal(request.head,'feature');assert.equal(request.base,'main');
 }
 if(provider==='gitlab'){
  assert.equal(calls.find(call=>call.path.endsWith('/merge_requests/1/merge')).body.sha,sha);
  const created=calls.find(call=>call.method==='POST'&&call.path==='/api/v4/projects').body;
  assert.equal(created.namespace_id,42);assert.equal(created.visibility,'private');assert.equal(created.initialize_with_readme,false);
  assert.equal(calls.find(call=>call.path.endsWith('/fork')).body.namespace_id,42);
  await api.fork(path,'fixture-org');assert.equal(calls.at(-1).body.namespace_path,'fixture-org');
  const request=calls.find(call=>call.method==='POST'&&call.path.endsWith('/merge_requests')).body;
  assert.equal(request.source_branch,'feature');assert.equal(request.target_branch,'main');
 }
 if(provider==='bitbucket'){
  assert.equal(calls.find(call=>call.path.endsWith('/pullrequests/1/merge')).body.merge_strategy,'squash');
  const created=calls.find(call=>call.method==='POST'&&call.path.endsWith('/repositories/fixture-org/new-repository')).body;
  assert.equal(created.is_private,true);assert.equal(created.scm,'git');
  assert.equal(calls.find(call=>call.path.endsWith('/forks')).body.workspace.slug,'fixture-org');
  const request=calls.find(call=>call.method==='POST'&&call.path.endsWith('/pullrequests')).body;
  assert.equal(request.source.branch.name,'feature');assert.equal(request.destination.branch.name,'main');
 }
});
Then('upstream API transport pins authentication and bounds response bodies',async function(){
 const calls=[],fetch=apiFetch('https://api.example.test/api/v4',token,undefined,async request=>{calls.push(request);return json({ok:true});});
 for(const url of ['https://evil.example/api/v4/projects','https://api.example.test/api/v40/projects','https://user:password@api.example.test/api/v4/projects'])await assert.rejects(fetch(url));
 assert.equal(calls.length,0);await fetch('https://api.example.test/api/v4/projects',{headers:{cookie:'secret','private-token':'other',authorization:'secret'}});
 assert.equal(calls[0].headers.get('authorization'),`Bearer ${token}`);assert.equal(calls[0].headers.get('private-token'),null);assert.equal(calls[0].headers.get('cookie'),null);
 const oversized=apiFetch('https://api.example.test','',undefined,async()=>new Response(new Uint8Array(8_000_001)));
 await assert.rejects(oversized('https://api.example.test/projects'),/too large/);
 const failure=apiFetch('https://api.example.test',token,undefined,async()=>{throw Error(token);});await assert.rejects(failure('https://api.example.test/projects'),error=>!error.message.includes(token));
});
Then('Git transport prevents cross-repository credentials and unreviewed receive-pack requests',async function(){
 const calls=[],http=gitHttp('https://github.com/owner/repo.git',{provider:'github',host:'https://github.com',relay:'https://relay.example.test/git',token},new AbortController().signal,false,undefined,async(url,init)=>{calls.push({url,init});return new Response(new Uint8Array());});
 for(const url of ['https://github.com/other/repo.git/info/refs?service=git-upload-pack','https://evil.example/owner/repo.git/info/refs?service=git-upload-pack'])await assert.rejects(http.request({url}));
 await assert.rejects(http.request({url:'https://github.com/owner/repo.git/git-receive-pack',method:'POST'}));assert.equal(calls.length,0);
 await http.request({url:'https://github.com/owner/repo.git/info/refs?service=git-upload-pack'});assert.equal(calls[0].url,'https://relay.example.test/git/github.com/owner/repo.git/info/refs?service=git-upload-pack');assert.equal(calls[0].init.redirect,'error');
 const payload=new TextEncoder().encode(`${sha} refs/heads/main\0report-status\n`),packet=new TextEncoder().encode((payload.length+4).toString(16).padStart(4,'0'));
 const bytes=new Uint8Array(packet.length+payload.length+4);bytes.set(packet);bytes.set(payload,4);bytes.set(new TextEncoder().encode('0000'),packet.length+payload.length);
 assert.equal(advertisementRef(bytes,'refs/heads/main'),sha);assert.equal(advertisementRef(bytes,'refs/heads/other'),null);assert.throws(()=>advertisementRef(new TextEncoder().encode('broken'),'main'));
});
Then('upstream input validation rejects unsafe hosts remotes and reference names',function(){
 assert.equal(normalizeHost('github','https://github.com/'),'https://github.com');assert.equal(apiBase('github','https://ghe.example'),'https://ghe.example/api/v3');assert.equal(apiBase('gitlab','https://git.example/gitlab'),'https://git.example/gitlab/api/v4');assert.equal(normalizeRelay('  '),'');
 for(const value of ['http://github.com','https://token@github.com','https://github.com?token=secret','https://github.com/#token'])assert.throws(()=>normalizeHost('github',value));
 assert.throws(()=>normalizeHost('bitbucket','https://other.example'));assert.throws(()=>normalizeHost('github','https://github.com/path'));
 assert.throws(()=>repositoryUrl('https://github.com/owner/repo',{provider:'gitlab',host:'https://gitlab.com'}));assert.throws(()=>repositoryUrl('https://github.com/repo'));
 assert.equal(repositoryPath('https://git.example/gitlab/group/sub/repo.git',{provider:'gitlab',host:'https://git.example/gitlab'}),'group/sub/repo');
 for(const value of ['../main','-main','name.lock','HEAD','a b','a\\b'])assert.throws(()=>refName(value));assert.equal(refName('feature/nested'),'feature/nested');
 for(const value of ['../origin','a.b','origin/evil',''])assert.throws(()=>remoteName(value));assert.equal(remoteName('upstream-2'),'upstream-2');
});
Then('upstream failures provide bounded redacted actionable messages',function(){
 for(const status of [401,403,404,409,422,429])assert.ok(!remoteError(Object.assign(Error(token),{status}),token).includes(token));
 assert.equal(remoteError(Error(`failure ${token}`),token),'failure [redacted]');assert.equal(remoteError(Error('x'.repeat(600))).length,500);
 const basic=btoa(`fixture:${token}`);assert.ok(!remoteError(Error(`Authorization: Basic ${basic}`),token).includes(basic));
});

Then('known browser Git relay requirements are scoped to validated public GitHub URLs',function(){
 for(const url of ['https://github.com/owner/repo.git','https://GitHub.COM/owner/repo','https://www.github.com/owner/repo.git'])assert.equal(requiresGitRelay(url),true);
 for(const url of ['','https://github.com','https://github.com.evil.test/owner/repo.git','https://github.enterprise.test/owner/repo.git','https://git.example.test/owner/repo.git','https://gitlab.com/owner/repo.git','https://bitbucket.org/owner/repo.git','http://github.com/owner/repo.git','https://token@github.com/owner/repo.git','https://github.com/owner/repo.git?token=fixture'])assert.equal(requiresGitRelay(url),false,url);
});
