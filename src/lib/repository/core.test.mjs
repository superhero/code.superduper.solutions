// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, readFile, readdir, lstat, writeFile, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Before, After, Then } from "@cucumber/cucumber";
import * as git from "isomorphic-git";
import { createRepositoryEngine } from "./core.ts";
import { indexFiles } from "./local-git.ts";
import { repositoryPaths } from "./paths.ts";
const author={name:'Editor test',email:'test@example.invalid'};
const input=(path,text)=>({path,data:typeof text==='string'?new TextEncoder().encode(text):text});

Before({tags:'@repository-core'}, async function() {
  this.root=await mkdtemp(join(tmpdir(),'code-repository-'));
  this.records=new Map();this.journals=new Map();this.preferences=undefined;
  this.fs={promises:{...fs.promises}};
  this.metadata={
    list:async()=>structuredClone([...new Map([...this.records,...[...this.journals].map(([id,p])=>[id,p.after])]).values()]),
    get:async id=>structuredClone(this.records.get(id)),
    pending:async id=>structuredClone(this.journals.get(id)),
    prepare:async(id,pending)=>{this.journals.set(id,structuredClone(pending));},
    finish:async record=>{this.records.set(record.id,structuredClone(record));this.journals.delete(record.id);},
    loadPreferences:async()=>structuredClone(this.preferences),
    savePreferences:async value=>{this.preferences=structuredClone(value);}
  };
  this.locks=new Map();
  this.options={fs:this.fs,metadata:this.metadata,root:this.root,flush:async()=>{
    if(this.flushFailure){this.flushFailure=false;throw Error('quota exhausted');}
  },lock:async(key,run)=>{
    const previous=this.locks.get(key)??Promise.resolve();
    const next=previous.catch(()=>{}).then(run);this.locks.set(key,next);return next;
  },checkpoint:async stage=>{if(this.failAt===stage){this.failAt=undefined;throw Error(`interrupted ${stage}`);}}};
  this.engine=createRepositoryEngine(this.options);
  this.open=()=>createRepositoryEngine(this.options);
});
After({tags:'@repository-core'},async function(){await rm(this.root,{recursive:true,force:true});});
async function fixture(world,files=[input('main.ts','initial')]) {return world.engine.create('Repository',files);}
async function contents(root,prefix='') {
  const entries=[];
  for(const name of (await readdir(join(root,prefix))).sort()) {
    const path=prefix?`${prefix}/${name}`:name;
    if((await lstat(join(root,path))).isDirectory()) entries.push(...await contents(root,path));
    else entries.push(input(path,new Uint8Array(await readFile(join(root,path)))));
  }
  return entries;
}
const source=(world,id)=>({fs:world.fs,dir:repositoryPaths(id,world.root).dir});
Then('repository rename changes only its name and rejects invalid or stale requests',async function(){
  let state=await fixture(this);
  state=await this.engine.commit(state.id,'Source baseline',author,state.revision);
  state=await this.engine.write(state.id,'main.ts','saved change',state.revision);
  state=await this.engine.undo(state.id,state.revision);
  const ordinary=await contents(repositoryPaths(state.id,this.root).gitdir);
  const renamed=await this.engine.renameRepository(state.id,'  Renamed repository  ',state.revision);
  assert.equal(renamed.name,'Renamed repository');assert.equal(renamed.id,state.id);
  assert.deepEqual(renamed.files,state.files);assert.deepEqual(renamed.history,state.history);
  assert.deepEqual(renamed.commits,state.commits);assert.equal(renamed.historyHead,state.historyHead);
  assert.equal(renamed.canRedo,true);assert.equal(await this.engine.read(state.id,'main.ts'),'initial');
  assert.deepEqual(await contents(repositoryPaths(state.id,this.root).gitdir),ordinary);
  for(const name of ['', ' ', 'x'.repeat(201),'invalid\nname'])await assert.rejects(this.engine.renameRepository(state.id,name,renamed.revision),/repository name/);
  await assert.rejects(this.engine.renameRepository(state.id,'Stale',state.revision),/another tab/);
  this.engine=this.open();assert.equal((await this.engine.open(state.id)).name,'Renamed repository');
  state=await this.engine.redo(state.id,renamed.revision);
  assert.equal(await this.engine.read(state.id,'main.ts'),'saved change');
});
Then('private history subjects summarize grouped changes and explicit formatting durably',async function(){
  const initial='const timeout = 5000;';let state=await fixture(this,[input('main.ts',initial)]);
  state=await this.engine.commit(state.id,'Source baseline',author,state.revision);
  const ordinary=await contents(repositoryPaths(state.id,this.root).gitdir),group={id:'typing',line:1};
  for(const value of [2,20,20000])state=await this.engine.write(state.id,'main.ts',`const timeout = ${value};`,state.revision,group);
  assert.equal(state.history.length,1);assert.equal(state.history[0].message,'Change timeout: 5000 → 20000');
  state=await this.engine.write(state.id,'main.ts','const timeout = 20000;\n',state.revision,group,'format');
  assert.equal(state.history.length,2);assert.equal(state.history[0].message,'Format document');assert.equal(state.editGroup,undefined);
  const unchanged=await this.engine.write(state.id,'main.ts','const timeout = 20000;\n',state.revision,undefined,'format');
  assert.equal(unchanged.revision,state.revision);assert.equal(unchanged.history.length,2);
  this.engine=this.open();state=await this.engine.open(state.id);assert.equal(state.history[0].message,'Format document');
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'const timeout = 20000;');
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),initial);
  state=await this.engine.redo(state.id,state.revision);state=await this.engine.redo(state.id,state.revision);
  assert.equal(state.history[0].message,'Format document');assert.deepEqual(await contents(repositoryPaths(state.id,this.root).gitdir),ordinary);
});
Then('grouped repository writes persist each edit and undo the entire row session',async function(){
  let state=await fixture(this,[input('main.ts','\nother')]);
  state=await this.engine.commit(state.id,'Source baseline',author,state.revision);
  const base=state.historyHead,ordinary=await contents(repositoryPaths(state.id,this.root).gitdir),ids=[];
  const group={id:'typing',line:1};
  for(const text of ['a','ab','abc']){
    state=await this.engine.write(state.id,'main.ts',`${text}\nother`,state.revision,group);ids.push(state.historyHead);
    assert.equal(await this.open().read(state.id,'main.ts'),`${text}\nother`);
    assert.equal(state.history.length,1);assert.deepEqual(this.records.get(state.id).undo,[base]);
  }
  assert.equal(new Set(ids).size,3);assert.deepEqual(state.history[0].parents,[base]);
  assert.deepEqual(state.history[0].changes,[{path:'main.ts',before:[{from:1,to:1}],after:[{from:1,to:1}],binary:false}]);
  assert.deepEqual(this.records.get(state.id).historyOrder,[state.historyHead]);
  assert.deepEqual(state.editGroup,{...group,path:'main.ts',before:base});
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'\nother');
  assert.equal(state.canUndo,false);assert.equal(state.editGroup,undefined);
  this.engine=this.open();state=await this.engine.open(state.id);state=await this.engine.redo(state.id,state.revision);
  assert.equal(await this.engine.read(state.id,'main.ts'),'abc\nother');assert.equal(state.canRedo,false);
  assert.deepEqual(await contents(repositoryPaths(state.id,this.root).gitdir),ordinary);
});
Then('repository edit grouping ends on {string}',async function(boundary){
  let state=await fixture(this,[input('main.ts','one\ntwo'),input('other.ts','other')]);
  const group={id:'typing',line:1};state=await this.engine.write(state.id,'main.ts','onea\ntwo',state.revision,group);
  const first=state.historyHead;
  const path=boundary==='another file'?'other.ts':'main.ts';
  const text=boundary==='another file'?'otherx':boundary==='another row'?'onea\ntwox':boundary==='multiline edit'?'onea\n\ntwo':'oneab\ntwo';
  const next=boundary==='ungrouped edit'?undefined:{id:boundary==='another group'?'second':group.id,line:boundary==='another row'?2:1};
  state=await this.engine.write(state.id,path,text,state.revision,next);
  assert.equal(state.history.length,2);assert.deepEqual(state.history[0].parents,[first]);
  if(boundary==='multiline edit'||boundary==='ungrouped edit')assert.equal(state.editGroup,undefined);
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'onea\ntwo');
  assert.equal(await this.engine.read(state.id,'other.ts'),'other');
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'one\ntwo');
});
Then('grouped repository edits never amend a restored history entry',async function(){
  let state=await fixture(this,[input('main.ts','')]);const group={id:'first',line:1};
  state=await this.engine.write(state.id,'main.ts','a',state.revision,group);const first=state.historyHead;
  state=await this.engine.write(state.id,'main.ts','ab',state.revision,{id:'second',line:1});const future=state.historyHead;
  state=await this.engine.undo(state.id,state.revision);
  state=await this.engine.write(state.id,'main.ts','ax',state.revision,group);
  assert.equal(state.history.length,3);assert.equal(state.canRedo,false);
  assert.deepEqual(state.history.find(item=>item.oid===state.historyHead).parents,[first]);
  assert.ok(state.history.some(item=>item.oid===future));
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'a');
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'');
});
Then('a grouped repository amendment recovers at {string}',async function(stage){
  let state=await fixture(this,[input('main.ts','')]);const group={id:'typing',line:1};
  state=await this.engine.write(state.id,'main.ts','a',state.revision,group);const revision=state.revision;
  this.failAt=stage;await assert.rejects(this.engine.write(state.id,'main.ts','ab',revision,group),/interrupted/);
  this.engine=this.open();state=await this.engine.open(state.id);
  assert.equal(state.history.length,1);assert.equal(this.journals.size,0);assert.equal(await this.engine.read(state.id,'main.ts'),'ab');
  assert.equal((await this.engine.write(state.id,'main.ts','ab',revision,group)).revision,state.revision);
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'');assert.equal(state.canUndo,false);
});
Then('change graphs remain isolated by source version without changing checkout content',async function(){
  let state=await fixture(this);const initial=state.historyHead;
  assert.deepEqual(state.history,[]);assert.equal(state.canUndo,false);
  state=await this.engine.write(state.id,'main.ts','unborn edit',state.revision);const unborn=state.historyHead;
  state=await this.engine.commit(state.id,'Version A',author,state.revision);const a=state.head;
  assert.deepEqual(state.history,[]);assert.equal(state.historyHead,unborn);
  state=await this.engine.write(state.id,'main.ts','version B content',state.revision);const edit=state.historyHead,graph=state.history;
  assert.deepEqual(graph.map(entry=>entry.oid),[edit]);assert.deepEqual(graph[0].parents,[unborn]);
  state=await this.engine.commit(state.id,'Version B',author,state.revision);const b=state.head;
  assert.deepEqual(state.history,[]);assert.equal(state.historyHead,edit);
  const before=state;
  for(const hidden of [initial,unborn,edit])await assert.rejects(this.engine.selectHistory(state.id,hidden,state.revision),{name:'RepositoryValidationError'});
  assert.deepEqual(await this.engine.open(state.id),before);
  state=await this.engine.checkoutCommit(state.id,a,state.revision);
  assert.equal(await this.engine.read(state.id,'main.ts'),'unborn edit');assert.deepEqual(state.history,graph);
  assert.ok(!state.history.some(entry=>entry.oid===state.historyHead));
  this.engine=this.open();state=await this.engine.open(state.id);assert.deepEqual(state.history,graph);
  state=await this.engine.selectHistory(state.id,edit,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'version B content');
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'unborn edit');
  state=await this.engine.checkoutCommit(state.id,b,state.revision);assert.deepEqual(state.history,[]);
  assert.equal(await this.engine.read(state.id,'main.ts'),'version B content');
  assert.deepEqual(this.records.get(state.id).changeGraphs.unborn.revisions,[unborn]);
  assert.deepEqual(this.records.get(state.id).changeGraphs[a].revisions,[edit]);
});
Then('scoped change graphs retain divergent futures and share identical source commits',async function(){
  let state=await fixture(this);state=await this.engine.commit(state.id,'Version A',author,state.revision);const a=state.head;
  state=await this.engine.write(state.id,'main.ts','first',state.revision);const first=state.historyHead;
  state=await this.engine.write(state.id,'main.ts','abandoned',state.revision);const future=state.historyHead;
  state=await this.engine.undo(state.id,state.revision);
  state=await this.engine.write(state.id,'main.ts','other direction',state.revision);const current=state.historyHead;
  const graph=state.history;
  assert.deepEqual(new Set(graph.map(entry=>entry.oid)),new Set([first,future,current]));
  state=await this.engine.createBranch(state.id,'same-version',state.revision);assert.deepEqual(state.history,graph);
  state=await this.engine.commit(state.id,'Version B',author,state.revision);const b=state.head;assert.deepEqual(state.history,[]);
  state=await this.engine.checkoutCommit(state.id,a,state.revision);assert.deepEqual(state.history,graph);
  state=await this.engine.switchBranch(state.id,'main',state.revision);assert.deepEqual(state.history,graph);
  this.engine=this.open();state=await this.engine.open(state.id);assert.deepEqual(state.history,graph);
  state=await this.engine.checkoutCommit(state.id,b,state.revision);assert.deepEqual(state.history,[]);
  state=await this.engine.undo(state.id,state.revision);assert.equal(state.head,b);assert.deepEqual(state.history,[]);
  state=await this.engine.redo(state.id,state.revision);assert.equal(state.head,b);
  const context={fs:this.fs,gitdir:repositoryPaths(state.id,this.root).historyGitdir};
  assert.equal(await git.resolveRef({...context,ref:`refs/editor/futures/${future}`}),future);
});
Then('scoped graph ancestry reconnects hidden checkouts and preserves actual Git parents',async function(){
  let state=await fixture(this,[input('main.ts','initial\n')]);const baseline=state.historyHead;
  state=await this.engine.commit(state.id,'Version A',author,state.revision);const a=state.head;
  const context={fs:this.fs,gitdir:repositoryPaths(state.id,this.root).historyGitdir};
  const read=this.fs.promises.readFile;let historyReads=0;
  this.fs.promises.readFile=async(path,...args)=>{if(String(path).startsWith(`${context.gitdir}/objects/`))historyReads++;return read(path,...args);};
  try{state=await this.engine.open(state.id);assert.deepEqual(state.history,[]);assert.equal(historyReads,0);}
  finally{this.fs.promises.readFile=read;}
  let first,second,third,hidden;
  const now=Date.now;
  try{
    Date.now=()=>2000000000000;
    state=await this.engine.write(state.id,'main.ts','initial\nfirst only\n',state.revision);first=state.historyHead;
    state=await this.engine.commit(state.id,'Version B',author,state.revision);const b=state.head;
    Date.now=()=>1000000000000;
    state=await this.engine.checkoutCommit(state.id,a,state.revision);
    state=await this.engine.checkoutCommit(state.id,b,state.revision);
    state=await this.engine.checkoutCommit(state.id,a,state.revision);hidden=state.historyHead;
    state=await this.engine.write(state.id,'main.ts','initial\nsecond only\n',state.revision);second=state.historyHead;
    state=await this.engine.write(state.id,'main.ts','initial\nthird only\n',state.revision);third=state.historyHead;
  }finally{Date.now=now;}
  assert.deepEqual(state.history.map(entry=>entry.oid),[third,second,first]);
  assert.ok(state.history[1].timestamp<state.history[2].timestamp);
  while(state.canUndo)state=await this.engine.undo(state.id,state.revision);
  assert.equal(state.historyHead,baseline);
  state=await this.engine.write(state.id,'main.ts','independent\n',state.revision);const independent=state.historyHead;
  // A separate retained Git root must not acquire a baseline or sibling edge.
  const original=(await git.readCommit({...context,oid:baseline})).commit;
  const separate=await git.writeCommit({...context,commit:{...original,parent:[],message:'Separate retained root'}});
  await git.writeRef({...context,ref:`refs/editor/futures/${separate}`,value:separate});
  this.records.get(state.id).futures.push(separate);this.records.get(state.id).changeGraphs[a].revisions.push(separate);
  state=await this.engine.open(state.id);
  const byOid=new Map(state.history.map(entry=>[entry.oid,entry]));
  assert.deepEqual(byOid.get(first).graphParents,[baseline]);assert.deepEqual(byOid.get(independent).graphParents,[baseline]);
  assert.deepEqual(byOid.get(separate).graphParents,[]);assert.deepEqual(byOid.get(separate).parents,[]);
  assert.deepEqual(byOid.get(second).graphParents,[first]);assert.deepEqual(byOid.get(third).graphParents,[second]);
  assert.deepEqual(byOid.get(second).parents,[hidden]);assert.deepEqual(byOid.get(independent).parents,[baseline]);
  assert.deepEqual(byOid.get(second).changes,[{path:'main.ts',before:[],after:[{from:2,to:2}],binary:false}]);
  for(const entry of state.history){
    assert.deepEqual(entry.parents,(await git.readCommit({...context,oid:entry.oid})).commit.parent);
    for(const parent of entry.graphParents)if(parent!==baseline)assert.ok(state.history.findIndex(item=>item.oid===parent)>state.history.indexOf(entry));
  }
  assert.ok(state.commits.every(entry=>entry.graphParents===undefined));
  const before=state,stored=structuredClone(this.records.get(state.id)),objects=await contents(context.gitdir);
  this.engine=this.open();state=await this.engine.open(state.id);
  assert.deepEqual(state,before);assert.deepEqual(this.records.get(state.id),stored);assert.deepEqual(await contents(context.gitdir),objects);
});
Then('legacy change graphs migrate durably while keeping global history endpoints',async function(){
  let state=await fixture(this);const baseline=state.historyHead;
  state=await this.engine.commit(state.id,'Source',author,state.revision);
  state=await this.engine.write(state.id,'main.ts','one',state.revision);const first=state.historyHead;
  state=await this.engine.write(state.id,'main.ts','future',state.revision);const future=state.historyHead;
  state=await this.engine.undo(state.id,state.revision);
  const stored=this.records.get(state.id);delete stored.changeGraphs;
  const before=structuredClone(stored);
  this.engine=this.open();state=await this.engine.write(state.id,'main.ts','one',state.revision);
  assert.deepEqual(new Set(state.history.map(entry=>entry.oid)),new Set([first,future]));
  assert.ok(!state.history.some(entry=>entry.oid===baseline));
  assert.deepEqual({...this.records.get(state.id),changeGraphs:undefined},{...before,changeGraphs:undefined});
  assert.ok(this.records.get(state.id).changeGraphs[state.head]);
  this.engine=this.open();state=await this.engine.open(state.id);assert.equal(state.canRedo,true);
  state=await this.engine.redo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'future');
});
Then('a scoped source {string} recovers at {string}',async function(operation,stage){
  let state=await fixture(this);state=await this.engine.commit(state.id,'Version A',author,state.revision);const a=state.head;
  state=await this.engine.write(state.id,'main.ts','next',state.revision);const oldGraph=state.history;
  let target;
  if(operation==='checkout'){
    state=await this.engine.commit(state.id,'Version B',author,state.revision);
    const context=source(this,state.id),original=(await git.readCommit({...context,oid:a})).commit;
    target=await git.writeCommit({...context,commit:{...original,parent:[state.head],message:'First visit target'}});
    await git.writeRef({...context,ref:'refs/heads/first-visit',value:target});
  }
  const base=state.revision,previous=state.historyHead;
  const invoke=()=>operation==='commit'?this.engine.commit(state.id,'New version',author,base):this.engine.checkoutCommit(state.id,target,base);
  this.failAt=stage;await assert.rejects(invoke(),/interrupted/);
  this.engine=this.open();state=await this.engine.open(state.id);
  assert.deepEqual(state.history,[]);assert.equal(this.journals.size,0);
  assert.deepEqual(this.records.get(state.id).changeGraphs[a].revisions,oldGraph.map(entry=>entry.oid));
  assert.ok(this.records.get(state.id).changeGraphs[state.head]);
  assert.equal((await invoke()).revision,state.revision);
  assert.equal(await this.engine.read(state.id,'main.ts'),operation==='commit'?'next':'initial');
  if(operation==='commit')assert.equal(state.historyHead,previous);
  else{state=await this.engine.undo(state.id,state.revision);assert.equal(state.historyHead,previous);assert.equal(state.head,target);assert.deepEqual(state.history,[]);}
});
Then('repository edits have isolated Git snapshots and explicit source commits',async function(){
  let state=await fixture(this);assert.equal(state.head,null);assert.equal(state.branch,'main');assert.deepEqual(state.history,[]);
  const initial=state;
  for(const text of ['a','ab','abc']) state=await this.engine.write(state.id,'main.ts',text,state.revision);
  assert.equal(state.history.length,3);assert.equal(state.commits.length,0);
  const privateTip=state.historyHead,privateGit={fs:this.fs,gitdir:repositoryPaths(state.id,this.root).historyGitdir};
  assert.equal((await git.log({...privateGit,ref:privateTip})).length,4);
  state=await this.engine.commit(state.id,'First intentional commit',author,state.revision);
  assert.equal(state.commits.length,1);assert.equal(state.commits[0].message,'First intentional commit');
  assert.deepEqual(state.commits[0].parents,[]);assert.deepEqual(state.history,[]);assert.equal(state.historyHead,privateTip);
  const ordinary=await contents(repositoryPaths(state.id,this.root).gitdir);
  const head=state.head;
  state=await this.engine.undo(state.id,state.revision);
  assert.equal(state.head,head);assert.equal(await this.engine.read(state.id,'main.ts'),'ab');
  assert.deepEqual(await contents(repositoryPaths(state.id,this.root).gitdir),ordinary);
  state=await this.engine.commit(state.id,'Keep earlier text',author,state.revision);
  assert.equal(state.commits.length,2);assert.deepEqual(state.history,[]);
  assert.equal((await git.log({...privateGit,ref:privateTip})).length,4);
  assert.deepEqual(state.commits[0].parents,[head]);
  const privateCommit=await git.readCommit({...privateGit,oid:initial.historyHead});
  assert.equal(privateCommit.commit.author.email,'editor@localhost');
});
Then('repository navigation restores files and survives reopening',async function(){
  let s=await fixture(this);
  s=await this.engine.write(s.id,'main.ts','one',s.revision);
  s=await this.engine.createFile(s.id,'src/second.ts','two',s.revision);
  s=await this.engine.undo(s.id,s.revision);assert.deepEqual(s.files,['main.ts']);assert.equal(s.canRedo,true);
  this.engine=this.open();s=await this.engine.open(s.id);
  assert.equal(s.canRedo,true);s=await this.engine.redo(s.id,s.revision);
  assert.equal(await this.engine.read(s.id,'src/second.ts'),'two');
  s=await this.engine.undo(s.id,s.revision);s=await this.engine.undo(s.id,s.revision);
  assert.equal(s.canUndo,false);assert.equal(await this.engine.read(s.id,'main.ts'),'initial');
  this.engine=this.open();s=await this.engine.open(s.id);s=await this.engine.redo(s.id,s.revision);s=await this.engine.redo(s.id,s.revision);
  assert.equal(s.canRedo,false);assert.equal(await this.engine.read(s.id,'main.ts'),'one');
});
Then('divergent editing retains its previous Git future',async function(){
  let s=await fixture(this);
  s=await this.engine.write(s.id,'main.ts','first',s.revision);s=await this.engine.write(s.id,'main.ts','future',s.revision);
  const future=this.records.get(s.id).current;
  s=await this.engine.undo(s.id,s.revision);s=await this.engine.undo(s.id,s.revision);
  s=await this.engine.write(s.id,'main.ts','new direction',s.revision);
  assert.equal(s.canRedo,false);assert.equal(s.history.length,3);assert.ok(s.history.some(v=>v.oid===future));
  assert.equal(await git.resolveRef({fs:this.fs,gitdir:repositoryPaths(s.id,this.root).historyGitdir,ref:`refs/editor/futures/${future}`}),future);
  s=await this.engine.undo(s.id,s.revision);s=await this.engine.redo(s.id,s.revision);
  assert.equal(await this.engine.read(s.id,'main.ts'),'new direction');
});
Then('repository history exposes its actual Git ancestry after divergence and reopening',async function(){
  let state=await fixture(this);
  const root=state.historyHead;
  state=await this.engine.write(state.id,'main.ts','first change',state.revision);
  const shared=state.historyHead;
  state=await this.engine.write(state.id,'main.ts','original future',state.revision);
  const future=state.historyHead;
  assert.deepEqual(state.history.map(({oid,parents})=>({oid,parents})),[
    {oid:future,parents:[shared]},{oid:shared,parents:[root]},
  ]);
  state=await this.engine.undo(state.id,state.revision);
  state=await this.engine.write(state.id,'main.ts','new future',state.revision);
  const current=state.historyHead;
  this.engine=this.open();state=await this.engine.open(state.id);
  assert.equal(state.historyHead,current);
  assert.equal(state.history.length,3);
  assert.deepEqual((await git.readCommit({fs:this.fs,gitdir:repositoryPaths(state.id,this.root).historyGitdir,oid:root})).commit.parent,[]);
  const expected=new Map([[root,[]],[shared,[root]],[future,[shared]],[current,[shared]]]);
  const positions=new Map(state.history.map((version,index)=>[version.oid,index]));
  for(const version of state.history){
    const stored=await git.readCommit({fs:this.fs,gitdir:repositoryPaths(state.id,this.root).historyGitdir,oid:version.oid});
    assert.deepEqual(version.parents,expected.get(version.oid));
    assert.deepEqual(version.parents,stored.commit.parent);
    for(const parent of version.parents)if(positions.has(parent))assert.ok(positions.get(version.oid)<positions.get(parent),'children precede visible parents');
    else assert.equal(parent,root,'only the implicit baseline is hidden');
  }
});
Then('retained revisions can be selected undone and redone without changing source Git',async function(){
  let state=await fixture(this,[input('main.ts','initial'),input('image.bin',new Uint8Array([0,255]))]);
  const initial=state.historyHead;
  state=await this.engine.commit(state.id,'Source baseline',author,state.revision);
  state=await this.engine.write(state.id,'main.ts','first',state.revision);
  const firstChange=state.historyHead;
  state=await this.engine.createFile(state.id,'old/future.ts','retained file',state.revision);
  const target=state.historyHead;
  state=await this.engine.undo(state.id,state.revision);
  state=await this.engine.write(state.id,'main.ts','diverged',state.revision);
  const previous=state,ordinary=await contents(repositoryPaths(state.id,this.root).gitdir);
  const ids=new Set(state.history.map(entry=>entry.oid));
  state=await this.engine.selectHistory(state.id,target,state.revision);
  assert.equal(state.historyHead,target);assert.equal(await this.engine.read(state.id,'main.ts'),'first');
  assert.equal(await this.engine.read(state.id,'old/future.ts'),'retained file');
  assert.equal((await this.engine.selectHistory(state.id,target,previous.revision)).revision,state.revision);
  await assert.rejects(this.engine.selectHistory(state.id,initial,previous.revision),/another tab/);
  assert.deepEqual(new Set(state.history.map(entry=>entry.oid)),ids);
  assert.deepEqual(await contents(repositoryPaths(state.id,this.root).gitdir),ordinary);
  this.engine=this.open();state=await this.engine.open(state.id);
  state=await this.engine.undo(state.id,state.revision);
  assert.equal(state.historyHead,previous.historyHead);assert.equal(await this.engine.read(state.id,'main.ts'),'diverged');
  assert.ok(!state.files.includes('old/future.ts'));
  state=await this.engine.redo(state.id,state.revision);assert.equal(state.historyHead,target);
  assert.deepEqual(await this.engine.selectHistory(state.id,target,state.revision),state);
  state=await this.engine.selectHistory(state.id,firstChange,state.revision);
  assert.equal(await this.engine.read(state.id,'main.ts'),'first');assert.ok(!state.files.includes('old/future.ts'));
  state=await this.engine.undo(state.id,state.revision);assert.equal(state.historyHead,target);
  state=await this.engine.write(state.id,'main.ts','new branch',state.revision);
  assert.deepEqual(state.history.find(entry=>entry.oid===state.historyHead).parents,[target]);
  for(const oid of ids)assert.ok(state.history.some(entry=>entry.oid===oid));
  assert.deepEqual(await contents(repositoryPaths(state.id,this.root).gitdir),ordinary);
  assert.deepEqual(new Uint8Array(await readFile(join(repositoryPaths(state.id,this.root).dir,'image.bin'))),new Uint8Array([0,255]));
});
Then('invalid history selections leave files Git and metadata untouched',async function(){
  let state=await fixture(this);state=await this.engine.commit(state.id,'Source only',author,state.revision);
  const other=await fixture(this),paths=repositoryPaths(state.id,this.root),history={fs:this.fs,gitdir:paths.historyGitdir};
  const original=await git.readCommit({...history,oid:state.historyHead});
  const unreachable=await git.writeCommit({...history,commit:{...original.commit,message:'Unretained private object'}});
  const files=await contents(paths.dir),objects=await contents(paths.historyGitdir),metadata=structuredClone(this.records.get(state.id));
  for(const target of ['HEAD','0'.repeat(40),state.head,state.historyHead,other.historyHead,unreachable]){
    await assert.rejects(this.engine.selectHistory(state.id,target,state.revision),{name:'RepositoryValidationError'});
    assert.deepEqual(await contents(paths.dir),files);assert.deepEqual(await contents(paths.historyGitdir),objects);
    assert.deepEqual(this.records.get(state.id),metadata);assert.equal(this.journals.size,0);
  }
});
Then('source commits can be checked out and returned to a branch without moving branch refs',async function(){
  const oldBytes=new Uint8Array([0,255,1]),newBytes=new Uint8Array([0,128,2]);
  let state=await fixture(this,[input('main.ts','initial'),input('image.bin',oldBytes),input('run.sh','run'),input('.gitignore','ignored.txt\n')]);
  state=await this.engine.commit(state.id,'First source',author,state.revision);const first=state.head;
  const paths=repositoryPaths(state.id,this.root),context=source(this,state.id);
  await writeFile(join(paths.dir,'image.bin'),newBytes);await fs.promises.chmod(join(paths.dir,'run.sh'),0o755);
  state=await this.engine.write(state.id,'main.ts','latest',state.revision);
  const firstGraph=state.history;
  state=await this.engine.commit(state.id,'Latest source',author,state.revision);const latest=state.head;
  state=await this.engine.createFile(state.id,'untracked/keep.txt','keep',state.revision);
  state=await this.engine.createFile(state.id,'ignored.txt','ignored',state.revision);
  const before=state,refs=await contents(join(paths.gitdir,'refs'));
  state=await this.engine.checkoutCommit(state.id,first,state.revision);
  assert.equal(state.head,first);assert.equal(state.branch,null);assert.deepEqual(state.history,firstGraph);
  assert.deepEqual((await git.readCommit({fs:this.fs,gitdir:paths.historyGitdir,oid:state.historyHead})).commit.parent,[before.historyHead]);
  assert.ok(!state.history.some(entry=>entry.oid===state.historyHead));
  assert.equal((await readFile(join(paths.gitdir,'HEAD'),'utf8')).trim(),first);
  assert.deepEqual(new Set(state.commits.map(entry=>entry.oid)),new Set([first,latest]));
  assert.deepEqual(new Uint8Array(await readFile(join(paths.dir,'image.bin'))),oldBytes);
  assert.equal((await lstat(join(paths.dir,'run.sh'))).mode&0o777,0o644);
  assert.equal(await this.engine.read(state.id,'untracked/keep.txt'),'keep');assert.equal(await this.engine.read(state.id,'ignored.txt'),'ignored');
  assert.ok((await git.statusMatrix(context)).filter(row=>row[1]||row[3]).every(row=>row.slice(1).every(value=>value===1)));
  assert.deepEqual(await contents(join(paths.gitdir,'refs')),refs);
  assert.equal((await this.engine.checkoutCommit(state.id,first,before.revision)).revision,state.revision);
  await assert.rejects(this.engine.checkoutCommit(state.id,latest,before.revision),/another tab/);
  this.engine=this.open();state=await this.engine.open(state.id);assert.equal(state.branch,null);
  const checkedOutGit=await contents(paths.gitdir);
  state=await this.engine.undo(state.id,state.revision);assert.equal(await this.engine.read(state.id,'main.ts'),'latest');
  assert.equal(state.head,first);assert.equal(state.branch,null);assert.deepEqual(await contents(paths.gitdir),checkedOutGit);
  assert.deepEqual(await this.engine.checkoutCommit(state.id,first,state.revision),state);
  state=await this.engine.redo(state.id,state.revision);
  state=await this.engine.switchBranch(state.id,'main',state.revision);
  assert.equal(state.branch,'main');assert.equal(state.head,latest);assert.equal(await this.engine.read(state.id,'main.ts'),'latest');
  assert.deepEqual(new Uint8Array(await readFile(join(paths.dir,'image.bin'))),newBytes);
  assert.equal((await lstat(join(paths.dir,'run.sh'))).mode&0o777,0o755);
  assert.deepEqual(await contents(join(paths.gitdir,'refs')),refs);
});
Then('invalid source commit targets cannot mutate repository state',async function(){
  let state=await fixture(this);state=await this.engine.commit(state.id,'Source',author,state.revision);
  const other=await fixture(this),context=source(this,state.id),original=await git.readCommit({...context,oid:state.head});
  const orphan=await git.writeCommit({...context,commit:{...original.commit,message:'Unreferenced'}});
  const blob=await git.writeBlob({...context,blob:new TextEncoder().encode('not a commit')});
  const before=await contents(context.dir),history=await contents(repositoryPaths(state.id,this.root).historyGitdir),metadata=structuredClone(this.records.get(state.id));
  for(const oid of ['HEAD','0'.repeat(40),state.historyHead,other.historyHead,orphan,blob]){
    await assert.rejects(this.engine.checkoutCommit(state.id,oid,state.revision),{name:'RepositoryValidationError'});
    assert.deepEqual(await contents(context.dir),before);assert.deepEqual(await contents(repositoryPaths(state.id,this.root).historyGitdir),history);
    assert.deepEqual(this.records.get(state.id),metadata);assert.equal(this.journals.size,0);
  }
});
Then('source version graphs retain every referenced commit while detached',async function(){
  const fixture=await branchFixture(this);let state=fixture.state;
  const context=source(this,state.id),base=(await git.readCommit({...context,oid:fixture.main})).commit;
  const tagged=await git.writeCommit({...context,commit:{...base,parent:[fixture.main],message:'Annotated tag only'}});
  const remote=await git.writeCommit({...context,commit:{...base,parent:[fixture.main],message:'Remote only'}});
  await git.annotatedTag({...context,ref:'release',object:tagged,message:'Release',tagger:author});
  await git.writeRef({...context,ref:'refs/remotes/origin/remote',value:remote});
  state=await this.engine.open(state.id);
  const expected=new Set([fixture.main,fixture.topic,tagged,remote]);
  assert.deepEqual(new Set(state.commits.map(entry=>entry.oid)),expected);
  const refs=await contents(join(repositoryPaths(state.id,this.root).gitdir,'refs'));
  state=await this.engine.checkoutCommit(state.id,fixture.topic,state.revision);
  state=await this.engine.checkoutCommit(state.id,tagged,state.revision);
  this.engine=this.open();state=await this.engine.open(state.id);
  assert.equal(state.branch,null);assert.equal(state.head,tagged);
  assert.deepEqual(new Set(state.commits.map(entry=>entry.oid)),expected);
  assert.deepEqual(await contents(join(repositoryPaths(state.id,this.root).gitdir,'refs')),refs);
});
Then('private Git history reports changed lines without modifying source commits',async function(){
  let state=await fixture(this,[input('main.ts','one\ntwo\nthree\nfour\nfive\n'),input('unchanged.ts','untouched\n')]);
  const initial=state.historyHead;
  assert.deepEqual(state.history,[]);
  state=await this.engine.commit(state.id,'Source baseline',author,state.revision);
  const sourceHead=state.head,ordinary=await contents(repositoryPaths(state.id,this.root).gitdir);
  const range=(from,to=from)=>({from,to});
  const change=(before,after)=>[{path:'main.ts',before,after,binary:false}];
  const expected=new Map();
  state=await this.engine.write(state.id,'main.ts','ONE\ntwo\nthree\nfour\nfive\n',state.revision);
  expected.set(state.historyHead,change([range(1)],[range(1)]));
  state=await this.engine.write(state.id,'main.ts','ONE\nTWO\nthree\nFOUR\nFIVE\n',state.revision);
  expected.set(state.historyHead,change([range(2),range(4,5)],[range(2),range(4,5)]));
  state=await this.engine.write(state.id,'main.ts','ONE\nTWO\nFOUR\nFIVE\n',state.revision);
  const abandoned=state.historyHead;
  expected.set(abandoned,change([range(3)],[]));
  state=await this.engine.undo(state.id,state.revision);
  state=await this.engine.write(state.id,'main.ts','ONE\nTWO\nthree\nFOUR\nFIVE\nsix\n',state.revision);
  expected.set(state.historyHead,change([],[range(6)]));
  const current=state.historyHead;
  this.engine=this.open();state=await this.engine.open(state.id);
  assert.equal(state.historyHead,current);assert.equal(state.history.length,expected.size);
  assert.ok(!state.history.some(entry=>entry.oid===initial));
  assert.ok(state.history.some(entry=>entry.oid===abandoned));
  for(const entry of state.history)assert.deepEqual(entry.changes,expected.get(entry.oid));
  assert.equal(state.head,sourceHead);assert.ok(state.commits.every(entry=>entry.changes===undefined));
  assert.deepEqual(await contents(repositoryPaths(state.id,this.root).gitdir),ordinary);
});
Then('private history distinguishes text file changes from binary files',async function(){
  let state=await fixture(this);
  state=await this.engine.addFiles(state.id,[input('added.txt','first\nsecond\n'),input('nul.bin',new Uint8Array([0,7])),input('invalid.bin',new Uint8Array([255]))],state.revision);
  const added=state.historyHead;
  assert.deepEqual(state.history.find(entry=>entry.oid===added).changes,[
    {path:'added.txt',before:[],after:[{from:1,to:2}],binary:false},
    {path:'invalid.bin',before:[],after:[],binary:true},
    {path:'nul.bin',before:[],after:[],binary:true},
  ]);
  state=await this.engine.remove(state.id,'added.txt',state.revision);
  assert.deepEqual(state.history.find(entry=>entry.oid===state.historyHead).changes,[{path:'added.txt',before:[{from:1,to:2}],after:[],binary:false}]);
  state=await this.engine.remove(state.id,'invalid.bin',state.revision);
  assert.deepEqual(state.history.find(entry=>entry.oid===state.historyHead).changes,[{path:'invalid.bin',before:[],after:[],binary:true}]);
  state=await this.engine.createFile(state.id,'empty.txt','',state.revision);
  assert.deepEqual(state.history.find(entry=>entry.oid===state.historyHead).changes,[{path:'empty.txt',before:[],after:[],binary:false}]);
});
Then('private history caches line summaries without masking Git read failures',async function(){
  let state=await fixture(this,[input('main.ts','before\n'),input('untouched/nested.txt','stable\n')]);
  state=await this.engine.write(state.id,'main.ts','after\n',state.revision);
  const history={fs:this.fs,gitdir:repositoryPaths(state.id,this.root).historyGitdir};
  const commit=await git.readCommit({...history,oid:state.historyHead});
  const tree=(await git.readTree({...history,oid:commit.commit.tree})).tree;
  const blob=tree.find(entry=>entry.path==='main.ts').oid;
  const untouchedTree=tree.find(entry=>entry.path==='untouched').oid;
  const untouchedBlob=(await git.readTree({...history,oid:untouchedTree})).tree[0].oid;
  const objectPath=oid=>`${history.gitdir}/objects/${oid.slice(0,2)}/${oid.slice(2)}`;
  const originalRead=this.fs.promises.readFile,reads=[];
  let failedPath;
  this.fs.promises.readFile=async(...args)=>{
    const path=String(args[0]);reads.push(path);
    if(path===failedPath)throw new Error('summary blob read failed');
    return originalRead(...args);
  };
  this.engine=this.open();state=await this.engine.open(state.id);
  assert.ok(reads.includes(objectPath(blob)));
  assert.ok(!reads.includes(objectPath(untouchedTree)));
  assert.ok(!reads.includes(objectPath(untouchedBlob)));
  state.history.find(entry=>entry.oid===state.historyHead).changes[0].after[0].from=999;
  reads.length=0;
  state=await this.engine.open(state.id);
  assert.ok(!reads.includes(objectPath(blob)),'cached commits do not read their changed blobs again');
  assert.deepEqual(state.history.find(entry=>entry.oid===state.historyHead).changes[0].after,[{from:1,to:1}]);
  this.engine=this.open();failedPath=objectPath(blob);
  await assert.rejects(this.engine.open(state.id),error=>error instanceof git.Errors.NotFoundError&&error.message.includes(blob));
  failedPath=undefined;
  state=await this.engine.open(state.id);
  assert.equal(state.history.find(entry=>entry.oid===state.historyHead).changes[0].binary,false);
});
Then('file operations restore exact binary contents',async function(){
  const bytes=new Uint8Array([0,255,12,80]);let s=await fixture(this,[input('folder/image.bin',bytes),input('text.txt','text')]);
  await assert.rejects(this.engine.read(s.id,'folder/image.bin'),/binary/);
  await assert.rejects(this.engine.write(s.id,'folder/image.bin','replacement',s.revision),/binary/);
  s=await this.engine.rename(s.id,'folder/image.bin','other/image.bin',s.revision);
  s=await this.engine.remove(s.id,'other/image.bin',s.revision);
  s=await this.engine.undo(s.id,s.revision);s=await this.engine.undo(s.id,s.revision);
  assert.deepEqual(new Uint8Array(await readFile(join(repositoryPaths(s.id,this.root).dir,'folder/image.bin'))),bytes);
  s=await this.engine.redo(s.id,s.revision);assert.ok(s.files.includes('other/image.bin'));
  s=await this.engine.remove(s.id,'other/image.bin',s.revision);
  s=await this.engine.createFile(s.id,'other','directory replaced by file',s.revision);
  s=await this.engine.undo(s.id,s.revision);s=await this.engine.undo(s.id,s.revision);assert.ok(s.files.includes('other/image.bin'));
});
Then('added file batches preserve bytes and source Git through undo and redo',async function(){
  let s=await fixture(this,[input('folder/keep.txt','existing'),input('run.sh','#!/bin/sh\n'),input('.gitignore','*.bin\n')]);
  const paths=repositoryPaths(s.id,this.root);
  await fs.promises.chmod(join(paths.dir,'run.sh'),0o755);
  s=await this.engine.commit(s.id,'Original source',author,s.revision);
  s=await this.engine.write(s.id,'folder/keep.txt','staged draft',s.revision);
  await git.add({...source(this,s.id),filepath:'folder/keep.txt'});
  s=await this.engine.write(s.id,'folder/keep.txt','working draft',s.revision);
  const before=s,ordinary=await contents(paths.gitdir),bytes=new Uint8Array([0,255,128,10,1]);
  const added=[input('folder/new/image.bin',bytes),input('folder/new/text.txt','new text'),input('top.txt','top')];
  s=await this.engine.addFiles(s.id,added,s.revision);
  const assertAdded=async()=>{
    assert.deepEqual(s.files,[...before.files,...added.map(file=>file.path)].sort());
    assert.deepEqual(new Uint8Array(await readFile(join(paths.dir,'folder/new/image.bin'))),bytes);
    assert.equal(await this.engine.read(s.id,'folder/new/text.txt'),'new text');
    assert.equal(await this.engine.read(s.id,'top.txt'),'top');
    assert.equal(await this.engine.read(s.id,'folder/keep.txt'),'working draft');
    assert.equal((await lstat(join(paths.dir,'run.sh'))).mode&0o777,0o755);
    assert.equal(s.history.length,before.history.length+1);
    assert.deepEqual(s.commits,before.commits);assert.equal(s.head,before.head);
    assert.deepEqual(await contents(paths.gitdir),ordinary);
  };
  await assertAdded();
  s=await this.engine.undo(s.id,s.revision);assert.deepEqual(s.files,before.files);assert.equal(s.canRedo,true);
  assert.deepEqual(await contents(paths.gitdir),ordinary);
  this.engine=this.open();s=await this.engine.open(s.id);assert.equal(s.canRedo,true);
  s=await this.engine.redo(s.id,s.revision);await assertAdded();
});
Then('an added file batch with {string} is rejected before writing',async function(conflict){
  let s=await fixture(this,[input('existing.txt','keep'),input('folder/child.txt','child')]);
  s=await this.engine.commit(s.id,'Original source',author,s.revision);
  const paths=repositoryPaths(s.id,this.root),before=await contents(paths.dir),privateBefore=await contents(paths.historyGitdir);
  const cases={
    'existing file':[input('existing.txt','replace')],
    'existing folder':[input('folder','replace')],
    'existing ancestor file':[input('existing.txt/child','blocked')],
    'duplicate paths':[input('new.txt','one'),input('new.txt','two')],
    'batch ancestor file':[input('new','file'),input('new/child','child')],
    'batch descendant file':[input('new/child','child'),input('new','file')],
    'absolute path':[input('/escape','unsafe')],
    'parent traversal':[input('folder/../escape','unsafe')],
    'empty segment':[input('folder//escape','unsafe')],
    'backslash':[input('folder\\escape','unsafe')],
    'control character':[input('folder/\0escape','unsafe')],
    'source Git metadata':[input('.git/config','unsafe')],
    'nested Git metadata':[input('new/.GiT/HEAD','unsafe')],
    'invalid bytes':[{path:'invalid.txt',data:'not a byte array'}],
    'empty batch':[],
  };
  const batch=conflict==='empty batch'?[]:[input('valid/new.txt','must not be written'),...cases[conflict]];
  await assert.rejects(async()=>this.engine.addFiles(s.id,batch,s.revision),/already exists|blocks|relative file path|segments|Git metadata|byte array|at least one/);
  assert.deepEqual(await contents(paths.dir),before);
  assert.deepEqual(await contents(paths.historyGitdir),privateBefore);
  assert.deepEqual(await this.engine.open(s.id),s);assert.equal(this.journals.size,0);
});
Then('added file batches enforce revisions and exact retries',async function(){
  const s=await fixture(this),bytes=new Uint8Array([0,255,5]);
  const winning=[input('folder/image.bin',bytes),input('other.txt','winner')],retry=structuredClone(winning);
  const first=this.engine.addFiles(s.id,winning,s.revision);bytes.fill(42);
  const outcomes=await Promise.allSettled([first,this.engine.addFiles(s.id,[input('loser.txt','stale')],s.revision)]);
  assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.match(outcomes[1].reason.message,/another tab/);
  const next=outcomes[0].value;
  assert.deepEqual(next.files,['folder/image.bin','main.ts','other.txt']);assert.equal(next.history.length,s.history.length+1);
  assert.deepEqual(new Uint8Array(await readFile(join(repositoryPaths(s.id,this.root).dir,'folder/image.bin'))),retry[0].data);
  this.engine=this.open();assert.deepEqual(await this.engine.addFiles(s.id,retry,s.revision),next);
  await assert.rejects(this.engine.addFiles(s.id,winning,s.revision),/another tab/);
  assert.deepEqual(await this.engine.open(s.id),next);
});
Then('added file batches retain divergent editor history',async function(){
  let s=await fixture(this);
  s=await this.engine.addFiles(s.id,[input('old-future.txt','first')],s.revision);
  const future=this.records.get(s.id).current;
  s=await this.engine.undo(s.id,s.revision);
  s=await this.engine.addFiles(s.id,[input('new-future.txt','second')],s.revision);
  assert.equal(s.canRedo,false);assert.equal(s.history.length,2);assert.ok(s.history.some(version=>version.oid===future));
  assert.deepEqual(s.files,['main.ts','new-future.txt']);
  const history={fs:this.fs,gitdir:repositoryPaths(s.id,this.root).historyGitdir};
  assert.equal(await git.resolveRef({...history,ref:`refs/editor/futures/${future}`}),future);
  this.engine=this.open();s=await this.engine.open(s.id);
  s=await this.engine.undo(s.id,s.revision);assert.deepEqual(s.files,['main.ts']);
  s=await this.engine.redo(s.id,s.revision);assert.deepEqual(s.files,['main.ts','new-future.txt']);
});
Then('an interrupted file batch at {string} recovers exactly once',async function(stage){
  let s=await fixture(this);s=await this.engine.commit(s.id,'Original source',author,s.revision);
  const paths=repositoryPaths(s.id,this.root),ordinary=await contents(paths.gitdir),bytes=new Uint8Array([0,255,7]);
  const batch=[input('nested/image.bin',bytes),input('other/new.txt','new')];
  this.failAt=stage;await assert.rejects(this.engine.addFiles(s.id,batch,s.revision),/interrupted/);
  if(stage==='prepared')assert.deepEqual((await contents(paths.dir)).filter(file=>!file.path.startsWith('.git/')).map(file=>file.path),s.files);
  this.engine=this.open();const recovered=await this.engine.open(s.id);assert.equal(this.journals.size,0);
  assert.deepEqual(recovered.files,['main.ts','nested/image.bin','other/new.txt']);assert.equal(recovered.history.length,s.history.length+1);
  assert.deepEqual(new Uint8Array(await readFile(join(paths.dir,'nested/image.bin'))),bytes);
  assert.equal(await this.engine.read(s.id,'other/new.txt'),'new');
  assert.deepEqual(await this.engine.addFiles(s.id,batch,s.revision),recovered);
  assert.deepEqual(await contents(paths.gitdir),ordinary);
  let restored=await this.engine.undo(s.id,recovered.revision);assert.deepEqual(restored.files,s.files);
  restored=await this.engine.redo(s.id,restored.revision);assert.deepEqual(restored.files,recovered.files);
});
Then('folder operations restore exact subtree contents and modes',async function(){
  const bytes=new Uint8Array([0,255,12,80]);
  let s=await fixture(this,[input('src/run.sh','#!/bin/sh\necho one\n'),input('src/nested/image.bin',bytes),input('src-other/keep.txt','sibling'),input('outside.txt','outside')]);
  const paths=repositoryPaths(s.id,this.root);
  await fs.promises.chmod(join(paths.dir,'src/run.sh'),0o755);
  s=await this.engine.write(s.id,'src/run.sh','#!/bin/sh\necho two\n',s.revision);
  s=await this.engine.commit(s.id,'Original source',author,s.revision);
  const ordinary=await contents(paths.gitdir),baseline=s;
  const assertState=async(prefix,historyLength)=>{
    assert.deepEqual(s.files,['outside.txt','src-other/keep.txt',...(prefix?[`${prefix}/nested/image.bin`,`${prefix}/run.sh`]:[])].sort());
    if(prefix){
      assert.deepEqual(new Uint8Array(await readFile(join(paths.dir,prefix,'nested/image.bin'))),bytes);
      assert.equal(await this.engine.read(s.id,`${prefix}/run.sh`),'#!/bin/sh\necho two\n');
      assert.equal((await lstat(join(paths.dir,prefix,'run.sh'))).mode&0o777,0o755);
    }
    assert.equal(await this.engine.read(s.id,'src-other/keep.txt'),'sibling');
    assert.equal(await this.engine.read(s.id,'outside.txt'),'outside');
    assert.equal(s.history.length,historyLength);
    assert.deepEqual(await contents(paths.gitdir),ordinary);
  };
  s=await this.engine.rename(s.id,'src','lib/code',s.revision);
  await assertState('lib/code',baseline.history.length+1);
  assert.equal((await this.engine.rename(s.id,'src','lib/code',baseline.revision)).revision,s.revision);
  this.engine=this.open();s=await this.engine.open(s.id);
  s=await this.engine.undo(s.id,s.revision);await assertState('src',baseline.history.length+1);
  s=await this.engine.redo(s.id,s.revision);await assertState('lib/code',baseline.history.length+1);
  const renamed=s;
  s=await this.engine.remove(s.id,'lib',s.revision);await assertState(null,baseline.history.length+2);
  assert.equal((await this.engine.remove(s.id,'lib',renamed.revision)).revision,s.revision);
  s=await this.engine.undo(s.id,s.revision);await assertState('lib/code',baseline.history.length+2);
  this.engine=this.open();s=await this.engine.open(s.id);
  s=await this.engine.redo(s.id,s.revision);await assertState(null,baseline.history.length+2);
});
Then('invalid folder operations and no-op renames preserve repository state',async function(){
  let s=await fixture(this,[input('parent/src/main.ts','source'),input('parent/src/deep/file.ts','nested'),input('occupied/child.ts','occupied'),input('blocker','file')]);
  s=await this.engine.commit(s.id,'Original source',author,s.revision);
  const before=await contents(repositoryPaths(s.id,this.root).dir);
  assert.equal((await this.engine.rename(s.id,'parent/src','parent/src',s.revision)).revision,s.revision);
  for(const destination of ['blocker','occupied','blocker/nested','parent/src/deep/new','parent']){
    await assert.rejects(this.engine.rename(s.id,'parent/src',destination,s.revision),/already exists|blocks|inside itself/);
  }
  await assert.rejects(this.engine.rename(s.id,'blocker','occupied',s.revision),/already exists/);
  await assert.rejects(this.engine.rename(s.id,'missing','missing',s.revision),/not found/);
  await assert.rejects(this.engine.remove(s.id,'missing',s.revision),/not found/);
  assert.deepEqual(await this.engine.open(s.id),s);
  assert.deepEqual(await contents(repositoryPaths(s.id,this.root).dir),before);
  assert.equal(this.journals.size,0);
});
Then('folder operations reject stale revisions without changing any files',async function(){
  let s=await fixture(this,[input('src/main.ts','source'),input('src/nested/file.ts','nested'),input('outside.txt','outside')]);
  const stale=s.revision;
  s=await this.engine.write(s.id,'outside.txt','newer change',s.revision);
  const before=await contents(repositoryPaths(s.id,this.root).dir);
  await assert.rejects(this.engine.rename(s.id,'src','renamed',stale),/another tab/);
  await assert.rejects(this.engine.remove(s.id,'src',stale),/another tab/);
  assert.deepEqual(await this.engine.open(s.id),s);
  assert.deepEqual(await contents(repositoryPaths(s.id,this.root).dir),before);
});
Then('no-op history commands preserve the revision',async function(){
  let s=await this.engine.create('Empty');const id=s.id;
  assert.equal((await this.engine.undo(id,s.revision)).revision,s.revision);
  assert.equal((await this.engine.redo(id,s.revision)).revision,s.revision);
  s=await this.engine.createFile(id,'a','same',s.revision);
  assert.equal((await this.engine.write(id,'a','same',s.revision)).revision,s.revision);
  assert.equal((await this.engine.rename(id,'a','a',s.revision)).revision,s.revision);
});
Then('concurrent repository changes reject stale revisions',async function(){
  let s=await fixture(this);
  for(let attempt=0;attempt<20;attempt++){
    const expected=s.revision,winner=`winner ${attempt}`,stale=`stale ${attempt}`;
    const outcomes=await Promise.allSettled([this.engine.write(s.id,'main.ts',winner,expected),this.engine.write(s.id,'main.ts',stale,expected)]);
    assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.match(outcomes[1].reason.message,/another tab/);
    assert.equal(await this.engine.read(s.id,'main.ts'),winner);
    assert.equal((await this.engine.write(s.id,'main.ts',winner,expected)).revision,outcomes[0].value.revision);s=outcomes[0].value;
  }
});
Then('invalid file operations cannot alter repository history',async function(){
  const s=await fixture(this,[input('a','A'),input('b','B')]);
  for(const operation of [()=>this.engine.write(s.id,'absent','x',s.revision),()=>this.engine.createFile(s.id,'a','x',s.revision),()=>this.engine.rename(s.id,'a','b',s.revision),()=>this.engine.remove(s.id,'absent',s.revision),()=>this.engine.createFile(s.id,'a/child','x',s.revision),()=>this.engine.createFile(s.id,'../escape','x',s.revision),()=>this.engine.write(s.id,'a','\0',s.revision)]) await assert.rejects(async()=>operation());
  assert.equal((await this.engine.open(s.id)).revision,s.revision);
  assert.equal(await this.engine.read(s.id,'a'),'A');
  await assert.rejects(this.engine.open('00000000-0000-0000-0000-000000000000'),/not found/);
});
Then('imported Git repositories retain their ordinary history and refs',async function(){
  let s=await fixture(this);s=await this.engine.commit(s.id,'Initial',author,s.revision);const first=s.head;
  s=await this.engine.write(s.id,'main.ts','second',s.revision);s=await this.engine.commit(s.id,'Second',author,s.revision);
  const context=source(this,s.id);
  await git.writeRef({...context,ref:'refs/heads/topic',value:first});await git.writeRef({...context,ref:'refs/tags/v1',value:first});
  await writeFile(join(context.dir,'main.ts'),'uncommitted imported text');
  const imported=await this.engine.create('Imported',await contents(context.dir));
  assert.deepEqual(imported.commits,s.commits);assert.equal(imported.head,s.head);assert.equal(await this.engine.read(imported.id,'main.ts'),'uncommitted imported text');
  assert.equal(await git.resolveRef({...source(this,imported.id),ref:'refs/heads/topic'}),first);
  assert.equal(await git.resolveRef({...source(this,imported.id),ref:'refs/tags/v1'}),first);
  const before=await contents(repositoryPaths(imported.id,this.root).gitdir);
  let edited=await this.engine.write(imported.id,'main.ts','edit',imported.revision);await this.engine.undo(edited.id,edited.revision);
  assert.deepEqual(await contents(repositoryPaths(imported.id,this.root).gitdir),before);
});
async function branchFixture(world) {
  let s=await fixture(world);
  s=await world.engine.commit(s.id,'Main source',author,s.revision);
  const main=s.head;
  s=await world.engine.createBranch(s.id,'topic',s.revision);
  s=await world.engine.write(s.id,'main.ts','topic content',s.revision);
  s=await world.engine.commit(s.id,'Topic source',author,s.revision);
  const topic=s.head;
  s=await world.engine.switchBranch(s.id,'main',s.revision);
  return {state:s,main,topic};
}
Then('repository branch choices preserve their ordinary Git identities',async function(){
  let s=await fixture(this);assert.deepEqual(s.branches,['main']);
  const unborn=await this.engine.create('Unborn branch import',await contents(repositoryPaths(s.id,this.root).dir));
  assert.deepEqual(unborn.branches,['main']);assert.equal(unborn.head,null);
  s=await this.engine.commit(s.id,'Source',author,s.revision);
  const context=source(this,s.id);
  for(const name of ['refs/heads/zeta','refs/heads/alpha','refs/tags/release','refs/remotes/origin/remote'])await git.writeRef({...context,ref:name,value:s.head});
  const imported=await this.engine.create('All refs',await contents(context.dir));
  assert.deepEqual(imported.branches,['alpha','main','zeta']);assert.equal(imported.branch,'main');
  await git.writeRef({...source(this,imported.id),ref:'HEAD',value:imported.head,force:true});
  const detached=await this.engine.open(imported.id);assert.equal(detached.branch,null);assert.deepEqual(detached.branches,imported.branches);
  const created=await this.engine.createBranch(detached.id,'from-detached',detached.revision);
  assert.equal(created.branch,'from-detached');assert.equal(created.head,detached.head);assert.deepEqual(created.history,detached.history);
});
Then('creating a branch preserves working changes and both Git histories',async function(){
  let s=await fixture(this);s=await this.engine.commit(s.id,'Source',author,s.revision);
  s=await this.engine.write(s.id,'main.ts','staged',s.revision);await git.add({...source(this,s.id),filepath:'main.ts'});
  s=await this.engine.write(s.id,'main.ts','working draft',s.revision);
  s=await this.engine.createFile(s.id,'untracked.txt','keep',s.revision);
  s=await this.engine.undo(s.id,s.revision);
  const before=s,context=source(this,s.id),index=await readFile(join(context.dir,'.git/index'));
  s=await this.engine.createBranch(s.id,'feature/editor',s.revision);
  assert.equal(s.branch,'feature/editor');assert.deepEqual(s.branches,['feature/editor','main']);assert.equal(s.head,before.head);
  assert.deepEqual(s.history,before.history);assert.deepEqual(s.commits,before.commits);assert.equal(s.canRedo,true);
  assert.equal(await this.engine.read(s.id,'main.ts'),'working draft');assert.deepEqual(await readFile(join(context.dir,'.git/index')),index);
  assert.equal(await git.resolveRef({...context,ref:'refs/heads/main'}),before.head);
  assert.equal((await this.engine.createBranch(s.id,'feature/editor',before.revision)).revision,s.revision);
  const noop=await this.engine.switchBranch(s.id,'feature/editor',s.revision);assert.deepEqual(noop,s);
});
Then('switching branches records reversible working snapshots independently of source refs',async function(){
  const original=new Uint8Array([0,255,1]),changed=new Uint8Array([0,128,44]);
  let s=await fixture(this,[input('main.ts','main'),input('image.bin',original),input('run.sh','run'),input('swap/child','nested'),input('removed.txt','remove'),input('.gitignore','ignored.txt\n')]);
  s=await this.engine.commit(s.id,'Main',author,s.revision);const main=s.head;
  s=await this.engine.createBranch(s.id,'topic',s.revision);
  const dir=repositoryPaths(s.id,this.root).dir;
  await writeFile(join(dir,'image.bin'),changed);await fs.promises.chmod(join(dir,'run.sh'),0o755);
  s=await this.engine.write(s.id,'main.ts','topic',s.revision);
  s=await this.engine.remove(s.id,'swap',s.revision);s=await this.engine.createFile(s.id,'swap','file replaces directory',s.revision);
  s=await this.engine.remove(s.id,'removed.txt',s.revision);s=await this.engine.commit(s.id,'Topic',author,s.revision);const topic=s.head;
  s=await this.engine.switchBranch(s.id,'main',s.revision);
  s=await this.engine.createFile(s.id,'untracked/keep.txt','local draft',s.revision);s=await this.engine.createFile(s.id,'ignored.txt','local ignored',s.revision);
  const before=s;
  s=await this.engine.switchBranch(s.id,'topic',s.revision);
  assert.equal(s.branch,'topic');assert.equal(s.head,topic);assert.deepEqual(s.history,[]);
  assert.deepEqual((await git.readCommit({fs:this.fs,gitdir:repositoryPaths(s.id,this.root).historyGitdir,oid:s.historyHead})).commit.parent,[before.historyHead]);
  assert.deepEqual(new Uint8Array(await readFile(join(dir,'image.bin'))),changed);assert.equal((await lstat(join(dir,'run.sh'))).mode&0o777,0o755);
  assert.equal(await this.engine.read(s.id,'swap'),'file replaces directory');assert.ok(!s.files.includes('removed.txt'));
  assert.equal(await this.engine.read(s.id,'untracked/keep.txt'),'local draft');assert.equal(await this.engine.read(s.id,'ignored.txt'),'local ignored');
  assert.deepEqual((await git.statusMatrix(source(this,s.id))).filter(row=>row[1]||row[3]).map(row=>row.slice(1)),Array(5).fill([1,1,1]));
  assert.equal(await git.resolveRef({...source(this,s.id),ref:'refs/heads/main'}),main);
  const ordinary=await contents(join(dir,'.git'));
  s=await this.engine.undo(s.id,s.revision);assert.equal(s.branch,'topic');assert.equal(s.head,topic);assert.equal(await this.engine.read(s.id,'main.ts'),'main');
  assert.deepEqual(new Uint8Array(await readFile(join(dir,'image.bin'))),original);assert.equal((await lstat(join(dir,'run.sh'))).mode&0o777,0o644);assert.ok(s.files.includes('swap/child'));
  assert.deepEqual(await contents(join(dir,'.git')),ordinary);
  this.engine=this.open();s=await this.engine.open(s.id);s=await this.engine.redo(s.id,s.revision);
  assert.equal(await this.engine.read(s.id,'main.ts'),'topic');assert.deepEqual(await contents(join(dir,'.git')),ordinary);
});
Then('invalid branch operations preserve repository state',async function(){
  let s=await fixture(this);
  await assert.rejects(this.engine.createBranch(s.id,'topic',s.revision),/ordinary Git commit/);assert.equal(this.journals.size,0);assert.deepEqual(await this.engine.open(s.id),s);
  s=await this.engine.commit(s.id,'Source',author,s.revision);
  const before=await contents(repositoryPaths(s.id,this.root).dir);
  for(const name of ['', 'HEAD','@','-option','bad..name','bad name','topic./child','.hidden','topic.lock/child','trailing/','/leading','double//slash','bad@{name','bad\\name','bad\nname',7]) {
    await assert.rejects(async()=>this.engine.createBranch(s.id,name,s.revision),/valid Git branch/);
    assert.equal(this.journals.size,0);assert.deepEqual(await this.engine.open(s.id),s);
  }
  await assert.rejects(this.engine.createBranch(s.id,'main',s.revision),/already exists/);
  await assert.rejects(this.engine.createBranch(s.id,'main/child',s.revision),/conflicts/);
  await assert.rejects(this.engine.switchBranch(s.id,'absent',s.revision),/Branch not found/);
  assert.deepEqual(await contents(repositoryPaths(s.id,this.root).dir),before);assert.equal(this.journals.size,0);
  s=await this.engine.createBranch(s.id,'nested/child',s.revision);
  await assert.rejects(this.engine.createBranch(s.id,'nested',s.revision),/conflicts/);
});
Then('branch requests enforce revisions and exact retries',async function(){
  const {state:base}=await branchFixture(this);
  let s=await this.engine.createBranch(base.id,'new',base.revision);
  assert.equal((await this.engine.createBranch(base.id,'new',base.revision)).revision,s.revision);
  await assert.rejects(this.engine.createBranch(s.id,'other',base.revision),/another tab/);
  await assert.rejects(this.engine.switchBranch(s.id,'topic',base.revision),/another tab/);
  const before=s;s=await this.engine.switchBranch(s.id,'topic',s.revision);
  assert.equal((await this.engine.switchBranch(s.id,'topic',before.revision)).revision,s.revision);
  await assert.rejects(this.engine.switchBranch(s.id,'main',before.revision),/another tab/);
  assert.equal(await this.engine.read(s.id,'main.ts'),'topic content');
});
Then('branch checkout automatically restores {string} without altering source commits',async function(change){
  let {state:s,topic}=await branchFixture(this);const context=source(this,s.id),path=join(context.dir,'main.ts');
  if(change==='working text')await writeFile(path,'dirty');
  if(change==='working mode')await fs.promises.chmod(path,0o755);
  if(change==='tracked deletion')await fs.promises.unlink(path);
  if(change==='staged text')await git.updateIndex({...context,filepath:'main.ts',oid:await git.writeBlob({...context,blob:new TextEncoder().encode('staged')}),mode:0o100644});
  if(change==='staged mode')await git.updateIndex({...context,filepath:'main.ts',oid:(await git.hashBlob({object:'initial'})).oid,mode:0o100755});
  if(change==='staged addition'){await writeFile(join(context.dir,'new.txt'),'staged');await git.add({...context,filepath:'new.txt'});}
  if(change==='staged deletion')await git.remove({...context,filepath:'main.ts'});
  const gitdir=repositoryPaths(s.id,this.root).gitdir;
  const before=(await contents(context.dir)).filter(file=>!file.path.startsWith('.git/'));
  const staged=await indexFiles(context),refs=await contents(join(gitdir,'refs'));
  for(const kind of ['branch','commit']){
    s=kind==='branch'?await this.engine.switchBranch(s.id,'topic',s.revision):await this.engine.checkoutCommit(s.id,topic,s.revision);
    assert.equal(await this.engine.read(s.id,'main.ts'),'topic content');
    assert.ok((await this.engine.gitStatus(s.id)).files.every(file=>file.head===file.stage&&file.work===file.stage));
    this.engine=this.open();s=await this.engine.open(s.id);s=await this.engine.switchBranch(s.id,'main',s.revision);
    assert.deepEqual((await contents(context.dir)).filter(file=>!file.path.startsWith('.git/')),before);
    assert.deepEqual(await indexFiles(context),staged);
    assert.deepEqual(await contents(join(gitdir,'refs')),refs);assert.equal(this.journals.size,0);
  }
  if(change==='working mode')assert.equal((await lstat(path)).mode&0o777,0o755);
});
Then('branch checkout automatically restores a {string} collision',async function(collision){
  let s=await fixture(this,[input('main.ts','initial'),input('.gitignore','blocked\n')]);s=await this.engine.commit(s.id,'Main',author,s.revision);
  s=await this.engine.createBranch(s.id,'topic',s.revision);
  const target=collision==='parent file'?'blocked/child':'blocked';s=await this.engine.createFile(s.id,target,'tracked target',s.revision);
  // Force the ignored target into the source index for the ignored-file case.
  if(collision==='ignored path')await git.add({...source(this,s.id),filepath:target,force:true});
  else {s=await this.engine.write(s.id,'.gitignore','',s.revision);}
  s=await this.engine.commit(s.id,'Topic',author,s.revision);const topic=s.head;s=await this.engine.switchBranch(s.id,'main',s.revision);
  const local=collision==='child file'?'blocked/child':'blocked';s=await this.engine.createFile(s.id,local,'local precious data',s.revision);
  for(const kind of ['branch','commit']){
    s=kind==='branch'?await this.engine.switchBranch(s.id,'topic',s.revision):await this.engine.checkoutCommit(s.id,topic,s.revision);
    assert.equal(await this.engine.read(s.id,target),'tracked target');
    this.engine=this.open();s=await this.engine.open(s.id);s=await this.engine.switchBranch(s.id,'main',s.revision);
    assert.equal(await this.engine.read(s.id,local),'local precious data');assert.equal(this.journals.size,0);
  }
});
Then('automatic checkout stashes preserve partial staging binary files modes and same-commit branches',async function(){
  let {state:s,main,topic}=await branchFixture(this);const context=source(this,s.id);
  s=await this.engine.write(s.id,'main.ts','main staged',s.revision);
  s=await this.engine.gitAction(s.id,{kind:'stage',paths:['main.ts']},s.revision);
  s=await this.engine.write(s.id,'main.ts','main unstaged',s.revision);
  const binary=new Uint8Array([0,255,9]);await writeFile(join(context.dir,'local.bin'),binary);await fs.promises.chmod(join(context.dir,'local.bin'),0o755);
  await git.add({...context,filepath:'local.bin'});
  s=await this.engine.createBranch(s.id,'same-commit',s.revision);s=await this.engine.switchBranch(s.id,'main',s.revision);
  assert.equal(await this.engine.read(s.id,'main.ts'),'main unstaged');
  assert.equal((await this.engine.gitDiff(s.id,{kind:'staged',path:'main.ts'})).after,'main staged');
  s=await this.engine.checkoutCommit(s.id,topic,s.revision);assert.ok(!s.files.includes('local.bin'));
  s=await this.engine.write(s.id,'main.ts','topic staged',s.revision);s=await this.engine.gitAction(s.id,{kind:'stage'},s.revision);
  s=await this.engine.write(s.id,'main.ts','topic unstaged',s.revision);
  for(let cycle=0;cycle<2;cycle++){
    this.engine=this.open();s=await this.engine.open(s.id);s=await this.engine.switchBranch(s.id,'main',s.revision);
    assert.equal(s.head,main);assert.equal(await this.engine.read(s.id,'main.ts'),'main unstaged');
    assert.equal((await this.engine.gitDiff(s.id,{kind:'staged',path:'main.ts'})).after,'main staged');
    assert.deepEqual(new Uint8Array(await readFile(join(context.dir,'local.bin'))),binary);assert.equal((await lstat(join(context.dir,'local.bin'))).mode&0o777,0o755);
    assert.equal((await this.engine.gitStatus(s.id)).files.find(file=>file.path==='local.bin').head,0);
    s=await this.engine.checkoutCommit(s.id,topic,s.revision);
    assert.equal(await this.engine.read(s.id,'main.ts'),'topic unstaged');assert.equal((await this.engine.gitDiff(s.id,{kind:'staged',path:'main.ts'})).after,'topic staged');
  }
  assert.equal(await git.resolveRef({...context,ref:'refs/heads/main'}),main);assert.equal(await git.resolveRef({...context,ref:'refs/heads/topic'}),topic);
  assert.deepEqual((await this.engine.gitStatus(s.id)).stashes,[]);
});
Then('an automatic stash {string} recovers at {string}',async function(operation,stage){
  let {state:s,topic}=await branchFixture(this);
  s=await this.engine.write(s.id,'main.ts','main staged',s.revision);s=await this.engine.gitAction(s.id,{kind:'stage'},s.revision);
  s=await this.engine.write(s.id,'main.ts','main unstaged',s.revision);
  if(operation==='return'){
    s=await this.engine.checkoutCommit(s.id,topic,s.revision);s=await this.engine.write(s.id,'main.ts','topic draft',s.revision);
  }
  const expected=s.revision,id=s.id;
  const invoke=()=>operation==='return'?this.engine.switchBranch(id,'main',expected):this.engine.checkoutCommit(id,topic,expected);
  this.failAt=stage;await assert.rejects(invoke(),/interrupted/);
  this.engine=this.open();s=await this.engine.open(id);assert.equal(this.journals.size,0);
  assert.equal((await invoke()).revision,s.revision);
  if(operation==='return'){
    assert.equal(await this.engine.read(id,'main.ts'),'main unstaged');assert.equal((await this.engine.gitDiff(id,{path:'main.ts',kind:'staged'})).after,'main staged');
    s=await this.engine.checkoutCommit(id,topic,s.revision);assert.equal(await this.engine.read(id,'main.ts'),'topic draft');
  }else{
    assert.equal(await this.engine.read(id,'main.ts'),'topic content');s=await this.engine.switchBranch(id,'main',s.revision);
    assert.equal(await this.engine.read(id,'main.ts'),'main unstaged');assert.equal((await this.engine.gitDiff(id,{path:'main.ts',kind:'staged'})).after,'main staged');
  }
});
Then('a detached automatic-stash base remains visible and restores its edits',async function(){
  let {state:s,topic}=await branchFixture(this);
  s=await this.engine.checkoutCommit(s.id,topic,s.revision);s=await this.engine.write(s.id,'main.ts','detached commit',s.revision);
  s=await this.engine.commit(s.id,'Detached source',author,s.revision);const detached=s.head;
  s=await this.engine.write(s.id,'main.ts','detached draft',s.revision);s=await this.engine.switchBranch(s.id,'main',s.revision);
  assert.ok(s.commits.some(commit=>commit.oid===detached));this.engine=this.open();s=await this.engine.open(s.id);
  s=await this.engine.checkoutCommit(s.id,detached,s.revision);assert.equal(s.branch,null);assert.equal(await this.engine.read(s.id,'main.ts'),'detached draft');
});
Then('an automatic stash with a missing {string} leaves checkout untouched',async function(snapshot){
  let {state:s,main}=await branchFixture(this);
  s=await this.engine.write(s.id,'main.ts','saved draft',s.revision);s=await this.engine.switchBranch(s.id,'topic',s.revision);
  const oid=this.records.get(s.id).autoStashes[main][snapshot],paths=repositoryPaths(s.id,this.root);
  await fs.promises.unlink(join(paths.historyGitdir,'objects',oid.slice(0,2),oid.slice(2)));
  const before=await contents(paths.dir),record=structuredClone(this.records.get(s.id));
  await assert.rejects(this.engine.switchBranch(s.id,'main',s.revision),/Could not find|not found/i);
  assert.deepEqual(await contents(paths.dir),before);assert.deepEqual(this.records.get(s.id),record);assert.equal(this.journals.size,0);
});
Then('an automatic stash flush failure preserves the current checkout for retry',async function(){
  let {state:s}=await branchFixture(this);
  s=await this.engine.write(s.id,'main.ts','saved draft',s.revision);s=await this.engine.gitAction(s.id,{kind:'stage'},s.revision);
  const before=await contents(repositoryPaths(s.id,this.root).dir),record=structuredClone(this.records.get(s.id));
  this.flushFailure=true;await assert.rejects(this.engine.switchBranch(s.id,'topic',s.revision),/quota exhausted/);
  assert.deepEqual(await contents(repositoryPaths(s.id,this.root).dir),before);assert.deepEqual(this.records.get(s.id),record);assert.equal(this.journals.size,0);
  s=await this.engine.switchBranch(s.id,'topic',s.revision);s=await this.engine.switchBranch(s.id,'main',s.revision);
  assert.equal(await this.engine.read(s.id,'main.ts'),'saved draft');assert.equal((await this.engine.gitDiff(s.id,{kind:'staged',path:'main.ts'})).after,'saved draft');
});
Then('an interrupted branch {string} at {string} recovers exactly once',async function(operation,stage){
  const fixture=await branchFixture(this),{main,topic}=fixture;
  let s=fixture.state;if(operation==='return')s=await this.engine.checkoutCommit(s.id,topic,s.revision);
  const base=s.revision;
  const privateGit={fs:this.fs,gitdir:repositoryPaths(s.id,this.root).historyGitdir};
  const privateCount=(await git.log({...privateGit,ref:s.historyHead})).length;
  const invoke=()=>operation==='create'?this.engine.createBranch(s.id,'created',base):operation==='commit'?this.engine.checkoutCommit(s.id,topic,base):this.engine.switchBranch(s.id,operation==='return'?'main':'topic',base);
  this.failAt=stage;await assert.rejects(invoke(),/interrupted/);
  if(stage!=='finalized')await assert.rejects(this.engine.read(s.id,'main.ts'),/incomplete/);
  this.engine=this.open();const recovered=await this.engine.open(s.id);assert.equal(this.journals.size,0);
  assert.equal((await invoke()).revision,recovered.revision);assert.equal(recovered.branch,operation==='create'?'created':operation==='commit'?null:operation==='return'?'main':'topic');
  assert.equal(recovered.head,operation==='create'||operation==='return'?main:topic);
  assert.deepEqual(recovered.history,operation==='create'||operation==='return'?fixture.state.history:[]);
  assert.equal((await git.log({...privateGit,ref:recovered.historyHead})).length,privateCount+(operation==='create'?0:1));
  assert.equal(await this.engine.read(s.id,'main.ts'),operation==='create'||operation==='return'?'initial':'topic content');
  assert.equal(await git.resolveRef({...source(this,s.id),ref:'refs/heads/main'}),main);assert.equal(await git.resolveRef({...source(this,s.id),ref:'refs/heads/topic'}),topic);
  assert.deepEqual((await git.statusMatrix(source(this,s.id)))[0].slice(1),[1,1,1]);
});
Then('pending branch recovery rejects {string} at {string}',async function(change,stage){
  const {state:s,main,topic}=await branchFixture(this),context=source(this,s.id);
  this.failAt=stage;await assert.rejects(this.engine.switchBranch(s.id,'topic',s.revision),/interrupted/);
  if(change==='symbolic HEAD'){await git.writeRef({...context,ref:'refs/heads/other',value:main});await git.writeRef({...context,ref:'HEAD',value:'refs/heads/other',symbolic:true,force:true});}
  if(change==='source ref')await git.writeRef({...context,ref:'refs/heads/main',value:topic,force:true});
  if(change==='target ref')await git.writeRef({...context,ref:'refs/heads/topic',value:main,force:true});
  if(change==='removed target')await git.deleteRef({...context,ref:'refs/heads/topic'});
  if(change==='missing target object')await fs.promises.unlink(join(context.dir,'.git/objects',topic.slice(0,2),topic.slice(2)));
  const before=await contents(context.dir),record=structuredClone(this.records.get(s.id));
  await assert.rejects(this.open().open(s.id),change==='missing target object'?/Could not find/:/source repository changed/);
  assert.deepEqual(await contents(context.dir),before);assert.deepEqual(this.records.get(s.id),record);assert.equal(this.journals.size,1);
});
Then('branch checkout retains divergent editor history',async function(){
  const {state:base}=await branchFixture(this);let s=await this.engine.write(base.id,'main.ts','abandoned draft',base.revision);
  const future=this.records.get(s.id).current;s=await this.engine.undo(s.id,s.revision);assert.equal(s.canRedo,true);
  s=await this.engine.switchBranch(s.id,'topic',s.revision);assert.equal(s.canRedo,false);assert.deepEqual(s.history,[]);
  assert.equal(await git.resolveRef({fs:this.fs,gitdir:repositoryPaths(s.id,this.root).historyGitdir,ref:`refs/editor/futures/${future}`}),future);
  s=await this.engine.undo(s.id,s.revision);assert.equal(await this.engine.read(s.id,'main.ts'),'initial');assert.equal(s.branch,'topic');
  s=await this.engine.redo(s.id,s.revision);s=await this.engine.switchBranch(s.id,'main',s.revision);
  assert.ok(s.history.some(version=>version.oid===future));
});
Then('repository import rejects {string}',async function(kind){
  if(kind==='invalid name') {for(const name of ['', ' ', 'x'.repeat(201),'bad\nname',7])await assert.rejects(this.engine.create(name),/repository name/);return;}
  let files;
  if(kind==='duplicate files')files=[input('a','x'),input('a','y')];
  else if(kind==='file blocks directory')files=[input('a','x'),input('a/b','y')];
  else if(kind==='missing Git HEAD')files=[input('.git/config','[core]\nbare=false')];
  else if(kind.endsWith('tree')){
    const s=await fixture(this);const context=source(this,s.id);
    const oid=await git.writeBlob({...context,blob:new TextEncoder().encode('target')});
    const tree=await git.writeTree({...context,tree:[{path:'special',mode:kind==='submodule tree'?'160000':'120000',type:kind==='submodule tree'?'commit':'blob',oid}]});
    const who={...author,timestamp:100,timezoneOffset:0};
    const commit=await git.writeCommit({...context,commit:{tree,parent:[],message:'Special file',author:who,committer:who}});
    await git.writeRef({...context,ref:'refs/heads/main',value:commit});files=await contents(context.dir);
  } else {const special={'shallow Git':'shallow','linked Git':'commondir','alternate Git objects':'objects/info/alternates'}[kind];files=[input('.git/HEAD','ref: refs/heads/main\n'),input(`.git/${special}`,'outside')];}
  const count=(await this.engine.list()).length;
  await assert.rejects(this.engine.create('Invalid import',files));assert.equal((await this.engine.list()).length,count);
});
Then('an interrupted {string} at {string} recovers exactly once',async function(operation,stage){
  let s=await fixture(this);const base=s.revision;this.failAt=stage;
  const invoke=()=>operation==='write'?this.engine.write(s.id,'main.ts','persisted',base):this.engine.commit(s.id,'Explicit',author,base);
  await assert.rejects(invoke(),/interrupted/);
  if(stage!=='finalized')await assert.rejects(this.engine.read(s.id,'main.ts'),/incomplete/);
  this.engine=this.open();const recovered=await this.engine.open(s.id);assert.equal(this.journals.size,0);
  const retried=await invoke();assert.equal(retried.revision,recovered.revision);
  assert.equal(retried.history.length,operation==='write'?1:0);assert.equal(retried.commits.length,operation==='commit'?1:0);
  assert.equal((await git.log({fs:this.fs,gitdir:repositoryPaths(s.id,this.root).historyGitdir,ref:retried.historyHead})).length,operation==='write'?2:1);
  assert.equal(await this.engine.read(s.id,'main.ts'),operation==='write'?'persisted':'initial');
});
Then('a pending repository creation can be reopened',async function(){
  this.failAt='prepared';await assert.rejects(this.engine.create('Interrupted',[input('a','kept')]),/interrupted/);
  const listed=await this.engine.list();assert.equal(listed.length,1);this.engine=this.open();const recovered=await this.engine.open(listed[0].id);
  assert.equal(recovered.name,'Interrupted');assert.equal(await this.engine.read(recovered.id,'a'),'kept');assert.equal(this.journals.size,0);
});
Then('recovery rejects a conflicting metadata journal',async function(){
  const s=await fixture(this);this.failAt='prepared';await assert.rejects(this.engine.write(s.id,'main.ts','pending',s.revision));
  this.records.get(s.id).revision='newer';await assert.rejects(this.engine.open(s.id),/conflicts/);assert.equal(this.journals.size,1);
});
Then('recovery rejects a conflicting source head',async function(){
  let s=await fixture(this);s=await this.engine.commit(s.id,'Base',author,s.revision);
  s=await this.engine.write(s.id,'main.ts','pending',s.revision);this.failAt='prepared';await assert.rejects(this.engine.commit(s.id,'Pending',author,s.revision));
  const base=await git.readCommit({...source(this,s.id),oid:s.head});
  const oid=await git.writeCommit({...source(this,s.id),commit:{...base.commit,parent:[s.head],message:'External newer commit'}});
  await git.writeRef({...source(this,s.id),ref:'refs/heads/main',value:oid,force:true});
  await assert.rejects(this.engine.open(s.id),/source repository changed/);assert.equal(await git.resolveRef({...source(this,s.id),ref:'HEAD'}),oid);
});
Then('failed storage preparation can be retried safely',async function(){
  const s=await fixture(this);this.flushFailure=true;await assert.rejects(this.engine.write(s.id,'main.ts','next',s.revision),/quota/);
  assert.equal(this.journals.size,0);assert.equal((await this.engine.open(s.id)).revision,s.revision);assert.equal(await this.engine.read(s.id,'main.ts'),'initial');
  const next=await this.engine.write(s.id,'main.ts','next',s.revision);assert.equal(next.history.length,1);
  assert.deepEqual(next.history[0].parents,[s.historyHead]);
});
Then('repository filesystem failures are surfaced without fallback storage',async function(){
  const original=this.fs.promises.lstat;
  this.fs.promises.lstat=async()=>{throw Object.assign(Error('permission denied'),{code:'EACCES'});};
  await assert.rejects(this.engine.list(),/permission denied/);
  this.fs.promises.lstat=original;assert.deepEqual(await this.engine.list(),[]);
  const s=await fixture(this);const directory=repositoryPaths(s.id,this.root).gitdir;
  const read = this.fs.promises.readFile;
  this.fs.promises.readFile = async (path, ...args) => { if(path === join(directory,'HEAD')) throw Object.assign(Error('HEAD unreadable'),{code:'EACCES'}); return read(path,...args); };
  await assert.rejects(this.engine.open(s.id),/HEAD/);
});
Then('externally introduced links are rejected without being followed',async function(){
  const s=await fixture(this);const link=join(repositoryPaths(s.id,this.root).dir,'unsafe');await symlink('/outside-scope',link);
  await assert.rejects(this.engine.open(s.id),/Symbolic links/);assert.equal((await lstat(link)).isSymbolicLink(),true);
});
Then('source commits preserve ignores and tracked deletions',async function(){
  let s=await fixture(this,[input('.gitignore','ignored.txt\n'),input('ignored.txt','private'),input('tracked.txt','tracked')]);
  s=await this.engine.commit(s.id,'Initial',author,s.revision);assert.deepEqual((await git.readTree({...source(this,s.id),oid:s.head})).tree.map(t=>t.path).sort(),['.gitignore','tracked.txt']);
  s=await this.engine.write(s.id,'ignored.txt','changed but ignored',s.revision);assert.equal(s.history.length,1);
  s=await this.engine.remove(s.id,'tracked.txt',s.revision);s=await this.engine.commit(s.id,'Delete tracked file',author,s.revision);
  assert.deepEqual(await git.listFiles(source(this,s.id)),['.gitignore']);
  s=await this.engine.undo(s.id,s.revision);assert.equal(await this.engine.read(s.id,'tracked.txt'),'tracked');assert.equal(s.commits[0].message,'Delete tracked file');
});
Then('invalid source commits leave both histories intact',async function(){
  let s=await fixture(this);
  for(const [message,who] of [['',author],['x',{name:'',email:'a'}],['x',{name:'a',email:''}],['x',{name:'bad\nname',email:'a'}]])await assert.rejects(async()=>this.engine.commit(s.id,message,who,s.revision),/commit needs/);
  s=await this.engine.commit(s.id,'First',author,s.revision);await assert.rejects(this.engine.commit(s.id,'No change',author,s.revision),/no changes/);
  assert.equal((await this.engine.open(s.id)).commits.length,1);
});
Then('detached repositories commit without inventing a branch',async function(){
  let s=await fixture(this);s=await this.engine.commit(s.id,'Initial',author,s.revision);const initial=s.head;
  await git.writeRef({...source(this,s.id),ref:'HEAD',value:initial,force:true});s=await this.engine.open(s.id);assert.equal(s.branch,null);
  s=await this.engine.write(s.id,'main.ts','detached edit',s.revision);s=await this.engine.commit(s.id,'Detached',author,s.revision);assert.equal(s.branch,null);assert.notEqual(s.head,initial);
  assert.equal(await git.resolveRef({...source(this,s.id),ref:'refs/heads/main'}),initial);
});
Then('repository preferences persist independently of working files',async function(){
  const s=await fixture(this);assert.equal(await this.engine.loadPreferences(),undefined);
  const value={global:{fontSize:16}};await this.engine.savePreferences(value);value.global.fontSize=30;
  assert.deepEqual(await this.open().loadPreferences(),{global:{fontSize:16}});assert.equal((await this.engine.open(s.id)).revision,s.revision);
});
Then('repository import preserves executable modes and working deletions',async function(){
  let s=await fixture(this,[input('run.sh','#!/bin/sh\necho one\n'),input('removed.txt','tracked')]);
  await fs.promises.chmod(join(repositoryPaths(s.id,this.root).dir,'run.sh'),0o755);
  s=await this.engine.write(s.id,'run.sh','#!/bin/sh\necho two\n',s.revision);
  s=await this.engine.commit(s.id,'Executable',author,s.revision);
  s=await this.engine.remove(s.id,'removed.txt',s.revision);
  const imported=await this.engine.create('Executable import',await contents(repositoryPaths(s.id,this.root).dir));
  const mode=(await lstat(join(repositoryPaths(imported.id,this.root).dir,'run.sh'))).mode&0o777;
  assert.equal(mode,0o755);assert.ok(!imported.files.includes('removed.txt'));
  let next=await this.engine.write(imported.id,'run.sh','#!/bin/sh\necho three\n',imported.revision);
  next=await this.engine.undo(next.id,next.revision);
  assert.equal((await lstat(join(repositoryPaths(next.id,this.root).dir,'run.sh'))).mode&0o777,0o755);
  await assert.rejects(this.engine.createFile(next.id,'run.sh/nested','conflict',next.revision),/blocks/);
  next=await this.engine.createFile(next.id,'folder/child','content',next.revision);
  await assert.rejects(this.engine.createFile(next.id,'folder','conflict',next.revision),/Duplicate/);
});
Then('an unborn Git directory imports without fabricated source commits',async function(){
  const s=await fixture(this);const imported=await this.engine.create('Unborn',await contents(repositoryPaths(s.id,this.root).dir));
  assert.equal(imported.head,null);assert.equal(imported.branch,'main');assert.equal(imported.commits.length,0);
});
Then('the default repository paths work inside an isolated filesystem',async function(){
  const adapter={promises:{}};
  for(const name of ['readFile','writeFile','lstat','mkdir','rmdir','unlink','readdir','chmod'])adapter.promises[name]=(path,...args)=>fs.promises[name](join(this.root,path),...args);
  const {root,...options}=this.options;
  const engine=createRepositoryEngine({...options,fs:adapter});
  assert.deepEqual(await engine.list(),[]);assert.ok((await lstat(join(root,'repositories'))).isDirectory());
});
Then('circular source references are surfaced',async function(){
  const s=await fixture(this);const gitdir=repositoryPaths(s.id,this.root).gitdir;
  await writeFile(join(gitdir,'HEAD'),'ref: refs/heads/main\n');await writeFile(join(gitdir,'refs/heads/main'),'ref: refs/heads/main\n');
  await assert.rejects(this.engine.open(s.id),/Circular reference/);
});
Then('malformed import payload {string} is rejected',async function(kind){
  let files;
  if(kind==='invalid bytes')files=[{path:'a',data:'not bytes'}];
  else if(kind==='invalid HEAD')files=[input('.git/HEAD','ref: refs/heads/../escape')];
  else if(kind==='missing detached object')files=[input('.git/HEAD','a'.repeat(40))];
  else files=[input('.git/HEAD','ref: refs/heads/main\n'),input('.git/index','not a Git index')];
  await assert.rejects(this.engine.create('Malformed',files));assert.deepEqual(await this.engine.list(),[]);
});

