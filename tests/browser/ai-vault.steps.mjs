// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { selectDropdown, selectPage, pageSelector } from './navigation.helpers.mjs';
const password='synthetic-vault-password', key='sk-fixture-only-NOT-A-REAL-API-KEY-490710';
const vault=page=>page.getByRole('region',{name:'Vault',exact:true});
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const prompt=page=>page.getByRole('textbox',{name:'Message AI',exact:true});
async function openVault(page){if(await pageSelector(page).getAttribute('data-value')!=='vault')await selectPage(page,'Vault');await expect(vault(page)).toBeVisible();}
async function create(world){
  const page=world.page;
  await page.addInitScript(()=>{
    window.vaultReplies=[];
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>window.vaultReplies.push(event.data));}};
    const nativeFetch=window.fetch;
    window.fetch=(url,options)=>{if(String(url).startsWith('https://api.openai.com/'))throw new Error('OpenAI request originated on the main thread');return nativeFetch(url,options);};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.vaultClipboard=value;}}});
  });
  await page.reload();await saved(page);await openVault(page);
  await page.getByLabel('Vault password',{exact:true}).fill(password);
  await page.getByLabel('Confirm vault password',{exact:true}).fill(password);
  await button(page,'Create vault').click();
  const recovery=vault(page).getByLabel('Recovery key',{exact:true});await expect(recovery).not.toBeEmpty();
  world.recovery=await recovery.innerText();
  await page.getByRole('checkbox',{name:'I will keep my recovery key safe',exact:true}).check();
  const [download]=await Promise.all([page.waitForEvent('download'),button(page,'Download recovery key and continue').click()]);
  expect(download.suggestedFilename()).toBe('code-vault-recovery-key.txt');
  await expect(page.getByRole('textbox',{name:'Vault key name',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Vault key name',exact:true}).fill('OpenAI fixture key');
  await page.getByLabel('Secret value',{exact:true}).fill(key);await button(page,'Save value').click();
  await expect(vault(page).getByText('Value saved.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Secret value',{exact:true})).toHaveValue('');
}
async function profile(world){
  const page=world.page;await selectPage(page,'Editor');await button(page,'AI chat').click();await button(page,'AI connections').click();
  await button(page,'New connection').click();
  await page.getByRole('textbox',{name:'Connection name',exact:true}).fill('OpenAI fixture');
  await selectDropdown(page,'Connection provider','openai');
  await selectDropdown(page,'Saved vault key',{label:'OpenAI fixture key'});
  await button(page,'Save connection').click();
  await expect(button(page,'AI connection')).toContainText('OpenAI fixture');
}
async function snapshot(page){return page.evaluate(async()=>{
  const existing=new Set((await indexedDB.databases()).map(database=>database.name));
  const read=async(name,store)=>{
    if(!existing.has(name))return[];
    return new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onerror=()=>reject(new Error('fixture storage unavailable'));request.onsuccess=()=>{const db=request.result;
      try{const tx=db.transaction(store),get=tx.objectStore(store).getAll();get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(new Error('fixture storage read failed'));tx.oncomplete=()=>db.close();tx.onabort=()=>{db.close();reject(new Error('fixture storage transaction aborted'));};}
      catch{db.close();reject(new Error('fixture storage schema unavailable'));}
    };});
  };
  return{vault:await read('code-secrets-vault','vault'),connections:await read('code-ai-connections','connections')};
});}
async function apiFixture(world){
  world.aiRequests=[];world.aiReply='A worker-owned reply. ';world.aiEcho=false;
  await world.context.route('https://api.openai.com/v1/**',async route=>{
    const request=route.request();const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    expect(request.headers().authorization).toBe(`Bearer ${key}`);world.aiRequests.push({url:request.url(),method:request.method(),body:request.postDataJSON()});
    if(request.url().endsWith('/models'))return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({data:[{id:'gpt-5.4-mini'},{id:'text-embedding-3-small'}]})});
    const body=request.postDataJSON();expect(body.store).toBe(false);expect(body.tools).toBeUndefined();
    const events=world.aiEcho?[{type:'response.output_text.delta',delta:'Safe text '+key.slice(0,10)},{type:'response.output_text.delta',delta:key.slice(10)}]:Array.from({length:64},()=>({type:'response.output_text.delta',delta:world.aiReply}));
    events.push({type:'response.completed',response:{status:'completed',output:[{type:'message'}],usage:{output_tokens:64}}});
    return route.fulfill({headers,contentType:'text/event-stream',body:events.map(event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')});
  });
}
Then('the header opens the shared vault independently of AI and clears drafts on navigation',async function(){
  const page=this.page;
  await button(page,'AI chat').click();
  await expect(button(page,'AI vault')).toHaveCount(0);await expect(button(page,'Unlock AI vault')).toHaveCount(0);
  await openVault(page);await expect(pageSelector(page)).toHaveAttribute('data-value','vault');
  await expect(button(page,'Close AI')).toHaveCount(0);await expect(button(page,'Undo')).toHaveCount(0);
  await page.getByLabel('Vault password',{exact:true}).fill('synthetic-unsaved-draft');
  await selectPage(page,'Editor');await expect(vault(page)).toHaveCount(0);
  await openVault(page);await expect(page.getByLabel('Vault password',{exact:true})).toHaveValue('');
  await saved(page);await page.reload();await saved(page);
  await expect(pageSelector(page)).toHaveAttribute('data-value','vault');await expect(vault(page)).toBeVisible();
  await page.setViewportSize({width:600,height:800});await expect(vault(page)).toBeVisible();
  await expect(page.getByRole('dialog',{name:'AI',exact:true})).toHaveCount(0);
  await mkdir(this.artifactDirectory,{recursive:true});await page.screenshot({path:`${this.artifactDirectory}/global-vault.png`});
});
Then('the AI vault and saved OpenAI connection preserve ciphertext across reload',{timeout:90000},async function(){
  const page=this.page;await create(this);await profile(this);
  const state=await snapshot(page),encoded=JSON.stringify(state);expect(encoded).not.toContain(key);expect(encoded).not.toContain(password);expect(encoded).not.toContain(this.recovery);
  expect(state.connections[0].credentialId).toBeTruthy();expect(state.connections[0].provider).toBe('openai');
  await page.reload();await saved(page);
  await expect(button(page,'AI chat')).toHaveAttribute('aria-expanded','true');
  await selectDropdown(page,'AI connection',{label:'OpenAI fixture'});
  await expect(button(page,'AI connection')).toContainText('OpenAI fixture');
  await button(page,'Connect').click();await expect(page.getByRole('alert')).toContainText('Unlock');
  await openVault(page);await expect(vault(page).getByText('OpenAI fixture key',{exact:true})).toBeVisible();await expect(button(page,'Copy OpenAI fixture key')).toBeDisabled();
  await page.getByLabel('Vault password or recovery key',{exact:true}).fill('wrong-fixture-password');await button(page,'Unlock vault').click();await expect(vault(page).getByRole('alert')).toContainText('could not be unlocked');
  await page.getByLabel('Vault password or recovery key',{exact:true}).fill(password);await button(page,'Unlock vault').click();await expect(button(page,'Copy OpenAI fixture key')).toBeEnabled();
  await button(page,'Copy OpenAI fixture key').click();expect(await page.evaluate(()=>window.vaultClipboard)).toBe(key);
  const [download]=await Promise.all([page.waitForEvent('download'),button(page,'Export encrypted vault').click()]);expect(download.suggestedFilename()).toBe('code-vault.encrypted.json');
  await mkdir(this.artifactDirectory,{recursive:true});await page.screenshot({path:`${this.artifactDirectory}/vault-wide.png`});
  await page.setViewportSize({width:600,height:800});await expect(vault(page)).toBeVisible();await page.screenshot({path:`${this.artifactDirectory}/vault-compact.png`});
});
Then('OpenAI chat uses the secret worker and redacts credential echoes',{timeout:90000},async function(){
  const page=this.page;await create(this);await profile(this);await apiFixture(this);
  await page.evaluate(()=>window.vaultReplies=[]);await button(page,'Connect').click();await expect(button(page,'AI model')).toContainText('gpt-5.4-mini');
  await prompt(page).fill('fixture question');await prompt(page).press('Enter');
  const conversation=page.getByRole('region',{name:'AI conversation',exact:true});await expect(conversation).toContainText(this.aiReply.repeat(64).trim());
  await expect(button(page,'Stop')).toHaveCount(0);expect(await page.evaluate(()=>JSON.stringify(window.vaultReplies))).not.toContain(key);
  expect(await page.evaluate(()=>window.vaultReplies.filter(reply=>'delta' in reply).length)).toBeLessThan(16);
  expect(await page.locator('body').innerText()).not.toContain(key);expect(this.aiRequests).toHaveLength(2);
  this.aiEcho=true;await prompt(page).fill('echo fixture');await prompt(page).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Sensitive response data was removed');expect(await conversation.innerText()).not.toContain(key);
  expect(await page.evaluate(()=>JSON.stringify(window.vaultReplies))).not.toContain(key);
  await mkdir(this.artifactDirectory,{recursive:true});await writeFile(`${this.artifactDirectory}/worker-privacy.json`,JSON.stringify({workerOnlyDispatch:true,replyCount:(await page.evaluate(()=>window.vaultReplies.length)),knownEchoBlocked:true,syntheticCredentialsOnly:true},null,2));
});
Then('locking the AI vault invalidates another tab without affecting local chat',{timeout:90000},async function(){
  const page=this.page;await create(this);
  const companion=await this.context.newPage();this.observePage(companion);await companion.goto(this.baseURL);await saved(companion);await openVault(companion);
  await companion.getByLabel('Vault password or recovery key',{exact:true}).fill(password);await button(companion,'Unlock vault').click();await expect(button(companion,'Copy OpenAI fixture key')).toBeEnabled();
  await button(page,'Lock vault').click();await expect(button(companion,'Copy OpenAI fixture key')).toBeDisabled();await expect(button(companion,'Unlock vault')).toBeVisible();
  await selectPage(page,'Editor');await button(page,'AI chat').click();await page.getByRole('tab',{name:'Session 1',exact:true}).click();await expect(button(page,'AI connection')).toBeEnabled();await expect(button(page,'Connect')).toBeEnabled();
  await companion.close();
});
Then('the AI vault supports a native virtual PRF passkey',{timeout:90000},async function(){
  // Use localhost for loopback and the real secure origin for published checks.
  const page=this.page,localURL=this.baseURL.replace('127.0.0.1','localhost');
  await this.context.route(`${localURL}/**`,route=>route.continue());await page.goto(localURL);this.baseURL=localURL;
  const cdp=await this.context.newCDPSession(page);await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',ctap2Version:'ctap2_1',transport:'usb',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,hasPrf:true,hasHmacSecret:true}});
  try{await create(this);await vault(page).locator('summary').filter({hasText:'Unlock methods'}).click();
    await vault(page).locator('input[name="authenticate"]').fill(password);await button(page,'Add passkey').click();
    await expect(vault(page).getByText('Passkey',{exact:true})).toBeVisible();await button(page,'Lock vault').click();
    await button(page,'Unlock with passkey').click();await expect(button(page,'Copy OpenAI fixture key')).toBeEnabled();
    const credentials=await cdp.send('WebAuthn.getCredentials',{authenticatorId});expect(credentials.credentials).toHaveLength(1);expect(credentials.credentials[0].rpId).toBe(new URL(localURL).hostname);
  }finally{await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});await cdp.detach();}
});
Then('AI vault management preserves guarded values through password rotation and restore',{timeout:120000},async function(){
  const page=this.page;await create(this);const replacement='sk-fixture-only-REPLACED-490710',nextPassword='next-synthetic-password';
  await button(page,'Edit OpenAI fixture key').click();await expect(page.getByLabel('Secret value',{exact:true})).toHaveValue('');
  await page.getByLabel('Secret value',{exact:true}).fill(replacement);await button(page,'Save value').click();await expect(vault(page).getByText('Value saved.',{exact:true})).toBeVisible();
  await page.getByLabel('Vault key name',{exact:true}).fill('Temporary fixture');await page.getByLabel('Secret value',{exact:true}).fill('temporary-fixture');await button(page,'Save value').click();
  await expect(button(page,'Delete Temporary fixture')).toBeVisible();await button(page,'Delete Temporary fixture').click();await button(page,'Delete value').click();await expect(button(page,'Delete Temporary fixture')).toHaveCount(0);
  const [download]=await Promise.all([page.waitForEvent('download'),button(page,'Export encrypted vault').click()]);const backup=await readFile(await download.path());expect(backup.toString()).not.toContain(replacement);
  await vault(page).locator('summary').filter({hasText:'Unlock methods'}).click();
  await vault(page).locator('input[name="authenticate"]').fill(password);await vault(page).locator('input[name="new-password"]').fill(nextPassword);await vault(page).locator('input[name="new-password-confirm"]').fill(nextPassword);
  await button(page,'Change password').click();await expect(vault(page).getByText('Password changed.',{exact:true})).toBeVisible();
  await button(page,'Lock vault').click();await page.getByLabel('Vault password or recovery key',{exact:true}).fill(nextPassword);await button(page,'Unlock vault').click();await expect(button(page,'Copy OpenAI fixture key')).toBeEnabled();
  await button(page,'Copy OpenAI fixture key').click();expect(await page.evaluate(()=>window.vaultClipboard)).toBe(replacement);
  await vault(page).locator('summary').filter({hasText:'Rotate encryption key'}).click();await vault(page).locator('input[name^="rotate-"]').fill(nextPassword);await button(page,'Rotate vault encryption key').click();
  const recovery=vault(page).getByLabel('Recovery key',{exact:true});await expect(recovery).not.toBeEmpty();expect(await recovery.innerText()).not.toBe(this.recovery);
  await page.getByRole('checkbox',{name:'I will keep my recovery key safe',exact:true}).check();await Promise.all([page.waitForEvent('download'),button(page,'Download recovery key and continue').click()]);
  await expect(page.getByLabel('Vault key name',{exact:true})).toBeVisible();
  await page.getByLabel('Import encrypted vault',{exact:true}).setInputFiles({name:'fixture.encrypted.json',mimeType:'application/json',buffer:backup});
  await page.getByLabel('Imported vault password or recovery key',{exact:true}).fill(password);await page.getByLabel('Current vault password or recovery key',{exact:true}).fill(nextPassword);
  await button(page,'Import and unlock vault').click();await expect(vault(page).getByText('Encrypted vault imported.',{exact:true})).toBeVisible();
  await button(page,'Lock vault').click();await page.getByLabel('Vault password or recovery key',{exact:true}).fill(password);await button(page,'Unlock vault').click();
  await expect(button(page,'Copy OpenAI fixture key')).toBeEnabled();await button(page,'Copy OpenAI fixture key').click();expect(await page.evaluate(()=>window.vaultClipboard)).toBe(replacement);
  expect(JSON.stringify(await snapshot(page))).not.toContain(replacement);
});
Then('AI vault idle locking starts from current activity and survives reload',{timeout:90000},async function(){
  const page=this.page;await create(this);
  await page.evaluate(()=>{const native=Date.now;Date.now=()=>native()+3600000;});
  await page.getByRole('checkbox',{name:'Lock after inactivity',exact:true}).check();
  await expect(button(page,'Copy OpenAI fixture key')).toBeEnabled();
  const preferences=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('code-vault-preferences');request.onerror=()=>reject(new Error('fixture preferences unavailable'));request.onsuccess=()=>{const db=request.result,tx=db.transaction('values'),read=tx.objectStore('values').get('idle');read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();};}));
  await expect.poll(async()=>Boolean((await preferences())?.idleLockEnabled)).toBe(true);
  await page.reload();await saved(page);await openVault(page);
  await page.getByLabel('Vault password or recovery key',{exact:true}).fill(password);await button(page,'Unlock vault').click();
  await expect(page.getByRole('checkbox',{name:'Lock after inactivity',exact:true})).toBeChecked();await expect(button(page,'Copy OpenAI fixture key')).toBeEnabled();
});
