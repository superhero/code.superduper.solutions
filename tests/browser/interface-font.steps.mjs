// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const editorFont=page=>page.locator('.cm-scroller').evaluate(element=>getComputedStyle(element).fontFamily);
Then('interface font changes preserve the editor font across reload and undo',async function(){
  const original=await editorFont(this.page);
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await selectDropdown(this.page,'Interface font','serif');await saved(this.page);
  await expect(this.page.locator('body')).toHaveCSS('font-family',/ui-serif/);
  assert.equal(await editorFont(this.page),original);
  const cached=await this.page.evaluate(()=>JSON.parse(localStorage.getItem('code.appearance.v1')));
  assert.equal(cached.interfaceFont,'serif');
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await expect(this.page.locator('body')).toHaveCSS('font-family',/ui-serif/);
  assert.equal(await editorFont(this.page),original);
  await selectDropdown(this.page,'Settings scope','repository');
  await selectDropdown(this.page,'Interface font','system');await saved(this.page);
  await expect(this.page.locator('html')).toHaveAttribute('data-interface-font','system');
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);
  await expect(this.page.locator('html')).toHaveAttribute('data-interface-font','serif');
  assert.equal(await editorFont(this.page),original);
  await selectDropdown(this.page,'Editor font','courier');await saved(this.page);
  await expect(this.page.locator('.cm-scroller')).toHaveCSS('font-family',/Courier New/);
  await expect(this.page.locator('body')).toHaveCSS('font-family',/ui-serif/);
});

Then('interface size presets persist independently of editor text and support undo',async function(){
  const editorSize=await this.page.locator('.cm-editor').evaluate(element=>getComputedStyle(element).fontSize);
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  const label=this.page.locator('#setting-interfaceSize-label');
  const size=()=>label.evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
  const medium=await size();
  const symbol=this.page.locator('.settings-card .card-heading .material-symbols-rounded').first();
  const fileIcon=this.page.getByRole('tree',{name:'Repository files',exact:true}).locator('.devicon[data-file-icon="javascript-plain"]');
  const iconSize=locator=>locator.evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
  const mediumSymbol=await iconSize(symbol),mediumFile=await iconSize(fileIcon);

  const aligned=async()=>{const tops=await this.page.locator('#setting-interfaceFont, #setting-fontFamily').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));assert.ok(Math.abs(tops[0]-tops[1])<1,'Interface and editor font selectors align');};
  await aligned();
  await this.page.getByRole('radiogroup',{name:'Interface size',exact:true}).getByRole('radio',{name:'Small',exact:true}).check();await saved(this.page);
  assert.ok(await size()<medium);
  assert.ok(await iconSize(symbol)<mediumSymbol);
  assert.ok(await iconSize(fileIcon)<mediumFile);
  await aligned();
  await this.page.getByRole('radiogroup',{name:'Interface size',exact:true}).getByRole('radio',{name:'Large',exact:true}).check();await saved(this.page);
  assert.ok(await size()>medium);
  assert.ok(await iconSize(symbol)>mediumSymbol);
  assert.ok(await iconSize(fileIcon)>mediumFile);
  await aligned();
  await expect(this.page.locator('.cm-editor')).toHaveCSS('font-size',editorSize);
  const cache=await this.page.evaluate(()=>JSON.parse(localStorage.getItem('code.appearance.v1')));
  assert.equal(cache.interfaceSize,'large');
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await expect(this.page.locator('html')).toHaveAttribute('data-interface-size','large');
  assert.ok(await size()>medium);
  assert.ok(await iconSize(symbol)>mediumSymbol);
  assert.ok(await iconSize(fileIcon)>mediumFile);
  await aligned();
  await expect(this.page.locator('.cm-editor')).toHaveCSS('font-size',editorSize);
  await selectDropdown(this.page,'Settings scope','repository');
  await this.page.getByRole('radiogroup',{name:'Interface size',exact:true}).getByRole('radio',{name:'Small',exact:true}).check();await saved(this.page);
  await expect(this.page.locator('html')).toHaveAttribute('data-interface-size','small');
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);
  await expect(this.page.locator('html')).toHaveAttribute('data-interface-size','large');
  await expect(this.page.locator('.cm-editor')).toHaveCSS('font-size',editorSize);
});

