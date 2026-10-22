// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as git from 'isomorphic-git';
import {normalizeSettings,resolveSettings} from '../editor/settings.ts';
import {repositoryPaths} from './paths.ts';
import type {EngineOptions,RepositoryRecord} from './core.ts';
import type {ActivityRecord,Entry} from './application-history.ts';

type Context={fs:git.PromiseFsClient;gitdir:string};
type Commit=Awaited<ReturnType<typeof git.readCommit>>['commit'];
type Graph={order:string[];commits:Map<string,Commit>};
export type RetentionPlan={repositories:RepositoryRecord[];activity:ActivityRecord;changed:boolean};

async function graph(context:Context,roots:string[]):Promise<Graph>{
  const commits=new Map<string,Commit>(),order:string[]=[],done=new Set<string>();
  // Iterative postorder supports histories substantially longer than the JS stack.
  for(const root of new Set(roots)){
    const pending=[root];
    while(pending.length){
      const oid=pending.at(-1)!;
      let commit=commits.get(oid);
      if(!commit){commit=(await git.readCommit({...context,oid})).commit;commits.set(oid,commit);}
      const parent=commit.parent.find(oid=>!done.has(oid));
      if(parent){pending.push(parent);continue;}
      pending.pop();if(!done.has(oid)){done.add(oid);order.push(oid);}
    }
  }
  return {order,commits};
}
const unique=(items:string[])=>[...new Set(items)];
const repositoryRoots=(record:RepositoryRecord)=>unique([record.current,...record.undo,...record.redo,...record.futures,
  ...Object.values(record.autoStashes??{}).flatMap(stash=>[stash.working,stash.index]),
  ...Object.values(record.changeGraphs??{}).flatMap(scope=>[scope.baseline,...scope.revisions])]);
const activityRoots=(record:ActivityRecord)=>unique([...(record.current?[record.current]:[]),...record.undo,...record.redo,...record.futures,
  ...Object.values(record.scoped??{}).flatMap(history=>[...history.undo,...history.redo])]);

