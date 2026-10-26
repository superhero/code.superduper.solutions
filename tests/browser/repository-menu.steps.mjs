// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {openNavigationMenu,repositoryAction,repositoryOptions,repositorySelector} from './navigation.helpers.mjs';
import {repositorySnapshot} from './repository-snapshot.helpers.mjs';
import {join} from 'node:path';

const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const documentText=page=>page.getByLabel('Code editor document',{exact:true}).locator('.cm-line').allTextContents().then(lines=>lines.join('\n'));
const dialog=(page,name)=>page.getByRole('dialog',{name,exact:true});
const warning="Are you sure? This action can't be undone. All saved changes in this repository will be removed.";

Then('repository dialogs are centered and keyboard accessible at {int} pixels with {string} motion',async function(width,motion){
  const page=this.page;await page.setViewportSize({width,height:740});await page.emulateMedia({reducedMotion:motion});
  const centered=async form=>{
    await expect(form).toBeVisible();await expect(form).toHaveAttribute('data-slot','dialog-content');
    await expect(form).toHaveCSS('box-shadow','none');await expect(form).toHaveCSS('border-top-width','2px');
    const samples=await form.evaluate(async node=>{
      const positions=[],until=performance.now()+160;
      do{await new Promise(requestAnimationFrame);const r=node.getBoundingClientRect();positions.push({x:r.x,y:r.y,width:r.width,height:r.height});}while(performance.now()<until);
      return {positions,transition:getComputedStyle(node).transitionProperty,duration:getComputedStyle(node).transitionDuration,
        width:node.clientWidth,scrollWidth:node.scrollWidth};
    });
    if(motion==='reduce')assert.equal(samples.duration,'0s');
    else assert.equal(samples.transition,'opacity');
    assert.ok(samples.scrollWidth<=samples.width,`Dialog content fits without horizontal scrolling: ${samples.scrollWidth}/${samples.width}`);
    for(const bounds of samples.positions){
      assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<1,'Dialog remains horizontally centered throughout its fade');
      assert.ok(Math.abs(bounds.y+bounds.height/2-370)<1,'Dialog remains vertically centered throughout its fade');
      assert.ok(bounds.x>=15&&bounds.x+bounds.width<=width-15);assert.ok(bounds.y>=15&&bounds.y+bounds.height<=725);
    }
  };
  await repositoryAction(page,'New repository');const form=dialog(page,'New repository');await centered(form);
  const input=form.getByLabel('Repository name',{exact:true}),close=form.getByRole('button',{name:'Close',exact:true});
  await expect(input).toBeFocused();await close.focus();await page.keyboard.press('Tab');await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(close).toBeFocused();
  await this.attach(await page.screenshot({path:join(this.artifactDirectory,`repository-dialog-${width}-${motion}.png`)}),'image/png');
  await page.keyboard.press('Escape');await expect(form).toBeHidden();await expect(repositorySelector(page)).toContainText('Choose a repository');
  await repositoryAction(page,'Clone repository');const clone=dialog(page,'Clone repository');
  await centered(clone);
  await expect(clone.getByRole('navigation',{name:'Clone source',exact:true})).toHaveCount(0);
  await expect(clone.getByRole('textbox',{name:'Find upstream repositories',exact:true})).toHaveCount(0);
  await expect(clone.getByLabel('HTTPS clone URL',{exact:true})).toBeVisible();
  await clone.locator('.clone-body').evaluate(node=>{node.scrollTop=node.scrollHeight;});
  await expect(clone.getByRole('button',{name:'Clone repository',exact:true})).toBeVisible();
  await expect(clone.getByRole('button',{name:'Close',exact:true})).toBeVisible();
  const geometry=await clone.evaluate(node=>{
    const bounds=element=>{const r=element.getBoundingClientRect();return {top:r.top,bottom:r.bottom};};
    return {dialog:bounds(node),header:bounds(node.querySelector('[data-slot="dialog-header"]')),close:bounds(node.querySelector('.dialog-close')),scrollTop:node.scrollTop};
  });
  for(const part of ['header','close'])assert.ok(geometry[part].top>=geometry.dialog.top-.5&&geometry[part].bottom<=geometry.dialog.bottom+.5,`${part} remains inside the dialog while its body scrolls: ${JSON.stringify(geometry)}`);
  if(width===1280)await this.attach(await page.screenshot({path:join(this.artifactDirectory,'clone-dialog.png')}),'image/png');
  await page.mouse.click(8,8);await expect(clone).toBeHidden();
});

