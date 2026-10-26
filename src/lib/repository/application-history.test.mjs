// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Before, After, Then } from "@cucumber/cucumber";
import * as git from "isomorphic-git";
import { createRepositoryEngine } from "./core.ts";
import { createApplicationHistory } from "./application-history.ts";
import { normalizeSettings } from "../editor/settings.ts";
import { emptyRepositoryWorkspace, normalizeWorkspace } from "../editor/workspace.ts";
import { repositoryPaths } from "./paths.ts";
import { planRepositoryDeletion, finishHistoryRetention } from "./history-retention.ts";

const clone = value => structuredClone(value);
const file = (path, text) => ({ path, data: typeof text === "string" ? new TextEncoder().encode(text) : text });
const initialState = () => ({ workspace: normalizeWorkspace(null), settings: normalizeSettings(null) });
const select = (state, id, path = "main.ts") => {
  const next = clone(state);
  next.workspace.repositoryId = id;
  next.workspace.repositories[id] = { ...emptyRepositoryWorkspace(), tabs: path ? [path] : [], activeFile: path };
  return next;
};
async function record(world, before, after, label, command, editGroup) {
  const request = { expected: world.activity.revision, before, after, label, ...(command ? { command } : {}), ...(editGroup?{editGroup}:{}) };
  const result = await world.application.recordActivity(request);
  world.activity = result.activity;
  return result;
}
async function undo(world, legacy) {
  const result = await world.application.undoActivity(world.activity.revision, legacy);
  world.activity = result.activity;
  return result;
}
async function redo(world, legacy) {
  const result = await world.application.redoActivity(world.activity.revision, legacy);
  world.activity = result.activity;
  return result;
}
Before({ tags: "@application-history" }, async function () {
  this.root = await mkdtemp(join(tmpdir(), "code-application-history-"));
  this.records = new Map(); this.pending = new Map(); this.applicationRecord = undefined; this.applicationPending = undefined;
  this.preferences = undefined; this.locks = new Map();
  const repositoryMetadata = {
    list: async () => clone([...this.records.values()]), get: async id => clone(this.records.get(id)),
    pending: async id => clone(this.pending.get(id)), prepare: async (id, value) => { this.pending.set(id, clone(value)); },
    finish: async value => { this.records.set(value.id, clone(value)); this.pending.delete(value.id); },
    loadPreferences: async () => clone(this.preferences), savePreferences: async value => { this.preferences = clone(value); },
  };
  this.applicationMetadata = {
    get: async () => clone(this.applicationRecord), pending: async () => clone(this.applicationPending),
    prepare: async value => { this.applicationPending = clone(value); },
    initialize: async value => { this.applicationRecord = clone(value); },
    finish: async value => { this.applicationRecord = clone(value); this.applicationPending = undefined;
      if (value.state) this.preferences = clone(value.state.settings); },
    discard: async () => { this.applicationPending = undefined; },
  };
  this.shared = { fs: { promises: { ...fs.promises } }, root: this.root, flush: async () => {
    if (this.flushFailure) { this.flushFailure = false; throw Object.assign(new Error("disk unavailable"), { code: "EIO" }); }
  },
    lock: async (key, run) => { const next = (this.locks.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
      this.locks.set(key, next); return next; } };
  this.repositoryOptions = { ...this.shared, metadata: repositoryMetadata,
    checkpoint: stage => { if (this.failAt === `repository-${stage}`) { this.failAt = undefined; throw Error("interrupted repository"); } } };
  this.reopen = () => {
    this.repository = createRepositoryEngine(this.repositoryOptions);
    this.application = createApplicationHistory({ ...this.shared, repository: this.repository, metadata: this.applicationMetadata,
      checkpoint: stage => { if (this.failAt === stage) { this.failAt = undefined; throw Error(`interrupted ${stage}`); } } });
  };
  this.reopen(); this.activity = await this.application.loadActivity();
  this.git = { fs: this.shared.fs, gitdir: `${this.root}/history/application.git` };
});
After({ tags: "@application-history" }, async function () { await rm(this.root, { recursive: true, force: true }); });
Then('deleting repository history removes every restoration path while another repository retains redo',async function(){
  const a=await this.repository.create('Delete me',[file('main.ts','private initial')]);
  const b=await this.repository.create('Keep me',[file('main.ts','other initial')]);
  let state=select(initialState(),a.id);
  await record(this,initialState(),state,'Open A');
  await record(this,state,state,'Edit A',{method:'write',args:[a.id,'main.ts','private saved',a.revision]});
  const settings=clone(state);settings.settings.global.fontSize=17;settings.settings.repositories[a.id]={fontSize:19};
  Object.assign(settings.settings,{files:{[a.id]:{'main.ts':{indentSize:8}}}});settings.settings.repositories[b.id]={fontSize:21};
  await record(this,state,settings,'Settings');state=select(settings,b.id);
  await record(this,settings,state,'Open B');
  await record(this,state,state,'Edit B',{method:'write',args:[b.id,'main.ts','other saved',b.revision]});
  await undo(this);
  const next=await planRepositoryDeletion(this.shared,this.applicationRecord,a.id,select(this.activity.state,a.id),[b.id]);
  this.applicationRecord=next;this.preferences=next.state.settings;this.records.delete(a.id);
  const paths=repositoryPaths(a.id,this.root);
  await rm(paths.dir,{recursive:true,force:true});await rm(paths.historyGitdir,{recursive:true,force:true});
  await finishHistoryRetention(this.shared,{repositories:[],activity:next,changed:true});
  this.reopen();this.activity=await this.application.loadActivity();
  assert.equal(this.activity.state.workspace.repositoryId,b.id);
  assert.equal(this.activity.state.workspace.repositories[a.id],undefined);
  assert.equal(this.activity.state.settings.repositories[a.id],undefined);assert.equal(Object.hasOwn(this.activity.state.settings,"files"),false);
  assert.equal(this.activity.state.settings.global.fontSize,17);assert.equal(this.activity.state.settings.repositories[b.id].fontSize,21);
  assert.equal(this.activity.canRedo,true);await redo(this);assert.equal(await this.repository.read(b.id,'main.ts'),'other saved');
  await undo(this);assert.equal(await this.repository.read(b.id,'main.ts'),'other initial');
  const refs=await git.listRefs({...this.git,filepath:'refs'});
  for(const ref of refs)for(const {oid} of await git.log({...this.git,ref:`refs/${ref}`})){
    const blob=await git.readBlob({...this.git,oid,filepath:'activity.json'});
    assert.equal(new TextDecoder().decode(blob.blob).includes(a.id),false);
  }
  while(this.activity.canUndo){await undo(this);assert.equal(this.activity.state.workspace.repositories[a.id],undefined);}
  await assert.rejects(this.repository.open(a.id),/not found|Unknown|exist/);
});
Then('application history uses the private edit subject for grouped edits and formatting',async function(){
  const initial='const timeout = 5000;';let repository=await this.repository.create('Subjects',[file('main.ts',initial)]);
  const state=select(initialState(),repository.id),group={id:'typing',line:1};
  for(const value of [2,20,20000])repository=(await record(this,state,state,'Edit main.ts',{
    method:'write',args:[repository.id,'main.ts',`const timeout = ${value};`,repository.revision]},group)).repository;
  const subject='Change timeout: 5000 → 20000';
  assert.equal(repository.history[0].message,subject);assert.equal(this.activity.undoLabel,subject);assert.equal(this.applicationRecord.undo.length,1);
  repository=(await record(this,state,state,'Format main.ts',{
    method:'write',args:[repository.id,'main.ts','const timeout = 20000;\n',repository.revision,undefined,'format']})).repository;
  assert.equal(repository.history[0].message,'Format document');assert.equal(this.activity.undoLabel,'Format document');
  assert.equal(this.applicationRecord.undo.length,2);
  this.reopen();this.activity=await this.application.loadActivity();assert.equal(this.activity.undoLabel,'Format document');
  await undo(this);assert.equal(this.activity.undoLabel,subject);assert.equal(this.activity.redoLabel,'Format document');
  await undo(this);assert.equal(await this.repository.read(repository.id,'main.ts'),initial);
  await redo(this);await redo(this);assert.equal(this.activity.undoLabel,'Format document');
});
Then('a formatting history subject recovers at {string}',async function(stage){
  const repository=await this.repository.create('Format recovery',[file('main.ts','const value=1;')]),state=select(initialState(),repository.id);
  const request={expected:this.activity.revision,before:state,after:state,label:'Format main.ts',
    command:{method:'write',args:[repository.id,'main.ts','const value = 1;\n',repository.revision,undefined,'format']}};
  this.failAt=stage;await assert.rejects(this.application.recordActivity(request),/interrupted/);
  this.reopen();this.activity=await this.application.loadActivity();
  assert.equal(this.activity.undoLabel,'Format document');assert.equal((await this.repository.open(repository.id)).history[0].message,'Format document');
  assert.equal((await this.application.recordActivity(request)).activity.revision,this.activity.revision);
  await undo(this);assert.equal(await this.repository.read(repository.id,'main.ts'),'const value=1;');
  await redo(this);assert.equal(this.activity.undoLabel,'Format document');
});

Then('grouped application edits undo and redo as one {string} step',async function(mode){
  let repository=await this.repository.create('Grouped',[file('main.ts','')]);
  const group={id:'typing',line:1};let state=select(initialState(),repository.id);const before=clone(state);
  const entries=[];
  for(const text of ['a','ab','abc']){
    const after=clone(state);after.workspace.repositories[repository.id].documents['main.ts']={selection:[{anchor:text.length,head:text.length}],mainIndex:0,scrollTop:0,scrollLeft:0};
    repository=(await record(this,state,after,'Edit main',{method:'write',args:[repository.id,'main.ts',text,repository.revision]},group)).repository;
    state=after;entries.push(this.applicationRecord.current);
    assert.equal(await this.repository.read(repository.id,'main.ts'),text);
    assert.equal(repository.history.length,1);assert.equal(this.applicationRecord.undo.length,1);
  }
  const refs=await git.listRefs({...this.git,filepath:'refs/editor/activities'});assert.deepEqual(refs,[entries.at(-1)]);
  const blob=await git.readBlob({...this.git,oid:this.applicationRecord.current,filepath:'activity.json'});
  const entry=JSON.parse(new TextDecoder().decode(blob.blob));assert.deepEqual(entry.before,before);assert.deepEqual(entry.after,state);
  assert.deepEqual((await git.readCommit({...this.git,oid:this.applicationRecord.current})).commit.parent,[]);
  const scoped=mode==='repository'?{repositoryId:repository.id,state,scope:{kind:'repository',repositoryId:repository.id}}:undefined;
  this.reopen();this.activity=await this.application.loadActivity();
  await undo(this,scoped);assert.equal(await this.repository.read(repository.id,'main.ts'),'');
  assert.equal((await this.repository.open(repository.id)).canUndo,false);
  this.reopen();this.activity=await this.application.loadActivity();
  await redo(this,scoped);assert.equal(await this.repository.read(repository.id,'main.ts'),'abc');
  assert.equal((await this.repository.open(repository.id)).canRedo,false);
});
Then('retention preserves grouped redo and collects replaced intermediate objects',async function(){
  let repository=await this.repository.create('Grouped retention',[file('main.ts','initial')]);
  const state=select(initialState(),repository.id);state.settings.global.historyLimit=1;
  const superseded=[];
  for(let index=1;index<=5;index++)for(const suffix of ['a','b']){
    repository=(await record(this,state,state,'Edit main',{method:'write',args:[repository.id,'main.ts',`${index}${suffix}`,repository.revision]},
      {id:`group-${index}`,line:1})).repository;
    if(suffix==='a')superseded.push([repository.historyHead,this.applicationRecord.current]);
  }
  assert.equal(repository.history.length,5);
  const scope={repositoryId:repository.id,state,scope:{kind:'repository',repositoryId:repository.id}};
  await undo(this,scope);assert.equal(await this.repository.read(repository.id,'main.ts'),'4b');
  const plan=await retention(this);assert.equal(plan.changed,true);
  this.reopen();this.activity=await this.application.loadActivity();
  await redo(this,scope);assert.equal(await this.repository.read(repository.id,'main.ts'),'5b');
  await undo(this,scope);assert.equal(await this.repository.read(repository.id,'main.ts'),'4b');
  for(const [privateOid,appOid] of superseded){
    await assert.rejects(git.readCommit({fs:this.shared.fs,gitdir:repositoryPaths(repository.id,this.root).historyGitdir,oid:privateOid}));
    await assert.rejects(git.readCommit({...this.git,oid:appOid}));
  }
});
Then('malformed edit groups are rejected before either private journal changes',async function(){
  const repository=await this.repository.create('Validation',[file('main.ts','initial')]);
  const state=select(initialState(),repository.id),before=clone(this.applicationRecord);
  for(const editGroup of [{id:'',line:1},{id:'valid',line:0},{id:'valid',line:1.5}]){
    await assert.rejects(this.application.recordActivity({expected:this.activity.revision,before:state,after:state,label:'Edit',editGroup,
      command:{method:'write',args:[repository.id,'main.ts','changed',repository.revision]}}),{name:'ActivityRejectedError'});
    assert.throws(()=>this.repository.write(repository.id,'main.ts','changed',repository.revision,editGroup),{name:'RepositoryValidationError'});
    assert.equal(this.applicationPending,undefined);assert.equal(this.pending.size,0);
  }
  assert.deepEqual(this.applicationRecord,before);assert.deepEqual(await this.repository.open(repository.id),repository);
});
Then('application edit grouping ends on {string}',async function(boundary){
  let repository=await this.repository.create('Boundaries',[file('main.ts',''),file('other.ts','')]);
  const group={id:'typing',line:1},initial=select(initialState(),repository.id);let state=clone(initial);
  if(boundary==='settings undo'){
    state.settings.global.fontSize++;
    await record(this,initial,state,'Setting');
  }
  repository=(await record(this,state,state,'First edit',{method:'write',args:[repository.id,'main.ts','a',repository.revision]},group)).repository;
  const first=repository.historyHead;
  if(boundary==='navigation'||boundary==='settings'){
    const after=clone(state);
    if(boundary==='navigation')after.workspace.rightPanes=['history'];else after.settings.global.fontSize++;
    await record(this,state,after,boundary);state=after;
  }else if(boundary==='settings undo'){
    await undo(this,{repositoryId:repository.id,state,scope:{kind:'settings',scope:'global'}});state=this.activity.state;
  }else if(boundary==='file undo'){
    await undo(this,{repositoryId:repository.id,state,scope:{kind:'repository',repositoryId:repository.id}});repository=await this.repository.open(repository.id);
  }else if(boundary==='multiline'){
    repository=(await record(this,state,state,'Newline',{method:'write',args:[repository.id,'main.ts','a\nb',repository.revision]},group)).repository;
    assert.equal(repository.editGroup,undefined);
  }
  const path=boundary==='another file'?'other.ts':'main.ts';
  const text=boundary==='multiline'?'a\nbx':boundary==='file undo'?'x':'ab';
  repository=(await record(this,state,state,'Next edit',{method:'write',args:[repository.id,path,text,repository.revision]},group)).repository;
  const scoped={repositoryId:repository.id,state,scope:{kind:'repository',repositoryId:repository.id}};
  const count=boundary==='multiline'?3:2;assert.equal(repository.history.length,count);
  assert.ok(repository.history.some(entry=>entry.oid===first));
  await undo(this,scoped);
  assert.equal(await this.repository.read(repository.id,'main.ts'),boundary==='file undo'?'':boundary==='multiline'?'a\nb':'a');
  assert.equal(await this.repository.read(repository.id,'other.ts'),'');
});
Then('a grouped application amendment recovers at {string}',async function(stage){
  let repository=await this.repository.create('Recovery',[file('main.ts','')]);
  const state=select(initialState(),repository.id),editGroup={id:'typing',line:1};
  repository=(await record(this,state,state,'Edit main',{method:'write',args:[repository.id,'main.ts','a',repository.revision]},editGroup)).repository;
  const request={expected:this.activity.revision,before:state,after:state,label:'Edit main',editGroup,
    command:{method:'write',args:[repository.id,'main.ts','ab',repository.revision]}};
  this.failAt=stage;await assert.rejects(this.application.recordActivity(request),/interrupted/);
  this.reopen();this.activity=await this.application.loadActivity();repository=await this.repository.open(repository.id);
  assert.equal(await this.repository.read(repository.id,'main.ts'),'ab');assert.equal(repository.history.length,1);
  assert.equal(this.applicationRecord.undo.length,1);assert.equal(this.applicationPending,undefined);assert.equal(this.pending.size,0);
  assert.equal((await this.application.recordActivity(request)).activity.revision,this.activity.revision);
  const scoped={repositoryId:repository.id,state,scope:{kind:'repository',repositoryId:repository.id}};
  await undo(this,scoped);assert.equal(await this.repository.read(repository.id,'main.ts'),'');
  await redo(this,scoped);assert.equal(await this.repository.read(repository.id,'main.ts'),'ab');
});

Then("application history restores interleaved workspace settings and repository edits", async function () {
  let first = await this.repository.create("First", [file("main.ts", "initial")]);
  let second = await this.repository.create("Second", [file("main.ts", "second")]);
  const blank = initialState(), opened = select(blank, first.id);
  await record(this, blank, opened, "Open first file");
  first = (await record(this, opened, opened, "Edit first", { method: "write", args: [first.id, "main.ts", "changed", first.revision] })).repository;
  const closed = select(opened, first.id, "");
  await record(this, opened, closed, "Close first file");
  const switched = select(closed, second.id);
  await record(this, closed, switched, "Select second repository");
  second = (await record(this, switched, switched, "Edit second", { method: "write", args: [second.id, "main.ts", "changed second", second.revision] })).repository;
  const configured = clone(switched); configured.workspace.rightPanes = ["settings"]; configured.settings.global.fontSize = 19;
  await record(this, switched, configured, "Change settings");
  const source = await this.repository.commit(first.id, "Explicit source commit", { name: "Test", email: "test@example.invalid" }, first.revision);
  const sourceIndex = await readFile(`${repositoryPaths(first.id, this.root).gitdir}/index`);
  const privateCount = (await this.repository.open(first.id)).history.length;
  await undo(this); assert.deepEqual(this.activity.state, switched); assert.equal(this.preferences.global.fontSize, blank.settings.global.fontSize);
  assert.equal((await this.repository.open(first.id)).history.length, privateCount);
  await undo(this); assert.equal(await this.repository.read(second.id, "main.ts"), "second");
  await undo(this); assert.deepEqual(this.activity.state, closed);
  await undo(this); assert.deepEqual(this.activity.state, opened);
  await undo(this); assert.equal(await this.repository.read(first.id, "main.ts"), "initial");
  assert.equal((await this.repository.open(first.id)).head, source.head);
  assert.deepEqual(await readFile(`${repositoryPaths(first.id, this.root).gitdir}/index`), sourceIndex);
  await undo(this); assert.deepEqual(this.activity.state, blank); assert.equal(this.activity.canUndo, false);
  this.reopen(); this.activity = await this.application.loadActivity(); assert.equal(this.activity.canRedo, true);
  for (let count = 0; count < 6; count++) await redo(this);
  assert.deepEqual(this.activity.state, configured); assert.equal(this.preferences.global.fontSize, 19);
  assert.equal(await this.repository.read(first.id, "main.ts"), "changed");
  assert.equal(await this.repository.read(second.id, "main.ts"), "changed second");
  assert.equal(this.activity.canRedo, false);
});

Then("application history restores graph choices without creating repository revisions",async function(){
  const repository=await this.repository.create("Graphs",[file("main.ts","initial")]);
  const changes=select(initialState(),repository.id);changes.workspace.rightPanes=["history"];
  const legacy=clone(changes);legacy.workspace.page="history";delete legacy.workspace.rightPanes;delete legacy.workspace.repositories[repository.id].historyView;
  this.applicationRecord.state=legacy;
  this.reopen();this.activity=await this.application.loadActivity();
  assert.deepEqual(this.activity.state,changes);
  const unchangedRevision=this.activity.revision;
  await record(this,legacy,changes,"Keep default graph");
  assert.equal(this.activity.revision,unchangedRevision);assert.equal(this.activity.canUndo,false);
  const versions=clone(changes);versions.workspace.repositories[repository.id].historyView="versions";
  await record(this,legacy,versions,"Version graph");
  assert.equal(this.activity.undoLabel,"Version graph");
  this.reopen();this.activity=await this.application.loadActivity();
  assert.deepEqual(this.activity.state,versions);
  await undo(this);assert.deepEqual(this.activity.state,changes);
  await redo(this);assert.deepEqual(this.activity.state,versions);
  const selectedRevision=this.activity.revision;
  await record(this,versions,versions,"Version graph");
  assert.equal(this.activity.revision,selectedRevision);
  assert.deepEqual(await this.repository.open(repository.id),repository);
});

Then("application history restores selected revisions and their workspace through reload",async function(){
  let repository=await this.repository.create("Selection",[file("main.ts","seed")]);
  repository=await this.repository.commit(repository.id,"Source baseline",{name:"Test",email:"test@example.invalid"},repository.revision);
  const sourceHead=repository.head,sourceIndex=await readFile(`${repositoryPaths(repository.id,this.root).gitdir}/index`);
  repository=await this.repository.write(repository.id,"main.ts","initial",repository.revision);const initial=repository.historyHead;
  const opened=select(initialState(),repository.id);opened.workspace.rightPanes=["history"];
  await record(this,initialState(),opened,"Open repository");
  repository=(await record(this,opened,opened,"Edit main",{method:"write",args:[repository.id,"main.ts","changed",repository.revision]})).repository;
  const extra=clone(opened);extra.workspace.repositories[repository.id].tabs.push("later.ts");extra.workspace.repositories[repository.id].activeFile="later.ts";
  repository=(await record(this,opened,extra,"Create later",{method:"createFile",args:[repository.id,"later.ts","later",repository.revision]})).repository;
  const prior=repository.historyHead,historyIds=new Set(repository.history.map(entry=>entry.oid));
  repository=(await record(this,extra,extra,"Select revision",{method:"selectHistory",args:[repository.id,initial,repository.revision]})).repository;
  assert.equal(repository.historyHead,initial);assert.deepEqual(this.activity.state,opened);
  assert.deepEqual(new Set(repository.history.map(entry=>entry.oid)),historyIds);
  this.reopen();this.activity=await this.application.loadActivity();
  await undo(this);assert.deepEqual(this.activity.state,extra);
  assert.equal((await this.repository.open(repository.id)).historyHead,prior);assert.equal(await this.repository.read(repository.id,"later.ts"),"later");
  await redo(this);assert.equal((await this.repository.open(repository.id)).historyHead,initial);
  await undo(this);await undo(this);await undo(this);
  assert.equal(await this.repository.read(repository.id,"main.ts"),"initial");
  for(let count=0;count<3;count++)await redo(this);
  repository=await this.repository.open(repository.id);
  assert.equal(repository.historyHead,initial);assert.equal(repository.head,sourceHead);
  assert.deepEqual(await readFile(`${repositoryPaths(repository.id,this.root).gitdir}/index`),sourceIndex);
  assert.deepEqual(new Set(repository.history.map(entry=>entry.oid)),historyIds);
});

Then("a history selection recovers an interruption at {string}",async function(stage){
  let repository=await this.repository.create("Selection recovery",[file("main.ts","seed")]);
  repository=await this.repository.write(repository.id,"main.ts","initial",repository.revision);
  const target=repository.historyHead;
  repository=await this.repository.write(repository.id,"main.ts","latest",repository.revision);
  const previous=repository.historyHead,state=select(initialState(),repository.id);
  const request={expected:this.activity.revision,before:state,after:state,label:"Select earlier revision",
    command:{method:"selectHistory",args:[repository.id,target,repository.revision]}};
  this.failAt=stage;await assert.rejects(this.application.recordActivity(request),/interrupted/);
  this.reopen();this.activity=await this.application.loadActivity();
  const restored=await this.repository.open(repository.id);
  assert.equal(restored.historyHead,target);assert.equal(restored.history.length,2);
  assert.equal(await this.repository.read(repository.id,"main.ts"),"initial");
  assert.equal(this.applicationPending,undefined);assert.equal(this.applicationRecord.undo.length,1);
  const retried=await this.application.recordActivity(request);assert.equal(retried.activity.revision,this.activity.revision);
  await undo(this);assert.equal((await this.repository.open(repository.id)).historyHead,previous);
  await redo(this);assert.equal((await this.repository.open(repository.id)).historyHead,target);
});

Then("source commit checkout records content undo independently of source HEAD",async function(){
  let repository=await this.repository.create("Source checkout",[file("main.ts","initial")]);
  const author={name:"Test",email:"test@example.invalid"};
  repository=await this.repository.commit(repository.id,"First",author,repository.revision);const first=repository.head;
  repository=await this.repository.write(repository.id,"main.ts","latest",repository.revision);
  repository=await this.repository.commit(repository.id,"Latest",author,repository.revision);const latest=repository.head;
  const state=select(initialState(),repository.id);state.workspace.rightPanes=["history"];state.workspace.repositories[repository.id].historyView="versions";
  repository=(await record(this,state,state,"Checkout source",{method:"checkoutCommit",args:[repository.id,first,repository.revision]})).repository;
  assert.equal(repository.head,first);assert.equal(repository.branch,null);assert.equal(this.activity.undoLabel,"Checkout source");
  const index=await readFile(`${repositoryPaths(repository.id,this.root).gitdir}/index`);
  this.reopen();this.activity=await this.application.loadActivity();
  await undo(this);assert.equal(await this.repository.read(repository.id,"main.ts"),"latest");
  repository=await this.repository.open(repository.id);assert.equal(repository.head,first);assert.equal(repository.branch,null);
  assert.deepEqual(await readFile(`${repositoryPaths(repository.id,this.root).gitdir}/index`),index);
  await redo(this);assert.equal(await this.repository.read(repository.id,"main.ts"),"initial");
  assert.equal(await git.resolveRef({fs:this.shared.fs,gitdir:repositoryPaths(repository.id,this.root).gitdir,ref:"refs/heads/main"}),latest);
});

Then("source commit checkout recovers an interruption at {string}",async function(stage){
  let repository=await this.repository.create("Source recovery",[file("main.ts","initial")]);
  const author={name:"Test",email:"test@example.invalid"};
  repository=await this.repository.commit(repository.id,"First",author,repository.revision);const target=repository.head;
  repository=await this.repository.write(repository.id,"main.ts","latest",repository.revision);
  repository=await this.repository.commit(repository.id,"Latest",author,repository.revision);const latest=repository.head;
  const state=select(initialState(),repository.id),request={expected:this.activity.revision,before:state,after:state,label:"Checkout version",
    command:{method:"checkoutCommit",args:[repository.id,target,repository.revision]}};
  this.failAt=stage;await assert.rejects(this.application.recordActivity(request),/interrupted/);
  this.reopen();this.activity=await this.application.loadActivity();
  const restored=await this.repository.open(repository.id);
  assert.equal(restored.head,target);assert.equal(restored.branch,null);assert.deepEqual(restored.history.map(entry=>entry.oid),[repository.historyHead]);
  assert.equal(this.applicationPending,undefined);assert.equal(this.applicationRecord.undo.length,1);
  assert.equal((await this.application.recordActivity(request)).activity.revision,this.activity.revision);
  await undo(this);assert.equal(await this.repository.read(repository.id,"main.ts"),"latest");
  assert.equal((await this.repository.open(repository.id)).head,target);
  await redo(this);assert.equal(await this.repository.read(repository.id,"main.ts"),"initial");
  assert.equal(await git.resolveRef({fs:this.shared.fs,gitdir:repositoryPaths(repository.id,this.root).gitdir,ref:"refs/heads/main"}),latest);
});

Then("application history recovers an interruption at {string}", async function (stage) {
  const repository = await this.repository.create("Recovery", [file("main.ts", "initial")]);
  const state = select(initialState(), repository.id);
  const bytes = new Uint8Array([0, 255, 27, 128]);
  const request = { expected: this.activity.revision, before: state, after: state, label: "Add binary file",
    command: { method: "addFiles", args: [repository.id, [file("new.bin", bytes)], repository.revision] } };
  this.failAt = stage;
  await assert.rejects(this.application.recordActivity(request), /interrupted/);
  this.reopen(); this.activity = await this.application.loadActivity();
  const restored = await this.repository.open(repository.id);
  assert.deepEqual(restored.files, ["main.ts", "new.bin"]); assert.equal(restored.history.length, 1);
  assert.equal(this.applicationRecord.undo.length, 1); assert.equal(this.applicationPending, undefined);
  assert.equal(this.activity.undoLabel, "Add binary file");
  const retry = await this.application.recordActivity(request); assert.equal(retry.activity.revision, this.activity.revision);
  assert.deepEqual(new Uint8Array(await readFile(`${repositoryPaths(repository.id, this.root).dir}/new.bin`)), bytes);
  this.failAt = stage;
  await assert.rejects(this.application.undoActivity(this.activity.revision), /interrupted/);
  this.reopen(); this.activity = await this.application.loadActivity();
  assert.deepEqual((await this.repository.open(repository.id)).files, ["main.ts"]);
  assert.equal(this.activity.canUndo, false); assert.equal(this.activity.canRedo, true);
  await redo(this); assert.deepEqual((await this.repository.open(repository.id)).files, ["main.ts", "new.bin"]);
});

Then("application history retains divergent futures and rejects competing cursors", async function () {
  const state = initialState(), next = clone(state); next.workspace.page = "settings";
  await record(this, state, next, "Settings");
  const abandoned = this.applicationRecord.current, stale = this.activity.revision;
  await undo(this);
  const history = clone(state); history.workspace.rightPanes = ["history"];
  const request = { expected: this.activity.revision, before: state, after: history, label: "History" };
  const results = await Promise.allSettled([this.application.recordActivity(request),
    this.application.recordActivity({ ...request, label: "Competing settings", after: next })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  this.activity = await this.application.loadActivity(); assert.equal(this.activity.canRedo, false);
  assert.equal(await git.resolveRef({ ...this.git, ref: `refs/editor/futures/${abandoned}` }), abandoned);
  await assert.rejects(this.application.undoActivity(stale), /another tab/);
  assert.deepEqual(this.activity.state, history);
  assert.equal((await git.log({ ...this.git, ref: abandoned })).length, 1);
});

Then("legacy repository edits can be undone and redone around new workspace actions", async function () {
  let repository = await this.repository.create("Legacy", [file("main.ts", "zero")]);
  for (const text of ["one", "two", "three"]) repository = await this.repository.write(repository.id, "main.ts", text, repository.revision);
  const state = select(initialState(), repository.id), closed = select(state, repository.id, "");
  await record(this, state, closed, "Close tab");
  await undo(this); assert.deepEqual(this.activity.state, state);
  const legacy = { repositoryId: repository.id, state };
  await undo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "two");
  await undo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "one");
  this.reopen(); this.activity = await this.application.loadActivity();
  await redo(this); assert.equal(await this.repository.read(repository.id, "main.ts"), "two");
  await redo(this); assert.equal(await this.repository.read(repository.id, "main.ts"), "three");
  await redo(this); assert.deepEqual(this.activity.state, closed);
  await undo(this); await undo(this); await undo(this);
  assert.equal(await this.repository.read(repository.id, "main.ts"), "one");
  await undo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "zero");
  assert.equal((await this.repository.open(repository.id)).canUndo, false);
  for (let count = 0; count < 4; count++) await redo(this);
  assert.equal(await this.repository.read(repository.id, "main.ts"), "three");
  assert.deepEqual(this.activity.state, closed);
});

