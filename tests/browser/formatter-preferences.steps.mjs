// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Given,When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
import {installFormatterPackage} from './formatter.helpers.mjs';
import {formats} from '../../src/lib/formatting/formats.ts';
const providers=JSON.parse(await readFile('src/lib/formatting/providers.json','utf8'));
const preferences=page=>page.getByRole('region',{name:'Formatters',exact:true});
const documentText=page=>page.getByLabel('Code editor document',{exact:true}).locator('.cm-line').allTextContents().then(lines=>lines.join('\n'));
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
async function personal(page) {await selectPage(page,'Settings');await selectDropdown(page,'Settings scope','global');}
async function choose(page,label,id){await preferences(page).getByLabel('Find a formatter preference',{exact:true}).fill(label);await selectDropdown(page,`${label} formatter`,id);await saved(page);}
async function install(page,provider){await installFormatterPackage(page,provider.id);}

async function history(page,label){return page.getByRole('list',{name:label,exact:true,includeHidden:true}).locator('[data-oid]').evaluateAll(elements=>elements.map(e=>e.dataset.oid));}
async function importSample(world,path,source){
 const directory=join(world.artifactDirectory,'provider-repository');await mkdir(directory,{recursive:true});await writeFile(join(directory,path),source);
 await world.page.getByLabel('Import directory',{exact:true}).setInputFiles(directory);await saved(world.page);await selectPage(world.page,'Editor');
 await world.page.getByRole('treeitem',{name:path,exact:true}).locator(':scope > .tree-row').click();
 await expect.poll(()=>documentText(world.page)).toBe(source);await saved(world.page);
 world.providerSource=source;world.recordedHistories={edits:await history(world.page,'Staged changes'),commits:await history(world.page,'Commit history')};
}
Given('the optional {string} provider sample is imported and selected',async function(id){
 const provider=providers.find(p=>p.id===id),format=formats.find(f=>f.providers.includes(id));assert.ok(provider&&format);
 await personal(this.page);await choose(this.page,format.label,id);
 // Selecting a provider before installation must not install it implicitly.
 assert.equal(this.requests.filter(item=>item.url.includes('/formatters/')).length,0);
 await install(this.page,provider);await importSample(this,`sample.${format.extension}`,id==='dockerfile-service'?'FROM alpine\nRUN echo one \\\n echo two\n':format.sample);
 this.providerId=id;
});
Then('the selected provider produced one formatting change',async function(){
 await saved(this.page);assert.notEqual(await documentText(this.page),this.providerSource);
 await expect(this.page.getByRole('alert')).toHaveCount(0);
 assert.equal((await history(this.page,'Staged changes')).length,this.recordedHistories.edits.length+1);
 const downloads=this.requests.filter(item=>item.url.includes('/formatters/'));
 assert.equal(downloads.length,1);assert.ok(downloads[0].url.includes(this.providerId+'-'));
});
When('I select {string} as the personal formatter for {string}',async function(id,label){await personal(this.page);await choose(this.page,label,id);});
When('I select {string} as the repository formatter for {string}',async function(id,label){await selectDropdown(this.page,'Settings scope','repository');await choose(this.page,label,id);});
When('I inspect repository formatter preferences',async function(){await selectDropdown(this.page,'Settings scope','repository');});
When('I compare installed Typst formatters',async function(){
 await preferences(this.page).getByRole('button',{name:'Compare Typst formatters',exact:true}).click();
 await expect(preferences(this.page).locator('[data-format="typst"] .measurement')).toHaveCount(2,{timeout:30_000});
});
Then('both Typst timings are visible without changing the selection',async function(){
 await preferences(this.page).getByLabel('Find a formatter preference',{exact:true}).fill('Typst');
 await expect(this.page.getByRole('button',{name:'Typst formatter',exact:true})).toHaveAttribute('data-value','dprint-typstyle-apcamargo');
 const timing=preferences(this.page).locator('[data-format="typst"] .measurement');await expect(timing).toHaveCount(2);await expect(timing.first()).toContainText(/first use [\d.]+ ms · subsequent [\d.]+ ms/);
 await expect(this.page.getByRole('alert')).toHaveCount(0);
});
When('I reload the formatter preferences',async function(){await saved(this.page);await this.page.reload({waitUntil:'networkidle'});await saved(this.page);await selectDropdown(this.page,'Settings scope','global');});
Then('the YAML formatter selection is {string}',async function(value){await preferences(this.page).getByLabel('Find a formatter preference',{exact:true}).fill('YAML');await expect(this.page.getByRole('button',{name:'YAML formatter',exact:true})).toHaveAttribute('data-value',value);});
When('I undo the formatter preference change',async function(){await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);});
When('I redo the formatter preference change',async function(){await this.page.getByRole('button',{name:'Redo',exact:true}).click();await saved(this.page);});
Given('the Markdown YAML fence fixture uses Pretty YAML',async function(){
 await personal(this.page);await choose(this.page,'YAML','dprint-pretty-yaml');
 await install(this.page,providers.find(p=>p.id==='dprint-markdown'));await install(this.page,providers.find(p=>p.id==='dprint-pretty-yaml'));
 await importSample(this,'sample.md','# Heading\n\n```yaml\nanswer:    42\n```\n');
});
Then('the Markdown YAML fence was formatted without installing Prettier',async function(){
 await expect.poll(()=>documentText(this.page)).toBe('# Heading\n\n```yaml\nanswer: 42\n```\n');
 assert.ok(!this.requests.some(item=>item.url.includes('/formatters/prettier-')));
 assert.equal((await history(this.page,'Staged changes')).length,this.recordedHistories.edits.length+1);
});

Then('the Typst formatter selection is {string}',async function(value){await preferences(this.page).getByLabel('Find a formatter preference',{exact:true}).fill('Typst');await expect(this.page.getByRole('button',{name:'Typst formatter',exact:true})).toHaveAttribute('data-value',value);});
