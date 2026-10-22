// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {expect} from '@playwright/test';
import {repositorySelector,selectPage} from './navigation.helpers.mjs';

const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');

/** Real graph rendering, with synthetic ancestry instead of unrelated Git setup work. */
export async function installHistoryRenderingFixture(page,size=250){
  const oid=value=>createHash('sha256').update(value).digest('hex').slice(0,40),history=[];
  const entry=(id,parent,time)=>({oid:oid(id),parents:parent?[oid(parent)]:[],
    message:'Adjust indentation, src/service.js:line 101',timestamp:1_700_000_000_000+Math.round(time*10_000)});
  for(let index=0;index<size;index++)history.push(entry(`main-${index}`,index?`main-${index-1}`:null,index));
  const junction=oid(`main-${size-8}`);
  for(let index=1;index<=102;index++)history.push(entry(`large-${index}`,index===1?`main-${size-8}`:`large-${index-1}`,size-8+index*7.25/102));
  for(const branch of ['a','b'])for(let index=1;index<=4;index++)
    history.push(entry(`${branch}-${index}`,index===1?`main-${size-6}`:`${branch}-${index-1}`,size-6+index/3+(branch==='b'?.01:0)));
  history.sort((a,b)=>b.timestamp-a.timestamp||a.oid.localeCompare(b.oid));
  const repositoryId=await repositorySelector(page).getAttribute('data-value');
  let worker;
  for(const candidate of page.workers())if(await candidate.evaluate(()=>self.name)==='code-repositories')worker=candidate;
  assert.ok(worker);
  await worker.evaluate(({repositoryId,history,historyHead})=>{
    const original=globalThis.postMessage;
    globalThis.__restoreHistoryRenderFixture=()=>{globalThis.postMessage=original;};
    globalThis.postMessage=function(reply,...options){
      const value=reply?.value;
      if(value?.id===repositoryId&&value.history)reply={...reply,value:{...value,history,historyHead}};
      else if(value?.repository?.id===repositoryId)reply={...reply,value:{...value,repository:{...value.repository,history,historyHead}}};
      return original.call(this,reply,...options);
    };
  },{repositoryId,history,historyHead:oid(`main-${size-1}`)});
  try{
    await page.getByLabel('Code editor document',{exact:true}).click();
    await page.keyboard.insertText('fixture');await saved(page);
    await selectPage(page,'History');
    await expect(page.getByRole('list',{name:'Staged changes',exact:true}).locator('li[data-oid]')).toHaveCount(size);
  }finally{await worker.evaluate(()=>globalThis.__restoreHistoryRenderFixture());}
  return {history,mainline:size,junction,watched:oid('main-5')};
}