Then("rejected application actions leave the prior workspace usable", async function () {
  const repository = await this.repository.create("Invalid", [file("main.ts", "unchanged")]);
  const state = select(initialState(), repository.id);
  const expected = this.activity.revision;
  await assert.rejects(record(this, state, state, "Invalid create", { method: "createFile", args: [repository.id, "main.ts", "conflict", repository.revision] }), { name: "ActivityRejectedError", message: /already exists/ });
  assert.equal(this.applicationPending, undefined); assert.equal((await this.application.loadActivity()).revision, expected);
  await record(this, initialState(), state, "Select file");
  assert.equal(this.activity.undoLabel, "Select file");
  await assert.rejects(this.application.recordActivity({ expected: this.activity.revision, before: state, after: state, label: " " }), /description/);
  assert.equal(await this.repository.read(repository.id, "main.ts"), "unchanged");
  const changed = await this.repository.write(repository.id, "main.ts", "outside", repository.revision);
  await assert.rejects(record(this, state, state, "Stale edit", { method: "write", args: [repository.id, "main.ts", "overwrite", repository.revision] }), /another tab/);
  await record(this, state, state, "Valid edit", { method: "write", args: [repository.id, "main.ts", "inside", changed.revision] });
  const current = await this.repository.open(repository.id);
  await this.repository.write(repository.id, "main.ts", "competing", current.revision);
  await assert.rejects(this.application.undoActivity(this.activity.revision), /outside application history/);
  assert.equal(await this.repository.read(repository.id, "main.ts"), "competing");
});