Then('file explorer icons can be hidden persistently and restored by repository settings',async function(){
  const tree=this.page.getByRole('tree',{name:'Repository files',exact:true});
  const icons=tree.locator('.tree-row > .material-symbols-rounded, .tree-row > .devicon');
  const folder=tree.getByRole('treeitem',{name:'src',exact:true});
  await expect(icons.first()).toBeVisible();
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await this.page.getByRole('switch',{name:'File explorer icons',exact:true}).uncheck();await saved(this.page);
  await expect(icons).toHaveCount(1);
  await expect(icons).toHaveText(/expand_more|chevron_right/);
  if(await folder.getAttribute('aria-expanded')==='true') await folder.locator(':scope > .tree-row').click();
  await expect(icons).toHaveText('chevron_right');
  await folder.locator(':scope > .tree-row').click();await saved(this.page);
  await expect(icons).toHaveText('expand_more');
  await expect(tree.getByRole('treeitem',{name:'src/notes.js',exact:true})).toBeVisible();
  await expect(icons).toHaveCount(1);
  await expect(icons).toHaveText(/expand_more|chevron_right/);
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await expect(icons).toHaveCount(1);
  await expect(icons).toHaveText(/expand_more|chevron_right/);
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await expect(this.page.getByRole('switch',{name:'File explorer icons',exact:true})).not.toBeChecked();
  await selectDropdown(this.page,'Settings scope','repository');
  await this.page.getByRole('switch',{name:'File explorer icons',exact:true}).check();await saved(this.page);
  await expect(icons).toHaveCount(2);
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);
  await expect(icons).toHaveCount(1);
  await expect(icons).toHaveText(/expand_more|chevron_right/);
});

Then('middle-click tab closing supports undo and a persisted disabled setting',async function(){
  const tab=this.page.getByRole('button',{name:'Switch to notes.js',exact:true});
  await tab.click({button:'middle'});await saved(this.page);
  await expect(tab).toHaveCount(0);
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);
  await expect(tab).toBeVisible();
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  const toggle=this.page.getByRole('switch',{name:'Middle-click closes tabs',exact:true});
  await expect(toggle).toBeChecked();await toggle.uncheck();await saved(this.page);
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await expect(toggle).not.toBeChecked();
  await selectPage(this.page,'Editor');
  await tab.click({button:'middle'});await expect(tab).toBeVisible();
});

Then('Google editor fonts load only on selection and installed fonts survive offline reload',async function(){
  const {readFile} = await import('node:fs/promises');
  const fontBytes=await readFile('src/assets/fonts/montserrat-latin.woff2');
  let cssRequests=0,fontRequests=0,licenseRequests=0;
  const css="@font-face {font-family: 'Fira Code';font-style: normal;font-weight: 400;src: url(https://fonts.gstatic.com/test-editor-font.woff2) format('woff2');unicode-range: U+0000-00FF;}";
  await this.context.route('https://fonts.googleapis.com/**',route=>{cssRequests++;return route.fulfill({contentType:'text/css',headers:{'access-control-allow-origin':'*'},body:css});});
  await this.context.route('https://fonts.gstatic.com/**',route=>{fontRequests++;return route.fulfill({contentType:'font/woff2',headers:{'access-control-allow-origin':'*'},body:fontBytes});});
  await this.context.route('https://raw.githubusercontent.com/google/fonts/**',route=>{licenseRequests++;return route.fulfill({contentType:'text/plain',headers:{'access-control-allow-origin':'*'},body:'Test fixture license retained with the font.'});});
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  assert.equal(cssRequests,0);
  await selectDropdown(this.page,'Editor font','google:Fira Code');await saved(this.page);
  await expect.poll(()=>cssRequests).toBeGreaterThan(0);
  await expect.poll(()=>fontRequests).toBeGreaterThan(0);
  await expect(this.page.locator('.cm-scroller')).toHaveCSS('font-family',/Fira Code/);
  assert.ok(!await editorFont(this.page).then(font=>font.includes('Montserrat')));
  await this.page.getByRole('button',{name:'Install editor font for offline use',exact:true}).click();
  await expect(this.page.getByRole('button',{name:'Install editor font for offline use',exact:true})).toHaveText('Installed');
  assert.equal(licenseRequests,1);
  const stored=await this.page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('code.editor-fonts.v1');request.onsuccess=()=>{const db=request.result,tx=db.transaction('fonts'),record=tx.objectStore('fonts').get('google:Fira Code');record.onsuccess=()=>{resolve({license:record.result.license,count:record.result.faces.length});db.close();};record.onerror=()=>reject(record.error);};request.onerror=()=>reject(request.error);}));
  assert.equal(stored.license,'Test fixture license retained with the font.');assert.ok(stored.count>0);
  const before={cssRequests,fontRequests,licenseRequests};
  const html=await readFile('dist/index.html','utf8');
  await this.context.route(this.baseURL+'/',route=>route.fulfill({contentType:'text/html',body:html}));
  await this.context.setOffline(true);
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await expect(this.page.locator('.cm-scroller')).toHaveCSS('font-family',/Fira Code/);
  await expect(this.page.getByRole('button',{name:'Install editor font for offline use',exact:true})).toHaveText('Installed');
  await expect.poll(()=>this.page.evaluate(()=>document.fonts.check('14px "Fira Code"'))).toBe(true);
  assert.deepEqual({cssRequests,fontRequests,licenseRequests},before);
  await this.context.setOffline(false);
});

