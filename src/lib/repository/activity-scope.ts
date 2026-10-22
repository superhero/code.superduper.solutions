// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type {ActivityScope,ActivityState} from './types.ts';

export function activityScopeKey(scope:ActivityScope):string{
  return JSON.stringify(scope.kind==='repository'?['files',scope.repositoryId]:
    ['settings',scope.scope,scope.repositoryId??'',scope.file??'']);
}
export function settingsInScope(state:ActivityState,scope:Extract<ActivityScope,{kind:'settings'}>){
  return scope.scope==='global'?state.settings.global:scope.scope==='repository'?
    state.settings.repositories[scope.repositoryId??'']:state.settings.files[scope.repositoryId??'']?.[scope.file??''];
}
export function activityDomains(entry:{before:ActivityState;after:ActivityState;repository?:{id:string}}):string[]{
  const scopes:ActivityScope[]=[{kind:'settings',scope:'global'}];
  const {before,after}=entry;
  for(const id of new Set([...Object.keys(before.settings.repositories),...Object.keys(after.settings.repositories)]))
    scopes.push({kind:'settings',scope:'repository',repositoryId:id});
  for(const id of new Set([...Object.keys(before.settings.files),...Object.keys(after.settings.files)]))
    for(const file of new Set([...Object.keys(before.settings.files[id]??{}),...Object.keys(after.settings.files[id]??{})]))
      scopes.push({kind:'settings',scope:'file',repositoryId:id,file});
  const keys=scopes.filter(scope=>scope.kind==='settings'&&JSON.stringify(settingsInScope(before,scope))!==JSON.stringify(settingsInScope(after,scope))).map(activityScopeKey);
  if(entry.repository)keys.push(activityScopeKey({kind:'repository',repositoryId:entry.repository.id}));
  return keys;
}

/** Apply only this domain; navigation and unrelated settings remain live. */
export function restoreScopedState(current:ActivityState,target:ActivityState,scope:ActivityScope):ActivityState{
  const result=structuredClone(current);
  if(scope.kind==='repository'){
    const live=result.workspace.repositories[scope.repositoryId],saved=target.workspace.repositories[scope.repositoryId];
    if(live&&saved){
      live.documents={...live.documents,...saved.documents};
      live.splitViews=live.splitViews.map(pane=>{
        const old=saved.splitViews.find(view=>view.id===pane.id),documents={...pane.documents,...old?.documents};
        return {...pane,documents,session:documents[pane.file]??pane.session};
      });
    }
  }else{
    const value=settingsInScope(target,scope),id=scope.repositoryId??'',file=scope.file??'';
    if(scope.scope==='global')result.settings.global=structuredClone(target.settings.global);
    else if(scope.scope==='repository'){
      if(value)result.settings.repositories[id]=structuredClone(value);else delete result.settings.repositories[id];
    }else{
      if(value){result.settings.files[id]??={};result.settings.files[id]![file]=structuredClone(value);}
      else {delete result.settings.files[id]?.[file];if(!Object.keys(result.settings.files[id]??{}).length)delete result.settings.files[id];}
    }
  }
  return result;
}