Then("application validation errors are distinguished from storage failures", async function () {
  const repository = await this.repository.create("Validation", [file("main.ts", "unchanged"), file("other.ts", "other")]);
  const state = select(initialState(), repository.id);
  for (const command of [
    { method: "rename", args: [repository.id, "main.ts", "other.ts", repository.revision] },
    { method: "remove", args: [repository.id, "missing.ts", repository.revision] },
    { method: "createFile", args: [repository.id, "../outside", "text", repository.revision] },
    { method: "write", args: [repository.id, "main.ts", "\0", repository.revision] },
    { method: "switchBranch", args: [repository.id, "missing", repository.revision] },
    { method: "selectHistory", args: [repository.id, "0".repeat(40), repository.revision] },
    { method: "checkoutCommit", args: [repository.id, "0".repeat(40), repository.revision] },
  ]) {
    await assert.rejects(record(this, state, state, "Invalid request", command), { name: "ActivityRejectedError" });
    assert.equal(this.applicationPending, undefined);
  }
  this.flushFailure = true;
  await assert.rejects(record(this, state, state, "Interrupted write", { method: "write", args: [repository.id, "main.ts", "changed", repository.revision] }),
    error => error.name !== "ActivityRejectedError" && error.code === "EIO");
  assert.equal(await this.repository.read(repository.id, "main.ts"), "unchanged");
  this.failAt = "activity-prepared";
  await assert.rejects(record(this, state, state, "Invalid interrupted create", { method: "createFile", args: [repository.id, "main.ts", "conflict", repository.revision] }), /interrupted/);
  this.reopen(); this.activity = await this.application.loadActivity();
  assert.equal(this.applicationPending, undefined); assert.equal(this.activity.canUndo, false);
  await record(this, initialState(), state, "Select file");
  assert.equal(this.activity.canUndo, true);
});

