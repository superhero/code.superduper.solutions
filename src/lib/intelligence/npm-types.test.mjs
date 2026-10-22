// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {buildNpmTypeArtifact,searchNpmTypes,declarationFiles,validateDeclarationPaths} from './npm-types.ts';
import {normalizeSettings,resolveSettings} from '../editor/settings.ts';
import {npmTypeName,isNpmPackageName,normalizeTypeLibraryChoices} from './type-libraries.ts';
import {npmFixture,registryFixture,tarFixture} from '../../../tests/fixtures/npm-type-packages.mjs';
const signal=()=>new AbortController().signal;
Then('npm type search filters results and identifies included declarations',async()=>{
  const svelte=npmFixture('svelte',{'index.d.ts':'export const version: string;'});
  const rows=[{name:'@types/cookie',version:'1.0.0'},{name:'other-runtime',version:'1.0.0'},{name:'@types/vue',version:'2.0.0',deprecated:'Stub'}];
  const requests=[],base=registryFixture([svelte],rows),fetcher=async(...args)=>{requests.push(args);return base(...args);};
  assert.deepEqual(await searchNpmTypes('',signal(),fetcher),[]);assert.equal(requests.length,0);
  const result=await searchNpmTypes('svelte',signal(),fetcher);
  assert.deepEqual(result.map(item=>[item.name,item.included]),[['@types/cookie',false],['svelte',true]]);
  assert.ok(requests.every(([,options])=>options.credentials==='omit'&&options.redirect==='error'));
  assert.ok(String(requests[0][0]).includes('%40types%2Fsvelte'));
});
Then('npm type installation verifies archives and retains declarations and notices only',async()=>{
  const helper=npmFixture('typed-helper',{'index.d.ts':'export interface Router { get(path: string): void; }'},{version:'1.2.0'});
  const peer=npmFixture('@types/peer',{'index.d.ts':'declare const peer: string;'});
  const root=npmFixture('@types/example',{'index.d.ts':'export function Router(): import("typed-helper").Router;'},{dependencies:{'typed-helper':'^1.0.0'},peers:{'@types/peer':'*'}});
  const artifact=await buildNpmTypeArtifact('@types/example',signal(),()=>{},registryFixture([root,helper,peer]));
  const envelope=JSON.parse(new TextDecoder().decode(artifact.bytes)),files=JSON.parse(Buffer.from(envelope.payload,'base64'));
  assert.equal(artifact.item.id,'npm:@types/example');assert.equal(artifact.item.version,'1.0.0');assert.equal(envelope.kind,'data');
  assert.ok(files['/repository/node_modules/@types/example/index.d.ts']);
  assert.ok(files['/repository/node_modules/@types/example/node_modules/typed-helper/index.d.ts']);
  assert.ok(files['/repository/node_modules/@types/example/node_modules/@types/peer/index.d.ts']);
  assert.ok(Object.keys(files).every(path=>path.endsWith('.d.ts')||path.endsWith('/package.json')));
  assert.ok(!JSON.stringify(files).includes('Runtime code must never'));
  assert.deepEqual(envelope.npm.lock.map(item=>item.name),['@types/example','typed-helper','@types/peer']);
  assert.equal(envelope.notices.length,3);assert.ok(envelope.notices.every(notice=>notice.text.includes('Permission is hereby granted')));
  validateDeclarationPaths(files,'@types/example');
  assert.throws(()=>validateDeclarationPaths({'/lib/lib.esnext.d.ts':'declare const bad: string;'},'@types/example'),/path/);
});
Then('npm types fetch only dependencies used by declarations',async()=>{
  const helper=npmFixture('typed-helper',{'index.d.ts':'export interface Value { ready: boolean; }'});
  const root=npmFixture('@types/example',{'index.d.ts':'/** Example: import "unused-runtime"; */\nexport type Value = import("typed-helper").Value;'},{dependencies:{'typed-helper':'^1.0.0','unused-runtime':'*'}});
  const requests=[],base=registryFixture([root,helper]);
  const result=await buildNpmTypeArtifact('@types/example',signal(),()=>{},async(input,options)=>{requests.push(String(input));return base(input,options);});
  assert.ok(!requests.some(url=>url.includes('unused-runtime')));
  const envelope=JSON.parse(new TextDecoder().decode(result.bytes));assert.deepEqual(envelope.npm.lock.map(item=>item.name),['@types/example','typed-helper']);
});
Then('npm type notice supplements match only their reviewed package identity',async()=>{
  const fixture=npmFixture('typed-helper',{'index.d.ts':'export const value: string;'}, {license:false});
  const supplement={name:'typed-helper',version:'1.0.0',license:'MIT',integrity:fixture.metadata.dist.integrity,text:'Reviewed fixture notice'};
  const fetcher=registryFixture([fixture]);
  const result=await buildNpmTypeArtifact('typed-helper',signal(),()=>{},fetcher,[supplement]);
  const envelope=JSON.parse(new TextDecoder().decode(result.bytes));assert.equal(envelope.notices[0].text,supplement.text);
  for(const mismatch of [{name:'other'},{version:'2.0.0'},{license:'ISC'},{integrity:'sha512-other'},{text:' '}]){
    await assert.rejects(buildNpmTypeArtifact('typed-helper',signal(),()=>{},fetcher,[{...supplement,...mismatch}]),/license or notice/);
  }
  const changed=npmFixture('typed-helper',{'index.d.ts':'export {};'}, {license:false,archiveManifest:{...fixture.manifest,license:'ISC'}});
  await assert.rejects(buildNpmTypeArtifact('typed-helper',signal(),()=>{},registryFixture([changed]),[{...supplement,integrity:changed.metadata.dist.integrity}]),/license or notice/);
});
Then('npm type installation rejects {string}',async failure=>{
  const fixture=npmFixture('@types/example',failure==='unsafe path'?{'../escaped.d.ts':'export {};'}:{'index.d.ts':'export const value: string;'});
  let expected=/./,fetcher=registryFixture([fixture]);
  if(failure==='corrupt integrity'){fixture.archive[20]^=1;expected=/integrity/;}
  else if(failure==='external tarball'){fixture.metadata.dist.tarball='https://example.invalid/archive.tgz';expected=/Only public npm/;}
  else if(failure==='unsafe path')expected=/unsafe path/;
  else if(failure==='truncated archive'){assert.throws(()=>declarationFiles(tarFixture({'package/file.d.ts':'export {};'}).subarray(0,700)),/truncated/);return;}
  else if(failure==='deprecated stub'){fixture.metadata.deprecated='This library includes its own types.';expected=/deprecated/;}
  else if(failure==='no declarations'){const empty=npmFixture('@types/example',{});fetcher=registryFixture([empty]);expected=/no supported type/;}
  else if(failure==='missing license'){fetcher=registryFixture([npmFixture('@types/example',{'index.d.ts':'export {};'}, {license:false})]);expected=/license/;}
  else if(failure==='inconsistent name'){const original=fetcher;fetcher=async(input,options)=>decodeURIComponent(new URL(input).pathname)==='/@types/example/latest'?new Response(JSON.stringify({...fixture.metadata,name:'@types/different'})):original(input,options);expected=/compatible npm/;}
  else if(failure==='archive identity'){fetcher=registryFixture([npmFixture('@types/example',{'index.d.ts':'export {};'}, {archiveManifest:{name:'@types/different',version:'1.0.0'}})]);expected=/archive identity/;}
  await assert.rejects(buildNpmTypeArtifact('@types/example',signal(),()=>{},fetcher),expected);
});
Then('npm type installation respects cancellation',async()=>{
  const controller=new AbortController();controller.abort(new Error('Cancelled'));
  await assert.rejects(buildNpmTypeArtifact('@types/example',controller.signal,()=>{},()=>{throw new Error('No network expected');}),/Cancelled/);
});
Then('npm type preferences validate names and inherit explicitly',()=>{
  for(const name of ['@types/react','svelte','@angular/core','typed-helper'])assert.equal(isNpmPackageName(name),true);
  for(const name of ['../react','@types/../../bad','UPPER','https://example.com','__proto__','@types/','@a/b/c'])assert.equal(isNpmPackageName(name),false);
  assert.equal(npmTypeName('npm:@types/react'),'@types/react');assert.equal(npmTypeName('npm:../bad'),undefined);
  assert.deepEqual(normalizeTypeLibraryChoices({'npm:@types/react':true,'npm:svelte':false,'npm:__proto__':true}),{'npm:@types/react':true,'npm:svelte':false});
  const settings=normalizeSettings({global:{typeLibraries:{'npm:@types/react':true}},repositories:{r:{typeLibraries:{'npm:@types/react':false}}}});
  assert.equal(resolveSettings(settings,'r').typeLibraries['npm:@types/react'],false);assert.equal(resolveSettings(settings,'other').typeLibraries['npm:@types/react'],true);
});
