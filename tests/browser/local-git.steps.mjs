// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown,openNavigationMenu} from './navigation.helpers.mjs';
import {repositorySnapshot,repositoryGitStatus} from './repository-snapshot.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const dialog=page=>page.locator('[data-git-panel]');
const action=(page,name)=>dialog(page).getByRole('button',{name,exact:true});
async function identity(page){await dialog(page).getByRole('textbox',{name:'Commit author name',exact:true}).fill('Browser author');await dialog(page).getByRole('textbox',{name:'Commit author email',exact:true}).fill('browser@example.invalid');}
async function open(page){await page.getByRole('button',{name:'Commit changes',exact:true}).click();await expect(dialog(page)).toBeVisible();await expect(action(page,'Stage all')).toBeVisible();}
async function close(page){await action(page,'Close').click();await expect(dialog(page)).toHaveCount(0);await saved(page);}
async function createBranch(page,name){
 const menu=await openNavigationMenu(page,'Branch');await menu.getByRole('menuitem',{name:'New branch',exact:true}).click();
 const form=page.getByRole('dialog',{name:'New branch',exact:true});await form.getByRole('textbox',{name:'Branch name',exact:true}).fill(name);
 await form.getByRole('button',{name:'Create branch',exact:true}).click();await expect(form).toBeHidden();await saved(page);
}
async function commit(page,text){await identity(page);if(await action(page,'Stage all').isEnabled())await action(page,'Stage all').click();await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill(text);await action(page,'Commit staged changes').click();await expect(dialog(page).locator('.file-row')).toHaveCount(0);await expect(dialog(page).getByRole('alert')).toHaveCount(0);}
Then('new commit reviews stage all files and retain manual exclusions across reopening and reload',{timeout:90000},async function(){
 const page=this.page;
 await page.getByLabel('Code editor document',{exact:true}).fill('const first = false;');await saved(page);
 const files=page.locator('.files-section'),bounds=await files.boundingBox();
 await files.click({button:'right',position:{x:bounds.width/2,y:bounds.height-15}});
 await page.getByRole('menu',{name:'Repository actions',exact:true}).getByRole('menuitem',{name:'New file',exact:true}).click();
 const form=page.getByRole('dialog',{name:'New file',exact:true});
 await form.getByLabel('File path',{exact:true}).fill('second.js');
 await form.getByRole('button',{name:'Create file',exact:true}).click();await expect(form).toBeHidden();await saved(page);
 await page.getByLabel('Code editor document',{exact:true}).fill('const second = false;');await saved(page);
 await open(page);await expect(dialog(page).locator('.staged-count')).toHaveText('2 files staged');
 await commit(page,'Existing source baseline');await close(page);
 for(const [path,text] of [['main.js','const first = true;'],['second.js','const second = true;']]){
  await page.getByRole('treeitem',{name:path,exact:true}).locator(':scope > .tree-row').click();
  await expect(page.getByRole('button',{name:`Switch to ${path}`,exact:true})).toHaveClass(/active/);
  await page.getByLabel('Code editor document',{exact:true}).fill(text);await saved(page);
 }
 // Earlier builds persisted this flag after automatic staging. It must not
 // suppress the default on an existing repository's later review.
 const repositoryId=await page.getByRole('button',{name:'Repository',exact:true}).getAttribute('data-value');
 await page.evaluate(id=>{
  sessionStorage.setItem(`code.git-review:${id}`,'1');
  sessionStorage.setItem(`code.git-staging-choice:${id}`,'');
 },repositoryId);
 await page.reload();await saved(page);
 const before=await repositorySnapshot(page);
 await page.getByRole('button',{name:'Git operations',exact:true}).click();
 await expect(page.getByRole('button',{name:'Git operation',exact:true})).toBeVisible();
 expect((await repositoryGitStatus(page)).files.every(file=>file.head===file.stage)).toBe(true);
 await action(page,'Staging').click();
 await expect(dialog(page).locator('.staged-count')).toHaveText('2 files staged');
 await expect(action(page,'Stage all')).toBeDisabled();
 await expect(dialog(page).getByRole('button',{name:'Stage file',exact:true})).toHaveCount(0);
 await expect(dialog(page).getByRole('region',{name:'Changes to commit',exact:true}).locator('.card-heading .count')).toHaveCount(0);
 const staged=await repositoryGitStatus(page);
 expect(staged.files).toHaveLength(2);
 expect(staged.files.every(file=>file.head!==file.stage&&file.work===file.stage)).toBe(true);
 await this.attach(await dialog(page).getByRole('region',{name:'Changes to commit',exact:true}).screenshot({path:`${this.artifactDirectory}/default-staged-existing-files.png`}),'image/png');
 expect((await repositorySnapshot(page)).head).toBe(before.head);
 await action(page,'main.js').click();
 await expect(page.getByRole('button',{name:'Switch to main.js',exact:true})).toHaveClass(/active/);
 await expect(page.getByLabel('Code editor document',{exact:true})).toContainText('const first = true;');
 await expect(dialog(page).getByLabel('Git result',{exact:true})).toHaveCount(0);
 const second=()=>dialog(page).locator('.file-row').filter({has:page.getByRole('button',{name:'second.js',exact:true})});
 await second().getByRole('button',{name:'Unstage',exact:true}).click();
 await expect(second().getByRole('button',{name:'Stage file',exact:true})).toBeEnabled();
 await expect(action(page,'Stage all')).toBeEnabled();
 await expect(dialog(page).locator('.staged-count')).toHaveText('1 file staged');
 await close(page);await open(page);
 await expect(second().getByRole('button',{name:'Stage file',exact:true})).toBeEnabled();
 await page.reload();await saved(page);await expect(dialog(page)).toBeVisible();
 await expect(second().getByRole('button',{name:'Stage file',exact:true})).toBeEnabled();
 await expect(dialog(page).locator('.staged-count')).toHaveText('1 file staged');
 await action(page,'Unstage all').click();
 await expect(dialog(page).getByRole('button',{name:'Stage file',exact:true})).toHaveCount(2);
 await close(page);await open(page);await page.reload();await saved(page);
 await expect(action(page,'Unstage all')).toBeDisabled();
 await expect(dialog(page).getByRole('button',{name:'Stage file',exact:true})).toHaveCount(2);
 expect((await repositoryGitStatus(page)).files.every(file=>file.head===file.stage)).toBe(true);
 await commit(page,'Default selection reviewed');
 await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Switch to second.js',exact:true}).click();
 await page.getByLabel('Code editor document',{exact:true}).fill('const second = false;');await saved(page);
 await expect(dialog(page).locator('.staged-count')).toHaveText('1 file staged');
 await expect(second().getByRole('button',{name:'Unstage',exact:true})).toBeEnabled();
 await action(page,'second.js').click();
 await expect(page.getByRole('button',{name:'Switch to second.js',exact:true})).toHaveClass(/active/);
 await expect(page.getByLabel('Code editor document',{exact:true})).toContainText('const second = false;');
 await expect(dialog(page).getByLabel('Git result',{exact:true})).toHaveCount(0);
 await expect(dialog(page).getByRole('alert')).toHaveCount(0);
});
Then('editor commit review opens staged comparisons without including unstaged edits',{timeout:90000},async function(){
 const page=this.page;await saved(page);const initial='const first = 1;\n'+Array.from({length:14},(_,i)=>`// unchanged ${i}`).join('\n')+'\nconst second = 2;\n';await page.getByLabel('Code editor document',{exact:true}).fill(initial);await saved(page);const original=await page.getByLabel('Code editor document',{exact:true}).textContent();
 await open(page);await identity(page);await expect(action(page,'Stage all')).toBeDisabled();await expect(action(page,'Unstage all')).toBeEnabled();await expect(action(page,'Commit staged changes')).toBeDisabled();
 await this.attach(await dialog(page).screenshot({path:`${this.artifactDirectory}/git-commit-review.png`}), 'image/png');
 await close(page);const later=initial.replace('first = 1','first = 10').replace('second = 2','second = 20');await page.getByLabel('Code editor document',{exact:true}).fill(later);await saved(page);
 await open(page);await identity(page);await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill('Initial reviewed source');
 await action(page,'Commit staged changes').click();await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('');
 await expect(dialog(page).locator('.file-row').first()).toBeVisible();await expect(page.getByRole('button',{name:'Page',exact:true})).toHaveAttribute('data-value','editor');
 await action(page,'Commits').click();const entry=dialog(page).getByRole('button').filter({hasText:'Initial reviewed source'});await entry.click();
 await dialog(page).getByRole('region',{name:'Selected commit',exact:true}).getByRole('button',{name:'main.js',exact:true}).click();
 await expect(page.getByRole('region',{name:'Commit file diff',exact:true}).getByLabel('Commit file',{exact:true})).toContainText(original.trim());
 await action(page,'Staging').click();await action(page,'Working diff').click();await expect(dialog(page).getByRole('button',{name:/^Stage hunk/}).first()).toBeVisible();
 await expect(dialog(page).getByRole('button',{name:/^Stage hunk/})).toHaveCount(2);await dialog(page).getByRole('button',{name:/^Stage hunk/}).first().click();await expect(action(page,'Unstage all')).toBeEnabled();
 await expect(action(page,'Stage all')).toBeEnabled();
 await action(page,'Staged diff').click();
 const comparison=page.getByRole('region',{name:'Staged file diff',exact:true});
 const staged=initial.replace('first = 1','first = 10');
 const verifyStaged=async()=>{
  await expect(comparison).toHaveAttribute('aria-busy','false');
  await expect.poll(async()=>(await comparison.getByLabel('Staged file',{exact:true}).locator('.cm-line').allTextContents()).join('\n')).toBe(staged);
  await expect.poll(async()=>(await comparison.getByLabel('Committed file',{exact:true}).locator('.cm-line').allTextContents()).join('\n')).toBe(initial);
  for(const label of ['Committed file','Staged file'])await expect(comparison.getByLabel(label,{exact:true})).toHaveAttribute('contenteditable','false');
  await expect(page.getByRole('button',{name:'Switch to main.js (staged diff)',exact:true})).toHaveClass(/active/);
  await expect(dialog(page).getByLabel('Git result',{exact:true})).toHaveCount(0);
  await expect(page.locator('.editor-document > .split-editor')).toHaveCount(0);
 };
 await verifyStaged();
 const indexBefore=await repositoryGitStatus(page);
 await comparison.getByLabel('Staged file',{exact:true}).focus();await page.keyboard.type('must not change the index');
 await verifyStaged();expect((await repositoryGitStatus(page)).files).toEqual(indexBefore.files);
 await action(page,'main.js').click();
 await expect(page.getByRole('button',{name:'Switch to main.js',exact:true})).toHaveClass(/active/);
 await expect(page.getByLabel('Code editor document',{exact:true})).toHaveAttribute('contenteditable','true');
 await page.getByRole('button',{name:'Open file diff',exact:true}).click();
 await expect.poll(async()=>(await page.getByRole('region',{name:'File diff',exact:true}).getByLabel('Current file',{exact:true}).locator('.cm-line').allTextContents()).join('\n')).toBe(later);
 await page.getByRole('button',{name:'Switch to main.js (staged diff)',exact:true}).click();await verifyStaged();
 await action(page,'Staged diff').click();await verifyStaged();
 await expect(page.getByRole('button',{name:'Switch to main.js (staged diff)',exact:true})).toHaveCount(1);
 await page.reload();await saved(page);await verifyStaged();
 await page.setViewportSize({width:390,height:844});const bounds=await dialog(page).boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=391);
 await action(page,'Staged diff').click();await expect(dialog(page)).toHaveCount(0);await saved(page);
 await expect(comparison).toBeVisible();await page.getByRole('button',{name:'Close main.js (staged diff)',exact:true}).click();
 await expect.poll(async()=>(await page.getByLabel('Code editor document',{exact:true}).locator('.cm-line').allTextContents()).join('\n')).toBe(later);
 await page.reload();await saved(page);await open(page);await expect(action(page,'Unstage all')).toBeEnabled();
});
Then('a staged deletion opens read only in the editor and survives reload',{timeout:60000},async function(){
 const page=this.page;
 await open(page);await expect(action(page,'Staged diff')).toBeEnabled();
 const before=await repositorySnapshot(page),indexBefore=await repositoryGitStatus(page);
 await action(page,'main.js').click();
 const diff=page.getByRole('region',{name:'Staged file diff',exact:true});
 const verify=async()=>{
  await expect(diff).toHaveAttribute('aria-busy','false');
  await expect(diff.getByLabel('Committed file',{exact:true})).toHaveText('const removed = true;');
  await expect(diff.getByLabel('Staged file',{exact:true})).toHaveText('');
  await expect(diff.getByLabel('Staged file',{exact:true})).toHaveAttribute('contenteditable','false');
  await expect(page.getByRole('button',{name:'Switch to main.js (staged diff)',exact:true})).toHaveClass(/active/);
 };
 await verify();await page.reload();await saved(page);await verify();
 expect((await repositorySnapshot(page)).head).toBe(before.head);
 expect((await repositoryGitStatus(page)).files).toEqual(indexBefore.files);
 await expect(dialog(page).getByRole('alert')).toHaveCount(0);
 await this.attach(await page.screenshot({path:`${this.artifactDirectory}/staged-deletion-editor.png`}),'image/png');
});
Then('Git action buttons and commit rows change only their foreground on hover',{timeout:90000},async function(){
 const page=this.page;
 await page.getByLabel('Code editor document',{exact:true}).fill('const value = 2;');await saved(page);await open(page);
 const hover=async button=>{
  await dialog(page).locator('[data-pane-heading]').hover();await expect(button).toBeEnabled();
  const before=await button.evaluate(element=>getComputedStyle(element).backgroundColor);
  const foreground=await button.evaluate(element=>{
   const probe=document.createElement('span');probe.style.color='var(--color-hover-foreground)';element.append(probe);
   const color=getComputedStyle(probe).color;probe.remove();return color;
  });
  await button.hover();await expect(button).toHaveCSS('color',foreground);await expect(button).toHaveCSS('background-color',before);
 };
 for(const name of ['Close','Staging','Commits','Actions','Remotes','Stashes'])await hover(action(page,name));
 await hover(action(page,'Unstage all'));await action(page,'Unstage all').click();
 await hover(action(page,'Stage all'));await hover(action(page,'main.js'));await hover(action(page,'Stage file'));
 await action(page,'Stage all').click();await identity(page);
 await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill('Hover result');
 await hover(action(page,'Commit staged changes'));await action(page,'Commit staged changes').click();
 await expect(dialog(page).locator('.file-row')).toHaveCount(0);
 await action(page,'Commits').click();
 const current=dialog(page).locator('.commit-list button').filter({hasText:'Hover result'});
 await current.click();await expect(dialog(page).getByRole('region',{name:'Selected commit',exact:true})).toContainText('Hover result');
 await hover(current);await hover(dialog(page).locator('.commit-list button').filter({hasText:'Hover baseline'}));
 for(const name of ['Cherry-pick','Revert','Squash from here','Amend / reword'])await hover(action(page,name));
 await hover(dialog(page).locator('.commit-files button').filter({hasText:'main.js'}));
 await expect(action(page,'Check out commit')).toBeDisabled();
 const checkout=action(page,'Check out commit'),disabled=await checkout.evaluate(element=>({background:getComputedStyle(element).backgroundColor,color:getComputedStyle(element).color,overlay:getComputedStyle(element,'::after').backgroundColor}));
 await checkout.hover({force:true});await expect(checkout).toHaveCSS('color',disabled.color);await expect(checkout).toHaveCSS('background-color',disabled.background);
 assert.equal(await checkout.evaluate(element=>getComputedStyle(element,'::after').backgroundColor),disabled.overlay);
 await action(page,'Actions').click();await selectDropdown(page,'Git operation','revert');await hover(action(page,'Revert commit'));
 await action(page,'Stashes').click();await hover(action(page,'Stash changes'));
 await expect(dialog(page).getByRole('alert')).toHaveCount(0);await close(page);
});
Then('both history views expose Git operations and commit inspection does not check out',{timeout:90000},async function(){
 const page=this.page;await page.getByLabel('Code editor document',{exact:true}).fill('const saved = true;');await saved(page);
 await open(page);await commit(page,'Source baseline');await close(page);
 await selectPage(page,'History');await expect(page.getByRole('button',{name:'Commit changes',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Git operations',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'History views',exact:true}).getByRole('button',{name:'Commit history',exact:true}).click();const graph=page.getByRole('list',{name:'Commit history',exact:true});const current=await graph.locator('li[aria-current="true"]').getAttribute('data-oid');
 await graph.getByRole('button',{name:`Inspect commit ${current.slice(0,8)}`,exact:true}).click();await expect(dialog(page).getByRole('region',{name:'Selected commit',exact:true})).toContainText('Source baseline');
 await expect(page.getByRole('button',{name:'Branch',exact:true})).toHaveAttribute('data-value','main');await close(page);
 await page.getByRole('button',{name:'Git operations',exact:true}).click();await expect(page.getByRole('button',{name:'Git operation',exact:true})).toBeVisible();
 const operations=['Merge branch','Rebase branch','Cherry-pick commit','Revert commit','Squash commits through branch tip','Reset branch','Recovery','Create tag','Delete tag','Rename branch','Delete branch'];
 await page.getByRole('button',{name:'Git operation',exact:true}).click();for(const name of operations)await expect(page.getByRole('menuitemradio',{name,exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await close(page);
});
Then('commit comparisons retain both immutable versions in editor tabs across reload',{timeout:90000},async function(){
 const page=this.page,before=await repositorySnapshot(page),index=await repositoryGitStatus(page);
 const versions=[['Changed version','const version = 1;','const version = 2;'],['Original version','','const version = 1;']];
 await page.getByRole('button',{name:'Git operations',exact:true}).click();await action(page,'Commits').click();
 const comparison=page.getByRole('region',{name:'Commit file diff',exact:true});
 const read=label=>comparison.getByLabel(label,{exact:true}).locator('.cm-line').allTextContents().then(lines=>lines.join('\n'));
 const verify=async(parent,current)=>{
  await expect(comparison).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>read('Parent file')).toBe(parent);await expect.poll(()=>read('Commit file')).toBe(current);
  for(const label of ['Parent file','Commit file']){
   const editor=comparison.getByLabel(label,{exact:true});await expect(editor).toHaveAttribute('contenteditable','false');
   assert.ok(await editor.evaluate(element=>getComputedStyle(element.closest('.cm-editor')).backgroundImage.includes('45deg')));
   await editor.focus();await page.keyboard.type('must not edit');
  }
  await expect.poll(()=>read('Parent file')).toBe(parent);await expect.poll(()=>read('Commit file')).toBe(current);
  await expect(dialog(page).locator('.diff-review')).toHaveCount(0);
 };
 const tabs=[];
 for(const [message,parent,current]of versions){
  await dialog(page).locator('.commit-list button').filter({hasText:message}).click();
  await dialog(page).getByRole('region',{name:'Selected commit',exact:true}).getByRole('button',{name:'main.js',exact:true}).click();
  const oid=before.commits.find(commit=>commit.message.trim()===message).oid;
  const name=`Switch to main.js (commit ${oid.slice(0,8)} diff)`;tabs.push(name);
  await expect(page.getByRole('button',{name,exact:true})).toHaveClass(/active/);await verify(parent,current);
 }
 for(const name of tabs)await expect(page.getByRole('button',{name,exact:true})).toHaveCount(1);
 await close(page);
 await page.reload();await saved(page);await verify('','const version = 1;');
 await page.getByRole('button',{name:tabs[0],exact:true}).click();await verify('const version = 1;','const version = 2;');
 await page.getByRole('button',{name:tabs[0],exact:true}).click({button:'right'});
 await page.getByRole('menu').getByRole('menuitem',{name:'Open in split view',exact:true}).click();await saved(page);
 const split=page.locator('.split-editor').getByRole('region',{name:'Commit file diff',exact:true});
 const verifySplit=async()=>{
  await expect(split).toHaveAttribute('aria-busy','false');
  await expect.poll(async()=>(await split.getByLabel('Commit file',{exact:true}).locator('.cm-line').allTextContents()).join('\n')).toBe('const version = 2;');
  for(const label of ['Parent file','Commit file']){
   await expect(split.getByLabel(label,{exact:true})).toHaveAttribute('contenteditable','false');
   assert.ok(await split.getByLabel(label,{exact:true}).evaluate(element=>getComputedStyle(element.closest('.cm-editor')).backgroundImage.includes('45deg')));
  }
 };
 await verifySplit();await page.reload();await saved(page);await verifySplit();
 const after=await repositorySnapshot(page);assert.equal(after.head,before.head);assert.deepEqual(after.files,before.files);
 assert.deepEqual(after.history.map(entry=>entry.oid),before.history.map(entry=>entry.oid));
 assert.deepEqual((await repositoryGitStatus(page)).files,index.files);
});
Then('Git targets and merge methods start selected and preserve explicit choices',{timeout:90000},async function(){
 const page=this.page,target=page.getByRole('button',{name:'Git target',exact:true}),method=page.getByRole('button',{name:'Merge method',exact:true});
 await open(page);await action(page,'Actions').click();
 await expect(method).toHaveAttribute('data-value','merge');await expect(method.locator('.navigation-label')).toHaveText('Create merge commit');
 await expect(target).toHaveAttribute('data-value','');await expect(target).toBeDisabled();await expect(action(page,'Merge branch')).toBeDisabled();
 await action(page,'Staging').click();await commit(page,'Default target baseline');await action(page,'Actions').click();
 await expect(target).toHaveAttribute('data-value','');await expect(target).toBeDisabled();await expect(action(page,'Merge branch')).toBeDisabled();
 await selectDropdown(page,'Merge method','ff-only');await selectDropdown(page,'Git operation','reset');
 await expect(target).toHaveAttribute('data-value','refs/heads/main');
 await expect(page.getByRole('button',{name:'Reset mode',exact:true})).toHaveAttribute('data-value','mixed');
 await selectDropdown(page,'Reset mode','hard');await selectDropdown(page,'Git operation','merge');
 await expect(method).toHaveAttribute('data-value','ff-only');await selectDropdown(page,'Git operation','reset');
 await expect(page.getByRole('button',{name:'Reset mode',exact:true})).toHaveAttribute('data-value','hard');
 await close(page);
 await createBranch(page,'topic/defaults');await createBranch(page,'topic/current');
 await page.reload();await saved(page);await page.getByRole('button',{name:'Git operations',exact:true}).click();
 await expect(target).toHaveAttribute('data-value','refs/heads/main');await expect(method).toHaveAttribute('data-value','merge');
 await selectDropdown(page,'Git target','refs/heads/topic/defaults');await selectDropdown(page,'Merge method','squash');
 await close(page);await page.getByRole('button',{name:'Git operations',exact:true}).click();
 await expect(target).toHaveAttribute('data-value','refs/heads/topic/defaults');await expect(method).toHaveAttribute('data-value','squash');
 await page.getByLabel('Code editor document',{exact:true}).fill('const changed = true;\n');await saved(page);
 await expect(target).toHaveAttribute('data-value','refs/heads/topic/defaults');await expect(method).toHaveAttribute('data-value','squash');
 await close(page);
});
Then('Git targets match their operation and exclude the current branch where required',{timeout:90000},async function(){
 const page=this.page,original=await repositorySnapshot(page),target=page.getByRole('button',{name:'Git target',exact:true});
 const choices=async expected=>{
  const menu=await openNavigationMenu(page,'Git target');
  await expect(menu.getByRole('menuitemradio')).toHaveCount(expected.length);
  assert.deepEqual((await menu.getByRole('menuitemradio').evaluateAll(items=>items.map(item=>item.dataset.value))).sort(),[...expected].sort());
  await page.keyboard.press('Escape');await expect(menu).toBeHidden();
 };
 await open(page);await action(page,'Actions').click();
 for(const [kind,label]of [['merge','Merge branch'],['rebase','Rebase branch'],['delete-branch','Delete branch'],['delete-tag','Delete tag']]){
  await selectDropdown(page,'Git operation',kind);await expect(target).toBeDisabled();await expect(target).toHaveAttribute('data-value','');
  await expect(action(page,label)).toBeDisabled();
 }
 await selectDropdown(page,'Git operation','rename-branch');await choices(['refs/heads/main']);
 await selectDropdown(page,'Git operation','tag');await dialog(page).getByLabel('New name',{exact:true}).fill('v1.0');
 await action(page,'Create tag').click();await expect.poll(async()=>(await repositoryGitStatus(page)).tags.map(tag=>tag.name)).toEqual(['v1.0']);
 await close(page);await createBranch(page,'feature/targets');await selectDropdown(page,'Branch','main');await saved(page);
 await page.getByRole('button',{name:'Git operations',exact:true}).click();
 for(const kind of ['merge','rebase','delete-branch']){
  await selectDropdown(page,'Git operation',kind);await expect(target).toHaveAttribute('data-value','refs/heads/feature/targets');
  await choices(['refs/heads/feature/targets']);await expect(dialog(page).locator('label[for="git-target"]')).toHaveText('Target (branch)');
 }
 await selectDropdown(page,'Git operation','rename-branch');await choices(['refs/heads/main','refs/heads/feature/targets']);
 await selectDropdown(page,'Git operation','delete-tag');await expect(target).toHaveAttribute('data-value','refs/tags/v1.0');await choices(['refs/tags/v1.0']);
 for(const kind of ['cherry-pick','revert','squash']){
  await selectDropdown(page,'Git operation',kind);await expect(target).toHaveAttribute('data-value',original.head);await choices([original.head]);
  await expect(dialog(page).locator('label[for="git-target"]')).toHaveText('Target (commit)');
 }
 for(const kind of ['reset','tag']){
  await selectDropdown(page,'Git operation',kind);await expect(target).toHaveAttribute('data-value',original.head);
  await choices(['refs/heads/main','refs/heads/feature/targets','refs/tags/v1.0',original.head]);
 }
 await selectDropdown(page,'Git operation','merge');await expect(target).toHaveAttribute('data-value','refs/heads/feature/targets');
 await selectDropdown(page,'Branch','feature/targets');await saved(page);
 await expect(target).toHaveAttribute('data-value','refs/heads/main');await choices(['refs/heads/main']);
 await expect(dialog(page).getByRole('alert')).toHaveCount(0);
 const current=await repositorySnapshot(page);assert.equal(current.head,original.head);
 assert.deepEqual(current.history.map(entry=>entry.oid),original.history.map(entry=>entry.oid));await close(page);
});
Then('Recovery uses the operation dropdown and checkpoint targets with explicit confirmation',{timeout:60000},async function(){
 const page=this.page,original=await repositorySnapshot(page);await open(page);await action(page,'Actions').click();
 await selectDropdown(page,'Git operation','recover');
 await expect(action(page,'Recovery')).toBeDisabled();await expect(dialog(page)).toContainText('No recovery checkpoints.');
 await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Git target',exact:true})).toHaveAttribute('data-value','');
 await expect(page.getByRole('button',{name:'Git target',exact:true})).toBeDisabled();
 await selectDropdown(page,'Git operation','merge');await action(page,'Staging').click();await identity(page);
 await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill('Amended source message');
 await dialog(page).getByRole('checkbox',{name:'Amend latest commit',exact:true}).check();
 await action(page,'Amend commit').click();
 await expect.poll(async()=>(await repositorySnapshot(page)).head).not.toBe(original.head);
 await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('');await saved(page);
 const amended=await repositorySnapshot(page);
 await expect(dialog(page).getByRole('navigation',{name:'Git views',exact:true}).getByRole('button',{name:'Recovery',exact:true})).toHaveCount(0);
 await action(page,'Actions').click();
 const operation=page.getByRole('button',{name:'Git operation',exact:true}),target=page.getByRole('button',{name:'Git target',exact:true});
 await expect(operation).toHaveAttribute('data-value','merge');const previousTarget=await target.getAttribute('data-value');
 await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill('Retained operation draft');
 await selectDropdown(page,'Git operation','recover');await expect(operation.locator('.navigation-label')).toHaveText('Recovery');
 const checkpoint=(await repositoryGitStatus(page)).recoveries.find(point=>point.oid===original.head);
 const menu=await openNavigationMenu(page,'Git target');
 await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
 await expect(menu.getByRole('menuitemradio')).toContainText(original.head.slice(0,8));await page.keyboard.press('Escape');
 await expect(target).toHaveAttribute('data-value',checkpoint.ref);
 const confirm=dialog(page).getByRole('checkbox',{name:'Reset the current branch to this checkpoint',exact:true});
 await expect(confirm).not.toBeChecked();await expect(action(page,'Recovery')).toBeDisabled();await confirm.check();
 await expect(action(page,'Recovery')).toBeEnabled();
 assert.equal((await repositorySnapshot(page)).head,amended.head);
 await selectDropdown(page,'Git operation','merge');await expect(target).toHaveAttribute('data-value',previousTarget);
 await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Retained operation draft');
 await selectDropdown(page,'Git operation','recover');await expect(confirm).not.toBeChecked();
 await confirm.check();await action(page,'Staging').click();await action(page,'Actions').click();
 await expect(operation).toHaveAttribute('data-value','recover');await expect(confirm).not.toBeChecked();
 await confirm.check();await action(page,'Recovery').click();
 await expect.poll(async()=>(await repositorySnapshot(page)).head).toBe(original.head);await saved(page);
 await expect(confirm).not.toBeChecked();await expect(action(page,'Recovery')).toBeDisabled();
 await expect(operation).toHaveAttribute('data-value','recover');
 await expect(dialog(page).getByRole('alert')).toHaveCount(0);assert.equal((await repositorySnapshot(page)).branch,'main');
 await close(page);
});
Then('the Git panel resolves a conflicting merge and survives reload',{timeout:90000},async function(){
 const page=this.page;
 // Prepare ordinary local branches using the same public worker API as the interface.
 await page.evaluate(async()=>{
  const {repositoryClient:c}=await import('/lib/repository/client.ts');const repo=(await c.list())[0];let s=await c.open(repo.id);const author={name:'Browser author',email:'browser@example.invalid'};
  const act=async(kind,args={})=>s=await c.gitAction(s.id,{kind,author,...args},s.revision);
  s=await c.write(s.id,'main.js','const side = "base";\n',s.revision);await act('stage');await act('commit',{message:'Baseline'});
  s=await c.createBranch(s.id,'feature',s.revision);s=await c.write(s.id,'main.js','const side = "feature";\n',s.revision);await act('stage');await act('commit',{message:'Feature'});
  s=await c.switchBranch(s.id,'main',s.revision);s=await c.write(s.id,'main.js','const side = "main";\n',s.revision);await act('stage');await act('commit',{message:'Main'});
 });
 await page.reload();await saved(page);await open(page);await identity(page);await action(page,'Actions').click();
 await selectDropdown(page,'Git target','refs/heads/feature');await action(page,'Merge branch').click();await expect(dialog(page).getByRole('region',{name:'Git operation in progress',exact:true})).toContainText('1 unresolved files');
 await close(page);await page.reload();await saved(page);await open(page);await expect(dialog(page)).toContainText('1 unresolved files');
 await action(page,'Use incoming').click();await expect(dialog(page)).toContainText('0 unresolved files');await action(page,'Continue').click();
 await expect(dialog(page).getByRole('region',{name:'Git operation in progress',exact:true})).toHaveCount(0);await close(page);await expect(page.getByLabel('Code editor document',{exact:true})).toContainText('feature');
});
Then('Git pane motion, layout and focus adapt without losing the commit draft',{timeout:90000},async function(){
 const page=this.page;await page.setViewportSize({width:1440,height:980});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByLabel('Code editor document',{exact:true}).fill('const changed = true;\n');await saved(page);
 await page.evaluate(()=>{
  window.gitPaneEntryFrames=null;
  const observer=new MutationObserver(()=>{
   const pane=document.querySelector('[data-slot="sheet-dock"]');if(!pane)return;observer.disconnect();
   requestAnimationFrame(()=>window.gitPaneEntryFrames=pane.getAnimations().flatMap(animation=>animation.effect.getKeyframes()).map(frame=>frame.flexBasis).filter(Boolean));
  });observer.observe(document.body,{childList:true,subtree:true});
 });
 await open(page);await expect(dialog(page)).toHaveAttribute('data-layout','docked');
 await expect.poll(()=>page.evaluate(()=>window.gitPaneEntryFrames)).not.toBeNull();
 assert.ok((await page.evaluate(()=>window.gitPaneEntryFrames)).some(value=>parseFloat(value)>300));
 await expect(page.locator('.sheet-dock-clip')).toHaveCSS('overflow-x','clip');
 await page.locator('[data-slot="sheet-dock"]').evaluate(element=>Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished)));
 const explorer=await page.getByRole('complementary',{name:'Repository explorer',exact:true}).boundingBox();
 const pane=await dialog(page).boundingBox(),workbench=await page.locator('.workbench').boundingBox();
 assert.ok(workbench.x>=explorer.x+explorer.width-1);assert.ok(pane.x>=workbench.x+workbench.width-1);assert.ok(workbench.width>=480);assert.equal(Math.round(pane.x+pane.width),1440);
 await identity(page);await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill('Preserve this draft');
 await page.getByLabel('Code editor document',{exact:true}).fill('const changed = false;\n');await saved(page);
 await expect(dialog(page)).toBeVisible();await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Preserve this draft');
 await close(page);
 await page.getByRole('button',{name:'Git operations',exact:true}).click();await expect(page.getByRole('button',{name:'Git operation',exact:true})).toBeVisible();
 await selectDropdown(page,'Git operation','rebase');await expect(action(page,'Actions')).toHaveAttribute('aria-pressed','true');
 await this.attach(await page.screenshot({path:`${this.artifactDirectory}/git-pane-docked.png`}), 'image/png');
 await action(page,'Staging').click();await page.setViewportSize({width:390,height:844});
 await expect(dialog(page)).toHaveAttribute('data-layout','overlay');await expect(page.getByRole('dialog',{name:'Git · Local Git fixture',exact:true})).toHaveAttribute('data-side','right');
 await expect.poll(async()=>{const b=await dialog(page).boundingBox();return Math.round(b.x)}).toBe(0);
 const compact=await dialog(page).boundingBox();assert.ok(compact.width>=389&&compact.width<=391);assert.equal(Math.round(compact.y),0);assert.equal(Math.round(compact.height),844);
 await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Preserve this draft');
 const closeButton=action(page,'Close');await closeButton.focus();await page.keyboard.press('Shift+Tab');assert.ok(await dialog(page).evaluate(element=>element.contains(document.activeElement)));
 await dialog(page).locator('[data-pane-heading]').focus();await expect(page.getByRole('tooltip')).toBeHidden();
 await this.attach(await page.screenshot({path:`${this.artifactDirectory}/git-pane-mobile.png`}), 'image/png');
 await page.keyboard.press('Escape');await expect(dialog(page)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Git operations',exact:true})).toBeFocused();
 await page.setViewportSize({width:1440,height:980});await page.emulateMedia({reducedMotion:'reduce'});await open(page);
 await expect(dialog(page)).toHaveAttribute('data-layout','docked');await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Preserve this draft');
 const animated=await dialog(page).evaluate(element=>element.parentElement.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length);assert.equal(animated,0);
 await close(page);await page.reload();await saved(page);await open(page);
 await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Preserve this draft');
 await close(page);
});

Then('the {string} button toggles the Git pane without losing drafts',async function(entry){
 const page=this.page;
 for(const view of ['Editor','History']){
  await selectPage(page,view);
  const button=page.getByRole('button',{name:entry,exact:true});
  await expect(button).toHaveAttribute('aria-expanded','false');
  await button.click();await expect(dialog(page)).toBeVisible();await expect(button).toHaveAttribute('aria-expanded','true');
  await expect(action(page,entry==='Commit changes'?'Staging':'Actions')).toHaveAttribute('aria-pressed','true');
  await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill('Retained toggle draft');
  const other=page.getByRole('button',{name:entry==='Commit changes'?'Git operations':'Commit changes',exact:true});
  await other.click();await expect(dialog(page)).toBeVisible();
  await expect(action(page,entry==='Commit changes'?'Actions':'Staging')).toHaveAttribute('aria-pressed','true');
  await button.click();await expect(dialog(page)).toBeVisible();
  await expect(action(page,entry==='Commit changes'?'Staging':'Actions')).toHaveAttribute('aria-pressed','true');
  await action(page,'Commits').click();
  await button.click();await expect(dialog(page)).toBeVisible();
  await expect(action(page,entry==='Commit changes'?'Staging':'Actions')).toHaveAttribute('aria-pressed','true');
  await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Retained toggle draft');
  await button.click();await expect(dialog(page)).toHaveCount(0);await expect(button).toHaveAttribute('aria-expanded','false');await expect(button).toBeFocused();
  await button.click();await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Retained toggle draft');
  await button.click();await expect(dialog(page)).toHaveCount(0);
 }
});
Then('Git pane resizing supports dragging cancellation keyboard and responsive restoration',{timeout:90000},async function(){
 const page=this.page;await page.setViewportSize({width:1600,height:980});await open(page);
 const handle=page.getByRole('separator',{name:'Resize Git pane',exact:true});
 const width=()=>dialog(page).evaluate(element=>Math.round(element.getBoundingClientRect().width));
 const sized=async value=>{await expect.poll(width).toBe(value);await saved(page);await expect(handle).toHaveAttribute('aria-valuenow',String(value));};
 const drag=async(delta,release=true)=>{const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-delta,box.y+box.height/2,{steps:8});if(release)await page.mouse.up();};
 await expect(handle).toBeVisible();const bounds=await handle.boundingBox();assert.equal(bounds.y,0);assert.equal(bounds.height,980);
 await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill('Keep this resize draft');
 const original=await width();assert.equal(original,320);await drag(90);await sized(original+90);
 await close(page);await open(page);await sized(original+90);
 await page.reload();await saved(page);await expect(dialog(page)).toBeVisible();await sized(original+90);
 await expect(dialog(page)).toHaveCSS('border-left-width','2px');
 await drag(70,false);await expect.poll(width).toBe(original+160);await page.keyboard.press('Escape');await page.mouse.up();await sized(original+90);await expect(dialog(page)).toBeVisible();
 await handle.focus();await handle.press('ArrowLeft');await sized(original+106);
 await handle.press('ArrowRight');await sized(original+90);
 await handle.press('Home');await sized(320);await handle.press('End');const maximum=Number(await handle.getAttribute('aria-valuemax'));await sized(maximum);
 const workbench=await page.locator('.workbench').boundingBox();assert.ok(workbench.width>=560);
 const trigger=page.getByRole('button',{name:'Git operations',exact:true}),triggerBox=await trigger.boundingBox();assert.ok(triggerBox.x+triggerBox.width<=workbench.x+workbench.width);
 await trigger.click();await expect(action(page,'Actions')).toHaveAttribute('aria-pressed','true');await expect(dialog(page)).toBeVisible();await saved(page);
 await trigger.click();await expect(dialog(page)).toHaveCount(0);await trigger.click();await sized(maximum);
 await page.reload();await saved(page);await expect(dialog(page)).toBeVisible();await sized(maximum);
 await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Keep this resize draft');
 await page.setViewportSize({width:1440,height:980});await expect.poll(async()=>await width()===Number(await handle.getAttribute('aria-valuemax'))).toBe(true);await saved(page);
 await page.setViewportSize({width:390,height:844});await expect(dialog(page)).toHaveAttribute('data-layout','overlay');await expect(handle).toHaveCount(0);
 assert.equal(Math.round((await dialog(page).boundingBox()).width),390);
 await page.setViewportSize({width:1600,height:980});await expect(handle).toBeVisible();await sized(maximum);
 await this.attach(await page.screenshot({path:`${this.artifactDirectory}/git-pane-resized.png`}), 'image/png');
 await close(page);
});
Then('the main view follows Git pane opening and closing across views',{timeout:90000},async function(){
 const page=this.page;await page.setViewportSize({width:1440,height:980});await page.emulateMedia({reducedMotion:'no-preference'});
 const fixture=Array.from({length:500},(_,line)=>`const item${line} = ${line};`).join('\n');
 await page.getByLabel('Code editor document',{exact:true}).fill(fixture);await saved(page);
 const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
 const results=[];
 for(const view of ['Editor','Editor','Editor','History','Settings']){
  if(view==='Settings'){await selectPage(page,'Editor');await page.getByRole('button',{name:'Git operations',exact:true}).click();await expect(dialog(page)).toBeVisible();}
  await selectPage(page,view);await saved(page);
  for(const opening of (view==='Settings'?[false]:[true,false])){
   const before=await session.send('Performance.getMetrics');
   await page.evaluate(()=>{
    const view=document.querySelector('.workbench'),area=document.querySelector('.work-area');
    window.gitDockSamples=[];window.gitDockSampling=true;
    const start=performance.now();
    const sample=()=>{
     if(!window.gitDockSampling)return;
     const box=view.getBoundingClientRect(),content=area.querySelector('.docked-content');
     window.gitDockSamples.push({time:performance.now()-start,width:box.width,right:box.right,paneLeft:content?.getBoundingClientRect().left??null});
     window.gitDockFrame=requestAnimationFrame(sample);
    };sample();
   });
   await (opening?page.getByRole('button',{name:'Git operations',exact:true}):action(page,'Close')).click();
   if(opening){await expect(dialog(page)).toBeVisible();await page.locator('[data-slot="sheet-dock"]').evaluate(async element=>{await Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});}
   else await expect(dialog(page)).toHaveCount(0);
   await page.evaluate(()=>new Promise(requestAnimationFrame));
   const samples=await page.evaluate(()=>{window.gitDockSampling=false;cancelAnimationFrame(window.gitDockFrame);return window.gitDockSamples;});
   const after=await session.send('Performance.getMetrics');
   const metric=(data,name)=>data.metrics.find(item=>item.name===name)?.value??0;
   const distinct=[...new Set(samples.map(item=>Math.round(item.width)))];
   const low=Math.min(...distinct),high=Math.max(...distinct),intermediate=distinct.filter(width=>width>low+1&&width<high-1);
   results.push({view,opening,samples,intermediate:intermediate.length,layoutMs:(metric(after,'LayoutDuration')-metric(before,'LayoutDuration'))*1000,layoutCount:metric(after,'LayoutCount')-metric(before,'LayoutCount')});
   assert.ok(high>low+300);
   assert.ok(intermediate.length>=2,`${view} ${opening?"opening":"closing"} must resize over intermediate frames`);
   const moving=samples.filter(sample=>sample.paneLeft!==null&&sample.width>low+1&&sample.width<high-1);
   assert.ok(moving.every(sample=>Math.abs(sample.right-sample.paneLeft)<1),"Main view and Git pane must share their moving boundary");
  }
 }
 await session.detach();
 await mkdir(this.artifactDirectory,{recursive:true});
 await writeFile(`${this.artifactDirectory}/git-dock-motion.json`,JSON.stringify({fixtureLines:500,browser:'Chromium',viewport:[1440,980],motion:'normal',instrumentation:'Playwright trace and per-frame geometry sampling; CDP main-page layout counters',results},null,2));
 await this.attach(JSON.stringify(results.map(({samples,...result})=>result)),'application/json');
});
Then('toggling the Git pane during its slide reverses smoothly',async function(){
 const page=this.page;await page.setViewportSize({width:1440,height:980});await page.emulateMedia({reducedMotion:'no-preference'});await saved(page);
 const result=await page.evaluate(async()=>{
  const button=document.querySelector('button[aria-label="Git operations"]'),view=document.querySelector('.workbench');
  const frame=()=>new Promise(requestAnimationFrame),width=()=>view.getBoundingClientRect().width;
  const initial=width();button.click();
  for(let index=0;index<60&&width()>=initial-1;index++)await frame();
  const beforeReverse=width();
  button.click();await Promise.resolve();await Promise.resolve();const afterReverse=width();
  for(let index=0;index<60&&document.querySelector('[data-slot="sheet-dock"]');index++)await frame();
  return {initial,beforeReverse,afterReverse,final:width(),closed:!document.querySelector('[data-slot="sheet-dock"]')};
 });
 assert.ok(result.beforeReverse<result.initial-1,'The reversal starts during a visible slide');
 assert.ok(Math.abs(result.afterReverse-result.beforeReverse)<=2,'Reversing must preserve the current main-view width');
 assert.equal(result.final,result.initial);assert.ok(result.closed);
});
Then('Git header toolbar and tab edges share the main view pixel coordinates',{timeout:90000},async function(){
 const page=this.page;await page.setViewportSize({width:1440,height:980});await open(page);
 const aligned=async()=>{
  await expect.poll(()=>page.evaluate(()=>{
   const pairs=[['.topbar','.git-header'],['.editor-toolbar','.git-context']];
   const tabs=document.querySelector('.file-tabs');if(tabs?.getBoundingClientRect().height>0)pairs.push(['.file-tabs','.git-tabs']);
   let difference=0;
   for(const [main,git]of pairs){const a=document.querySelector(main).getBoundingClientRect(),b=document.querySelector(git).getBoundingClientRect();difference=Math.max(difference,Math.abs(a.top-b.top),Math.abs(a.bottom-b.bottom));}
   const center=element=>{const r=element.getBoundingClientRect();return r.x+r.width/2;};
   const gitTitle=document.querySelector('.git-header .material-symbols-rounded'),gitBranch=document.querySelector('.git-context .material-symbols-rounded'),gitTab=document.querySelector('.git-tab .material-symbols-rounded');
   difference=Math.max(difference,Math.abs(center(gitTitle)-center(gitBranch)));
   if(gitTab.getBoundingClientRect().width>0)difference=Math.max(difference,Math.abs(center(gitTitle)-center(gitTab)));
   if(tabs?.getBoundingClientRect().height>0){const a=document.querySelector('.file-tab-select').getBoundingClientRect(),b=document.querySelector('.git-tab .button-content').getBoundingClientRect();difference=Math.max(difference,Math.abs((a.top+a.bottom-b.top-b.bottom)/2));}
   if(tabs?.getBoundingClientRect().height>0){
    const icon=tabs.querySelector('.file-tab-select .devicon, .file-tab-select .material-symbols-rounded');
    for(const selector of ['.topbar .repository-picker .material-symbols-rounded','.editor-toolbar button .material-symbols-rounded'])difference=Math.max(difference,Math.abs(center(document.querySelector(selector))-center(icon)));
   }
   return difference;
  })).toBeLessThan(.01);
  await expect.poll(()=>page.evaluate(()=>{
   const icon=document.querySelector('.git-header button .material-symbols-rounded'),text=document.querySelector('.git-context code');
   const context=document.createElement('canvas').getContext('2d'),style=getComputedStyle(icon);
   context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
   const right=icon.getBoundingClientRect().x+context.measureText(icon.textContent).actualBoundingBoxRight;
   return Math.abs(right-text.getBoundingClientRect().right);
  })).toBeLessThan(1);
 };
 for(const size of ['Small','Medium','Large']){
  await selectPage(page,'Settings');await selectDropdown(page,'Settings scope','global');
  await page.getByRole('radio',{name:size,exact:true}).check();await saved(page);await aligned();
  await selectPage(page,'History');await page.getByRole('navigation',{name:'History views',exact:true}).getByRole('button',{name:'Commit history',exact:true}).click();await aligned();
  await selectPage(page,'Editor');await page.getByRole('separator',{name:'Resize Git pane',exact:true}).press('End');await saved(page);await aligned();
  await page.setViewportSize({width:1760,height:980});await page.getByRole('separator',{name:'Resize Git pane',exact:true}).press('End');await saved(page);await aligned();
  await page.setViewportSize({width:1440,height:980});await aligned();
 }
 await selectPage(page,'Settings');await page.getByRole('radio',{name:'Medium',exact:true}).check();await saved(page);
 await selectPage(page,'Editor');await page.setViewportSize({width:1280,height:900});await aligned();
 const main=await page.locator('.workbench').boundingBox();
 await this.attach(await page.screenshot({path:`${this.artifactDirectory}/git-aligned-headers.png`,clip:{x:Math.round(main.x+main.width)-70,y:0,width:180,height:155}}),'image/png');
 await this.attach(await page.screenshot({path:`${this.artifactDirectory}/main-header-icon-alignment.png`,clip:{x:Math.round(main.x),y:0,width:180,height:155}}),'image/png');
 await this.attach(await page.screenshot({path:`${this.artifactDirectory}/git-close-icon-alignment.png`,clip:{x:1180,y:0,width:100,height:130}}),'image/png');
 await close(page);
});
Then('overflowing Git tabs support mouse wheel trackpad and keyboard navigation at {int} pixels',{timeout:90000},async function(width){
 const page=this.page;await selectPage(page,'Settings');await selectDropdown(page,'Settings scope','global');
 await selectDropdown(page,'Interface font','monospace');
 await page.getByRole('radiogroup',{name:'Interface size',exact:true}).getByRole('radio',{name:'Large',exact:true}).check();await saved(page);
 await selectPage(page,'Editor');await page.setViewportSize({width,height:900});await open(page);
 if(width>1000){const divider=page.getByRole('separator',{name:'Resize Git pane',exact:true});await divider.press('Home');await saved(page);}
 const tabs=dialog(page).getByRole('navigation',{name:'Git views',exact:true}),position=()=>tabs.evaluate(element=>element.scrollLeft);
 await expect.poll(()=>tabs.evaluate(element=>element.scrollWidth-element.clientWidth)).toBeGreaterThan(0);
 const first=tabs.getByRole('button',{name:'Staging',exact:true}),last=tabs.getByRole('button',{name:'Stashes',exact:true});
 const tabCount=await tabs.getByRole('button').count();
 const header=await dialog(page).locator('.git-header').boundingBox(),context=await dialog(page).locator('.git-context').boundingBox();
 const fullyVisible=button=>expect.poll(async()=>{const outer=await tabs.boundingBox(),inner=await button.boundingBox();return Math.max(outer.x-inner.x,inner.x+inner.width-outer.x-outer.width);},{message:'The complete tab must fit inside the scroll area'}).toBeLessThanOrEqual(1);
 await tabs.hover();await page.mouse.wheel(0,300);await expect.poll(position).toBeGreaterThan(0);await fullyVisible(last);
 await expect(first).toHaveAttribute('aria-pressed','true');
 await page.mouse.wheel(0,-300);await expect.poll(position).toBe(0);
 await page.mouse.wheel(300,0);await expect.poll(position).toBeGreaterThan(0);await fullyVisible(last);
 await page.mouse.wheel(-300,0);await expect.poll(position).toBe(0);
 await first.focus();for(let i=1;i<tabCount;i++)await page.keyboard.press('Tab');await expect(last).toBeFocused();await fullyVisible(last);
 await page.keyboard.press('Enter');await expect(last).toHaveAttribute('aria-pressed','true');
 for(let i=1;i<tabCount;i++)await page.keyboard.press('Shift+Tab');await expect(first).toBeFocused();await fullyVisible(first);
 await page.keyboard.press('Enter');await expect(first).toHaveAttribute('aria-pressed','true');
 assert.deepEqual(await dialog(page).locator('.git-header').boundingBox(),header);assert.deepEqual(await dialog(page).locator('.git-context').boundingBox(),context);
 await close(page);
});
Then('Git tab changes keep their first card visible with {string} motion at {int} pixels',{timeout:90000},async function(motion,width){
 const page=this.page;await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:motion});await open(page);
 await page.locator('[data-git-panel]').evaluate(async pane=>{await Promise.all(pane.closest('[data-slot="sheet-dock"], [role="dialog"]').getAnimations({subtree:true}).map(animation=>animation.finished));await document.fonts.ready;});
 await dialog(page).getByRole('textbox',{name:'Commit subject',exact:true}).fill('Visible tab draft');
 const results=[];
 for(let repeat=0;repeat<3;repeat++)for(const tab of ['Actions','Stashes','Commits','Staging']){
  await page.evaluate(()=>{
   const pane=document.querySelector('[data-git-panel]'),previous=pane.querySelector('.view-content');
   const chrome=[pane.querySelector('.git-header'),pane.querySelector('.git-context'),pane.querySelector('.git-tabs')];
   const bounds=chrome.map(element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}});
   window.gitTabSample={done:false,frames:[],animations:[],chromeShift:0};
   const observer=new MutationObserver(()=>{
    const view=pane.querySelector('.view-content');if(!view||view===previous)return;observer.disconnect();
    const started=performance.now();
    const sample=()=>{
     const data=window.gitTabSample,style=getComputedStyle(view),card=view.querySelector('.git-card');
     data.frames.push({time:performance.now()-started,opacity:Number(style.opacity),transform:style.transform,cardTop:card.getBoundingClientRect().top});
     if(!data.animations.length)data.animations=view.getAnimations().map(animation=>animation.effect.getKeyframes().map(frame=>({opacity:frame.opacity,transform:frame.transform})));
     for(let i=0;i<chrome.length;i++){const r=chrome[i].getBoundingClientRect(),b=bounds[i];data.chromeShift=Math.max(data.chromeShift,Math.abs(r.x-b.x),Math.abs(r.y-b.y),Math.abs(r.width-b.width),Math.abs(r.height-b.height));}
     if(performance.now()-started<180)requestAnimationFrame(sample);else data.done=true;
    };requestAnimationFrame(sample);
   });observer.observe(pane,{childList:true,subtree:true});
  });
  await action(page,tab).click();await expect(action(page,tab)).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(()=>window.gitTabSample.done)).toBe(true);
  results.push({repeat,tab,...await page.evaluate(()=>window.gitTabSample)});
 }
 await action(page,'Actions').focus();await page.keyboard.press('Enter');await expect(action(page,'Actions')).toHaveAttribute('aria-pressed','true');
 await action(page,'Staging').focus();await page.keyboard.press('Space');await expect(action(page,'Staging')).toHaveAttribute('aria-pressed','true');
 await expect(dialog(page).getByRole('textbox',{name:'Commit subject',exact:true})).toHaveValue('Visible tab draft');
 await mkdir(this.artifactDirectory,{recursive:true});
 const hash=createHash('sha256');for await(const chunk of createReadStream('dist/index.html'))hash.update(chunk);
 const report={build:hash.digest('hex'),browser:page.context().browser().version(),viewport:[width,900],motion,fixture:'Unborn repository with empty main.js; unsubmitted commit draft',instrumentation:'Playwright tracing, requestAnimationFrame opacity and geometry sampling; no elapsed-time performance claim',results};
 await writeFile(`${this.artifactDirectory}/git-tab-visibility.json`,JSON.stringify(report,null,2));
 const summary={build:report.build,viewport:report.viewport,motion,switches:results.length,minOpacity:Math.min(...results.flatMap(result=>result.frames.map(frame=>frame.opacity))),transformedFrames:results.reduce((count,result)=>count+result.frames.filter(frame=>frame.transform!=='none').length,0),maxChromeShift:Math.max(...results.map(result=>result.chromeShift))};
 await this.attach(JSON.stringify(summary),'application/json');
 await this.attach(await dialog(page).screenshot({path:`${this.artifactDirectory}/git-tabs-finished.png`}),'image/png');
 await close(page);
 assert.ok(summary.minOpacity>=.99,`First Git card faded to opacity ${summary.minOpacity}`);
 assert.equal(summary.transformedFrames,0,'Switching Git tabs must not replay an entrance animation on the upper card');
 assert.ok(summary.maxChromeShift<.01,`Git header or tabs shifted by ${summary.maxChromeShift}px`);
});
Then('Git dropdown labels and controls share a continuous hover area at {int} pixels',{timeout:90000},async function(width){
 const page=this.page;await page.setViewportSize({width,height:900});
 await page.getByRole('button',{name:'Git operations',exact:true}).click();await expect(dialog(page).locator('#git-command')).toBeVisible();
 const palette=await dialog(page).evaluate(pane=>{
  const probe=document.createElement('span');probe.hidden=true;pane.append(probe);
  const values={};for(const state of ['hover','focus']){probe.style.color=`var(--color-${state}-foreground)`;probe.style.backgroundColor=`var(--color-${state}-background)`;const style=getComputedStyle(probe);values[state]={color:style.color,background:style.backgroundColor};}
  probe.style.color='var(--color-foreground)';probe.style.backgroundColor='var(--color-background)';const style=getComputedStyle(probe);values.base={color:style.color,background:style.backgroundColor};probe.remove();return values;
 });
 const leave=async()=>{const heading=await dialog(page).locator('[data-pane-heading]').boundingBox();await page.mouse.move(heading.x+heading.width/2,heading.y+heading.height/2);};
 const travel=async(id,state)=>{
  const trigger=dialog(page).locator(`#${id}`),label=dialog(page).locator(`label[for="${id}"]`);
  const button=await trigger.boundingBox(),title=await label.boundingBox(),value=await trigger.getAttribute('data-value');
  for(const y of [title.y+title.height/2,button.y-3,button.y+3,button.y+button.height/2]){
   await page.mouse.move(button.x+button.width/2,y,{steps:4});
   await expect(trigger).toHaveCSS('color',palette[state].color);await expect(trigger).toHaveCSS('background-color',state==='hover'?palette.base.background:palette.focus.background);
   await expect(trigger).toHaveAttribute('data-value',value);
  }
 };
 for(const id of ['git-command','git-target','git-mode']){
  await travel(id,'hover');await leave();await expect(dialog(page).locator(`#${id}`)).toHaveCSS('color',palette.base.color);
 }
 const operation=dialog(page).locator('#git-command'),box=await operation.boundingBox();
 // The visible spacing is part of the native label's click target as well.
 await page.mouse.click(box.x+box.width/2,box.y-3);await expect(operation).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.getByRole('menu',{name:'Git operation',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(operation).toBeFocused();
 await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(operation).toBeFocused();
 assert.ok(await operation.evaluate(button=>button.matches(':focus-visible')));await travel('git-command','focus');
 await selectDropdown(page,'Git operation','reset');await travel('git-reset-mode','hover');
 const reset=dialog(page).locator('#git-reset-mode');await leave();await reset.evaluate(button=>button.disabled=true);
 const disabled=await reset.evaluate(async button=>{getComputedStyle(button).color;await Promise.all(button.getAnimations().map(animation=>animation.finished));return{color:getComputedStyle(button).color,background:getComputedStyle(button).backgroundColor};});
 const label=await dialog(page).locator('label[for="git-reset-mode"]').boundingBox();await page.mouse.move(label.x+label.width/2,label.y+label.height/2);
 await expect(reset).toHaveCSS('color',disabled.color);await expect(reset).toHaveCSS('background-color',disabled.background);
 await reset.evaluate(button=>button.disabled=false);await close(page);
});