Then("unchanged application commands create no artificial history", async function () {
  let repository = await this.repository.create("No-op", [file("main.ts", "baseline")]);
  repository = await this.repository.write(repository.id, "main.ts", "unchanged", repository.revision);
  const state = select(initialState(), repository.id), closed = select(state, repository.id, "");
  await record(this, initialState(), state, "Open tab");
  await record(this, state, closed, "Close tab");
  await undo(this);
  const revision = this.activity.revision, recordBefore = clone(this.applicationRecord);
  await record(this, state, state, "Unchanged view");
  await record(this, state, state, "Unchanged text", { method: "write", args: [repository.id, "main.ts", "unchanged", repository.revision] });
  await record(this, state, state, "Same branch", { method: "switchBranch", args: [repository.id, "main", repository.revision] });
  await record(this, state, state, "Same revision", { method: "selectHistory", args: [repository.id, repository.historyHead, repository.revision] });
  assert.equal(this.activity.revision, revision); assert.deepEqual(this.applicationRecord, recordBefore);
  assert.equal(this.activity.canRedo, true); assert.equal((await this.repository.open(repository.id)).history.length, 1);
  assert.equal(this.applicationPending, undefined);
  await redo(this); assert.deepEqual(this.activity.state, closed);
});

Then("existing repository redo joins application history without losing its order", async function () {
  let repository = await this.repository.create("Legacy redo", [file("main.ts", "zero")]);
  for (const text of ["one", "two", "three"]) repository = await this.repository.write(repository.id, "main.ts", text, repository.revision);
  for (let index = 0; index < 3; index++) repository = await this.repository.undo(repository.id, repository.revision);
  const state = select(initialState(), repository.id), legacy = { repositoryId: repository.id, state };
  assert.equal(this.activity.legacyRedoAllowed, true); assert.equal(repository.canRedo, true);
  await redo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "one");
  assert.equal(this.activity.canUndo, true); assert.equal(this.activity.undoLabel, "Change zero → one");
  this.reopen(); this.activity = await this.application.loadActivity();
  assert.equal(this.activity.legacyRedoAllowed, true);
  await redo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "two");
  await undo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "one");
  await redo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "two");
  await redo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "three");
  assert.equal((await this.repository.open(repository.id)).history.length, 3);
  assert.equal((await this.repository.open(repository.id)).canRedo, false);
  for (let index = 0; index < 3; index++) await undo(this, legacy);
  assert.equal(await this.repository.read(repository.id, "main.ts"), "zero");
  this.reopen(); this.activity = await this.application.loadActivity();
  for (let index = 0; index < 3; index++) await redo(this, legacy);
  assert.equal(await this.repository.read(repository.id, "main.ts"), "three");
  assert.deepEqual(this.activity.state, state);
});