/** Plan immutable replacement objects only. The caller publishes all metadata atomically. */
export async function planHistoryRetention(options:Pick<EngineOptions,'fs'|'root'>,records:RepositoryRecord[],activity:ActivityRecord,preferences:unknown):Promise<RetentionPlan>{
  const root=options.root??'',fs=options.fs;
  const settings=normalizeSettings(activity.state?.settings??preferences);
  const appContext={fs,gitdir:`${root}/history/application.git`};
  const appGraph=await graph(appContext,activityRoots(activity));
  const entries=new Map<string,Entry>(),extraRoots=new Map<string,string[]>();
  for(const oid of appGraph.order){
    const blob=await git.readBlob({...appContext,oid,filepath:'activity.json'});
    const entry=JSON.parse(new TextDecoder().decode(blob.blob)) as Entry;
    entries.set(oid,entry);
    if(entry.repository){const item=entry.repository;
      const roots=extraRoots.get(item.id)??[];roots.push(item.before,item.after);extraRoots.set(item.id,roots);}
  }
  const rewritten=new Map<string,Map<string,string>>();
  const repositories:RepositoryRecord[]=[];
  let changed=false;
  for(const record of records){
    const context={fs,gitdir:repositoryPaths(record.id,root).historyGitdir};
    const data=await graph(context,[...repositoryRoots(record),...(extraRoots.get(record.id)??[])]);
    const selected=new Set<string>(),keep=new Set<string>();
    const revisions=unique(Object.values(record.changeGraphs??{}).flatMap(scope=>scope.revisions));
    // Older unscoped stores are migrated by repository.open before maintenance.
    const candidates=new Set(revisions);
    const touched=await changedPaths(context,data);
    const counts=new Map<string,number>();
    // Scope append order breaks equal-second timestamp ties without using random hashes.
    const sequence=new Map((record.historyOrder??revisions).map((oid,index)=>[oid,index]));
    const chronological=[...revisions].sort((a,b)=>record.historyOrder&&sequence.has(a)&&sequence.has(b)
      ? sequence.get(a)!-sequence.get(b)!
      : data.commits.get(a)!.author.timestamp-data.commits.get(b)!.author.timestamp||
        (sequence.get(a)??-1)-(sequence.get(b)??-1));
    for(const oid of [...chronological].reverse()){
      if(!candidates.has(oid))continue;
      let retain=false;
      for(const path of touched.get(oid)??[]){
        const count=counts.get(path)??0;
        const limit=resolveSettings(settings,record.id,path).historyLimit;
        if(count<limit)retain=true;
        counts.set(path,count+1);
      }
      if(retain)selected.add(oid);
    }
    // Cursor, branch endpoints, scope baselines and forks are structural checkpoints,
    // not a shared file-history budget. They keep every surviving branch loadable.
    // Checkout/setup snapshots are not automatic file edits. Their source-view
    // navigation and recovery semantics are outside the edit-retention budget.
    for(const oid of data.order)if(!candidates.has(oid))keep.add(oid);
    keep.add(record.current);
    for(const oid of record.futures)keep.add(oid);
    if(record.redo[0])keep.add(record.redo[0]);
    const children=new Map<string,number>();
    for(const [oid,commit] of data.commits){
      if(!commit.parent.length)keep.add(oid);
      for(const parent of commit.parent)children.set(parent,(children.get(parent)??0)+1);
    }
    for(const oid of data.order)if(!children.get(oid)||children.get(oid)!>1)keep.add(oid);
    for(const scope of Object.values(record.changeGraphs??{})){
      keep.add(scope.baseline);
      // A scope's last state remains accessible even after switching source versions.
      if(scope.revisions.at(-1))keep.add(scope.revisions.at(-1)!);
    }
    for(const oid of selected)keep.add(oid);
    for(const stash of Object.values(record.autoStashes??{})){keep.add(stash.working);keep.add(stash.index);}
    if(keep.size===data.order.length){repositories.push(record);continue;}
    const promotedTrees=new Map<string,string>();
    const descendants=new Map<string,string[]>();
    for(const [oid,commit] of data.commits)for(const parent of commit.parent)
      descendants.set(parent,[...(descendants.get(parent)??[]),oid]);
    // Fold the discarded common prefix into its baseline, preserving the state
    // immediately before the first surviving action rather than an ancient import.
    for(const oid of data.order){
      if(data.commits.get(oid)!.parent.length)continue;
      let cursor=oid;
      while(descendants.get(cursor)?.length===1){
        const next=descendants.get(cursor)![0]!;
        if(keep.has(next))break;
        cursor=next;
      }
      promotedTrees.set(oid,data.commits.get(cursor)!.tree);
    }
    const mapping=new Map<string,string>();
    for(const oid of data.order){
      const commit=data.commits.get(oid)!;
      const parents=unique(commit.parent.map(parent=>mapping.get(parent)!));
      if(!keep.has(oid)){mapping.set(oid,parents[0]!);continue;}
      mapping.set(oid,await git.writeCommit({...context,commit:{...commit,tree:promotedTrees.get(oid)??commit.tree,parent:parents}}));
    }
    const map=(oid:string)=>mapping.get(oid)!;
    const current=map(record.current);
    const chain=(items:string[])=>items.map(map).filter((oid,index,all)=>oid!==current&&(index===0||oid!==all[index-1]));
    const next:RepositoryRecord={...record,revision:crypto.randomUUID(),current,undo:chain(record.undo),redo:chain(record.redo),
      futures:unique(record.futures.map(map)),historyOrder:chronological.filter(oid=>candidates.has(oid)&&keep.has(oid)).map(map),changeGraphs:Object.fromEntries(Object.entries(record.changeGraphs??{}).map(([key,scope])=>[key,{
        baseline:map(scope.baseline),revisions:unique(scope.revisions.filter(oid=>selected.has(oid)||
          // Branch tips are selectable; omitted forks remain graph junctions.
          (!children.get(oid))||oid===record.current||record.futures.includes(oid)||oid===record.redo[0]||oid===scope.revisions.at(-1)).map(map))
      }]))};
    if (record.gitOperation) next.gitOperation = { ...record.gitOperation, beforeFiles: map(record.gitOperation.beforeFiles) };
    if (record.autoStashes) next.autoStashes = Object.fromEntries(Object.entries(record.autoStashes).map(([key,stash])=>
      [key,{working:map(stash.working),index:map(stash.index)}]));
    delete next.lastAction;
    delete next.editGroup;
    repositories.push(next);rewritten.set(record.id,mapping);changed=true;
  }
  if(!changed)return {repositories,activity,changed:false};
  const mapped=new Map<string,string|null>();
  for(const oid of appGraph.order){
    const commit=appGraph.commits.get(oid)!,entry=structuredClone(entries.get(oid)!);
    const parent=commit.parent[0]?mapped.get(commit.parent[0]!)??null:null;
    if(entry.repository){
      const mapping=rewritten.get(entry.repository.id);
      if(mapping){
        const before=mapping.get(entry.repository.before),after=mapping.get(entry.repository.after);
        if(!before||!after)throw new Error('History retention could not resolve an application revision.');
        entry.repository={...entry.repository,before,after};
        if(before===after){mapped.set(oid,parent);continue;}
      }
    }
    const blob=await git.writeBlob({...appContext,blob:new TextEncoder().encode(JSON.stringify(entry))});
    const tree=await git.writeTree({...appContext,tree:[{path:'activity.json',type:'blob',mode:'100644',oid:blob}]});
    mapped.set(oid,await git.writeCommit({...appContext,commit:{...commit,tree,parent:parent?[parent]:[]}}));
  }
  const stack=(items:string[])=>unique(items.filter(oid=>{
    const entry=entries.get(oid)!;
    if(!entry.repository)return true;
    const mapping=rewritten.get(entry.repository.id);
    return !mapping||mapping.get(entry.repository.before)!==mapping.get(entry.repository.after);
  }).map(oid=>mapped.get(oid)!).filter((oid):oid is string=>Boolean(oid)));
  const nextActivity={...activity,revision:crypto.randomUUID(),current:activity.current?mapped.get(activity.current)??null:null,
    undo:stack(activity.undo),redo:stack(activity.redo),futures:unique(activity.futures.map(oid=>mapped.get(oid)).filter((oid):oid is string=>Boolean(oid)))};
  if(activity.scoped)nextActivity.scoped=Object.fromEntries(Object.entries(activity.scoped).map(([key,history])=>
    [key,{...history,undo:stack(history.undo),redo:stack(history.redo)}]));
  delete nextActivity.lastAction;
  return {repositories,activity:nextActivity,changed:true};
}