Then('the repository menu renames the current repository without changing its saved files or history',async function(){
  const page=this.page,before=await repositorySnapshot(page),menu=await openNavigationMenu(page,'Repository');
  const order=await menu.locator('[role="menuitemradio"], [role="menuitem"], [role="separator"]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('role')==='separator'?'separator':node.textContent.replace(/\s+/g,' ').trim()));
  const rename=order.findIndex(value=>value.includes('Rename repository')),deletion=order.findIndex(value=>value.includes('Delete repository'));
  assert.equal(order[rename-1],'separator');assert.equal(deletion,rename+1);assert.equal(order[deletion+1],'separator');
  await menu.getByRole('menuitem',{name:'Rename repository',exact:true}).focus();await page.keyboard.press('Enter');
  const form=dialog(page,'Rename repository'),input=form.getByLabel('Repository name',{exact:true});
  await expect(input).toBeFocused();await expect(input).toHaveValue('Original repository');
  await expect(input).toHaveAttribute('placeholder','Name');
  assert.deepEqual(await input.evaluate(node=>[node.selectionStart,node.selectionEnd]),[0,'Original repository'.length]);
  await input.fill('Cancelled name');await form.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(repositorySelector(page)).toContainText('Original repository');
  await repositoryAction(page,'Rename repository');await input.fill('Renamed repository');
  await form.getByRole('button',{name:'Rename repository',exact:true}).click();await expect(form).toBeHidden();await saved(page);
  await expect(repositorySelector(page)).toContainText('Renamed repository');
  const after=await repositorySnapshot(page);
  for(const key of ['id','files','history','historyHead','commits','head','branch','canUndo','canRedo'])assert.deepEqual(after[key],before[key],key);
  assert.equal(await documentText(page),'Saved before rename');
  await page.reload();await saved(page);await expect(repositorySelector(page)).toContainText('Renamed repository');
  assert.equal(await documentText(page),'Saved before rename');
});

Then('the repository menu confirms permanent deletion and keeps the other repository intact',async function(){
  const page=this.page,id=await repositorySelector(page).getAttribute('data-value');
  await repositoryAction(page,'Delete repository');const form=dialog(page,'Delete repository');
  await expect(form.getByText(warning,{exact:true})).toBeVisible();await expect(form.getByText('Delete repository fixture',{exact:true})).toBeVisible();
  await expect(form.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
  await form.getByRole('button',{name:'Cancel',exact:true}).click();await saved(page);
  assert.equal(await documentText(page),'Remove these saved changes');assert.equal(await repositorySelector(page).getAttribute('data-value'),id);
  await repositoryAction(page,'Delete repository');await form.getByRole('button',{name:'Delete repository',exact:true}).click();
  await expect(form).toBeHidden();await saved(page);await expect(repositorySelector(page)).toContainText('Keep repository');
  assert.deepEqual(await repositoryOptions(page),['Keep repository']);assert.equal(await documentText(page),'Keep these saved changes');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await saved(page);assert.equal(await documentText(page),'');
  await page.getByRole('button',{name:'Redo',exact:true}).click();await saved(page);assert.equal(await documentText(page),'Keep these saved changes');
  await page.reload();await saved(page);assert.deepEqual(await repositoryOptions(page),['Keep repository']);
  assert.equal(await documentText(page),'Keep these saved changes');
  const records=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('v1/repositories/index');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
      const db=request.result,tx=db.transaction(['repositories','deletions']),repos=tx.objectStore('repositories').getAllKeys(),pending=tx.objectStore('deletions').getAllKeys();
      tx.oncomplete=()=>{db.close();resolve({repositories:repos.result,deletions:pending.result});};tx.onerror=()=>reject(tx.error);
    };
  }));
  assert.equal(records.repositories.includes(id),false);assert.deepEqual(records.deletions,[]);
});

Then('deleting the final repository leaves the repository creation and import actions available',async function(){
  const page=this.page;await repositoryAction(page,'Delete repository');const form=dialog(page,'Delete repository');
  await form.getByRole('button',{name:'Delete repository',exact:true}).click();await expect(form).toBeHidden();await saved(page);
  await expect(repositorySelector(page)).toContainText('Choose a repository');await expect(page.getByLabel('Code editor document',{exact:true})).toHaveCount(0);
  const menu=await openNavigationMenu(page,'Repository');await expect(menu.getByRole('menuitemradio')).toHaveCount(0);
  for(const name of ['New repository','Import repository','Clone repository'])await expect(menu.getByRole('menuitem',{name,exact:true})).toBeVisible();
  for(const name of ['Rename repository','Delete repository'])await expect(menu.getByRole('menuitem',{name,exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');await page.reload();await saved(page);await expect(repositorySelector(page)).toContainText('Choose a repository');
});

Then('interrupted repository deletion finishes removing local files and private history after reopening',async function(){
  const result=await this.page.evaluate(async()=>{
    const fixture=await import('/test-fixtures/repository-lifecycle.ts');return fixture.recoverInterruptedDeletion();
  });
  assert.equal(result.interrupted,true);assert.match(result.error,/Injected deletion cleanup interruption/);
  assert.equal(result.staleRejected,true);assert.equal(result.filesGone,true);assert.equal(result.historyGone,true);
  assert.equal(result.noDeletedSettings,true);assert.equal(result.fallbackSelected,true);assert.equal(result.repeated,true);
  assert.equal(result.keptText,'keep');assert.equal(result.keptFontSize,21);assert.equal(result.globalFontSize,17);
});
