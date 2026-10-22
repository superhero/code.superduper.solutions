// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Given,When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const samples={
  node:{engine:'typescript',name:'TypeScript',label:'TypeScript / TSX',path:'server.ts',source:'import { readFile } from "node:fs/promises";\nconst cwd: string = process.cwd();\nconst buffer: Buffer = Buffer.from("hello");\nconst file: Promise<string> = readFile("file.txt", "utf8");\n',files:{'package.json':'{"name":"node-app","engines":{"node":">=22"}}'}},
  browserTypes:{engine:'typescript',name:'TypeScript',label:'TypeScript / TSX',path:'main.ts',source:'const value = process.pid;',files:{'package.json':'{"name":"browser-app","scripts":{"dev":"vite"}}'}},
  nodeTypesDisabled:{engine:'typescript',name:'TypeScript',label:'TypeScript / TSX',path:'main.ts',source:'const value = process.pid;',files:{'package.json':'{"engines":{"node":">=22"}}','tsconfig.json':'{"compilerOptions":{"types":[]}}'}},
  browserTypesDisabled:{engine:'typescript',name:'TypeScript',label:'TypeScript / TSX',path:'main.ts',source:'const value = document.title;',files:{'tsconfig.json':'{"compilerOptions":{"lib":["ES2022"],"types":[]}}'}},
  javascript:{engine:'typescript',name:'TypeScript',label:'JavaScript / JSX',path:'main.js',source:'function unrelated() { const implausibleSuggestion = 1; }\nconst item = { important: 42 };\nitem.imp',files:{}},
  liquid:{name:'Shopify Liquid',label:'Shopify Liquid',path:'example.liquid',source:'{{ "icon.png" | asset_url }}\n{{ "https://example.invalid/app.js" | script_tag }}\n{{ product.title | definitely_missing }}',files:{'snippets/card.liquid':'<article>Card</article>','assets/icon.png':Buffer.from([137,80,78,71,13,10,26,10])}},
  postgres:{name:'PostgreSQL',label:'PostgreSQL SQL',path:'query.sql',source:'SELECT FROM ;',files:{'postgres-schema.json':JSON.stringify({schemas:[{id:1,name:'public',owner:'postgres',allowed_creators:[],allowed_users:[],function_count:0,table_count:1,total_size:'0',view_count:0}],tables:[{id:1,name:'users',schema:'public',bytes:0,dead_rows_estimate:0,live_rows_estimate:0,replica_identity:'Default',rls_enabled:false,rls_forced:false,size:'0',table_kind:'Ordinary',comment:'Local users table'}]})}},
  toml:{name:'Taplo',label:'TOML',path:'config.toml',source:'answer = ?\n',files:{'schema.json':'{"type":"object","properties":{"answer":{"type":"number","description":"Local answer value"}}}'}},
  wgsl:{name:'WGSL',label:'WGSL',path:'shader.wgsl',source:'@compute @workgroup_size(1) fn main() { let x: f32 = nope; }'},
  dockerfile:{name:'Dockerfile',label:'Dockerfile / Containerfile',path:'Dockerfile',source:'FROM alpine\nINVALID something\n'},
  typescript:{name:'TypeScript',label:'TypeScript / TSX',path:'main.ts',source:'import { answer } from "./other";\nconst value: string = answer;\n',files:{'other.ts':'export const answer = 42;\n'}},
  html:{name:'HTML',label:'HTML',path:'main.html',source:'<div>Hello</div>'},
  css:{name:'CSS / SCSS / Less',label:'CSS',path:'main.css',source:'a { unknown-property: 2; }'},
  json:{name:'JSON / JSONC',label:'JSON',path:'main.json',source:'{"$schema":"./schema.json","answer":"wrong"}',files:{'schema.json':'{"type":"object","properties":{"answer":{"type":"number"}}}'}},
  yaml:{name:'YAML',label:'YAML',path:'main.yaml',source:'# yaml-language-server: $schema=./schema.json\nanswer: wrong\n',files:{'schema.json':'{"type":"object","properties":{"answer":{"type":"number"}}}'}},
  markdown:{name:'Markdown',label:'Markdown',path:'main.md',source:'[missing](missing.md)'},
  graphql:{name:'GraphQL',label:'GraphQL',path:'main.graphql',source:'query { missing }',files:{'schema.graphql':'type Query { greeting: String }'}},
};
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const preferences=page=>page.getByRole('region',{name:'Language engines',exact:true});
async function personal(page){await selectPage(page,'Settings');await selectDropdown(page,'Settings scope','global');}
async function openEditor(world){await selectPage(world.page,'Editor');await world.page.getByRole('treeitem',{name:world.languageSample.path,exact:true}).locator(':scope > .tree-row').click();await saved(world.page);}
async function histories(page){return (await repositoryHistories(page)).edits;}
Given('the {string} language intelligence repository is imported',async function(id){
  this.languageSample=samples[id];this.languageId=this.languageSample?.engine??id;assert.ok(this.languageSample);
  const directory=join(this.artifactDirectory,'language-repository');await mkdir(directory,{recursive:true});
  for(const [path,source]of Object.entries({[this.languageSample.path]:this.languageSample.source,...this.languageSample.files,...this.extraLanguageFiles})){await mkdir(join(directory,path,'..'),{recursive:true});await writeFile(join(directory,path),source);}
  await this.page.getByLabel('Import directory',{exact:true}).setInputFiles(directory);await saved(this.page);await openEditor(this);
  this.languageHistory=await histories(this.page);this.languageWorkerCount=this.page.workers().length;
});
When('I install and activate its language engine',async function(){
  await personal(this.page);
  await expect(this.page.getByRole('region',{name:'Type libraries',exact:true})).toHaveCount(0);
  await expect(preferences(this.page).getByRole('button',{name:`${this.languageSample.label} language engine`,exact:true})).toHaveAttribute('data-value',this.languageId);
  assert.equal(this.requests.filter(item=>item.url.includes('/languages/')).length,0);
  await selectDropdown(this.page,`${this.languageSample.label} language engine`,this.languageId);await saved(this.page);
  await preferences(this.page).getByRole('button',{name:`Install ${this.languageSample.name} language engine`,exact:true}).first().click();
  await expect(preferences(this.page).getByRole('button',{name:`Uninstall ${this.languageSample.name} language engine`,exact:true}).first()).toBeVisible();
  await expect(preferences(this.page).getByRole('button',{name:`${this.languageSample.label} language engine`,exact:true})).toHaveAttribute('data-value',this.languageId);
  await expect(preferences(this.page).getByRole('button',{name:`Install ${this.languageSample.name} language engine`,exact:true})).toHaveCount(0);
});
When('I activate its language engine',async function(){
  await personal(this.page);await selectDropdown(this.page,`${this.languageSample.label} language engine`,this.languageId);await saved(this.page);await openEditor(this);
});
Then('additional type libraries are offered without being downloaded or enabled',async function(){
  const panel=this.page.getByRole('region',{name:'Type libraries',exact:true});await expect(panel).toBeVisible();
  for(const name of ['Browser / DOM','Web Workers','Node.js','ScriptHost']){
    await expect(panel.getByRole('button',{name:`${name} types`,exact:true})).toHaveAttribute('data-value','disabled');
    await expect(panel.getByRole('button',{name:`Install ${name} types`,exact:true})).toBeVisible();
  }
  assert.equal(this.requests.filter(item=>item.url.includes('/types/')).length,0);
});
When('I install and enable the {string} type library',async function(name){
  await personal(this.page);const panel=this.page.getByRole('region',{name:'Type libraries',exact:true});
  await panel.getByRole('button',{name:`Install ${name} types`,exact:true}).click();
  await expect(panel.getByRole('button',{name:`Uninstall ${name} types`,exact:true})).toBeVisible();await saved(this.page);
  await expect(panel.getByRole('button',{name:`${name} types`,exact:true})).toHaveAttribute('data-value','enabled');
});
Then('type library repository overrides survive reload without changing personal defaults',async function(){
  const page=this.page,panel=page.getByRole('region',{name:'Type libraries',exact:true});
  await selectDropdown(page,'Settings scope','repository');
  await expect(panel.getByRole('button',{name:'Node.js types',exact:true})).toHaveAttribute('data-value','inherit');
  await selectDropdown(page,'Node.js types','disabled');await saved(page);await openEditor(this);
  const document=page.getByLabel('Code editor document',{exact:true});
  await document.click();await page.keyboard.press('Control+a');await page.keyboard.insertText('process.pid;');await saved(page);
  await expect(page.locator('.cm-lintRange-error').first()).toBeVisible();
  await personal(page);await expect(panel.getByRole('button',{name:'Node.js types',exact:true})).toHaveAttribute('data-value','enabled');
  await selectDropdown(page,'Settings scope','repository');
  await page.reload({waitUntil:'networkidle'});await saved(page);
  await selectDropdown(page,'Settings scope','repository');
  await expect(panel.getByRole('button',{name:'Node.js types',exact:true})).toHaveAttribute('data-value','disabled');
  await expect(panel.getByRole('button',{name:'Uninstall Node.js types',exact:true})).toBeVisible();
  assert.equal(this.requests.filter(item=>item.url.includes('/types/')).length,1);
  await selectDropdown(page,'Node.js types','inherit');await saved(page);
  await openEditor(this);
});
Then('the {string} type library supplies an offline completion',async function(name){
  const page=this.page,document=page.getByLabel('Code editor document',{exact:true});await page.context().setOffline(true);
  const [source,label]={'Browser / DOM':['document.que','querySelector'],'Web Workers':['self.importS','importScripts'],ScriptHost:['WScript.Ec','Echo']}[name];
  await document.click();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);await saved(page);
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:new RegExp('^'+label+'$')})).toBeVisible();
  await expect(page.locator('.intelligence-notice')).toHaveCount(0);
});
Then('a type library export can be reimported offline and rejects modified declarations',async function(){
  const page=this.page,panel=page.getByRole('region',{name:'Type libraries',exact:true});
  const downloadPromise=page.waitForEvent('download');await panel.getByRole('button',{name:'Export Browser / DOM types',exact:true}).click();
  const download=await downloadPromise,path=join(this.artifactDirectory,'browser.types.json');await mkdir(this.artifactDirectory,{recursive:true});await download.saveAs(path);
  const bytes=await (await import('node:fs/promises')).readFile(path),corrupted=Buffer.from(bytes);
  const payloadOffset=bytes.indexOf(Buffer.from(JSON.parse(bytes).payload))+20;corrupted[payloadOffset]=corrupted[payloadOffset]===65?66:65;
  await panel.getByRole('button',{name:'Uninstall Browser / DOM types',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Install Browser / DOM types',exact:true})).toBeVisible();await page.context().setOffline(true);
  const input=panel.getByLabel('Import type package file',{exact:true});
  await input.setInputFiles({name:'modified.types.json',mimeType:'application/json',buffer:corrupted});
  await expect(panel.getByRole('alert')).toContainText('checksum');
  await expect(panel.getByRole('button',{name:'Install Browser / DOM types',exact:true})).toBeVisible();
  await input.setInputFiles(path);await expect(panel.getByRole('button',{name:'Uninstall Browser / DOM types',exact:true})).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);await openEditor(this);
});
Then('the language engine provides its supported editor feedback',async function(){
  if(this.languageId==='html'){
    const line=this.page.locator('.cm-content .cm-line').first();
    const box=await line.boundingBox();assert.ok(box);
    await this.page.mouse.move(box.x+24,box.y+box.height/2);
    await expect(this.page.locator('.cm-language-hover')).toContainText(/div|element/i,{timeout:15_000});
    await this.page.mouse.move(1,1);
  }else {
    const range=this.page.locator('.cm-lintRange').first();await expect(range).toBeVisible({timeout:15_000});
    if(this.languageId==='typescript'){
      await range.hover();await expect(this.page.locator('.cm-tooltip-lint')).toContainText("Type 'number' is not assignable to type 'string'");await this.page.mouse.move(1,1);
    }
  }
  await expect(this.page.locator('.intelligence-notice')).toHaveCount(0);
  if(this.languageId==='liquid'){await expect(this.page.locator('.cm-content .cm-line').first().locator('.cm-lintRange')).toHaveCount(0);assert.ok(!this.requests.some(item=>item.url.includes('example.invalid')));}
});
Then('language analysis does not change repository histories',async function(){assert.deepEqual(await histories(this.page),this.languageHistory);});
When('I reload and use the installed language engine offline',async function(){
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);await this.page.context().setOffline(true);
  await this.page.getByLabel('Code editor document',{exact:true}).click();
});
When('I disable its language engine for this repository',async function(){
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','repository');await selectDropdown(this.page,`${this.languageSample.label} language engine`,'none');await saved(this.page);await openEditor(this);
});
Then('its language feedback clears without removing its installation',async function(){
  await expect(this.page.locator('.cm-lintRange')).toHaveCount(0);await expect(this.page.locator('.cm-language-hover')).toHaveCount(0);
  await this.page.context().setOffline(false);await personal(this.page);
  await expect(preferences(this.page).getByRole('button',{name:`Uninstall ${this.languageSample.name} language engine`,exact:true}).first()).toBeVisible();
});
Then('engine rows provide notices updates uninstall and reinstallation',async function(){
  await expect(this.page.getByRole('region',{name:'Language engine packages',exact:true})).toHaveCount(0);
  const notices=this.page.getByRole('region',{name:'Licenses and notices',exact:true});
  await notices.locator(':scope > details > summary').click();
  await expect(notices.getByRole('status')).toHaveCount(0);
  await expect(notices.locator('summary').filter({hasText:/^vscode-json-languageservice/})).toHaveCount(1);
  await this.page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('code-language-packages');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const transaction=db.transaction('packages','readwrite'),store=transaction.objectStore('packages'),request=store.get('json');
    request.onsuccess=()=>store.put({...request.result,version:'older',sha256:'previous-reviewed-digest'});
    await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});db.close();
  });
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await preferences(this.page).getByRole('button',{name:'Update JSON / JSONC language engine',exact:true}).first().click();
  await expect(preferences(this.page).getByRole('button',{name:'Update JSON / JSONC language engine',exact:true})).toHaveCount(0);
  await preferences(this.page).getByRole('button',{name:'Uninstall JSON / JSONC language engine',exact:true}).first().click();
  await expect(preferences(this.page).getByRole('button',{name:'Uninstall JSON / JSONC language engine',exact:true})).toHaveCount(0);
  await preferences(this.page).getByRole('button',{name:'Install JSON / JSONC language engine',exact:true}).first().click();
  await expect(preferences(this.page).getByRole('button',{name:'Uninstall JSON / JSONC language engine',exact:true}).first()).toBeVisible();
});
Then('TypeScript supplemental attribution is available in shared notices',async function(){
  const notices=this.page.getByRole('region',{name:'Licenses and notices',exact:true});
  await notices.locator(':scope > details > summary').click();
  const summary=notices.locator('summary').filter({hasText:/^TypeScript third-party notices/});
  await expect(summary).toHaveCount(1);await summary.click();
  await expect(summary.locator('..').locator('pre')).toContainText('W3C License');
  await expect(summary.locator('..').locator('pre')).toContainText('WHATWG');
});
Then('a TypeScript property completion is one undoable document edit',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('const result = Math.ma');
  await saved(this.page);const before=await histories(this.page);
  await this.page.keyboard.press('Control+Space');
  await this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^max$/}).click();
  await saved(this.page);await expect(document).toContainText('Math.max');
  assert.equal((await histories(this.page)).length,before.length+1);
  await this.page.keyboard.press('Control+z');await saved(this.page);
  await expect(document).toHaveText('const result = Math.ma');
});
Then('correcting the YAML value clears diagnostics and undo restores them',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('# yaml-language-server: $schema=./schema.json\nanswer: 42\n');
  await saved(this.page);await expect(this.page.locator('.cm-lintRange')).toHaveCount(0,{timeout:10_000});
  // Ensure analysis actually ran on the new text, rather than merely clearing decorations on input.
  await this.page.waitForTimeout(700);await expect(this.page.locator('.cm-lintRange')).toHaveCount(0);
  await this.page.keyboard.press('Control+z');await saved(this.page);
  await expect(this.page.locator('.cm-lintRange').first()).toBeVisible({timeout:10_000});
  await expect(this.page.locator('.intelligence-notice')).toHaveCount(0);
});
Then('Dockerfile completion is undoable and registry lookups stay offline',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('FROM alpine\nCO');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  await this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^COPY\b/}).click();
  await saved(this.page);await expect(document).toContainText('COPY');
  await this.page.keyboard.press('Control+z');await saved(this.page);await expect(document).toContainText('CO');await expect(document).not.toContainText('COPY');
  await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('FROM alpine:');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  await expect(this.page.locator('.intelligence-notice')).toHaveCount(0);
  assert.ok(!this.requests.some(item=>/docker\.io/.test(item.url)));
});