Then("only unchanged or rejected actions preserve legacy redo availability", async function () {
  let repository = await this.repository.create("Legacy future", [file("main.ts", "zero")]);
  repository = await this.repository.write(repository.id, "main.ts", "one", repository.revision);
  repository = await this.repository.undo(repository.id, repository.revision);
  const state = select(initialState(), repository.id), legacy = { repositoryId: repository.id, state };
  await record(this, state, state, "Unchanged selection");
  await record(this, state, state, "Unchanged document", { method: "write", args: [repository.id, "main.ts", "zero", repository.revision] });
  await assert.rejects(record(this, state, state, "Rejected create", { method: "createFile", args: [repository.id, "main.ts", "conflict", repository.revision] }), { name: "ActivityRejectedError" });
  assert.equal(this.activity.legacyRedoAllowed, true); assert.equal((await this.repository.open(repository.id)).canRedo, true);
  const next = clone(state); next.workspace.rightPanes = ["settings"];
  await record(this, state, next, "Open settings");
  assert.equal(this.activity.legacyRedoAllowed, false);
  await undo(this); assert.deepEqual(this.activity.state, state); assert.equal(this.activity.legacyRedoAllowed, false);
  this.reopen(); this.activity = await this.application.loadActivity();
  assert.equal(this.activity.legacyRedoAllowed, false);
  await redo(this, legacy); assert.deepEqual(this.activity.state, next);
  const revision = this.activity.revision;
  await redo(this, legacy);
  assert.equal(this.activity.revision, revision); assert.equal(await this.repository.read(repository.id, "main.ts"), "zero");
  assert.equal((await this.repository.open(repository.id)).canRedo, true);
});

Then("legacy redo recovers an interruption at {string}", async function (stage) {
  let repository = await this.repository.create("Legacy interrupted", [file("main.ts", "before")]);
  repository = await this.repository.write(repository.id, "main.ts", "after", repository.revision);
  repository = await this.repository.undo(repository.id, repository.revision);
  const state = select(initialState(), repository.id), legacy = { repositoryId: repository.id, state };
  const expected = this.activity.revision;
  this.failAt = stage;
  await assert.rejects(this.application.redoActivity(expected, legacy), /interrupted/);
  this.reopen(); this.activity = await this.application.loadActivity();
  assert.equal(await this.repository.read(repository.id, "main.ts"), "after");
  assert.equal(this.applicationPending, undefined); assert.equal(this.activity.canUndo, true);
  assert.equal(this.activity.legacyRedoAllowed, true); assert.equal(this.applicationRecord.undo.length, 1);
  const retried = await this.application.redoActivity(expected, legacy);
  assert.equal(retried.activity.revision, this.activity.revision);
  await undo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "before");
  await redo(this, legacy); assert.equal(await this.repository.read(repository.id, "main.ts"), "after");
  assert.equal((await this.repository.open(repository.id)).history.length, 1);
});

