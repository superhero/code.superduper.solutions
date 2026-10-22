// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {engines,engineFor,intelligenceLanguage,normalizeEngineChoices} from './catalog.ts';
import {DEFAULT_SETTINGS,normalizeSettings,resolveSettings} from '../editor/settings.ts';
import {normalizeTypeLibraryChoices} from './type-libraries.ts';
Then('language engines require a compatible explicit selection',()=>{
  assert.equal(intelligenceLanguage("query.graphql","auto","text"),"graphql");
  assert.equal(intelligenceLanguage("query.graphql","text","text"),"text");
  assert.equal(intelligenceLanguage("config.jsonc","auto","json"),"jsonc");
  for(const path of ['Dockerfile','src/Containerfile','Dockerfile.dev','CONTAINERFILE']) assert.equal(intelligenceLanguage(path,'auto','text'),'dockerfile');
  assert.equal(intelligenceLanguage('Dockerfile','text','text'),'text');
  for(const [path,language]of [['query.SQL','sql'],['shader.wgsl','wgsl']])assert.equal(intelligenceLanguage(path,'auto','text'),language);
  assert.equal(intelligenceLanguage('sections/product.LIQUID','auto','text'),'liquid');
  assert.equal(intelligenceLanguage('product.liquid','text','text'),'text');
  assert.equal(engines.length,12);assert.ok(!engines.some(engine=>engine.id==='python'));
  assert.deepEqual(normalizeSettings(null).global.languageEngines,DEFAULT_SETTINGS.languageEngines);
  for(const engine of engines)for(const language of engine.languages){assert.equal(engineFor(language,{}),undefined);assert.equal(engineFor(language,{[language]:engine.id}),engine.id);assert.equal(engineFor(language,{[language]:'none'}),undefined);}
  for(const value of [null,undefined,[],false,'typescript'])assert.deepEqual(normalizeEngineChoices(value),{});
  assert.deepEqual(normalizeEngineChoices(JSON.parse('{"typescript":"typescript","css":"none","json":"css","unknown":"html","__proto__":"html"}')),{typescript:'typescript',css:'none'});
});
Then('language engine preferences merge by language and preserve explicit disabling',()=>{
  const settings=normalizeSettings({version:1,global:{languageEngines:{typescript:'typescript',css:'css'}},repositories:{r:{languageEngines:{typescript:'none',json:'json'}}},files:{r:{'main.ts':{languageEngines:{typescript:'typescript'}}}}});
  assert.deepEqual(resolveSettings(settings,'r','main.ts').languageEngines,{...DEFAULT_SETTINGS.languageEngines,typescript:'none',css:'css',json:'json'});
  assert.deepEqual(resolveSettings(settings,'other').languageEngines,{...DEFAULT_SETTINGS.languageEngines,typescript:'typescript',css:'css'});
  assert.deepEqual(settings.files.r['main.ts'],{});
});
Then('type library settings default off and merge without leaking into file overrides',()=>{
  assert.deepEqual(DEFAULT_SETTINGS.typeLibraries,{});
  for(const value of [null,undefined,[],true,'node'])assert.deepEqual(normalizeTypeLibraryChoices(value),{});
  assert.deepEqual(normalizeTypeLibraryChoices(JSON.parse('{"node":true,"browser":false,"webworker":"true","unknown":true,"__proto__":true}')),{node:true,browser:false});
  const inherited=Object.create({node:true});inherited.browser=true;
  assert.deepEqual(normalizeTypeLibraryChoices(inherited),{browser:true});
  const store=normalizeSettings({version:1,global:{typeLibraries:{node:true,browser:false}},repositories:{r:{typeLibraries:{node:false,webworker:true}}},files:{r:{'main.ts':{typeLibraries:{node:true}}}}});
  assert.deepEqual(resolveSettings(store,'r','main.ts').typeLibraries,{node:false,browser:false,webworker:true});
  assert.deepEqual(resolveSettings(store,'other').typeLibraries,{node:true,browser:false});
  assert.deepEqual(store.files.r['main.ts'],{});
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(store))),store);
  assert.notEqual(store.global.typeLibraries,DEFAULT_SETTINGS.typeLibraries);
});