Then('its local schema supplies an offline undoable completion',async function(){
  await this.page.context().setOffline(true);
  const document=this.page.getByLabel('Code editor document',{exact:true});
  const source=this.languageId==='postgres'?'SELECT * FROM us':'#:schema ./schema.json\nans';
  const label=this.languageId==='postgres'?'users':'answer';
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText(source);await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  await this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:new RegExp('^'+label+'$')}).click();
  await saved(this.page);await expect(document).toContainText(label);
  await expect(this.page.locator('.intelligence-notice')).toHaveCount(0);
  await this.page.keyboard.press('Control+z');await saved(this.page);
  await expect(document.locator('.cm-line')).toHaveText(source.split('\n'));
  await this.page.context().setOffline(false);
});

Then('Liquid documentation and repository completions work offline with undo',async function(){
  await this.page.context().setOffline(true);
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('{{ prod');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  await this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^product$/}).click();
  await saved(this.page);await expect(document).toHaveText('{{ product');
  await this.page.keyboard.press('Control+z');await saved(this.page);await expect(document).toHaveText('{{ prod');
  await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('{{ product.title }}');await saved(this.page);
  const line=this.page.locator('.cm-content .cm-line').first(),box=await line.boundingBox();assert.ok(box);
  await this.page.mouse.move(box.x+48,box.y+box.height/2);
  await expect(this.page.locator('.cm-language-hover')).toContainText('product',{timeout:15_000});await this.page.mouse.move(1,1);
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText("{% render 'ca' %}");await saved(this.page);
  await this.page.keyboard.press('End');for(let step=0;step<4;step++)await this.page.keyboard.press('ArrowLeft');
  await this.page.keyboard.press('Control+Space');
  await this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^card$/}).click();
  await saved(this.page);await expect(document).toContainText('card');
  await expect(this.page.locator('.intelligence-notice')).toHaveCount(0);
  await this.page.context().setOffline(false);
});