Then('committed file baselines ignore working edits and preserve repository state',async function(){
  let state=await this.engine.create('Committed baseline',[input('main.js','first\nsecond\n')]);
  assert.equal(await this.engine.readCommitted(state.id,'main.js',null),null);
  state=await this.engine.commit(state.id,'Baseline',author,state.revision);const first=state.head;
  state=await this.engine.write(state.id,'main.js','changed\nsecond\n',state.revision);
  const before=await this.engine.open(state.id);
  assert.equal(await this.engine.readCommitted(state.id,'main.js',first),'first\nsecond\n');
  assert.equal(await this.engine.readCommitted(state.id,'new.js',first),null);
  assert.deepEqual(await this.engine.open(state.id),before);
  state=await this.engine.commit(state.id,'Second baseline',author,state.revision);
  assert.equal(await this.engine.readCommitted(state.id,'main.js',state.head),'changed\nsecond\n');
  assert.equal(await this.engine.readCommitted(state.id,'main.js',first),'first\nsecond\n');
});

Then('history navigation avoids unchanged file IO and repeated graph reads',async function(){
  let state=await fixture(this,[input('main.ts','initial'),input('untouched/nested.bin',new Uint8Array([0,255,128]))]);
  const paths=repositoryPaths(state.id,this.root),context={fs:this.fs,gitdir:paths.historyGitdir};
  state=await this.engine.write(state.id,'main.ts','first',state.revision);const first=state.historyHead;
  state=await this.engine.write(state.id,'main.ts','second',state.revision);
  state=await this.engine.write(state.id,'main.ts','third',state.revision);
  const tree=(await git.readTree({...context,oid:(await git.readCommit({...context,oid:state.historyHead})).commit.tree})).tree;
  const untouched=tree.find(entry=>entry.path==='untouched').oid;
  const blob=(await git.readTree({...context,oid:untouched})).tree[0].oid;
  const object=oid=>`${paths.historyGitdir}/objects/${oid.slice(0,2)}/${oid.slice(2)}`;
  const original={...this.fs.promises},reads=[],writes=[];
  this.fs.promises.readFile=async(path,...args)=>{reads.push(String(path));return original.readFile(path,...args);};
  this.fs.promises.writeFile=async(path,...args)=>{writes.push(path);return original.writeFile(path,...args);};
  try{
    const graph=structuredClone(state.history);
    for(const direction of ['undo','redo']){
      reads.length=0;writes.length=0;
      state=await this.engine[direction](state.id,state.revision);
      assert.deepEqual(writes.filter(path=>path.startsWith(`${paths.dir}/`)&&!path.startsWith(`${paths.gitdir}/`)),[`${paths.dir}/main.ts`]);
      assert.deepEqual(reads.filter(path=>path.startsWith(`${paths.dir}/`)&&!path.startsWith(`${paths.gitdir}/`)),[]);
      for(const oid of [first,untouched,blob])assert.ok(!reads.includes(object(oid)),`unchanged object ${oid} was reread`);
      assert.deepEqual(state.history,graph);
      state.history[0].changes[0].after.push({from:999,to:999});
      state=await this.engine.open(state.id);assert.deepEqual(state.history,graph);
    }
    assert.equal(await this.engine.read(state.id,'main.ts'),'third');
  }finally{Object.assign(this.fs.promises,original);}
});

