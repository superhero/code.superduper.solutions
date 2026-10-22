// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import * as git from 'isomorphic-git';
const author={name:'Remote fixture',email:'fixture@example.invalid',timestamp:1700000000,timezoneOffset:0};
const access={token:'remote-fixture-token'};
export async function writeFixtureCommit(context,text,parent=[],binary=false){
 const tree=await git.writeTree({...context,tree:[{path:'main.js',type:'blob',mode:'100644',oid:await git.writeBlob({...context,blob:new TextEncoder().encode(text)})},...(binary?[{path:'asset.bin',type:'blob',mode:'100644',oid:await git.writeBlob({...context,blob:new Uint8Array([0,255,3,4])})}]:[])]});
 return git.writeCommit({...context,commit:{tree,parent,message:text,author,committer:author}});
}
export async function gitFixtureFetch(world,input,init){
 const request=new Request(input,init),target=new URL(request.url);
 assert.equal(target.origin,'https://git.example.test','Only the local fixture transport may run');
 world.remoteRequests.push({method:request.method,path:target.pathname,query:target.search});
 assert.ok(!target.href.includes(access.token));
 if(world.beforeRemoteRequest)await world.beforeRemoteRequest(request);
 const body=Buffer.from(await request.arrayBuffer());
 const child=spawn('git',['http-backend'],{env:{...process.env,GIT_PROJECT_ROOT:world.remoteRoot,GIT_HTTP_EXPORT_ALL:'1',PATH_INFO:target.pathname,QUERY_STRING:target.search.slice(1),REQUEST_METHOD:request.method,CONTENT_TYPE:request.headers.get('content-type')??'',CONTENT_LENGTH:String(body.length),REMOTE_USER:'fixture',GIT_PROTOCOL:request.headers.get('git-protocol')??''},stdio:['pipe','pipe','pipe']});
 const chunks=[],errors=[];child.stdout.on('data',chunk=>chunks.push(chunk));child.stderr.on('data',chunk=>errors.push(chunk));child.stdin.end(body);
 await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(`Fixture Git backend: ${Buffer.concat(errors).toString()}`)));});
 const bytes=Buffer.concat(chunks),offset=bytes.indexOf('\r\n\r\n');assert.ok(offset>=0);
 const headers=new Headers();let status=200;
 for(const line of bytes.subarray(0,offset).toString().split('\r\n')){const colon=line.indexOf(':');const key=line.slice(0,colon),value=line.slice(colon+1).trim();if(key.toLowerCase()==='status')status=Number(value.split(' ')[0]);else headers.set(key,value);}
 return new Response(bytes.subarray(offset+4),{status,headers});
}
export async function prepareGitFixture(world){
 world.remoteRoot=join(world.root,'transport-fixture');world.upstream={fs:world.fs,gitdir:join(world.remoteRoot,'owner/repository.git')};
 await mkdir(world.upstream.gitdir,{recursive:true});await git.init({...world.upstream,bare:true,defaultBranch:'main'});await git.setConfig({...world.upstream,path:'http.receivepack',value:true});
 world.first=await writeFixtureCommit(world.upstream,'const value = 1;',[],true);world.second=await writeFixtureCommit(world.upstream,'const value = 2;',[world.first],true);world.feature=await writeFixtureCommit(world.upstream,'const feature = true;',[world.first],true);
 await git.writeRef({...world.upstream,ref:'refs/heads/main',value:world.second});await git.writeRef({...world.upstream,ref:'refs/heads/feature/nested',value:world.feature});
 await git.annotatedTag({...world.upstream,ref:'v1',object:world.first,message:'Historical release',tagger:author});
 world.remoteRequests=[];
}