Given('Liquid configuration extends a remote profile',function(){this.extraLanguageFiles={'.theme-check.yml':'extends: https://example.invalid/custom-checks.yml\n'};});
Then('Liquid rejects the remote profile without requesting it',async function(){
 await expect(this.page.locator('.intelligence-notice')).toContainText('Only bundled Theme Check profiles are supported.');
 assert.ok(!this.requests.some(item=>item.url.includes('example.invalid')));
});

Then('the installed engine checks plain JavaScript only when explicitly requested',async function(){
  const results=await this.page.evaluate(async()=>{
    const record=await new Promise((resolve,reject)=>{const request=indexedDB.open('code-language-packages');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,get=db.transaction('packages').objectStore('packages').get('typescript');get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};});
    const envelope=JSON.parse(new TextDecoder().decode(record.bytes));
    const bytes=Uint8Array.from(atob(envelope.payload),letter=>letter.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'})),worker=new Worker(url,{type:'module'});let next=0;
    const request=(files,path,language='javascript',method='diagnostics',position=0)=>new Promise((resolve,reject)=>{
      const id=++next,timer=setTimeout(()=>reject(new Error('Language engine request timed out')),15000);
      worker.onmessage=event=>{if(event.data.id!==id)return;clearTimeout(timer);if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);};
      worker.postMessage({id,request:{files,path,language,method,position}});
    });
    try{
      const plain={};
      for(const path of ['main.js','main.mjs','main.cjs','main.jsx'])plain[path]=await request({[path]:'function identity(value) { return value; }'},path,path.endsWith('.jsx')?'jsx':'javascript');
      const optIn=await request({'main.js':'// @ts-check\nfunction identity(value) { return value; }'},'main.js');
      const configured=await request({'main.js':'function identity(value) { return value; }','jsconfig.json':'{"compilerOptions":{"checkJs":true,"strict":true}}'},'main.js');
      const typescript=await request({'main.ts':'function identity(value) { return value; }'},'main.ts','typescript');
      const syntax=await request({'main.js':'function broken( {'},'main.js');
      const text='const item = {answer: 42}; item.';
      const completion=await request({'main.js':text},'main.js','javascript','completion',text.length);
      return{plain,optIn,configured,typescript,syntax,completion};
    }finally{worker.terminate();URL.revokeObjectURL(url);}
  });
  for(const result of Object.values(results.plain))assert.deepEqual(result.diagnostics,[]);
  for(const result of [results.optIn,results.configured,results.typescript])assert.ok(result.diagnostics.some(item=>item.message.includes("implicitly has an 'any' type")));
  assert.ok(results.syntax.diagnostics.length>0);
  assert.ok(results.completion.completions.some(item=>item.label==='answer'));
});