Then('an incremental {string} patch recovers after writing its first target file',async function(direction){
  let state=await fixture(this,[input('swap/run.sh','#!/bin/sh\n'),input('swap/data.bin',new Uint8Array([0,255,128])),input('stable.txt','stable')]);
  const paths=repositoryPaths(state.id,this.root);
  await fs.promises.chmod(`${paths.dir}/swap/run.sh`,0o755);
  state=await this.engine.write(state.id,'stable.txt','changed',state.revision);const directoryVersion=state.historyHead;
  state=await this.engine.remove(state.id,'swap',state.revision);
  state=await this.engine.createFile(state.id,'swap','a file replaces a directory',state.revision);const fileVersion=state.historyHead;
  state=await this.engine.selectHistory(state.id,directoryVersion,state.revision);
  if(direction==='redo')state=await this.engine.undo(state.id,state.revision);
  const write=this.fs.promises.writeFile;let interrupted=false;
  this.fs.promises.writeFile=async(path,...args)=>{
    const result=await write(path,...args);
    if(!interrupted&&(path===`${paths.dir}/swap`||path.startsWith(`${paths.dir}/swap/`))){interrupted=true;throw Error('interrupted patch');}
    return result;
  };
  try{await assert.rejects(this.engine[direction](state.id,state.revision),/interrupted patch/);}
  finally{this.fs.promises.writeFile=write;}
  assert.equal(interrupted,true);assert.ok(this.journals.get(state.id).filesBefore);
  this.engine=this.open();state=await this.engine.open(state.id);
  assert.equal(this.journals.size,0);assert.equal(state.historyHead,direction==='undo'?fileVersion:directoryVersion);
  if(direction==='undo')assert.equal(await this.engine.read(state.id,'swap'),'a file replaces a directory');
  else{
    assert.deepEqual(new Uint8Array(await readFile(`${paths.dir}/swap/data.bin`)),new Uint8Array([0,255,128]));
    assert.equal((await lstat(`${paths.dir}/swap/run.sh`)).mode&0o111,0o111);
  }
  assert.equal(await this.engine.read(state.id,'stable.txt'),'changed');
  assert.deepEqual(await this.engine.open(state.id),state);
});

