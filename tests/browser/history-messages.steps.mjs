// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved',{timeout:30_000});

When('I change the timeout to 10000 in the {string} view',async function(view){
  let label='Code editor document';
  if(view==='split'){
    await this.page.getByRole('button',{name:'Switch to main.js',exact:true}).click({button:'right'});
    await this.page.getByRole('menu',{name:'Tab actions for main.js',exact:true}).getByRole('menuitem',{name:'Open in split view',exact:true}).click();
    label='Split editor document';
  }else if(view==='diff'){
    await this.page.getByRole('button',{name:'Open file diff',exact:true}).click();label='Current file';
  }
  const editor=this.page.getByLabel(label,{exact:true});await expect(editor).toBeVisible();await editor.focus();
  await this.page.keyboard.press('Control+Home');
  for(let index=0;index<'const timeout = '.length;index++)await this.page.keyboard.press('ArrowRight');
  for(let index=0;index<4;index++)await this.page.keyboard.press('Delete');
  await this.page.keyboard.type('10000');await saved(this.page);
  await expect(editor).toHaveText('const timeout = 10000;');
});
Then('the latest private history subject is {string}',async function(message){
  await saved(this.page);
  await expect.poll(async()=>{const snapshot=await repositorySnapshot(this.page);return snapshot.history.find(entry=>entry.oid===snapshot.historyHead)?.message;}).toBe(message);
});
Then('the latest code edit is the only change in its history graph',async function(){
  await expect.poll(async()=>(await repositoryHistories(this.page)).edits.length).toBe(1);
});