Then('delayed engine keyword completions appear once without native duplicates',async function(){
  await this.page.evaluate(()=>{
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(...args){if(args[0]?.request?.method==='completion')setTimeout(()=>original.apply(this,args),350);else original.apply(this,args);};
    window.keywordSnapshots=[];
    window.keywordObserver=new MutationObserver(()=>{
      const rows=[...document.querySelectorAll('.cm-tooltip-autocomplete li')].filter(row=>row.querySelector('.cm-completionLabel')?.textContent==='const');
      if(rows.length)window.keywordSnapshots.push(rows.map(row=>row.querySelector('.cm-completionDetail')?.textContent??''));
    });
    window.keywordObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
  });
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('con');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  const option=this.page.locator('.cm-tooltip-autocomplete li').filter({has:this.page.locator('.cm-completionLabel').filter({hasText:/^const$/})});
  await expect(option).toHaveCount(1);await expect(option.locator('.cm-completionDetail')).toHaveText('keyword');
  const snapshots=await this.page.evaluate(()=>{window.keywordObserver.disconnect();return window.keywordSnapshots;});
  assert.ok(snapshots.length>0);
  for(const details of snapshots)assert.deepEqual(details,['keyword']);
});

Then('native keyword completions work without downloading an engine',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();
  await this.page.keyboard.insertText('con');await saved(this.page);await this.page.keyboard.press('Control+Space');
  await expect(this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^const$/})).toHaveCount(1);
  assert.equal(this.requests.filter(item=>item.url.includes('/languages/')).length,0);
});