Then('a direct repository read touches only its requested file and rejects linked ancestors',async function(){
  const state=await fixture(this,[input('nested/main.ts','requested'),input('other.bin',new Uint8Array([0,255]))]);
  const paths=repositoryPaths(state.id,this.root),read=this.fs.promises.readFile,reads=[];
  this.fs.promises.readFile=async(path,...args)=>{reads.push(path);return read(path,...args);};
  try{assert.equal(await this.engine.read(state.id,'nested/main.ts'),'requested');}
  finally{this.fs.promises.readFile=read;}
  assert.deepEqual(reads,[`${paths.dir}/nested/main.ts`]);
  await assert.rejects(this.engine.read(state.id,'missing/main.ts'),/File not found/);
  await assert.rejects(this.engine.read(state.id,'nested'),/File not found/);
  await assert.rejects(this.engine.read(state.id,'nested/main.ts/child'),/File not found/);
  await symlink(`${paths.dir}/nested`,`${paths.dir}/linked`);
  await assert.rejects(this.engine.read(state.id,'linked/main.ts'),/Symbolic links/);
  await symlink(`${paths.dir}/nested/main.ts`,`${paths.dir}/link.ts`);
  await assert.rejects(this.engine.read(state.id,'link.ts'),/Symbolic links/);
});

