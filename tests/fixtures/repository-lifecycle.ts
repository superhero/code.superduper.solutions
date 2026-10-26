// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import LightningFS from '@isomorphic-git/lightning-fs';
import {createRepositoryService,repositoryPaths} from '$lib/repository/browser';
import {normalizeSettings} from '$lib/editor/settings';
import {normalizeWorkspace,emptyRepositoryWorkspace} from '$lib/editor/workspace';

/** Dedicated test storage exercises interruption after atomic deletion publication. */
export async function recoverInterruptedDeletion(){
  const namespace=`test/deletion/${crypto.randomUUID()}`,fs=new LightningFS(namespace);
  const options={filesystemName:namespace,databaseName:`${namespace}/metadata`,filesystem:fs};
  const service=createRepositoryService(options);
  const deleted=await service.create('Delete fixture',[{path:'private.txt',data:new TextEncoder().encode('private')}]);
  const kept=await service.create('Keep fixture',[{path:'keep.txt',data:new TextEncoder().encode('keep')}]);
  const state={workspace:normalizeWorkspace(null),settings:normalizeSettings(null)};
  state.workspace.repositoryId=deleted.id;state.workspace.repositories[deleted.id]=emptyRepositoryWorkspace();
  state.workspace.repositories[kept.id]=emptyRepositoryWorkspace();state.settings.global.fontSize=17;
  state.settings.repositories[deleted.id]={fontSize:19};state.settings.repositories[kept.id]={fontSize:21};
  Object.assign(state.settings,{files:{[deleted.id]:{'private.txt':{indentSize:8}}}});
  const activity=await service.loadActivity();
  const saved=await service.recordActivity({expected:activity.revision,label:'Save private changes',before:state,after:state,
    command:{method:'write',args:[deleted.id,'private.txt','private saved',deleted.revision]}});
  let staleRejected=false;
  try{await service.deleteRepository(deleted.id,deleted.revision,saved.activity.revision,state);}catch{staleRejected=true;}
  const paths=repositoryPaths(deleted.id),remove=fs.promises.rmdir.bind(fs.promises);
  let interrupted=false,error='';
  fs.promises.rmdir=async path=>{
    if(!interrupted&&path===paths.dir){interrupted=true;throw new Error('Injected deletion cleanup interruption');}
    return remove(path);
  };
  try{await service.deleteRepository(deleted.id,saved.repository!.revision,saved.activity.revision,state);}
  catch(failure){error=failure instanceof Error?failure.message:String(failure);}
  const reopened=createRepositoryService(options),list=await reopened.list(),recovered=await reopened.loadActivity();
  const gone=async(path:string)=>{try{await fs.promises.stat(path);return false;}catch(failure){return (failure as {code?:string}).code==='ENOENT';}};
  const repeated=await createRepositoryService(options).list();
  return {interrupted,error,staleRejected,filesGone:await gone(paths.dir),historyGone:await gone(paths.historyGitdir),
    keptText:await reopened.read(kept.id,'keep.txt'),keptFontSize:recovered.state!.settings.repositories[kept.id]!.fontSize,
    globalFontSize:recovered.state!.settings.global.fontSize,
    noDeletedSettings:!recovered.state!.settings.repositories[deleted.id]&&!Object.hasOwn(recovered.state!.settings,'files'),
    fallbackSelected:recovered.state!.workspace.repositoryId===kept.id,
    repeated:JSON.stringify(list)===JSON.stringify(repeated)&&list.length===1&&list[0]!.id===kept.id};
}