Then('arrow keys select completions immediately without moving the code cursor',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('con');await saved(this.page);
  await this.page.keyboard.press('Escape');
  await this.page.evaluate(()=>{
    window.immediateArrowResult=null;
    const observer=new MutationObserver(()=>{
      const options=[...document.querySelectorAll('.cm-tooltip-autocomplete li[role="option"]')];
      const selected=options.findIndex(option=>option.getAttribute('aria-selected')==='true');
      if(options.length<2||selected<0)return;
      observer.disconnect();
      const content=document.querySelector('.cm-content'),beforeSelection=window.getSelection();
      const before={anchor:beforeSelection.anchorNode,offset:beforeSelection.anchorOffset};
      content.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}));
      const after=options.findIndex(option=>option.getAttribute('aria-selected')==='true');
      content.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',code:'ArrowUp',bubbles:true,cancelable:true}));
      const restored=options.findIndex(option=>option.getAttribute('aria-selected')==='true'),selection=window.getSelection();
      window.immediateArrowResult={selected,after,restored,cursorUnchanged:before.anchor===selection.anchorNode&&before.offset===selection.anchorOffset};
    });
    observer.observe(document.body,{subtree:true,childList:true});
  });
  await this.page.keyboard.press('Control+Space');
  await expect.poll(()=>this.page.evaluate(()=>window.immediateArrowResult)).not.toBeNull();
  const result=await this.page.evaluate(()=>window.immediateArrowResult);
  assert.notEqual(result.after,result.selected);assert.equal(result.restored,result.selected);assert.equal(result.cursorUnchanged,true);
});

Then('completion arrows stay out of the document while results refresh',async function(){
  await this.page.evaluate(()=>{const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(...args){if(args[0]?.request?.method==='completion')setTimeout(()=>original.apply(this,args),650);else original.apply(this,args);};});
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('cons\nconst other = 1;');await saved(this.page);
  await this.page.keyboard.press('Control+Home');await this.page.keyboard.press('End');
  await this.page.keyboard.press('Control+Space');
  const popup=this.page.locator('.cm-tooltip-autocomplete');
  await expect(popup).toBeVisible();await expect(popup).not.toHaveClass(/disabled/);
  await this.page.keyboard.press('Backspace');
  await expect(popup).toHaveClass(/disabled/);
  const before=await document.evaluate(()=>({node:window.getSelection().anchorNode.textContent,offset:window.getSelection().anchorOffset}));
  await this.page.keyboard.press('ArrowDown');
  const after=await document.evaluate(()=>({node:window.getSelection().anchorNode.textContent,offset:window.getSelection().anchorOffset}));
  assert.deepEqual(after,before);
  await expect(popup).not.toHaveClass(/disabled/);
  const firstId=await popup.locator('li[role="option"]').first().getAttribute('id');
  await expect(popup.locator('li[aria-selected="true"]')).not.toHaveAttribute('id',firstId);
  await expect(document).toHaveText('conconst other = 1;');
});
Then('cached completions still replace the whole word after further typing',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await this.page.keyboard.press('Escape');await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('const value = Math.m');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  const max=this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^max$/});
  await expect(max).toBeVisible();
  await this.page.keyboard.insertText('a');
  await expect(this.page.locator('.cm-tooltip-autocomplete')).not.toHaveClass(/disabled/);
  await max.click();await saved(this.page);
  await expect(document).toHaveText('const value = Math.max()');
});