async function retention(world, publish = true, collect = true) {
  const {planHistoryRetention,finishHistoryRetention}=await import('./history-retention.ts');
  const plan=await planHistoryRetention(world.shared,[...world.records.values()],world.applicationRecord,world.preferences);
  if(publish){world.records=new Map(plan.repositories.map(record=>[record.id,clone(record)]));world.applicationRecord=clone(plan.activity);}
  if(publish&&collect)await finishHistoryRetention(world.shared,plan);
  world.reopen();world.activity=await world.application.loadActivity();
  return plan;
}
Then('automatic checkout stashes survive history retention and application reload',async function(){
  let repository=await this.repository.create('Automatic stashes',[file('main.ts','version A')]);
  const state=select(initialState(),repository.id),author={name:'Test',email:'test@example.invalid'};
  state.settings.global.historyLimit=1;await record(this,initialState(),state,'Open');
  repository=await this.repository.commit(repository.id,'Version A',author,repository.revision);const a=repository.head;
  repository=(await record(this,state,state,'Edit B',{method:'write',args:[repository.id,'main.ts','version B',repository.revision]})).repository;
  repository=await this.repository.commit(repository.id,'Version B',author,repository.revision);const b=repository.head;
  repository=(await record(this,state,state,'Stage B',{method:'write',args:[repository.id,'main.ts','staged B',repository.revision]})).repository;
  repository=(await record(this,state,state,'Stage file',{method:'gitAction',args:[repository.id,{kind:'stage'},repository.revision]})).repository;
  repository=(await record(this,state,state,'Edit B again',{method:'write',args:[repository.id,'main.ts','working B',repository.revision]})).repository;
  repository=(await record(this,state,state,'Checkout A',{method:'checkoutCommit',args:[repository.id,a,repository.revision]})).repository;
  for(let index=1;index<=5;index++)repository=(await record(this,state,state,`Edit A ${index}`,{method:'write',args:[repository.id,'main.ts',`working A ${index}`,repository.revision]})).repository;
  assert.equal((await retention(this)).changed,true);
  repository=await this.repository.open(repository.id);
  repository=(await record(this,state,state,'Return to B',{method:'switchBranch',args:[repository.id,'main',repository.revision]})).repository;
  assert.equal(repository.head,b);assert.equal(await this.repository.read(repository.id,'main.ts'),'working B');
  assert.equal((await this.repository.gitDiff(repository.id,{path:'main.ts',kind:'staged'})).after,'staged B');
  repository=(await record(this,state,state,'Return to A',{method:'checkoutCommit',args:[repository.id,a,repository.revision]})).repository;
  assert.equal(await this.repository.read(repository.id,'main.ts'),'working A 5');
  assert.equal((await this.repository.gitDiff(repository.id,{path:'main.ts',kind:'staged'})).after,'version A');
});
Then('automatic history retains the requested edits per file and consistent application undo',{timeout:15000},async function(){
  let repository=await this.repository.create('Retention',[file('main.ts','a0'),file('other.ts','b0')]);
  repository=await this.repository.commit(repository.id,'Source version',{name:'Test',email:'test@example.invalid'},repository.revision);
  const sourceContext={fs:this.shared.fs,dir:repositoryPaths(repository.id,this.root).dir};
  const sourceBefore=await git.log({...sourceContext,ref:'HEAD'});
  let state=select(initialState(),repository.id);state.settings.global.historyLimit=2;
  await record(this,initialState(),state,'Open repository');
  for(let i=1;i<=5;i++)for(const [path,prefix] of [['main.ts','a'],['other.ts','b']]){
    repository=(await record(this,state,state,`Edit ${path}`,{method:'write',args:[repository.id,path,`${prefix}${i}`,repository.revision]})).repository;
  }
  const oldCurrent=repository.historyHead,oldRevision=repository.revision,oldActivity=this.activity.revision;
  const plan=await retention(this);
  assert.equal(plan.changed,true);assert.notEqual(this.activity.revision,oldActivity);
  repository=await this.repository.open(repository.id);
  for(const path of ['main.ts','other.ts'])assert.equal(repository.history.filter(entry=>entry.changes.some(change=>change.path===path)).length,2);
  assert.equal(await this.repository.read(repository.id,'main.ts'),'a5');assert.equal(await this.repository.read(repository.id,'other.ts'),'b5');
  assert.deepEqual(await git.log({...sourceContext,ref:'HEAD'}),sourceBefore);
  await assert.rejects(this.repository.write(repository.id,'main.ts','stale',oldRevision));
  for(let i=0;i<4;i++)await undo(this);
  assert.equal(await this.repository.read(repository.id,'main.ts'),'a3');assert.equal(await this.repository.read(repository.id,'other.ts'),'b3');
  for(let i=0;i<4;i++)await redo(this);
  assert.equal(await this.repository.read(repository.id,'main.ts'),'a5');assert.equal(await this.repository.read(repository.id,'other.ts'),'b5');
  const unchanged=await retention(this);assert.equal(unchanged.changed,false);
  assert.notEqual(repository.historyHead,oldCurrent);
  await assert.rejects(git.readCommit({fs:this.shared.fs,gitdir:repositoryPaths(repository.id,this.root).historyGitdir,oid:oldCurrent}));
});
Then('automatic history compaction preserves branch tips current files and redo at zero retention',async function(){
  let repository=await this.repository.create('Forks',[file('main.ts','initial')]);
  const state=select(initialState(),repository.id);state.settings.global.historyLimit=0;
  await record(this,initialState(),state,'Open repository');
  const edit=async text=>{repository=(await record(this,state,state,`Edit ${text}`,{method:'write',args:[repository.id,'main.ts',text,repository.revision]})).repository;};
  await edit('common');await edit('old branch 1');await edit('old branch end');
  await undo(this);await undo(this);repository=await this.repository.open(repository.id);
  await edit('new branch 1');await edit('new branch 2');await edit('new branch end');
  await undo(this);repository=await this.repository.open(repository.id);
  const before=await this.repository.read(repository.id,'main.ts');
  const plan=await retention(this);assert.equal(plan.changed,true);
  repository=await this.repository.open(repository.id);
  assert.equal(await this.repository.read(repository.id,'main.ts'),before);assert.equal(this.activity.canRedo,true);
  const historyContext={fs:this.shared.fs,gitdir:repositoryPaths(repository.id,this.root).historyGitdir};
  const tips=await Promise.all(repository.history.map(async entry=>new TextDecoder().decode((await git.readBlob({...historyContext,oid:entry.oid,filepath:'main.ts'})).blob)));
  assert.ok(tips.includes('old branch end'));assert.ok(tips.includes('new branch end'));
  await redo(this);assert.equal(await this.repository.read(repository.id,'main.ts'),'new branch end');
  await undo(this);assert.equal(await this.repository.read(repository.id,'main.ts'),before);
});
Then('unpublished history compaction is harmless and collection can finish after publication',async function(){
  let repository=await this.repository.create('Recovery',[file('main.ts','initial')]);
  const state=select(initialState(),repository.id);state.settings.global.historyLimit=1;
  await record(this,initialState(),state,'Open');
  for(let i=1;i<=5;i++)repository=(await record(this,state,state,`Edit ${i}`,{method:'write',args:[repository.id,'main.ts',String(i),repository.revision]})).repository;
  const before=await this.repository.open(repository.id),activityBefore=clone(this.applicationRecord);
  await retention(this,false,false);
  assert.deepEqual(await this.repository.open(repository.id),before);assert.deepEqual(this.applicationRecord,activityBefore);
  const plan=await retention(this,true,false);
  assert.equal(await this.repository.read(repository.id,'main.ts'),'5');
  const {finishHistoryRetention}=await import('./history-retention.ts');
  await finishHistoryRetention(this.shared,plan);await finishHistoryRetention(this.shared,plan);
  this.reopen();this.activity=await this.application.loadActivity();
  await undo(this);assert.equal(await this.repository.read(repository.id,'main.ts'),'4');
  await redo(this);assert.equal(await this.repository.read(repository.id,'main.ts'),'5');
});

