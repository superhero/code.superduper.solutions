// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import assert from 'node:assert/strict';
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved',{timeout:30_000});
const revisionCount=async page=>(await repositoryHistories(page)).edits.length;
const document=(world)=>world.page.getByLabel(world.groupLabel??'Code editor document',{exact:true});
const text=world=>document(world).locator('.cm-line').allTextContents().then(lines=>lines.join('\n'));
When('I type a continuous row session in the {string} view',async function(view){
  this.groupView=view;
  if(view.startsWith('split')){
    await this.page.getByRole('button',{name:'Switch to notes.txt',exact:true}).click({button:'right'});
    await this.page.getByRole('menu',{name:'Tab actions for notes.txt',exact:true}).getByRole('menuitem',{name:'Open in split view',exact:true}).click();
    await expect(this.page.getByLabel('Split editor document',{exact:true})).toBeVisible();
    this.groupLabel='Split editor document';
  }
  if(view.includes('diff')){
    if(view==='split diff')await this.page.getByRole('button',{name:'Focus split file notes.txt',exact:true}).click();
    await this.page.getByRole('button',{name:'Open file diff',exact:true}).click();
    this.groupLabel='Current file';
  }
  await expect(document(this)).toBeVisible();await saved(this.page);this.groupBefore=await revisionCount(this.page);
  await document(this).click();await this.page.keyboard.type('abc');
  await this.page.keyboard.press('Backspace');await this.page.keyboard.type('c');
  await saved(this.page);await expect.poll(()=>text(this)).toBe('abc');
});
When('I close the focused typing-session diff',async function(){
  await expect(document(this)).toBeFocused();
  // Programmatic activation keeps focus in the editor until Svelte removes it,
  // exercising the native blur fired during DOM teardown.
  await this.page.getByRole('button',{name:'Close file diff',exact:true}).evaluate(button=>button.click());
  this.groupLabel=this.groupView==='split diff'?'Split editor document':'Code editor document';
  await saved(this.page);
});
Then('its editor keeps the grouped content without another history entry',async function(){
  await expect(document(this)).toBeVisible();await expect.poll(()=>text(this)).toBe('abc');
  await expect.poll(()=>revisionCount(this.page)).toBe(this.groupBefore+1);
});
Then('the row session has one history entry and one durable Undo and Redo step',async function(){
  await expect.poll(()=>revisionCount(this.page)).toBe(this.groupBefore+1);
  await this.page.keyboard.press('Control+z');await saved(this.page);await expect.poll(()=>text(this)).toBe('');
  await this.page.reload();await saved(this.page);await expect(document(this)).toBeVisible();
  await document(this).focus();await this.page.keyboard.press('Control+Shift+Z');
  await saved(this.page);await expect.poll(()=>text(this)).toBe('abc');
  await expect.poll(()=>revisionCount(this.page)).toBe(this.groupBefore+1);await expect(this.page.getByRole('alert')).toHaveCount(0);
});
When('I separate two typing sessions with {string}',async function(boundary){
  const editor=document(this);this.groupBefore=await revisionCount(this.page);
  await editor.click();await this.page.keyboard.type('abc');await saved(this.page);
  if(boundary==='pause')await this.page.waitForTimeout(1600);
  else if(boundary==='cursor move'){await this.page.keyboard.press('ArrowLeft');await this.page.keyboard.press('ArrowRight');}
  else if(boundary==='focus loss'){await this.page.getByRole('button',{name:'Open file diff',exact:true}).focus();await editor.focus();}
  else if(boundary==='reload'){await this.page.reload();await saved(this.page);await editor.focus();await this.page.keyboard.press('Control+End');}
  if(boundary==='paste')await editor.evaluate(element=>{
    const clipboardData=new DataTransfer();clipboardData.setData('text/plain','d');
    element.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
  });
  else if(boundary==='new row'){
    await this.page.keyboard.press('Enter');await this.page.keyboard.type('d');
  }else await this.page.keyboard.type('d');
  this.groupFinal=boundary==='new row'?'abc\nd':'abcd';this.groupPrevious=boundary==='new row'?'abc\n':'abc';
  await saved(this.page);assert.equal(await text(this),this.groupFinal);
});
Then('Undo restores only the second typing session',async function(){
  await expect.poll(()=>revisionCount(this.page)).toBe(this.groupBefore+(this.groupFinal.includes('\n')?3:2));
  await this.page.keyboard.press('Control+z');await saved(this.page);await expect.poll(()=>text(this)).toBe(this.groupPrevious);
  await this.page.keyboard.press('Control+Shift+Z');await saved(this.page);await expect.poll(()=>text(this)).toBe(this.groupFinal);
});
