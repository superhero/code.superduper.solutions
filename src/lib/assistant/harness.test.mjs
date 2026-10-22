// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { BrowserAgentHarness, ollamaPlugin } from './harness.ts';
import { parseSkill, normalizeSkills, mergeSkills, skillCatalog } from './skills.ts';
import { skillTools } from './skill-tools.ts';
import { gitTools } from './git-tools.ts';
import { settingsTools } from './settings-tool.ts';
import { repositoryTools } from './tools.ts';
import { DEFAULT_TOOLS, DEFAULT_INSTRUCTIONS, normalizeContexts, runtimeContextSize } from './configuration.ts';
import { normalizeSettings, normalizeOverrides, resolveSettings } from '../editor/settings.ts';
const encoder = new TextEncoder();
const wire = events => new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(events.map(event => JSON.stringify(event)).join('\n'))); controller.close(); } }));
const done = { done: true, done_reason: 'stop', prompt_eval_count: 80, eval_count: 4 };
const call = (name, args) => ({ message: { tool_calls: [{ function: { name, arguments: args } }] }, done: false });
const text = value => ({ message: { content: value }, done: false });
const settings = extra => ({ instructions: 'Inspect before answering.', contextWindow: 8192, tools: [], onTool() {}, onUsage() {}, ...extra });
const repository = () => ({ id: 'repo', revision: 'r1', files: new Set(['README.md','src/main.ts','.git/config']), read: async path => ({ 'README.md': '# Project\nReal project description', 'src/main.ts': 'export const ready = true;' })[path] ?? 'private' });
const signal = () => new AbortController().signal;
Then('the browser Pi harness inspects a repository and replays its tool results', async function() {
  const original = globalThis.fetch, requests = [], activity = [], usage = [], chunks = [];
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://localhost:11434/api/chat'); assert.equal(options.credentials, 'omit');
      const body = JSON.parse(options.body); requests.push(body);
      assert.equal(body.options.num_ctx, 8192); assert.equal(body.messages[0].content, 'Inspect before answering.');
      if (requests.length === 1) return wire([call('read_file', { path: 'README.md' }), done]);
      assert.equal(body.messages.at(-1).role, 'tool'); assert.equal(body.messages.at(-1).tool_name, 'read_file');
      assert.match(body.messages.at(-1).content, /Real project description/);
      return wire([text('Read the actual README.'), done]);
    };
    const result = await new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434', value => usage.push(value)), 'ornith:9b-q8_0', [{ role: 'user', content: 'Describe this project.' }], signal(), value => chunks.push(value), settings({ tools: repositoryTools(repository()), onTool: value => activity.push(value) }));
    assert.equal(result.reason, 'stop'); assert.equal(requests.length, 2); assert.equal(chunks.join(''), 'Read the actual README.');
    assert.deepEqual(activity.map(value => value.status), ['running','completed']); assert.match(activity[1].result, /Real project description/);
    assert.deepEqual(usage.at(-1), { used: 84, measured: true });
  } finally { globalThis.fetch = original; }
});
Then('repository tools enforce enabled capabilities and bounded text access', async function() {
  let reads = 0;
  const repo = repository(); const originalRead = repo.read; repo.read = async path => { reads++; return originalRead(path); };
  assert.equal(repositoryTools(undefined).length, 0);
  assert.deepEqual(repositoryTools(repo, { ...DEFAULT_TOOLS, read_file: false, search_text: false }).map(tool => tool.name), ['list_files']);
  const tools = repositoryTools(repo), read = tools.find(tool => tool.name === 'read_file');
  for (const path of ['../README.md','.git/config','https://example.com','/README.md','absent']) await assert.rejects(read.execute('x',{ path },signal()), /listed/);
  assert.equal(reads, 0);
  const listed = await tools[0].execute('x',{},signal()); assert.doesNotMatch(listed.content[0].text, /\.git/);
  const found = await tools[2].execute('x',{ query: 'ready' },signal()); assert.match(found.content[0].text, /src\/main.ts/);
  const limited = repositoryTools({ ...repo, files: new Set(['long']), read: async () => 'a'.repeat(20000) });
  assert.ok((await limited[1].execute('x',{ path: 'long' },signal())).content[0].text.length < 12100);
  const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(tools[0].execute('x',{},cancelled.signal), /abort/i);
});
Then('the Pi harness rejects full context and preserves measured runtime usage', async function() {
  const original = globalThis.fetch; let requests = 0; const usage = [];
  try {
    globalThis.fetch = async () => { requests++; return wire([text('ok'),done]); };
    const harness = new BrowserAgentHarness();
    await assert.rejects(harness.run(ollamaPlugin('http://localhost:11434', value => usage.push(value)), 'ornith:9b-q8_0', [{ role:'user', content:'x'.repeat(14000) }],signal(),()=>{},settings({ contextWindow: 2048 })), /Context limit/);
    assert.equal(requests,0);
    await new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434', value => usage.push(value)), 'ornith:9b-q8_0',[{role:'user',content:'hello'}],signal(),()=>{},settings());
    assert.deepEqual(usage.at(-1),{used:84,measured:true});
  } finally { globalThis.fetch = original; }
});
Then('Pi tool loops stop on cancellation and reject unavailable capabilities', async function() {
  const original = globalThis.fetch; let requests = 0; const activity = [];
  try {
    globalThis.fetch = async () => { requests++; return requests === 1 ? wire([call('read_file',{path:'../bad'}),done]) : wire([text('Cannot read that path.'),done]); };
    await new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434',()=>{}),'ornith:9b-q8_0',[{role:'user',content:'read'}],signal(),()=>{},settings({tools:repositoryTools(repository()),onTool:value=>activity.push(value)}));
    assert.equal(activity.at(-1).status,'failed'); assert.match(activity.at(-1).result,/listed/);
    for (const [name,args] of [['unavailable_tool',{}],['read_file',{path:42}]]) {
      requests=0; let lastBody;
      globalThis.fetch=async (_url,options)=>{ lastBody=JSON.parse(options.body); return ++requests===1 ? wire([call(name,args),done]) : wire([text('Tool unavailable.'),done]); };
      await new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434',()=>{}),'ornith:9b-q8_0',[{role:'user',content:'read'}],signal(),()=>{},settings({tools:repositoryTools(repository())}));
      assert.equal(lastBody.messages.at(-1).role,'tool'); assert.match(lastBody.messages.at(-1).content,/not found|validation|invalid|expected|listed repository/i);
    }
    requests=0;
    globalThis.fetch=async ()=>{requests++;return wire([call('list_files',{}),done]);};
    const ids=[];
    await assert.rejects(new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434',()=>{}),'ornith:9b-q8_0',[{role:'user',content:'repeat'}],signal(),()=>{},settings({tools:repositoryTools(repository()),onTool:item=>{if(item.status==='running')ids.push(item.id);}})),/round limit/);
    assert.equal(requests,6); assert.equal(new Set(ids).size,6);
    const controller = new AbortController(); requests=0;
    globalThis.fetch = async () => { requests++; return wire([text('partial'),done]); };
    await assert.rejects(new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434',()=>{}),'ornith:9b-q8_0',[{role:'user',content:'hello'}],controller.signal,()=>controller.abort(),settings()), /abort/i);
    assert.equal(requests,1);
  } finally { globalThis.fetch = original; }
});
Then('AI harness settings inherit persist and reject malformed values', function() {
  const defaults = normalizeSettings(null); assert.equal(defaults.global.aiInstructions,DEFAULT_INSTRUCTIONS); assert.deepEqual(defaults.global.aiTools,DEFAULT_TOOLS);
  const store = normalizeSettings({version:1,global:{aiInstructions:'Personal',aiModelContexts:{'ollama:a':8192}},repositories:{repo:{aiInstructions:'Repository',aiTools:{read_file:false},aiModelContexts:{'ollama:b':16384}}}});
  const active=resolveSettings(store,'repo'); assert.equal(active.aiInstructions,'Repository'); assert.equal(active.aiTools.read_file,false);
  assert.deepEqual(active.aiModelContexts,{'ollama:a':8192,'ollama:b':16384}); assert.equal(resolveSettings(store,'other').aiInstructions,'Personal');
  assert.deepEqual(normalizeOverrides({aiInstructions:5,aiTools:'bad',aiModelContexts:[]}),{});
  assert.deepEqual(normalizeContexts({'ollama:a':-1,'openai:b':9999999,'bad':4096,'ollama:bad':'x'}),{'ollama:a':2048,'openai:b':1048576});
});

Then('the read settings tool captures scoped preferences and filters unknown fields', async function() {
  const settings = normalizeSettings({ version:1, global:{fontSize:13}, repositories:{selected:{fontSize:16}} });
  const context = {personal:{...settings.global,apiKey:'must-not-leak'},effective:resolveSettings(settings,'selected'),repository:{id:'selected',overrides:{fontSize:16,password:'must-not-leak'}}};
  const [tool] = settingsTools(context);
  assert.equal(settingsTools(context,false).length,0); assert.equal(settingsTools(undefined).length,0);
  const run = async args => JSON.parse((await tool.execute('settings',args,signal())).content[0].text);
  const catalog = await run({}); assert.ok(catalog.keys.includes('fontSize')); assert.ok(!catalog.keys.includes('apiKey'));
  context.effective.fontSize=30;
  const effective = await run({keys:['fontSize','aiEnterAction']}); assert.equal(effective.values.fontSize,16);
  assert.deepEqual(effective.sources,{fontSize:'repository',aiEnterAction:'personal'});
  assert.equal((await run({scope:'personal',keys:['fontSize']})).values.fontSize,13);
  assert.deepEqual((await run({scope:'repository',keys:['fontSize','aiEnterAction']})).inherited,['aiEnterAction']);
  await assert.rejects(tool.execute('settings',{keys:['apiKey']},signal()),/Unknown/);
  assert.doesNotMatch(JSON.stringify(await run({scope:'repository'})),/must-not-leak|password/);
  const [personal] = settingsTools({personal:settings.global,effective:settings.global});
  const absent = JSON.parse((await personal.execute('settings',{scope:'repository'},signal())).content[0].text); assert.equal(absent.available,false);
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(tool.execute('settings',{},cancelled.signal),/abort/i);
});

Then('Git tools expose bounded repository history and reject private or invalid references', async function() {
  const oid='a'.repeat(40), parent='b'.repeat(40), privateOid='c'.repeat(40), requests=[];
  const context={id:'selected',head:oid,branch:'main',branches:['main','feature'],commits:[{oid,parents:[parent],message:'Latest change',timestamp:2},{oid:parent,parents:[],message:'Initial',timestamp:1}],
    status:async()=>({revision:'r2',files:[{path:'same',head:1,work:1,stage:1,conflicted:false},{path:'changed',head:1,work:2,stage:1,conflicted:false}],branches:[],tags:[],author:{email:'hidden'},operation:{beforeControl:'hidden'}}),
    commit:async value=>{requests.push(['commit',value]);return {oid:value,parents:[parent],message:'Latest change',author:{name:'Author',email:'author@example.invalid'},files:['changed']};},
    diff:async request=>{requests.push(['diff',request]);return {path:request.path,before:'old',after:'new',binary:false};}};
  assert.equal(gitTools(undefined).length,0);
  const tools=gitTools(context), tool=name=>tools.find(tool=>tool.name===name), run=async(name,args={})=>JSON.parse((await tool(name).execute('git',args,signal())).content[0].text);
  assert.equal(tools.length,5); assert.equal(gitTools(context,{...DEFAULT_TOOLS,git_diff:false}).length,4);
  const log=await run('git_log',{limit:1});assert.equal(log.commits[0].oid,oid);assert.equal(log.truncated,true);
  assert.equal((await run('git_log',{offset:1})).commits[0].oid,parent);
  assert.deepEqual((await run('git_branches')).branches,['main','feature']);
  const status=await run('git_status');assert.equal(status.files.length,1);assert.equal(status.files[0].path,'changed');assert.doesNotMatch(JSON.stringify(status),/hidden|beforeControl/);
  assert.equal((await run('git_commit')).message,'Latest change');
  const diff=await run('git_diff',{path:'changed',kind:'commit',oid});assert.equal(diff.before.text,'1: old');assert.equal(diff.after.text,'1: new');
  const before=requests.length;
  await assert.rejects(tool('git_commit').execute('git',{oid:privateOid},signal()),/git_log/);
  await assert.rejects(tool('git_diff').execute('git',{path:'changed',kind:'commit',oid,parent:2},signal()),/parent/);
  for(const path of ['../escape','.git/config','/absolute'])await assert.rejects(tool('git_diff').execute('git',{path},signal()),/repository path/);
  assert.equal(requests.length,before);
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(tool('git_status').execute('git',{},cancelled.signal),/abort/i);
});

Then('enabled browser skills advertise metadata and Pi loads their instructions on demand', async function() {
  const parsed=parseSkill('---\nname: review-code\ndescription: Review repository code.\n---\nRead files first. Skill proof: browser-skill-42');
  const skills={ [parsed.name]:parsed.skill, disabled:{description:'Disabled',instructions:'never-advertise-this',enabled:false} };
  assert.match(skillCatalog(skills),/review-code/);assert.doesNotMatch(skillCatalog(skills),/browser-skill-42|never-advertise-this/);
  assert.deepEqual(mergeSkills(skills,{'review-code':null}),{disabled:skills.disabled});
  assert.deepEqual(normalizeSkills({'Bad Name':parsed.skill}),{});
  for(const source of ['plain text','---\nname: x\n---\nbody','---\nname: x\ndescription: desc\ndisable-model-invocation: true\n---\nbody'])assert.throws(()=>parseSkill(source));
  const store=normalizeSettings({version:1,global:{aiSkills:skills},repositories:{repo:{aiSkills:{'review-code':null}}}});
  assert.ok(resolveSettings(store).aiSkills['review-code']);assert.equal(resolveSettings(store,'repo').aiSkills['review-code'],undefined);
  const tools=skillTools(skills);assert.equal(tools.length,1);
  await assert.rejects(tools[0].execute('x',{name:'disabled'},signal()),/disabled/);
  const original=globalThis.fetch;let requests=0;const activities=[];
  try {
    globalThis.fetch=async(_url,options)=>{
      const body=JSON.parse(options.body);requests++;
      assert.match(body.messages[0].content,/review-code/);assert.doesNotMatch(body.messages[0].content,/browser-skill-42/);
      if(requests===1)return wire([call('load_skill',{name:'review-code'}),done]);
      assert.equal(body.messages.at(-1).role,'tool');assert.match(body.messages.at(-1).content,/browser-skill-42/);
      return wire([text('Skill loaded.'),done]);
    };
    await new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434',()=>{}),'ornith:9b-q8_0',[{role:'user',content:'Review code using the skill.'}],signal(),()=>{},settings({skills,tools,onTool:item=>activities.push(item)}));
    assert.equal(requests,2);assert.equal(activities.at(-1).name,'load_skill');assert.equal(activities.at(-1).status,'completed');
  } finally {globalThis.fetch=original;}
});

Then('Ollama context allocation grows with payload while preserving the configured ceiling', async function() {
  assert.equal(runtimeContextSize({messages:['hello']},262144),8192);
  assert.equal(runtimeContextSize({messages:['hello']},4096),4096);
  assert.equal(runtimeContextSize({messages:['x'.repeat(12000)]},262144),16384);
  assert.equal(runtimeContextSize({messages:['x'.repeat(24000)]},262144),32768);
  assert.equal(runtimeContextSize({messages:['x'.repeat(100000)]},65536),65536);
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.options.num_ctx,8192);return wire([text('Ready.'),done]);};
    await new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434',()=>{}),'ornith:9b-q8_0',[{role:'user',content:'hello'}],signal(),()=>{},settings({contextWindow:262144}));
  } finally {globalThis.fetch=original;}
});
