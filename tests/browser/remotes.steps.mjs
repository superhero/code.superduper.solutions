// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Then,After} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import * as git from 'isomorphic-git';
import {selectPage,selectDropdown,openNavigationMenu} from './navigation.helpers.mjs';
import {upstreamApiFixture,fixtureToken} from '../fixtures/upstream-api.mjs';
import {prepareGitFixture,gitFixtureFetch,writeFixtureCommit} from '../fixtures/git-transport.mjs';
const labels={github:'GitHub',gitlab:'GitLab',bitbucket:'Bitbucket'};
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const settings=page=>page.getByRole('region',{name:'Upstream connections',exact:true});
async function settingsPage(page){await selectPage(page,'Settings');await selectDropdown(page,'Settings scope','global');await saved(page);}
async function install(page,provider){
 const card=settings(page).getByRole('region',{name:`${labels[provider]} integration`,exact:true});
 await card.getByRole('button',{name:'Install',exact:true}).click();await expect(card.getByRole('button',{name:'Add connection',exact:true})).toBeEnabled();
}
async function connect(page,provider,{host,remembered=false,token=fixtureToken}={}){
 await settings(page).getByRole('button',{name:'New connection',exact:true}).click();await selectDropdown(page,'Upstream provider',provider);
 const form=settings(page).locator('.connection-form');await form.getByLabel('Name',{exact:true}).fill(`Fixture ${labels[provider]}`);
 if(host)await form.getByLabel('Host',{exact:true}).fill(host);await form.getByLabel('Access token',{exact:true}).fill(token);
 if(remembered){await form.getByRole('switch',{name:'Remember encrypted token',exact:true}).check();await form.getByLabel('Encryption passphrase',{exact:false}).fill('fixture encryption passphrase');}
 await form.getByRole('button',{name:'Save connection',exact:true}).click();await expect(form).toHaveCount(0);await expect(settings(page)).toContainText('Connection saved.');
}
async function mockApi(world,provider){
 const fixture=upstreamApiFixture(provider),apiOrigin=provider==='github'?'https://api.github.com':provider==='gitlab'?`${fixture.host}/api/v4`:'https://api.bitbucket.org';
 await world.context.route(`${apiOrigin}/**`,async route=>{
  const request=route.request();if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','access-control-allow-headers':'*'}});
  const response=await fixture.transport(new Request(request.url(),{method:request.method(),headers:request.headers(),credentials:'omit',redirect:'error',...(request.postDataBuffer()?{body:request.postDataBuffer()}: {})}));
  await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'access-control-allow-origin':'*','access-control-expose-headers':'*'},body:Buffer.from(await response.arrayBuffer())});
 });return fixture;
}
async function addRemote(page,url){
 await selectPage(page,'Editor');await page.getByRole('button',{name:'Git operations',exact:true}).click();const panel=page.locator('[data-git-panel]');await panel.getByRole('button',{name:'Remotes',exact:true}).click();
 const remote=panel.getByRole('region',{name:'Remote Git',exact:true});await expect(remote.getByRole('button',{name:'Add remote',exact:true})).toBeEnabled();await remote.getByRole('button',{name:'Add remote',exact:true}).click();
 await remote.getByLabel('Remote name',{exact:true}).fill('origin');await remote.getByLabel('HTTPS clone URL',{exact:true}).fill(url);await remote.getByRole('button',{name:'Save remote',exact:true}).click();await expect(remote).toContainText('Remote configured.');return remote;
}
Then('upstream libraries install only on request and preserve verified package controls',{timeout:90000},async function(){
 const page=this.page;await settingsPage(page);assert.ok(!this.requests.some(item=>item.url.includes('/remotes/')));
 for(const provider of ['github','gitlab','bitbucket'])await install(page,provider);
 assert.equal(this.requests.filter(item=>/\/remotes\/.*\.remote\.json$/.test(item.url)).length,3);
 const card=settings(page).getByRole('region',{name:'GitHub integration',exact:true});const download=page.waitForEvent('download');await card.getByRole('button',{name:'Export GitHub integration',exact:true}).click();const file=await download;
 await mkdir(this.artifactDirectory,{recursive:true});const exported=join(this.artifactDirectory,'github.remote.json');await file.saveAs(exported);
 await card.getByRole('button',{name:'Uninstall GitHub integration',exact:true}).click();await expect(card.getByRole('button',{name:'Install',exact:true})).toBeEnabled();
 await settings(page).getByLabel('Import upstream integration',{exact:true}).setInputFiles(exported);await expect(card.getByRole('button',{name:'Add connection',exact:true})).toBeEnabled();
 await this.attach(await settings(page).screenshot({path:join(this.artifactDirectory,'upstream-settings.png')}),'image/png');
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>settings(page).evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(1);
});
Then('an upstream connection remembers only encrypted credentials and unlocks after reload',{timeout:90000},async function(){
 const page=this.page;await mockApi(this,'github');await settingsPage(page);await install(page,'github');await connect(page,'github',{remembered:true});
 const stored=await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('code-remote-connections');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise((resolve,reject)=>{const request=db.transaction('connections').objectStore('connections').getAll();request.onsuccess=()=>resolve(request.result.map(record=>({...record,secret:{...record.secret,cipherBytes:record.secret.cipher.byteLength}})));request.onerror=()=>reject(request.error);});}finally{db.close();}
 });assert.equal(stored.length,1);assert.ok(stored[0].secret.cipherBytes>16);assert.ok(!JSON.stringify(stored).includes(fixtureToken));assert.ok(!(await page.evaluate(()=>JSON.stringify({...localStorage}))).includes(fixtureToken));
 await page.reload();await saved(page);await expect(settings(page)).toContainText('Locked');await settings(page).getByRole('button',{name:'Unlock',exact:true}).click();
 await settings(page).getByLabel('Passphrase for Fixture GitHub',{exact:true}).fill('wrong passphrase');await settings(page).locator('.unlock').getByRole('button',{name:'Unlock',exact:true}).click();await expect(settings(page).getByRole('alert')).toContainText('could not be unlocked');
 await settings(page).getByLabel('Passphrase for Fixture GitHub',{exact:true}).fill('fixture encryption passphrase');await settings(page).locator('.unlock').getByRole('button',{name:'Unlock',exact:true}).click();await expect(settings(page)).toContainText('Connection unlocked.');
 await settings(page).getByRole('button',{name:'Verify',exact:true}).click();await expect(settings(page)).toContainText('Connected as Fixture');
});
Then('the {string} connection supports hosted requests issues and checks with intercepted APIs',{timeout:120000},async function(provider){
 const page=this.page,fixture=await mockApi(this,provider);await page.setViewportSize({width:1440,height:980});await settingsPage(page);await install(page,provider);await connect(page,provider,{host:fixture.host});
 const remote=await addRemote(page,`${fixture.host}/owner/repository.git`);await selectDropdown(page,'Git connection',(await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('code-remote-connections');r.onsuccess=()=>resolve(r.result);});const result=await new Promise(resolve=>{const r=db.transaction('connections').objectStore('connections').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return result[0].id;
 })));
 await remote.getByRole('button',{name:'Requests',exact:true}).click();const hosted=remote.getByRole('region',{name:provider==='gitlab'?'Merge requests':'Pull requests',exact:true});
 await hosted.getByRole('button',{name:/#1 Review fixture/}).click();await expect(hosted.getByRole('region',{name:'Selected upstream request',exact:true})).toContainText('Description');
 await hosted.getByLabel('Comment',{exact:true}).fill('An explicitly intercepted fixture comment');await hosted.getByRole('button',{name:'Post comment',exact:true}).click();await expect(hosted).toContainText('Comment posted.');
 await hosted.getByRole('button',{name:'Approve',exact:true}).click();await expect(hosted).toContainText('Approval submitted.');
 await hosted.getByRole('button',{name:'New request',exact:true}).click();await hosted.getByLabel('Title',{exact:true}).fill('Fixture request');await hosted.getByLabel('Source branch',{exact:true}).fill('feature');await hosted.getByLabel('Target branch',{exact:true}).fill('main');
 await hosted.getByRole('button',{name:'Create request',exact:true}).click();await expect(hosted).toContainText('Request created.');
 await hosted.getByRole('button',{name:'Merge…',exact:true}).click();await hosted.getByRole('button',{name:'Merge request upstream',exact:true}).click();await expect(hosted).toContainText('Merged upstream.');
 await remote.getByRole('button',{name:'Issues',exact:true}).click();const issues=remote.getByRole('region',{name:'Upstream issues',exact:true});await issues.getByRole('button',{name:'New issue',exact:true}).click();await issues.getByLabel('Title',{exact:true}).fill('Fixture issue');await issues.getByLabel('Description',{exact:true}).fill('Fixture issue body');await issues.getByRole('button',{name:'Create issue',exact:true}).click();await expect(issues).toContainText('Issue created.');
 await remote.getByRole('button',{name:'Checks',exact:true}).click();await expect(remote.getByRole('region',{name:'Upstream checks',exact:true})).toContainText(provider==='gitlab'?'Pipeline #1':'CI');
 assert.ok(fixture.calls.some(call=>call.method==='POST'));await this.attach(await page.locator('[data-git-panel]').screenshot({path:join(this.artifactDirectory,`${provider}-remote-pane.png`)}),'image/png');
});
Then('the {string} clone browser finds creates and forks repositories with intercepted APIs',{timeout:120000},async function(provider){
 const page=this.page,fixture=await mockApi(this,provider);await settingsPage(page);await install(page,provider);await connect(page,provider,{host:fixture.host});
 const menu=await openNavigationMenu(page,'Repository');await menu.getByRole('menuitem',{name:'Clone repository',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Clone repository',exact:true});
 await dialog.getByLabel('Find upstream repositories',{exact:true}).fill('owner/repository');await dialog.getByRole('button',{name:'Browse',exact:true}).click();await dialog.getByRole('button',{name:/owner\/repository/}).click();await expect(dialog.getByLabel('HTTPS clone URL',{exact:true})).toHaveValue(`${fixture.host}/owner/repository.git`);
 await dialog.getByRole('button',{name:'Fork repository…',exact:true}).click();await dialog.getByLabel(provider==='bitbucket'?'Destination workspace':'Destination namespace (optional)',{exact:true}).fill('fixture-org');await dialog.getByRole('button',{name:'Create fork upstream',exact:true}).click();await expect(dialog).toContainText('Fork requested.');
 await dialog.locator('summary').filter({hasText:'Create a repository upstream'}).click();await dialog.getByLabel('New repository name',{exact:true}).fill('new-repository');await dialog.getByLabel(provider==='gitlab'?'Namespace ID (optional)':provider==='bitbucket'?'Workspace':'Organization (optional)',{exact:true}).fill(provider==='gitlab'?'42':'fixture-org');await dialog.getByRole('button',{name:'Create upstream repository',exact:true}).click();await expect(dialog).toContainText('Upstream repository created.');
 assert.ok(fixture.calls.some(call=>call.method==='POST'&&call.path.endsWith('/forks')||call.method==='POST'&&call.path.endsWith('/fork')));await this.attach(await dialog.screenshot({path:join(this.artifactDirectory,`${provider}-clone-browser.png`)}),'image/png');
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(dialog).toHaveCount(0);
});
After({tags:'@remote-ui'},async function(){if(this.gitTransport)await rm(this.gitTransport.root,{recursive:true,force:true});});
Then('browser cloning fetch and pull use only the local Git transport fixture',{timeout:120000},async function(){
 const page=this.page,fixture={root:await mkdtemp(join(tmpdir(),'code-browser-git-')),fs:{promises:{...fs.promises}}};this.gitTransport=fixture;await prepareGitFixture(fixture);
 await this.context.route('https://git.example.test/**',async route=>{
  const request=route.request();if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
  const response=await gitFixtureFetch(fixture,new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postDataBuffer()?{body:request.postDataBuffer()}: {})}));
  await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'access-control-allow-origin':'*','access-control-expose-headers':'*'},body:Buffer.from(await response.arrayBuffer())});
 });
 await page.setViewportSize({width:1440,height:980});await settingsPage(page);await install(page,'gitlab');await connect(page,'gitlab',{host:'https://git.example.test',token:'remote-fixture-token'});
 const menu=await openNavigationMenu(page,'Repository');await menu.getByRole('menuitem',{name:'Clone repository',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Clone repository',exact:true});await dialog.getByRole('button',{name:'URL',exact:true}).click();await dialog.getByLabel('HTTPS clone URL',{exact:true}).fill('https://git.example.test/owner/repository.git');await dialog.getByLabel('Repository name',{exact:true}).fill('Cloned fixture');await dialog.getByRole('button',{name:'Clone repository',exact:true}).click();await expect(dialog).toHaveCount(0);await saved(page);
 await expect(page.getByRole('button',{name:'Repository',exact:true})).toContainText('Cloned fixture');await expect(page.getByLabel('Code editor document',{exact:true})).toContainText('const value = 2;');
 await page.getByRole('button',{name:'Git operations',exact:true}).click();await page.locator('[data-git-panel]').getByRole('button',{name:'Remotes',exact:true}).click();const remote=page.getByRole('region',{name:'Remote Git',exact:true});await expect(remote).toContainText('origin/main');
 const incoming=await writeFixtureCommit(fixture.upstream,'const value = 3;',[fixture.second],true);await git.writeRef({...fixture.upstream,ref:'refs/heads/main',value:incoming,force:true});
 await remote.getByRole('button',{name:'Fetch branches and tags',exact:true}).click();await expect(remote).toContainText('1 behind');await expect(page.getByLabel('Code editor document',{exact:true})).toContainText('const value = 2;');
 await remote.getByRole('button',{name:'Pull into main',exact:true}).click();await expect(page.getByLabel('Code editor document',{exact:true})).toContainText('const value = 3;');await saved(page);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('Code editor document',{exact:true})).toContainText('const value = 2;');await saved(page);
 await remote.getByRole('button',{name:'Review push',exact:true}).click();await expect(remote.getByRole('button',{name:'Push now',exact:true})).toBeEnabled();assert.ok(fixture.remoteRequests.every(request=>!request.path.endsWith('/git-receive-pack')));
 await page.getByRole('separator',{name:'Resize Git pane',exact:true}).press('End');await saved(page);await this.attach(await page.locator('[data-git-panel]').screenshot({path:join(this.artifactDirectory,'remote-sync-wide.png')}),'image/png');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('[data-git-panel]')).toHaveAttribute('data-layout','overlay');await expect.poll(()=>page.locator('[data-git-panel]').evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(1);await this.attach(await page.screenshot({path:join(this.artifactDirectory,'remote-sync-mobile.png')}),'image/png');
});
