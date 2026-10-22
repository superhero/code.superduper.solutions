// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {formats, normalizeFormatterChoices, recommendedProvider, selectedProvider} from './formats.ts';
import {formatterFor,formatIdFor} from './routing.ts';
import {DEFAULT_SETTINGS,normalizeSettings,resolveSettings} from '../editor/settings.ts';
Then('formatter selections reject incompatible unknown and unsafe entries',()=>{
  for(const invalid of [null,undefined,[],false,'yaml']) assert.deepEqual(normalizeFormatterChoices(invalid),{});
  assert.deepEqual(normalizeFormatterChoices(JSON.parse('{"yaml":"dprint-pretty-yaml","css":"none","json":"dprint-malva","unrecognized":"dprint-sh","__proto__":"polluted"}')),
    {yaml:'dprint-pretty-yaml',css:'none'});
  assert.deepEqual(normalizeFormatterChoices({yaml:42}),{});
});
Then('repository formatter overrides merge by language and can disable formatting',()=>{
  const settings=normalizeSettings({version:1,global:{formatters:{yaml:'dprint-pretty-yaml',css:'dprint-malva'}},repositories:{r:{formatters:{yaml:'prettier-yaml',sql:'none'}}},files:{r:{'main.yaml':{formatters:{yaml:'none'}}}}});
  assert.deepEqual(resolveSettings(settings,'r','main.yaml').formatters,{...DEFAULT_SETTINGS.formatters,yaml:'prettier-yaml',css:'dprint-malva',sql:'none'});
  assert.deepEqual(settings.files.r['main.yaml'],{});
  assert.equal(formatterFor('main.sql','auto',resolveSettings(settings,'r').formatters),undefined);
  assert.equal(formatterFor('main.yaml','auto',resolveSettings(settings,'other').formatters).plugin,'pretty-yaml');
  assert.deepEqual(normalizeSettings(null).global.formatters,DEFAULT_SETTINGS.formatters);
});
Then('recommendations prefer official support and compare measured peers without changing choices',()=>{
  const yaml=formats.find(f=>f.id==='yaml'),typst=formats.find(f=>f.id==='typst');
  const time=(format,provider,warmMs,coldMs=10)=>({format,provider,warmMs,coldMs,sha256:'fixture',measuredAt:0});
  assert.equal(recommendedProvider(yaml,[time('yaml','prettier-yaml',100),time('yaml','dprint-pretty-yaml',1)]),'prettier-yaml');
  assert.equal(recommendedProvider(typst,[]),'dprint-typstyle');
  assert.equal(recommendedProvider(typst,[time('typst','dprint-typstyle-apcamargo',1)]),'dprint-typstyle');
  const measured=[time('typst','dprint-typstyle',4),time('typst','dprint-typstyle-apcamargo',2)];
  assert.equal(recommendedProvider(typst,measured),'dprint-typstyle-apcamargo');
  assert.equal(selectedProvider(typst,{}),'dprint-typstyle');
  assert.equal(selectedProvider(typst,{typst:'none'}),'none');
  assert.equal(selectedProvider(yaml,{yaml:'dprint-pretty-yaml'}),'dprint-pretty-yaml');
});
Then('formatter routing retains script dialects templates and existing defaults',()=>{
  for(const [path,mode,plugin,extension] of [['src/thing.jsx','javascript','typescript','jsx'],['src/thing.tsx','typescript','typescript','tsx'],['.bashrc','auto','sh','sh'],['script.zsh','auto','sh','zsh'],['template.component.html','auto','html','component.html'],['Dockerfile.dev','auto','dockerfile','dockerfile'],['.babelrc','auto','json','jsonc'],['example.svg','auto','xml','svg']]) {
    const route=formatterFor(path,mode);assert.equal(route.plugin,plugin);assert.equal(route.extension,extension);
  }
  assert.equal(formatterFor('query.sql').engine,'dprint');
  assert.equal(formatterFor('query.sql','auto',{sql:'postgres-service'}).engine,'postgres');
  assert.equal(formatterFor('shader.wgsl').engine,'wgsl');
  assert.equal(formatterFor('Dockerfile').engine,'dprint');
  assert.equal(formatterFor('Dockerfile','auto',{dockerfile:'dockerfile-service'}).engine,'dockerfile');
  assert.equal(formatIdFor('src/unknown.whatever'),undefined);
  assert.equal(formatterFor('example.yaml','text'),undefined);
  assert.equal(formatterFor('example.yaml','auto',{yaml:'dprint-malva'}),undefined);
  assert.equal(formatterFor('example.yaml','auto',{yaml:'dprint-pretty-yaml'}).plugin,'pretty-yaml');
  assert.equal(formatterFor('example.jsx','auto',{jsx:'none'}),undefined);
});