Then('an incremental restore validates all target blobs before writing any files',async function(){
  const bytes=new Uint8Array([0,255,128]);
  let state=await fixture(this,[input('group/a.txt','text'),input('group/b.bin',bytes),input('stable.txt','stable')]);
  const paths=repositoryPaths(state.id,this.root),context={fs:this.fs,gitdir:paths.historyGitdir};
  const target=state.historyHead;
  const root=await git.readTree({...context,oid:(await git.readCommit({...context,oid:target})).commit.tree});
  const group=await git.readTree({...context,oid:root.tree.find(entry=>entry.path==='group').oid});
  const blob=group.tree.find(entry=>entry.path==='b.bin').oid;
  state=await this.engine.remove(state.id,'group',state.revision);
  const before=await contents(paths.dir),read=this.fs.promises.readFile;let failing=true;
  const broken=`${paths.historyGitdir}/objects/${blob.slice(0,2)}/${blob.slice(2)}`;
  this.fs.promises.readFile=async(path,...args)=>{if(path===broken&&failing)throw Error('target blob unavailable');return read(path,...args);};
  try{
    await assert.rejects(this.engine.undo(state.id,state.revision),error=>error instanceof git.Errors.NotFoundError);
    assert.deepEqual(await contents(paths.dir),before);assert.equal(this.records.get(state.id).revision,state.revision);
    assert.ok(this.journals.get(state.id).filesBefore);
    failing=false;this.engine=this.open();state=await this.engine.open(state.id);
    assert.equal(state.historyHead,target);assert.equal(this.journals.size,0);
    assert.equal(await this.engine.read(state.id,'group/a.txt'),'text');
    assert.deepEqual(new Uint8Array(await readFile(`${paths.dir}/group/b.bin`)),bytes);
  }finally{this.fs.promises.readFile=read;}
});