Then('saved edits do not reread unchanged files for autocomplete',async function(){
  await expect(this.page.locator('.cm-lintRange').first()).toBeVisible({timeout:15000});
  await this.page.evaluate(()=>{
    window.completionRepositoryReads=[];window.completionTimings=[];
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(...args){
      const data=args[0];if(data?.method==='read')window.completionRepositoryReads.push(data.args[1]);
      if(data?.request?.method==='completion'){
        const start=performance.now(),id=data.id,worker=this;
        const listener=event=>{if(event.data.id!==id)return;worker.removeEventListener('message',listener);window.completionTimings.push(performance.now()-start);};worker.addEventListener('message',listener);
      }
      return original.apply(this,args);
    };
  });
  const document=this.page.getByLabel('Code editor document',{exact:true});
  for(const prefix of ['ma','mi']){
    await this.page.keyboard.press('Escape');await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText(`const value = Math.${prefix}`);await saved(this.page);
    await this.page.keyboard.press('Control+Space');
    await expect(this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:new RegExp('^'+(prefix==='ma'?'max':'min')+'$')})).toBeVisible();
  }
  const measured=await this.page.evaluate(()=>({reads:window.completionRepositoryReads,timings:window.completionTimings}));
  assert.ok(!measured.reads.includes('other.ts'),'Unchanged dependency is not reloaded after each saved edit');
  assert.ok(measured.timings.length>0);await this.attach(JSON.stringify(measured),'application/json');
});

Then('JavaScript completion excludes unchecked identifier guesses',async function(){
  await this.page.evaluate(()=>{
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(...args){
      const data=args[0];
      if(data?.request?.method==='completion'){
        const worker=this,listener=event=>{if(event.data.id!==data.id)return;worker.removeEventListener('message',listener);window.unfilteredCompletion=event.data.result;};worker.addEventListener('message',listener);
      }
      return original.apply(this,args);
    };
  });
  await this.page.getByLabel('Code editor document',{exact:true}).click();await this.page.keyboard.press('Control+End');await this.page.keyboard.press('Control+Space');
  const popup=this.page.locator('.cm-tooltip-autocomplete');
  await expect(popup.locator('.cm-completionLabel').filter({hasText:/^important$/})).toBeVisible();
  await expect(popup.locator('.cm-completionLabel').filter({hasText:/^implausibleSuggestion$/})).toHaveCount(0);
  await expect(popup.locator('.cm-completionDetail').filter({hasText:/^warning$/})).toHaveCount(0);
  const raw=await this.page.evaluate(()=>window.unfilteredCompletion);
  assert.ok(raw.completions.some(item=>item.label==='implausibleSuggestion'&&item.detail==='warning'));
});

Then('Enter accepts the first completion while results refresh without inserting a newline',async function(){
  await this.page.evaluate(()=>{const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(...args){if(args[0]?.request?.method==='completion')setTimeout(()=>original.apply(this,args),650);else original.apply(this,args);};});
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('const value = Math.max');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  const popup=this.page.locator('.cm-tooltip-autocomplete');
  await expect(popup).toBeVisible();await expect(popup).not.toHaveClass(/disabled/);
  await this.page.keyboard.press('Backspace');
  await expect(popup).toHaveClass(/disabled/);
  await this.page.keyboard.press('Enter');
  await expect(document).toHaveText('const value = Math.ma');
  await expect(popup).toHaveCount(0);
  await expect(document).toHaveText('const value = Math.max()');await saved(this.page);
  // A ready first option accepts immediately as well.
  await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('const value = Math.ma');await saved(this.page);await this.page.keyboard.press('Control+Space');
  await expect(popup).toBeVisible();await expect(popup).not.toHaveClass(/disabled/);
  await this.page.keyboard.press('Enter');await expect(document).toHaveText('const value = Math.max()');
});

Then('method completions insert parentheses once and place the cursor inside',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  for(const existing of [false,true]){
    await document.click();await this.page.keyboard.press('Control+a');
    await this.page.keyboard.insertText(existing?'Math.ma()':'Math.ma');await saved(this.page);
    if(existing){await this.page.keyboard.press('ArrowLeft');await this.page.keyboard.press('ArrowLeft');}
    await this.page.keyboard.press('Control+Space');
    const popup=this.page.locator('.cm-tooltip-autocomplete');
    await expect(popup).toBeVisible();await expect(popup).not.toHaveClass(/disabled/);
    await this.page.keyboard.press('Enter');await expect(document).toHaveText('Math.max()');
    await this.page.keyboard.insertText('1, 2');await expect(document).toHaveText('Math.max(1, 2)');await saved(this.page);
  }
});