Then('retained checkout checkpoints still undo independently from source Git',async function(){
  let repository=await this.repository.create('Checkout retention',[file('main.ts','version A')]);
  const state=select(initialState(),repository.id);
  await record(this,initialState(),state,'Open');
  const author={name:'Test',email:'test@example.invalid'};
  repository=await this.repository.commit(repository.id,'Version A',author,repository.revision);const a=repository.head;
  repository=(await record(this,state,state,'Edit B',{method:'write',args:[repository.id,'main.ts','version B',repository.revision]})).repository;
  repository=await this.repository.commit(repository.id,'Version B',author,repository.revision);
  repository=(await record(this,state,state,'Checkout A',{method:'checkoutCommit',args:[repository.id,a,repository.revision]})).repository;
  repository=(await record(this,state,state,'Edit A',{method:'write',args:[repository.id,'main.ts','edited A',repository.revision]})).repository;
  assert.equal((await retention(this)).changed,false);
  await undo(this);assert.equal(await this.repository.read(repository.id,'main.ts'),'version A');
  await undo(this);assert.equal(await this.repository.read(repository.id,'main.ts'),'version B');
  assert.equal((await this.repository.open(repository.id)).head,a);
});

Then('scoped history independently restores files and settings without replaying navigation',async function(){
  let first=await this.repository.create('Scoped first',[file('main.ts','one')]);
  let second=await this.repository.create('Scoped second',[file('main.ts','two')]);
  let state=select(initialState(),first.id);
  await record(this,initialState(),state,'Open first');
  first=(await record(this,state,state,'Edit first',{method:'write',args:[first.id,'main.ts','one edited',first.revision]})).repository;
  const configured=clone(state);configured.settings.global.fontSize=19;
  await record(this,state,configured,'Configure global');state=configured;
  const switched=select(state,second.id);await record(this,state,switched,'Switch repository');state=switched;
  second=(await record(this,state,state,'Edit second',{method:'write',args:[second.id,'main.ts','two edited',second.revision]})).repository;
  // Existing global journals migrate to domain indexes without manufacturing edits.
  delete this.applicationRecord.scoped;this.reopen();this.activity=await this.application.loadActivity();
  const navigate=async(direction,scope)=>{
    const result=await this.application[direction==='undo'?'undoActivity':'redoActivity'](this.activity.revision,{repositoryId:second.id,state,scope});
    this.activity=result.activity;state=result.activity.state;return result;
  };
  await navigate('undo',{kind:'repository',repositoryId:first.id});
  assert.equal(await this.repository.read(first.id,'main.ts'),'one');assert.equal(await this.repository.read(second.id,'main.ts'),'two edited');
  assert.equal(state.settings.global.fontSize,19);assert.equal(state.workspace.repositoryId,second.id);
  const exhausted=this.activity.revision;
  await navigate('undo',{kind:'repository',repositoryId:first.id});
  assert.equal(this.activity.revision,exhausted);assert.equal(await this.repository.read(second.id,'main.ts'),'two edited');
  await navigate('undo',{kind:'settings',scope:'global'});
  assert.equal(state.settings.global.fontSize,13);assert.equal(await this.repository.read(second.id,'main.ts'),'two edited');
  const viewed=clone(state);viewed.workspace.rightPanes=['history'];await record(this,state,viewed,'Select History');state=viewed;
  this.reopen();this.activity=await this.application.loadActivity();
  await navigate('redo',{kind:'repository',repositoryId:first.id});
  assert.equal(await this.repository.read(first.id,'main.ts'),'one edited');assert.equal(state.settings.global.fontSize,13);
  assert.equal(state.workspace.repositoryId,second.id);assert.equal(state.workspace.page,'editor');assert.deepEqual(state.workspace.rightPanes,['history']);
  await navigate('redo',{kind:'settings',scope:'global'});
  assert.equal(state.settings.global.fontSize,19);assert.equal(await this.repository.read(first.id,'main.ts'),'one edited');
});

Then('settings scopes retain independent undo and redo paths',async function(){
  const repo=await this.repository.create('Scoped settings',[file('main.ts','source')]);
  let state=select(initialState(),repo.id);
  const save=async change=>{const next=clone(state);change(next.settings);await record(this,state,next,'Change scoped settings');state=next;};
  await save(value=>{value.global.fontSize=19;});
  await save(value=>{value.repositories[repo.id]={lineWrapping:true};});
  const navigate=async(direction,scope)=>{const result=await this.application[direction==='undo'?'undoActivity':'redoActivity'](this.activity.revision,{repositoryId:repo.id,state,scope});this.activity=result.activity;state=result.activity.state;};
  await navigate('undo',{kind:'settings',scope:'repository',repositoryId:repo.id});
  assert.equal(state.settings.global.fontSize,19);assert.equal(state.settings.repositories[repo.id],undefined);
  await save(value=>{value.global.fontSize=20;});
  this.reopen();this.activity=await this.application.loadActivity();
  await navigate('redo',{kind:'settings',scope:'repository',repositoryId:repo.id});
  assert.equal(state.settings.repositories[repo.id].lineWrapping,true);assert.equal(state.settings.global.fontSize,20);
  await navigate('undo',{kind:'settings',scope:'global'});
  assert.equal(state.settings.global.fontSize,19);assert.equal(state.settings.repositories[repo.id].lineWrapping,true);
  await navigate('redo',{kind:'settings',scope:'global'});
  assert.equal(state.settings.global.fontSize,20);assert.equal(Object.hasOwn(state.settings,'files'),false);
  assert.equal(await this.repository.read(repo.id,'main.ts'),'source');
});

Then('scoped repository undo recovers its prepared journal independently',async function(){
  const repo=await this.repository.create('Scoped recovery',[file('main.ts','before')]);
  let state=select(initialState(),repo.id);
  await record(this,state,state,'Edit',{method:'write',args:[repo.id,'main.ts','after',repo.revision]});
  const configured=clone(state);configured.settings.global.fontSize=21;configured.workspace.rightPanes=['settings'];
  await record(this,state,configured,'Settings');state=configured;
  this.failAt='activity-prepared';
  await assert.rejects(this.application.undoActivity(this.activity.revision,{repositoryId:repo.id,state,scope:{kind:'repository',repositoryId:repo.id}}),/interrupted/);
  this.reopen();this.activity=await this.application.loadActivity();
  assert.equal(await this.repository.read(repo.id,'main.ts'),'before');assert.equal(this.activity.state.settings.global.fontSize,21);
  assert.equal(this.activity.state.workspace.page,'editor');assert.deepEqual(this.activity.state.workspace.rightPanes,['settings']);assert.equal(this.preferences.global.fontSize,21);
});

Then('scoped redo survives startup history retention and reload',async function(){
  let repo=await this.repository.create('Scoped retention',[file('main.ts','initial')]);
  let state=select(initialState(),repo.id);state.settings.global.historyLimit=1;
  await record(this,initialState(),state,'Preferences');
  for(let index=0;index<5;index++)repo=(await record(this,state,state,'Edit',{method:'write',args:[repo.id,'main.ts',`edit ${index}`,repo.revision]})).repository;
  const configured=clone(state);configured.settings.global.fontSize=20;await record(this,state,configured,'Font');state=configured;
  const navigate=async(direction,scope)=>{const result=await this.application[direction==='undo'?'undoActivity':'redoActivity'](this.activity.revision,{repositoryId:repo.id,state,scope});this.activity=result.activity;state=result.activity.state;};
  await navigate('undo',{kind:'repository',repositoryId:repo.id});
  await navigate('undo',{kind:'settings',scope:'global'});
  const plan=await retention(this);assert.equal(plan.changed,true);
  this.reopen();this.activity=await this.application.loadActivity();
  await navigate('redo',{kind:'settings',scope:'global'});assert.equal(state.settings.global.fontSize,20);
  await navigate('redo',{kind:'repository',repositoryId:repo.id});assert.equal(await this.repository.read(repo.id,'main.ts'),'edit 4');
  assert.equal(state.settings.global.fontSize,20);
});