Then('editor font options lazily preview their own typefaces without changing the selection',async function(){
  const {readFile}=await import('node:fs/promises');
  const fontBytes=await readFile('src/assets/fonts/montserrat-latin.woff2');
  const previews=[];
  await this.context.route('https://fonts.googleapis.com/**',route=>{
    const url=new URL(route.request().url());previews.push(url);
    const family=url.searchParams.get('family').split(':')[0];
    return route.fulfill({contentType:'text/css',headers:{'access-control-allow-origin':'*'},body:`@font-face {font-family: '${family}';font-weight: 100 900;src: url(https://fonts.gstatic.com/preview.woff2);}`});
  });
  await this.context.route('https://fonts.gstatic.com/**',route=>route.fulfill({contentType:'font/woff2',headers:{'access-control-allow-origin':'*'},body:fontBytes}));
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  assert.equal(previews.length,0);
  await this.page.getByRole('button',{name:'Editor font',exact:true}).click();
  const option=this.page.getByRole('menuitemradio',{name:'Anonymous Pro',exact:true});
  await option.scrollIntoViewIfNeeded();
  await expect(option.locator('.menu-choice > span')).toHaveCSS('font-family',/Anonymous Pro/);
  await expect.poll(()=>previews.length).toBeGreaterThan(0);
  assert.ok(previews.length<51,'Only visible fonts are previewed');
  assert.ok(previews.every(url=>url.searchParams.has('text')),'Previews request only label characters');
  await expect.poll(()=>this.page.evaluate(()=>Array.from(document.fonts).some(face=>face.family.includes('Code preview Anonymous Pro')&&face.status==='loaded'))).toBe(true);
  await this.page.keyboard.press('Escape');
  await expect(this.page.locator('[data-font-preview]')).toHaveCount(0);
  await expect(this.page.getByRole('button',{name:'Editor font',exact:true})).toHaveAttribute('data-value','google:JetBrains Mono');
  await expect(this.page.locator('.cm-scroller')).not.toHaveCSS('font-family',/Anonymous Pro/);
});