Then('if and if-else completions insert editable conditional blocks',async function(){
  await this.page.evaluate(()=>{
    window.conditionalEngineRequests=0;
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(...args){
      if(args[0]?.request?.method==='completion'){window.conditionalEngineRequests++;return;}
      return original.apply(this,args);
    };
  });
  const document=this.page.getByLabel('Code editor document',{exact:true});
  for(const label of ['if','if-else']){
    await this.page.evaluate(()=>{window.conditionalEngineRequests=0;});
    await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.type('if',{delay:50});await saved(this.page);
    await this.page.keyboard.press('Control+Space');
    const popup=this.page.locator('.cm-tooltip-autocomplete');
    for(const name of ['if','if-else'])await expect(popup.locator('.cm-completionLabel').filter({hasText:new RegExp('^'+name+'$')})).toHaveCount(1);
    assert.equal(await this.page.evaluate(()=>window.conditionalEngineRequests),0,'Conditional snippets do not wait for a language worker');
    await popup.locator('.cm-completionLabel').filter({hasText:new RegExp('^'+label+'$')}).click();await saved(this.page);
    await this.page.keyboard.insertText('ready');await this.page.keyboard.press('Tab');await this.page.keyboard.insertText('run();');
    if(label==='if-else'){await this.page.keyboard.press('Tab');await this.page.keyboard.insertText('stop();');}
    await saved(this.page);
    const text=await document.innerText();
    assert.match(text,/if \(ready\) \{\s*run\(\);/);
    if(label==='if-else')assert.match(text,/else \{\s*stop\(\);/);else assert.ok(!text.includes('else'));
  }
});

Then('fuzzy completion labels emphasize matches and strike only internal gaps',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('const fooBarResult = 1;\nfbr');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  const label=this.page.locator('.cm-completionLabel').filter({hasText:/^fooBarResult$/});
  await expect(label).toBeVisible();
  await expect(label.locator('.cm-completionMatchGap')).toHaveText(['oo','ar']);
  for(const match of await label.locator('.cm-completionMatchedText').all()){
    await expect(match).toHaveCSS('font-weight','700');await expect(match).toHaveCSS('text-decoration-line','none');
  }
  for(const gap of await label.locator('.cm-completionMatchGap').all())await expect(gap).toHaveCSS('text-decoration-line','line-through');
  assert.equal(await label.evaluate(element=>element.lastChild.textContent),'esult');
  await expect(label).toHaveCSS('text-decoration-line','none');
  await label.click();await expect(document).toContainText('fooBarResult');
});

Then('completion matching allows two skipped letters but excludes larger gaps',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');
  await this.page.keyboard.insertText('const fooBarResult = 1; const fooLongBarResult = 2; const fBarResult = 3;\nf');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  const labels=this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel');
  await expect(labels.filter({hasText:/^fooLongBarResult$/})).toBeVisible();
  await this.page.keyboard.insertText('br');
  await expect(labels.filter({hasText:/^fooBarResult$/})).toBeVisible();
  await expect(labels.filter({hasText:/^fBarResult$/})).toBeVisible();
  await expect(labels.filter({hasText:/^fooLongBarResult$/})).toHaveCount(0);
  const kept=labels.filter({hasText:/^fooBarResult$/});await kept.click();
  await expect(document).toContainText('fooBarResult');await saved(this.page);
});

Then('method hover presents structured readable documentation',async function(){
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('const text = "a";\ntext.split("\\n");');await saved(this.page);
  await this.page.keyboard.press('Escape');
  const point=await document.evaluate(element=>{
    const walker=window.document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){const index=node.textContent.indexOf('split');if(index<0)continue;
      const range=window.document.createRange();range.setStart(node,index);range.setEnd(node,index+5);
      const rect=range.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2};}
  });assert.ok(point);await this.page.mouse.move(point.x,point.y);
  const hover=this.page.locator('.cm-language-hover');
  await expect(hover.locator('.cm-hover-signature')).toContainText('String.split(');
  await expect(hover.locator('.cm-hover-metadata')).toContainText('method');
  await expect(hover.locator('.cm-hover-description')).toContainText('Split a string');
  await expect(hover.locator('.cm-hover-signature')).not.toContainText('(method)');
  await expect.poll(()=>hover.locator('.cm-hover-signature code').evaluate(element=>new Set([getComputedStyle(element).color,...[...element.querySelectorAll('span[class]')].map(span=>getComputedStyle(span).color)]).size)).toBeGreaterThan(1);
  const signature=await hover.locator('.cm-hover-signature code').evaluate(element=>({text:element.textContent,classes:[...element.querySelectorAll('span')].every(span=>span.className.length>0)}));
  assert.ok(signature.text.includes('separator: string'));assert.equal(signature.classes,true);
  const popup=this.page.locator('.cm-tooltip').filter({has:hover});
  await expect(popup).toHaveCSS('border-radius','4px');await expect(popup).toHaveCSS('border-top-width','2px');
});

Then('import meta hover formats inline code throughout its documentation',async function(){
  const page=this.page,document=page.getByLabel('Code editor document',{exact:true});
  await document.click();await page.keyboard.press('Control+a');
  await page.keyboard.insertText('console.log(import.meta.url); export {};');await saved(page);await page.keyboard.press('Escape');
  const point=await document.evaluate(element=>{
    const walker=window.document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){const index=node.textContent.indexOf('meta');if(index<0)continue;
      const range=window.document.createRange();range.setStart(node,index);range.setEnd(node,index+4);
      const rect=range.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2};}
  });assert.ok(point);await page.mouse.move(point.x,point.y);
  const hover=page.locator('.cm-language-hover'),description=hover.locator('.cm-hover-description');
  await expect(description).toContainText('The type of import.meta.');
  await expect(description.locator('p').first().locator('code')).toHaveText('import.meta');
  await expect(description.locator('p').nth(1).locator('code')).toHaveText('import.meta');
  await expect(description).not.toContainText('`');
  await expect(hover.locator('.cm-hover-signature')).toHaveCount(0);
});