Then('scoped legacy redo materializes every future without touching settings',async function(){
  let repo=await this.repository.create('Scoped legacy',[file('main.ts','initial')]);
  repo=await this.repository.write(repo.id,'main.ts','first',repo.revision);
  repo=await this.repository.write(repo.id,'main.ts','second',repo.revision);
  repo=await this.repository.undo(repo.id,repo.revision);repo=await this.repository.undo(repo.id,repo.revision);
  const initial=select(initialState(),repo.id),state=clone(initial);state.settings.global.fontSize=23;
  await record(this,initial,state,'Settings');
  for(const expected of ['first','second']){
    const result=await this.application.redoActivity(this.activity.revision,{repositoryId:repo.id,state,scope:{kind:'repository',repositoryId:repo.id}});
    this.activity=result.activity;assert.equal(await this.repository.read(repo.id,'main.ts'),expected);
    assert.equal(this.activity.state.settings.global.fontSize,23);
  }
});

Then('scoped file history performs one snapshot scan per undo and redo',async function(){
  let repository=await this.repository.create('Efficient navigation',[file('main.ts','initial'),file('stable.bin',new Uint8Array([0,255]))]);
  const opened=select(initialState(),repository.id);
  repository=(await record(this,opened,opened,'Edit main',{method:'write',args:[repository.id,'main.ts','changed',repository.revision]})).repository;
  const events=[];this.repositoryOptions.onProgress=event=>events.push(event);
  this.reopen();repository=await this.repository.open(repository.id);
  const originalOpen=this.repository.open;let opens=0;
  this.repository.open=async(...args)=>{opens++;return originalOpen(...args);};
  for(const navigate of [undo,redo]){
    events.length=0;const result=await navigate(this,{repositoryId:repository.id,state:opened,scope:{kind:'repository',repositoryId:repository.id}});
    repository=result.repository;
    assert.equal(opens,0,'preflight validates metadata without opening a full repository snapshot');
    assert.equal(events.filter(event=>event.item==='files.scan'&&event.status==='running').length,1);
    assert.equal(events.filter(event=>event.item==='git.edits'&&event.status==='running').length,1);
    assert.deepEqual(result.activity.state,opened);
  }
  assert.equal(await this.repository.read(repository.id,'main.ts'),'changed');
});

Then('an uncached history entry failure leaves files unchanged and retries successfully',async function(){
  let repository=await this.repository.create('Read failure',[file('main.ts','initial')]);
  const opened=select(initialState(),repository.id);
  repository=(await record(this,opened,opened,'Edit main',{method:'write',args:[repository.id,'main.ts','changed',repository.revision]})).repository;
  const entry=this.applicationRecord.current;
  const commit=await git.readCommit({...this.git,oid:entry});
  const tree=await git.readTree({...this.git,oid:commit.commit.tree});
  const blob=tree.tree.find(item=>item.path==='activity.json').oid;
  const broken=`${this.git.gitdir}/objects/${blob.slice(0,2)}/${blob.slice(2)}`;
  const read=this.shared.fs.promises.readFile;let failing=true;
  this.shared.fs.promises.readFile=async(path,...args)=>{if(path===broken&&failing)throw Error('activity storage unavailable');return read(path,...args);};
  this.reopen();
  const context={repositoryId:repository.id,state:opened,scope:{kind:'repository',repositoryId:repository.id}};
  try{
    await assert.rejects(undo(this,context),error=>error instanceof git.Errors.NotFoundError);
    assert.equal(this.applicationPending,undefined);assert.equal(await this.repository.read(repository.id,'main.ts'),'changed');
    failing=false;await undo(this,context);assert.equal(await this.repository.read(repository.id,'main.ts'),'initial');
    await redo(this,context);assert.equal(await this.repository.read(repository.id,'main.ts'),'changed');
  }finally{this.shared.fs.promises.readFile=read;}
});
Then('private retention preserves pending Git operation checkpoints',async function(){
 let repository=await this.repository.create('Conflict retention',[file('main.ts','base')]);
 const state=select(initialState(),repository.id);state.settings.global.historyLimit=1;
 await record(this,initialState(),state,'Open repository');
 const author={name:'Test',email:'test@example.invalid'};
 const act=async(kind,args={})=>{repository=(await record(this,state,state,`Git ${kind}`,{method:'gitAction',args:[repository.id,{kind,author,...args},repository.revision]})).repository;};
 const edit=async text=>{repository=(await record(this,state,state,'Edit',{method:'write',args:[repository.id,'main.ts',text,repository.revision]})).repository;};
 for(let i=0;i<5;i++)await edit(`base ${i}`);
 await act('stage');await act('commit',{message:'Base'});
 repository=await this.repository.createBranch(repository.id,'feature',repository.revision);await edit('feature');await act('stage');await act('commit',{message:'Feature'});
 repository=await this.repository.switchBranch(repository.id,'main',repository.revision);await edit('main');await act('stage');await act('commit',{message:'Main'});const head=repository.head;
 await act('merge',{target:'feature',mode:'merge'});assert.equal((await this.repository.gitStatus(repository.id)).operation.kind,'merge');
 const plan=await retention(this);assert.equal(plan.changed,true);repository=await this.repository.open(repository.id);
 await act('abort');assert.equal(await this.repository.read(repository.id,'main.ts'),'main');assert.equal(repository.head,head);
});

Then('legacy file settings cannot return through history reload undo or redo',async function(){
  const repo=await this.repository.create('Legacy settings',[file('main.ts','source')]);
  const before=select(initialState(),repo.id);before.settings.repositories[repo.id]={tabSize:4};
  const after=clone(before);after.settings.global.fontSize=19;after.settings.repositories[repo.id]={tabSize:6};
  await record(this,before,after,'Legacy scoped settings');
  const context={fs:this.shared.fs,gitdir:`${this.root}/history/application.git`};
  const commit=(await git.readCommit({...context,oid:this.applicationRecord.current})).commit;
  const entry=JSON.parse(new TextDecoder().decode((await git.readBlob({...context,oid:this.applicationRecord.current,filepath:'activity.json'})).blob));
  for(const state of [entry.before,entry.after])state.settings.files={[repo.id]:{'main.ts':{tabSize:12,readOnly:true}}};
  const blob=await git.writeBlob({...context,blob:new TextEncoder().encode(JSON.stringify(entry))});
  const tree=await git.writeTree({...context,tree:[{mode:'100644',path:'activity.json',oid:blob,type:'blob'}]});
  const oid=await git.writeCommit({...context,commit:{...commit,tree}});
  this.applicationRecord.current=oid;this.applicationRecord.undo=[oid];delete this.applicationRecord.scoped;
  this.applicationRecord.state=clone(entry.after);this.reopen();this.activity=await this.application.loadActivity();
  let state=this.activity.state;assert.equal(Object.hasOwn(state.settings,'files'),false);
  const navigate=async(direction,scope)=>{const result=await this.application[direction==='undo'?'undoActivity':'redoActivity'](this.activity.revision,{repositoryId:repo.id,state,scope});this.activity=result.activity;state=result.activity.state;assert.equal(Object.hasOwn(state.settings,'files'),false);};
  await navigate('undo',{kind:'settings',scope:'global'});
  assert.equal(state.settings.global.fontSize,13);assert.equal(state.settings.repositories[repo.id].tabSize,6);
  await navigate('redo',{kind:'settings',scope:'global'});
  assert.equal(state.settings.global.fontSize,19);
  await navigate('undo',{kind:'settings',scope:'repository',repositoryId:repo.id});
  assert.equal(state.settings.repositories[repo.id].tabSize,4);assert.equal(state.settings.global.fontSize,19);
  assert.equal(await this.repository.read(repo.id,'main.ts'),'source');assert.equal((await this.repository.open(repo.id)).head,repo.head);
});
