// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import * as git from 'isomorphic-git';
import {repositoryPaths} from './paths.ts';
const author={name:'Git test',email:'git@example.invalid'};
const files=(...entries)=>entries.map(([path,text])=>({path,data:new TextEncoder().encode(text)}));
async function action(w,s,kind,args={}){return w.engine.gitAction(s.id,{kind,author,...args},s.revision);}
async function baseline(w){let s=await w.engine.create('Git workflow',files(['main.txt','base\n']));s=await action(w,s,'stage');return action(w,s,'commit',{message:'Initial source'});}
const context=(w,s)=>({fs:w.fs,...repositoryPaths(s.id,w.root)});
Then('local Git stages commits and preserves unstaged changes',async function(){
 let s=await baseline(this);s=await this.engine.write(s.id,'main.txt','staged\n',s.revision);s=await action(this,s,'stage');
 s=await this.engine.write(s.id,'main.txt','later\n',s.revision);s=await action(this,s,'commit',{message:'Only staged'});
 assert.equal(await this.engine.readCommitted(s.id,'main.txt',s.head),'staged\n');assert.equal(await this.engine.read(s.id,'main.txt'),'later\n');
 let status=await this.engine.gitStatus(s.id);assert.equal(status.files[0].stage,1);assert.equal(status.files[0].work,2);
 s=await action(this,s,'stage',{path:'main.txt',content:'partial\n'});s=await action(this,s,'commit',{message:'Partial stage'});
 assert.equal(await this.engine.readCommitted(s.id,'main.txt',s.head),'partial\n');assert.equal(await this.engine.read(s.id,'main.txt'),'later\n');
 s=await action(this,s,'stage');s=await action(this,s,'unstage');status=await this.engine.gitStatus(s.id);assert.ok(status.files.every(f=>f.stage===f.head));
 s=await action(this,s,'discard',{paths:['main.txt']});assert.equal(await this.engine.read(s.id,'main.txt'),'partial\n');
});
Then('local Git merges resolve conflicts and abort without losing changes',async function(){
 let s=await baseline(this);const base=s.head;s=await this.engine.createBranch(s.id,'feature',s.revision);
 s=await this.engine.write(s.id,'main.txt','feature\n',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Feature'});const feature=s.head;
 s=await this.engine.switchBranch(s.id,'main',s.revision);s=await this.engine.write(s.id,'main.txt','main\n',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Main'});const main=s.head;
 s=await action(this,s,'merge',{target:'feature',message:'Merge feature',mode:'merge'});
 let status=await this.engine.gitStatus(s.id);assert.deepEqual(status.operation.conflicts,['main.txt']);assert.equal(s.head,main);
 this.engine=this.open();s=await this.engine.open(s.id);assert.equal((await this.engine.gitStatus(s.id)).operation.kind,'merge');
 s=await action(this,s,'abort');assert.equal(await this.engine.read(s.id,'main.txt'),'main\n');assert.equal(s.head,main);
 s=await action(this,s,'merge',{target:'feature',mode:'merge'});s=await action(this,s,'resolve',{path:'main.txt',content:'resolved\n'});s=await action(this,s,'continue');
 assert.equal((await this.engine.gitStatus(s.id)).operation,null);assert.equal(await this.engine.read(s.id,'main.txt'),'resolved\n');
 assert.deepEqual((await git.readCommit({...context(this,s),oid:s.head})).commit.parent,[main,feature]);assert.notEqual(base,s.head);
});
Then('local Git rewrites and replays source commits safely',async function(){
 let s=await baseline(this);const base=s.head;s=await this.engine.createBranch(s.id,'feature',s.revision);
 s=await this.engine.createFile(s.id,'feature.txt','feature',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Feature one'});const first=s.head;
 s=await this.engine.write(s.id,'feature.txt','feature two',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Feature two'});
 s=await this.engine.switchBranch(s.id,'main',s.revision);s=await this.engine.createFile(s.id,'main-only.txt','main',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Main advances'});const main=s.head;
 s=await this.engine.switchBranch(s.id,'feature',s.revision);s=await action(this,s,'rebase',{target:'main'});assert.equal(await this.engine.read(s.id,'feature.txt'),'feature two');assert.equal(await this.engine.read(s.id,'main-only.txt'),'main');
 const commits=await git.log({...context(this,s),ref:s.head});assert.equal(commits[2].oid,main);
 const oldest=commits[1].oid;s=await action(this,s,'squash',{target:oldest,message:'Combined feature'});assert.deepEqual((await git.readCommit({...context(this,s),oid:s.head})).commit.parent,[main]);
 s=await action(this,s,'amend',{message:'Feature complete'});assert.equal(s.commits.find(c=>c.oid===s.head).message,'Feature complete');
 assert.ok((await this.engine.gitStatus(s.id)).recoveries.length>=3);
 s=await this.engine.switchBranch(s.id,'main',s.revision);s=await action(this,s,'cherry-pick',{target:first});assert.equal(await this.engine.read(s.id,'feature.txt'),'feature');const cherry=s.head;
 s=await action(this,s,'revert',{target:cherry});assert.ok(!s.files.includes('feature.txt'));assert.notEqual(s.head,base);
});
Then('local Git stashes restore the staging split and protect untracked files',async function(){
 let s=await baseline(this);s=await this.engine.write(s.id,'main.txt','staged',s.revision);s=await action(this,s,'stage');s=await this.engine.write(s.id,'main.txt','working',s.revision);
 s=await this.engine.createFile(s.id,'new.txt','untracked',s.revision);s=await action(this,s,'stash-push',{includeUntracked:true,message:'Save my work'});
 assert.equal(await this.engine.read(s.id,'main.txt'),'base\n');assert.ok(!s.files.includes('new.txt'));
 const stash=(await this.engine.gitStatus(s.id)).stashes[0];assert.ok(stash);
 s=await action(this,s,'stash-pop',{target:stash.oid});assert.equal(await this.engine.read(s.id,'main.txt'),'working');assert.equal(await this.engine.read(s.id,'new.txt'),'untracked');
 const status=await this.engine.gitStatus(s.id);assert.equal(status.stashes.length,0);const row=status.files.find(f=>f.path==='main.txt');assert.equal(row.stage,3);assert.equal(row.work,2);
});
Then('local Git publication recovers at {string}',async function(stage){
 let s=await baseline(this);s=await this.engine.write(s.id,'main.txt','next',s.revision);s=await action(this,s,'stage');
 this.failAt=stage;const expected=s.revision;await assert.rejects(()=>action(this,s,'commit',{message:'Recover commit'}),/interrupted/);
 this.engine=this.open();s=await this.engine.open(s.id);const head=s.head;assert.equal(await this.engine.readCommitted(s.id,'main.txt',head),'next');
 s=await this.engine.gitAction(s.id,{kind:'commit',author,message:'Recover commit'},expected);assert.equal(s.head,head);
});
Then('local Git supports fast-forward squash merge and reference maintenance',async function(){
 let s=await baseline(this);s=await this.engine.createBranch(s.id,'topic',s.revision);
 s=await this.engine.createFile(s.id,'topic.txt','first',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Topic'});const tip=s.head;
 s=await this.engine.switchBranch(s.id,'main',s.revision);s=await action(this,s,'merge',{target:'topic',mode:'ff-only'});assert.equal(s.head,tip);
 s=await this.engine.switchBranch(s.id,'topic',s.revision);s=await this.engine.write(s.id,'topic.txt','second',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Second topic'});
 s=await this.engine.switchBranch(s.id,'main',s.revision);s=await action(this,s,'merge',{target:'topic',mode:'squash',message:'Combined changes'});
 assert.deepEqual((await git.readCommit({...context(this,s),oid:s.head})).commit.parent,[tip]);
 s=await action(this,s,'tag',{target:s.head,name:'v1-test'});assert.equal((await this.engine.gitStatus(s.id)).tags[0].name,'v1-test');
 s=await action(this,s,'rename-branch',{target:'topic',name:'topic/nested'});assert.ok(s.branches.includes('topic/nested'));
 s=await action(this,s,'rename-branch',{target:'topic/nested',name:'renamed'});assert.ok(s.branches.includes('renamed'));
 s=await action(this,s,'delete-branch',{name:'renamed',force:true});assert.ok(!s.branches.includes('renamed'));
 s=await action(this,s,'delete-tag',{name:'v1-test',force:true});assert.equal((await this.engine.gitStatus(s.id)).tags.length,0);
});
Then('local Git soft mixed and hard resets preserve the appropriate states',async function(){
 for(const mode of ['soft','mixed','hard']){
 let s=await baseline(this);const base=s.head;s=await this.engine.write(s.id,'main.txt','second',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Second'});
 s=await this.engine.write(s.id,'main.txt','third',s.revision);s=await action(this,s,'stage');s=await this.engine.write(s.id,'main.txt','fourth',s.revision);
 s=await action(this,s,'reset',{target:base,mode,force:true});assert.equal(s.head,base);
 assert.equal(await this.engine.read(s.id,'main.txt'),mode==='hard'?'base\n':'fourth');
 const diff=await this.engine.gitDiff(s.id,{path:'main.txt',kind:'staged'});assert.equal(diff.after,mode==='soft'?'third':'base\n');
 assert.equal((await this.engine.gitStatus(s.id)).recoveries.length,1);
 }
});
Then('local Git rebase conflicts survive reload and support every exit',async function(){
 for(const exit of ['continue','skip','abort']){
 let s=await baseline(this);s=await this.engine.createBranch(s.id,'feature',s.revision);s=await this.engine.write(s.id,'main.txt','feature',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Feature'});const feature=s.head;
 s=await this.engine.switchBranch(s.id,'main',s.revision);s=await this.engine.write(s.id,'main.txt','main',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Main'});const main=s.head;
 s=await this.engine.switchBranch(s.id,'feature',s.revision);s=await action(this,s,'rebase',{target:'main'});assert.equal((await this.engine.gitStatus(s.id)).operation.kind,'rebase');
 this.engine=this.open();s=await this.engine.open(s.id);
 if(exit==='continue')s=await action(this,s,'resolve',{path:'main.txt',content:'combined'});
 s=await action(this,s,exit);assert.equal((await this.engine.gitStatus(s.id)).operation,null);
 assert.equal(await this.engine.read(s.id,'main.txt'),exit==='continue'?'combined':exit==='skip'?'main':'feature');
 if(exit==='abort')assert.equal(s.head,feature);if(exit==='skip')assert.equal(s.head,main);
 }
});
Then('local Git refuses destructive stash application and retains recovery data',async function(){
 let s=await baseline(this);s=await this.engine.createFile(s.id,'untracked.txt','saved',s.revision);s=await action(this,s,'stash-push',{includeUntracked:true,message:'Untracked'});
 const stash=(await this.engine.gitStatus(s.id)).stashes[0];s=await this.engine.createFile(s.id,'untracked.txt','new data',s.revision);
 await assert.rejects(()=>action(this,s,'stash-pop',{target:stash.oid}),/overwrite/);
 assert.equal(await this.engine.read(s.id,'untracked.txt'),'new data');assert.equal((await this.engine.gitStatus(s.id)).stashes.length,1);
});
Then('local Git stashes leave ignored files and binary resolutions intact',async function(){
 let s=await baseline(this);s=await this.engine.createFile(s.id,'.gitignore','ignored.bin\n',s.revision);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Ignore generated data'});
 s=await this.engine.addFiles(s.id,[{path:'ignored.bin',data:new Uint8Array([0,255,1])},{path:'new.bin',data:new Uint8Array([0,254,2])}],s.revision);
 s=await action(this,s,'stash-push',{includeUntracked:true});assert.ok(s.files.includes('ignored.bin'));assert.ok(!s.files.includes('new.bin'));
 const stash=(await this.engine.gitStatus(s.id)).stashes[0];s=await action(this,s,'stash-pop',{target:stash.oid});assert.ok(s.files.includes('new.bin'));
 assert.deepEqual([...await this.fs.promises.readFile(`${repositoryPaths(s.id,this.root).dir}/new.bin`)],[0,254,2]);
});
Then('local Git resolves annotated tags and restores stashes from packed repositories',async function(){
 let s=await baseline(this);const base=s.head;s=await action(this,s,'tag',{target:base,name:'annotated',message:'Release test'});
 s=await this.engine.write(s.id,'main.txt','stash payload',s.revision);s=await action(this,s,'stash-push');const stash=(await this.engine.gitStatus(s.id)).stashes[0];
 const ctx=context(this,s), objects=`${ctx.gitdir}/objects`, oids=[];
 for(const prefix of await this.fs.promises.readdir(objects))if(/^[0-9a-f]{2}$/.test(prefix))for(const name of await this.fs.promises.readdir(`${objects}/${prefix}`))if(/^[0-9a-f]{38}$/.test(name))oids.push(prefix+name);
 const pack=await git.packObjects({...ctx,oids,write:true});await git.indexPack({...ctx,filepath:`.git/objects/pack/${pack.filename}`});
 for(const oid of oids)await this.fs.promises.unlink(`${objects}/${oid.slice(0,2)}/${oid.slice(2)}`);
 s=await action(this,s,'stash-pop',{target:stash.oid});assert.equal(await this.engine.read(s.id,'main.txt'),'stash payload');
 s=await action(this,s,'reset',{target:'refs/tags/annotated',mode:'hard',force:true});assert.equal(s.head,base);assert.equal(await this.engine.read(s.id,'main.txt'),'base\n');
});
Then('local Git binary conflicts preserve incoming and current bytes',async function(){
 let s=await this.engine.create('Binary merge',[{path:'image.bin',data:new Uint8Array([0,255,1])}]);s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Binary base'});
 s=await this.engine.createBranch(s.id,'feature',s.revision);await this.fs.promises.writeFile(`${repositoryPaths(s.id,this.root).dir}/image.bin`,new Uint8Array([0,254,2]));s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Binary feature'});
 s=await this.engine.switchBranch(s.id,'main',s.revision);await this.fs.promises.writeFile(`${repositoryPaths(s.id,this.root).dir}/image.bin`,new Uint8Array([0,253,3]));s=await action(this,s,'stage');s=await action(this,s,'commit',{message:'Binary main'});
 s=await action(this,s,'merge',{target:'feature',mode:'merge'});assert.deepEqual((await this.engine.gitStatus(s.id)).operation.conflicts,['image.bin']);
 assert.deepEqual([...await this.fs.promises.readFile(`${repositoryPaths(s.id,this.root).dir}/image.bin`)],[0,253,3]);
 s=await action(this,s,'resolve',{path:'image.bin',resolution:'theirs'});s=await action(this,s,'continue');assert.deepEqual([...await this.fs.promises.readFile(`${repositoryPaths(s.id,this.root).dir}/image.bin`)],[0,254,2]);
});
Then('local Git branch renames preserve upstream configuration and staged files',async function(){
 let s=await baseline(this);const head=s.head;const ctx=context(this,s);
 await git.setConfig({...ctx,path:'branch.main.remote',value:'origin'});await git.setConfig({...ctx,path:'branch.main.merge',value:'refs/heads/main'});
 s=await this.engine.write(s.id,'main.txt','staged edit',s.revision);s=await action(this,s,'stage');
 s=await action(this,s,'rename-branch',{target:'main',name:'renamed'});assert.equal(s.branch,'renamed');assert.equal(s.head,head);
 assert.equal(await git.getConfig({...ctx,path:'branch.renamed.remote'}),'origin');assert.equal(await git.getConfig({...ctx,path:'branch.renamed.merge'}),'refs/heads/main');
 assert.equal((await this.engine.gitDiff(s.id,{path:'main.txt',kind:'staged'})).after,'staged edit');assert.ok(!s.branches.includes('main'));
});
Then('local Git refuses foreign operation metadata without changing its index or refs',async function(){
 let s=await baseline(this);const ctx=context(this,s), before=s.head,index=await this.fs.promises.readFile(`${ctx.gitdir}/index`);
 await this.fs.promises.writeFile(`${ctx.gitdir}/MERGE_HEAD`,before+'\n');
 await assert.rejects(()=>action(this,s,'commit',{message:'Do not lose the merge parent'}),/unfinished Git operation/);
 assert.equal((await this.engine.open(s.id)).head,before);assert.deepEqual(await this.fs.promises.readFile(`${ctx.gitdir}/index`),index);
});