Then('empty language hover replies stay hidden while useful replies remain visible',async function(){
  const page=this.page,document=page.getByLabel('Code editor document',{exact:true});
  const typescript=this.languageId==='typescript';
  await document.click();await page.keyboard.press('Control+a');
  await page.keyboard.insertText(typescript?'const value = 42;\nvalue;':'<div>Hello</div>');await saved(page);await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    window.hoverReply='';window.hoverRequests=0;window.emptyHoverFrames=0;
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(...args){
      const data=args[0];if(data?.request?.method!=='hover')return original.apply(this,args);
      window.hoverRequests++;
      const position=data.request.position,source=data.request.files[data.request.path];
      queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:{id:data.id,result:{hover:{
        from:Math.max(0,position-2),to:Math.min(source.length,position+2),text:window.hoverReply,
      }}}})));
    };
    window.emptyHoverObserver=new MutationObserver(()=>{
      for(const tooltip of window.document.querySelectorAll('.cm-tooltip-hover'))
        if(tooltip.querySelector('.cm-language-hover')&&!tooltip.textContent.trim())window.emptyHoverFrames++;
    });
    window.emptyHoverObserver.observe(window.document.body,{subtree:true,childList:true,characterData:true});
  });
  const point=await document.evaluate((element,needle)=>{
    const walker=window.document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){const index=node.textContent.indexOf(needle);if(index<0)continue;
      const range=window.document.createRange();range.setStart(node,index);range.setEnd(node,index+needle.length);
      const rect=range.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2};}
  },typescript?'value':'div');assert.ok(point);
  const hover=page.locator('.cm-tooltip-hover');
  const replies=['',' \n\t ',typescript?'(method)':'[reference]: https://example.invalid'];
  replies.push(typescript?'(const) value: 42\nUseful hover documentation.':'Useful **hover** documentation.','\n');
  for(const text of replies){
    await page.mouse.move(1,1);await expect(hover).toHaveCount(0);
    const requests=await page.evaluate(text=>{window.hoverReply=text;return window.hoverRequests;},text);
    await page.mouse.move(point.x,point.y);
    await expect.poll(()=>page.evaluate(()=>window.hoverRequests)).toBeGreaterThan(requests);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(text.includes('Useful'))await expect(hover).toContainText('Useful hover documentation.');
    else await expect(hover).toHaveCount(0);
  }
  const empty=await page.evaluate(()=>{window.emptyHoverObserver.disconnect();return window.emptyHoverFrames;});
  assert.equal(empty,0,'Empty service replies never create a framed popup');
});

Then('Node declarations provide offline globals and built-in modules',async function(){
  await this.page.context().setOffline(true);
  await this.page.evaluate(()=>{
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(...args){
      const data=args[0];if(data?.request?.method==='diagnostics'){
        const worker=this,listener=event=>{if(event.data.id!==data.id)return;worker.removeEventListener('message',listener);window.nodeDiagnostics=event.data;};worker.addEventListener('message',listener);
      }
      return original.apply(this,args);
    };
  });
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+End');await this.page.keyboard.insertText('process.cw');await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  const cwd=this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^cwd$/});
  await expect(cwd).toBeVisible();await cwd.click();await saved(this.page);
  await expect.poll(()=>this.page.evaluate(()=>window.nodeDiagnostics?.result?.diagnostics)).toEqual([]);
  await expect(document).toContainText('process.cwd()');
});
Then('Node globals remain unavailable in this browser or explicitly restricted repository',async function(){
  await expect(this.page.locator('.cm-lintRange-error').first()).toBeVisible({timeout:15000});
  await this.page.locator('.cm-lintRange-error').first().hover();
  await expect(this.page.locator('.cm-tooltip-lint')).toContainText("Cannot find name 'process'");
});

Then('explicit compiler libraries keep DOM globals unavailable',async function(){
  await expect(this.page.locator('.cm-lintRange-error').first()).toBeVisible({timeout:15000});
  await this.page.locator('.cm-lintRange-error').first().hover();
  await expect(this.page.locator('.cm-tooltip-lint')).toContainText("Cannot find name 'document'");
});

Then('long Node hover documentation is formatted and scrolls inside its frame',async function(){
  await this.page.setViewportSize({width:1000,height:550});
  const document=this.page.getByLabel('Code editor document',{exact:true});
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('Buffer.byteLength("hello");');await saved(this.page);await this.page.keyboard.press('Escape');
  const point=await document.evaluate(element=>{
    const walker=window.document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){const index=node.textContent.indexOf('byteLength');if(index<0)continue;
      const range=window.document.createRange();range.setStart(node,index);range.setEnd(node,index+10);
      const rect=range.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2};}
  });assert.ok(point);await this.page.mouse.move(point.x,point.y);
  const hover=this.page.locator('.cm-language-hover');await expect(hover.locator('.cm-hover-signature')).toContainText('byteLength(');
  const description=hover.locator('.cm-hover-description');
  await expect(description.locator('pre code').first()).toBeVisible();
  await expect.poll(()=>description.locator('pre code span[class]').count()).toBeGreaterThan(0);
  await expect(description.locator('a').first()).toHaveAttribute('href',/^https:\/\//);
  assert.ok(!(await description.innerText()).includes('```'));
  const popup=this.page.locator('.cm-tooltip-hover').filter({has:hover});
  await expect(popup).toHaveCSS('overflow-y','auto');
  const geometry=await popup.evaluate(element=>{const rect=element.getBoundingClientRect();return{top:rect.top,bottom:rect.bottom,height:rect.height,client:element.clientHeight,scroll:element.scrollHeight};});
  assert.ok(geometry.top>=0&&geometry.bottom<=550);assert.ok(geometry.scroll>geometry.client);
  await popup.evaluate(element=>{element.scrollTop=element.scrollHeight;});
  assert.ok(await popup.evaluate(element=>element.scrollTop)>0);
});