async function changedPaths(context:Context,graph:Graph):Promise<Map<string,string[]>>{
  const trees=new Map<string,git.TreeEntry[]>();
  const read=async(oid:string|undefined)=>{
    if(!oid)return [];
    let tree=trees.get(oid);if(!tree){tree=(await git.readTree({...context,oid})).tree;trees.set(oid,tree);}return tree;
  };
  const result=new Map<string,string[]>();
  for(const oid of graph.order){
    const commit=graph.commits.get(oid)!,paths:string[]=[];
    const visit=async(before:string|undefined,after:string|undefined,prefix:string):Promise<void>=>{
      if(before===after)return;
      const a=new Map((await read(before)).map(item=>[item.path,item]));
      const b=new Map((await read(after)).map(item=>[item.path,item]));
      for(const name of new Set([...a.keys(),...b.keys()])){
        const left=a.get(name),right=b.get(name),path=prefix?`${prefix}/${name}`:name;
        if(left?.oid===right?.oid&&left?.mode===right?.mode)continue;
        if(left?.type==='tree'||right?.type==='tree')await visit(left?.type==='tree'?left.oid:undefined,right?.type==='tree'?right.oid:undefined,path);
        if((left&&left.type!=='tree')||(right&&right.type!=='tree'))paths.push(path);
      }
    };
    await visit(commit.parent[0]?graph.commits.get(commit.parent[0])!.tree:undefined,commit.tree,'');
    result.set(oid,paths);
  }
  return result;
}

/** Metadata is authoritative. Ref repair also makes a crash after publication recoverable. */
export async function finishHistoryRetention(options:Pick<EngineOptions,'fs'|'root'|'flush'>,plan:RetentionPlan):Promise<void>{
  const root=options.root??'',fs=options.fs;
  const extraRoots=new Map<string,string[]>();
  const appContext={fs,gitdir:`${root}/history/application.git`};
  for(const oid of (await graph(appContext,activityRoots(plan.activity))).order){
    const blob=await git.readBlob({...appContext,oid,filepath:'activity.json'});
    const entry=JSON.parse(new TextDecoder().decode(blob.blob)) as Entry;
    if(entry.repository){const item=entry.repository;const roots=extraRoots.get(item.id)??[];roots.push(item.before,item.after);extraRoots.set(item.id,roots);}
  }
  for(const record of [...plan.repositories,plan.activity]){
    const isRepository='id' in record;
    const context={fs,gitdir:isRepository?repositoryPaths(record.id,root).historyGitdir:`${root}/history/application.git`};
    const roots=isRepository?[...repositoryRoots(record),...(extraRoots.get(record.id)??[])]:activityRoots(record);
    const wanted=new Map<string,string>();
    if(record.current)wanted.set('refs/heads/current',record.current);
    if(record.redo[0])wanted.set('refs/editor/redo',record.redo[0]);
    for(const oid of record.futures)wanted.set(`refs/editor/futures/${oid}`,oid);
    if(!isRepository)for(const oid of roots)wanted.set(`refs/editor/activities/${oid}`,oid);
    for(const name of await git.listRefs({...context,filepath:'refs'})){
      const ref=`refs/${name}`;
      if((ref==='refs/heads/current'||ref==='refs/editor/redo'||/^refs\/editor\/(futures|activities)\//.test(ref))&&!wanted.has(ref))await git.deleteRef({...context,ref});
    }
    for(const [ref,value] of wanted)await git.writeRef({...context,ref,value,force:true});
    await options.flush();
    const reachable=new Set<string>();
    const refs=await git.listRefs({...context,filepath:'refs'});
    for(const name of refs)roots.push(await git.resolveRef({...context,ref:`refs/${name}`}));
    const data=await graph(context,roots);
    const tree=async(oid:string):Promise<void>=>{
      if(reachable.has(oid))return;reachable.add(oid);
      for(const entry of (await git.readTree({...context,oid})).tree){
        if(entry.type==='tree')await tree(entry.oid);else reachable.add(entry.oid);
      }
    };
    for(const [oid,commit] of data.commits){reachable.add(oid);await tree(commit.tree);}
    // Private histories are owned loose-object stores. Never inspect or collect source .git.
    for(const directory of await fs.promises.readdir(`${context.gitdir}/objects`)){
      if(!/^[0-9a-f]{2}$/.test(directory))continue;
      for(const name of await fs.promises.readdir(`${context.gitdir}/objects/${directory}`))
        if(/^[0-9a-f]{38}$/.test(name)&&!reachable.has(directory+name))await fs.promises.unlink(`${context.gitdir}/objects/${directory}/${name}`);
    }
    await options.flush();
  }
}