Then('JetBrains Mono starts at thirteen pixels and stays installed on offline reload',async function(){
  const check=async()=>{
    await expect(this.page.locator('.cm-editor')).toHaveCSS('font-size','13px');
    await expect(this.page.locator('body')).toHaveCSS('font-family',/Geomini/);
    await expect(this.page.getByRole('button',{name:'Interface font',exact:true})).toHaveAttribute('data-value','google:Geomini');
    await expect(this.page.getByRole('button',{name:'Install interface font for offline use',exact:true})).toHaveText('Installed');
    await this.page.evaluate(()=>document.fonts.load('700 16px Geomini'));
    assert.ok(await this.page.evaluate(()=>Array.from(document.fonts).some(face=>face.family.includes('Geomini')&&face.status==='loaded')));
    await expect(this.page.locator('.cm-scroller')).toHaveCSS('font-family',/JetBrains Mono/);
    await this.page.evaluate(async()=>{for(const style of ['normal 400','italic 400','normal 700','italic 700'])await document.fonts.load(`${style} 13px "JetBrains Mono"`);});
    assert.equal(await this.page.evaluate(()=>Array.from(document.fonts).filter(face=>face.family.includes('JetBrains Mono')&&face.status==='loaded').length),4);
    await expect(this.page.getByRole('button',{name:'Editor font',exact:true})).toHaveAttribute('data-value','google:JetBrains Mono');
    await expect(this.page.getByRole('button',{name:'Install editor font for offline use',exact:true})).toHaveText('Installed');
  };
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await check();
  const {readFile}=await import('node:fs/promises');const html=await readFile('dist/index.html','utf8');
  assert.ok(html.includes('src/assets/fonts/JetBrainsMono-OFL.txt'),'Distribution retains font license');
  assert.ok(html.includes('src/assets/fonts/Geomini-OFL.txt'),'Distribution retains Geomini license');
  await this.context.route(this.baseURL+'/',route=>route.fulfill({contentType:'text/html',body:html}));
  await this.context.setOffline(true);await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await check();
  assert.ok(!this.requests.some(request=>request.url.startsWith('https://fonts.')),'Bundled default makes no Google requests');
  await this.context.setOffline(false);
});

Then('interface Google fonts preview install and restore offline independently of the editor',async function(){
  const {readFile}=await import('node:fs/promises');const fontBytes=await readFile('src/assets/fonts/montserrat-latin.woff2');
  let requests=0;
  await this.context.route('https://fonts.googleapis.com/**',route=>{
    requests++;const family=new URL(route.request().url()).searchParams.get('family').split(':')[0];
    return route.fulfill({contentType:'text/css',headers:{'access-control-allow-origin':'*'},body:`@font-face {font-family:'${family}';font-weight:100 900;src:url(https://fonts.gstatic.com/interface-test.woff2);}`});
  });
  await this.context.route('https://fonts.gstatic.com/**',route=>route.fulfill({contentType:'font/woff2',headers:{'access-control-allow-origin':'*'},body:fontBytes}));
  await this.context.route('https://raw.githubusercontent.com/google/fonts/**',route=>route.fulfill({contentType:'text/plain',headers:{'access-control-allow-origin':'*'},body:'Test interface font license.'}));
  const originalEditor=await editorFont(this.page);
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await this.page.getByRole('button',{name:'Interface font',exact:true}).click();
  await this.page.getByRole('textbox',{name:'Search interface font',exact:true}).fill('Roboto');
  const option=this.page.getByRole('menuitemradio',{name:'Roboto',exact:true});await option.scrollIntoViewIfNeeded();
  await expect(option.locator('.menu-choice > span')).toHaveCSS('font-family',/Code preview Roboto/);
  await option.click();await saved(this.page);
  await expect(this.page.locator('body')).toHaveCSS('font-family',/Roboto/);
  assert.equal(await editorFont(this.page),originalEditor);
  await this.page.getByRole('button',{name:'Install interface font for offline use',exact:true}).click();
  await expect(this.page.getByRole('button',{name:'Install interface font for offline use',exact:true})).toHaveText('Installed');
  const before=requests;
  const html=await readFile('dist/index.html','utf8');await this.context.route(this.baseURL+'/',route=>route.fulfill({contentType:'text/html',body:html}));
  await this.context.setOffline(true);await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await expect(this.page.locator('body')).toHaveCSS('font-family',/Roboto/);
  await expect(this.page.getByRole('button',{name:'Interface font',exact:true})).toHaveAttribute('data-value','google:Roboto');
  await expect(this.page.getByRole('button',{name:'Install interface font for offline use',exact:true})).toHaveText('Installed');
  assert.equal(await editorFont(this.page),originalEditor);assert.equal(requests,before);
  await this.context.setOffline(false);
});
