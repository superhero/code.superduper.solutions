// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { emptyRepositoryWorkspace, normalizeWorkspace, reconcileRepositoryWorkspace, renameRepositoryWorkspace,
  rightDockWidths, fitWorkspacePanes, explorerDockWidth, resolvePaneSizes, splitPaneSizes, removePaneSize, moveWorkspaceTab, commitDiffTab, commitDiffOid, diffTab, tabFile, tabLabel, activePaneTab, settingsScrollTop, WORKSPACE_KEY } from "./workspace.ts";

const crowdedPanes = () => ({version:1,repositoryId:'',page:'editor',repositories:{},rightPanes:['history','git','ai'],paneOrder:['explorer','history','git','ai']});
Then('Vault pane preferences migrate persist and fit without storing secret drafts',function(){
  const state=normalizeWorkspace({...crowdedPanes(),page:'vault',vaultPaneWidth:480.4,vault:{password:'synthetic-only'}});
  assert.equal(state.page,'editor');assert.deepEqual(state.rightPanes,['history','git','ai','vault']);
  assert.equal(state.vaultPaneWidth,480);assert.equal(Object.hasOwn(state,'vault'),false);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(state))),state);
  assert.equal(normalizeWorkspace({...state,vaultPaneWidth:1}).vaultPaneWidth,320);
  assert.equal(normalizeWorkspace({...state,vaultPaneWidth:9999}).vaultPaneWidth,640);
  for(const value of [null,'480',NaN,Infinity])assert.equal(normalizeWorkspace({...state,vaultPaneWidth:value}).vaultPaneWidth,undefined);
  const widths=rightDockWidths(2400,{history:440,git:320,ai:380,vault:480});
  assert.ok(["history","git","ai","vault"].every(pane=>widths[pane]>=320));assert.equal(widths.resources,0);
  assert.ok(Object.values(widths).reduce((sum,width)=>sum+width,320)<=2400);
  const selected=fitWorkspacePanes(2400,{...state,paneOrder:['explorer','vault','history','git','ai']},'vault');
  assert.equal(selected.paneOrder.at(-1),'vault');
  const narrow=fitWorkspacePanes(600,selected);
  assert.equal(narrow.explorerOpen,false);assert.deepEqual(narrow.rightPanes,['vault']);
  const fitted=rightDockWidths(600,{vault:480});assert.equal(fitted.vault,300);
});
Then('the newest side pane stays open while older panes close to preserve the editor',function(){
  const wide=fitWorkspacePanes(2000,crowdedPanes());
  assert.equal(wide.explorerOpen,true);assert.deepEqual(wide.rightPanes,['history','git','ai']);
  const narrower=fitWorkspacePanes(1280,wide);
  assert.equal(narrower.explorerOpen,false);assert.deepEqual(narrower.rightPanes,['history','git','ai']);
  const narrow=fitWorkspacePanes(1000,narrower);
  assert.deepEqual(narrow.rightPanes,['git','ai']);
  const files=fitWorkspacePanes(600,{...narrow,explorerOpen:true},'explorer');
  assert.equal(files.explorerOpen,true);assert.deepEqual(files.rightPanes,[]);
  const ai=fitWorkspacePanes(600,{...files,rightPanes:['ai']},'ai');
  assert.equal(ai.explorerOpen,false);assert.deepEqual(ai.rightPanes,['ai']);
});
Then('explorer visibility and pane opening order normalize safely and remain closed on expansion',function(){
  const input={...crowdedPanes(),explorerOpen:false,paneOrder:['ai','bad','git','ai','explorer']};
  const stored=normalizeWorkspace(input);assert.equal(stored.explorerOpen,false);assert.deepEqual(stored.paneOrder,['ai','git','explorer']);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(stored))),stored);
  const small=fitWorkspacePanes(500,crowdedPanes()),large=fitWorkspacePanes(2000,small);
  assert.equal(large,small);assert.equal(large.explorerOpen,false);assert.deepEqual(large.rightPanes,['ai']);
  assert.equal(fitWorkspacePanes(0,stored),stored);assert.equal(fitWorkspacePanes(NaN,stored),stored);
});
Then('all retained pane widths leave space for the editor at every supported viewport width',function(){
  for(const available of [240,320,480,600,640,800,1000,1280,1440,1600,2000]){
    const state=fitWorkspacePanes(available,crowdedPanes());
    const explorer=state.explorerOpen?explorerDockWidth(available,state.rightPanes.length,600):0;
    const preferred=Object.fromEntries(state.rightPanes.map(pane=>[pane,pane==='ai'?640:1600]));
    const widths=rightDockWidths(available-explorer,preferred),editor=available-explorer-Object.values(widths).reduce((sum,width)=>sum+width,0);
    assert.ok(editor>=Math.min(320,available/2),`Editor remains visible at ${available}px`);
    assert.ok(editor>0);for(const pane of state.rightPanes)assert.ok(widths[pane]>0);
  }
});

Then('commit comparison tabs survive normalization moves reload and missing working files',function(){
 const oid='a'.repeat(40),other='b'.repeat(40),file='src/old.ts',key=commitDiffTab(file,oid),second=commitDiffTab(file,other);
 const input={...emptyRepositoryWorkspace(),tabs:[file,key,second],activeFile:file,fileDiffOpen:true,commitDiffOid:oid,
  documents:{[file]:session(12)},splitViews:[split('right','README.md',0)]};
 const roundtrip=value=>normalizeWorkspace(JSON.parse(JSON.stringify({version:1,repositoryId:'repo',page:'editor',repositories:{repo:value}}))).repositories.repo;
 const normalized=roundtrip(input);assert.equal(activePaneTab(normalized),key);assert.equal(tabFile(key),file);assert.equal(commitDiffOid(key),oid);
 assert.match(tabLabel(key),/commit aaaaaaaa diff/);
 const retained=reconcileRepositoryWorkspace(normalized,['README.md']);assert.deepEqual(retained.tabs,[key,second]);assert.equal(activePaneTab(retained),key);
 const moved=moveWorkspaceTab(retained,'primary','right',key,1);assert.equal(activePaneTab(moved.splitViews[0]),key);
 const restored=roundtrip(moved);assert.equal(restored.splitViews[0].commitDiffOid,oid);assert.equal(activePaneTab(restored),second);
 assert.deepEqual(reconcileRepositoryWorkspace(restored,['README.md']).splitViews[0].session,session(12));
 const renamed=renameRepositoryWorkspace(normalized,'src','renamed');assert.ok(renamed.tabs.includes(key));assert.equal(activePaneTab(renamed),key);
 const promoted=moveWorkspaceTab(restored,'primary','right',second,2);assert.equal(activePaneTab(promoted),second);assert.equal(promoted.commitDiffOid,other);
});

const session = (offset = 0) => ({ selection: [{ anchor: offset, head: offset + 4 }, { anchor: 80, head: 80 }],
  mainIndex: 1, scrollTop: 130.5, scrollLeft: 20 });
const split = (id, file, offset) => ({ id, file, session:session(offset), tabs:[file], documents:{[file]:session(offset)} });
const repository = () => ({ ...emptyRepositoryWorkspace(), tabs: ["src/main.ts", "README.md"], activeFile: "README.md",
  documents: { "src/main.ts": session(40), "README.md": session(5), "closed.md": session(9) },
  expandedDirectories: ["src", "src/lib"], treeFocus: "src/main.ts", focus: "editor",
  scroll: { explorer: 14, tabs: 8, history: 200, settings: 300 } });

Then("the resources view and scroll position survive safe workspace normalization", function () {
  const input = { version: 1, repositoryId: "first", page: "resources", repositories: {
    first: { ...repository(), scroll: { ...repository().scroll, resources: 220 } } }, samples: [{ heap: 900 }] };
  const normalized = normalizeWorkspace(input);
  assert.equal(normalized.page, "editor"); assert.deepEqual(normalized.rightPanes, ["resources"]);
  assert.equal(normalized.repositories.first.scroll.resources, 220);
  assert.ok(!Object.hasOwn(normalized, "samples"));
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(normalized))), normalized);
  for (const invalid of [-1, Infinity, "100", null]) {
    const next = structuredClone(input); next.repositories.first.scroll.resources = invalid;
    assert.equal(normalizeWorkspace(next).repositories.first.scroll.resources, 0);
  }
  assert.ok(!Object.hasOwn(emptyRepositoryWorkspace().scroll, "resources"));
});

Then('Resources widths visibility and priority survive normalization without storing measurements',function(){
  const input={...crowdedPanes(),rightPanes:['history','git','ai','vault','resources'],
    paneOrder:['explorer','history','git','ai','vault','resources'],resourcesPaneWidth:480.4,samples:[{heap:900}]};
  const state=normalizeWorkspace(input);
  assert.equal(state.resourcesPaneWidth,480);assert.equal(Object.hasOwn(state,'samples'),false);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(state))),state);
  assert.equal(normalizeWorkspace({...state,resourcesPaneWidth:1}).resourcesPaneWidth,320);
  assert.equal(normalizeWorkspace({...state,resourcesPaneWidth:9999}).resourcesPaneWidth,1600);
  for(const value of [null,'480',NaN,Infinity])assert.equal(normalizeWorkspace({...state,resourcesPaneWidth:value}).resourcesPaneWidth,undefined);
  for(const available of [320,600,1280,2000,2800]){
    const fitted=fitWorkspacePanes(available,state);
    const explorer=fitted.explorerOpen?explorerDockWidth(available,fitted.rightPanes.length,245):0;
    const widths=rightDockWidths(available-explorer,Object.fromEntries(fitted.rightPanes.map(pane=>[pane,480])));
    assert.ok(available-explorer-Object.values(widths).reduce((sum,width)=>sum+width,0)>=Math.min(320,available/2));
    assert.equal(fitted.rightPanes.at(-1),'resources');
  }
  const selected=fitWorkspacePanes(2800,{...state,paneOrder:['explorer','resources','history','git','ai','vault']},'resources');
  assert.equal(selected.paneOrder.at(-1),'resources');
  const narrow=fitWorkspacePanes(600,selected);
  assert.equal(narrow.explorerOpen,false);assert.deepEqual(narrow.rightPanes,['resources']);
  assert.equal(rightDockWidths(600,{resources:480}).resources,300);
});

Then('the vault view survives workspace normalization without credential drafts', function () {
  const input = { version: 1, repositoryId: '', page: 'vault', repositories: {},
    vault: { password: 'synthetic-only', value: 'synthetic-secret' }, recovery: 'synthetic-recovery' };
  const normalized = normalizeWorkspace(input);
  assert.deepEqual(normalized, { version: 1, repositoryId: '', page: 'editor', rightPanes: ['vault'], repositories: {} });
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(normalized))), normalized);
});

Then('split workspace state survives reload rename and reconciliation',function(){
  const state={...repository(),splitViews:[split('one','src/main.ts',7),split('two','src/main.ts',11),split('three','other.txt',15)]};
  const roundtrip=normalizeWorkspace(JSON.parse(JSON.stringify({version:1,repositoryId:'repo',page:'editor',repositories:{repo:state}}))).repositories.repo;
  assert.deepEqual(roundtrip.splitViews,state.splitViews);
  assert.notEqual(roundtrip.splitViews[0].session,state.splitViews[0].session);
  const renamed=renameRepositoryWorkspace(roundtrip,'src','lib');
  assert.deepEqual(renamed.splitViews.map(view=>view.file),['lib/main.ts','lib/main.ts','other.txt']);
  assert.deepEqual(renamed.splitViews[1].session,session(11));
  const removed=reconcileRepositoryWorkspace(renamed,['README.md','other.txt']);
  assert.deepEqual(removed.splitViews,[state.splitViews[2]]);
  const promoted=reconcileRepositoryWorkspace({...state,tabs:['src/main.ts'],activeFile:'src/main.ts'},['other.txt']);
  assert.deepEqual(promoted.tabs,['other.txt']);assert.equal(promoted.activeFile,'other.txt');
  assert.deepEqual(promoted.splitViews,[]);assert.deepEqual(promoted.documents['other.txt'],session(15));
  const migrated=normalizeWorkspace({version:1,repositories:{repo:{...repository(),splitViews:undefined,splitFile:'src/main.ts',splitDocuments:{'src/main.ts':session(7)}}}}).repositories.repo;
  assert.deepEqual(migrated.splitViews,[split('legacy-split','src/main.ts',7)]);
  const invalid=normalizeWorkspace({version:1,repositories:{repo:{...state,splitViews:[...state.splitViews,{id:'one',file:'README.md'},null,{id:'unsafe',file:'../bad'}]}}}).repositories.repo;
  assert.deepEqual(invalid.splitViews,state.splitViews);

});

Then('split pane sizes persist normalize and follow pane insertion deletion and promotion',function(){
  const state={...repository(),splitViews:[
    split('one','src/main.ts',7),
    split('two','src/main.ts',11),
    split('three','other.txt',15)
  ],paneSizes:[2,3,5,10]};
  const normalize=value=>normalizeWorkspace({version:1,repositories:{repo:value}}).repositories.repo;
  const before=structuredClone(state);
  const roundtrip=normalize(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(roundtrip.paneSizes,[.1,.15,.25,.5]);
  assert.deepEqual(normalize(roundtrip),roundtrip);
  assert.deepEqual(renameRepositoryWorkspace(roundtrip,'src','lib').paneSizes,roundtrip.paneSizes);
  assert.notEqual(normalize(roundtrip).paneSizes,roundtrip.paneSizes);
  assert.deepEqual(state,before);
  assert.deepEqual(emptyRepositoryWorkspace().paneSizes,[]);
  const legacy={...state};delete legacy.paneSizes;
  assert.deepEqual(normalize(legacy).paneSizes,[]);
  for(const invalid of [null,false,{},'2,3,5,10',[],[1],[1,2,3],
    [1,2,3,0],[1,-2,3,4],[1,2,3,NaN],[1,2,3,Infinity],[1,2,3,'4']]){
    assert.deepEqual(normalize({...state,paneSizes:invalid}).paneSizes,[]);
  }
  const pruned=reconcileRepositoryWorkspace(roundtrip,['README.md','other.txt']);
  assert.deepEqual(pruned.splitViews.map(view=>view.id),['three']);
  assert.deepEqual(pruned.paneSizes,[.5,.5]);
  assert.deepEqual(pruned.splitViews[0].session,session(15));
  const promoted=reconcileRepositoryWorkspace({...roundtrip,tabs:['gone'],activeFile:'gone'},['src/main.ts','other.txt']);
  assert.equal(promoted.activeFile,'src/main.ts');
  assert.deepEqual(promoted.splitViews.map(view=>view.id),['two','three']);
  assert.deepEqual(promoted.paneSizes,[.25,.25,.5]);
  assert.deepEqual(promoted.documents['src/main.ts'],session(7));
  const sole=reconcileRepositoryWorkspace({...roundtrip,tabs:['gone'],activeFile:'gone'},['other.txt']);
  assert.deepEqual(sole.splitViews,[]);assert.deepEqual(sole.paneSizes,[1]);
  assert.deepEqual(resolvePaneSizes([],3),[1/3,1/3,1/3]);
  assert.deepEqual(resolvePaneSizes([3,1],2),[.75,.25]);
  assert.deepEqual(resolvePaneSizes([3,1],3),[1/3,1/3,1/3]);
  assert.deepEqual(resolvePaneSizes([Number.MAX_VALUE,Number.MAX_VALUE],2),[.5,.5]);
  const sixths=resolvePaneSizes([1,1,1,1,1,1],6);
  assert.deepEqual(resolvePaneSizes(sixths,6),sixths);
  assert.deepEqual(resolvePaneSizes([],0),[]);
  assert.deepEqual(splitPaneSizes([],0),[]);assert.deepEqual(removePaneSize([],1),[]);
  assert.deepEqual(splitPaneSizes([.2,.3,.5],1),[.2,.15,.15,.5]);
  assert.deepEqual(removePaneSize([.2,.3,.5],0),[.5,.5]);
  assert.deepEqual(removePaneSize([.2,.3,.5],1),[.5,.5]);
  assert.deepEqual(removePaneSize([.2,.3,.5],2),[.2,.8]);
  assert.deepEqual(removePaneSize([1],0),[]);
  assert.deepEqual(splitPaneSizes([1],-1),[1]);
  assert.deepEqual(removePaneSize([1],2),[1]);
});

Then("a workspace roundtrip preserves repository tabs selections scroll and focus", function () {
  const input = { version: 1, repositoryId: "second", page: "editor", rightPanes: ["settings"], repositories: {
    first: repository(), second: { ...emptyRepositoryWorkspace(), focus: "tree" }
  } };
  const before = structuredClone(input);
  const normalized = normalizeWorkspace(JSON.parse(JSON.stringify(input)));
  assert.equal(WORKSPACE_KEY, "code.workspace.v1");
  assert.deepEqual(normalized, input);
  assert.deepEqual(normalizeWorkspace(normalized), normalized);
  assert.notEqual(normalized.repositories.first.documents, input.repositories.first.documents);
  normalized.repositories.first.documents["src/main.ts"].selection[0].head = 999;
  assert.deepEqual(input, before);
  const extra = structuredClone(input);
  extra.contents = "do not retain";
  extra.repositories.first.content = "do not retain";
  extra.repositories.first.documents["src/main.ts"].content = "do not retain";
  assert.deepEqual(normalizeWorkspace(extra), input);
});

Then("history view preferences survive normalization roundtrip and repository mutations", function () {
  assert.equal(emptyRepositoryWorkspace().historyView,"changes");
  const input={version:1,repositoryId:"first",page:"history",repositories:{
    first:{...repository(),historyView:"versions"},second:repository(),
  }};
  const normalized=normalizeWorkspace(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(normalized,{...input,page:"editor",rightPanes:["history"]});
  const first=normalized.repositories.first;
  assert.equal(reconcileRepositoryWorkspace(first,["README.md"]).historyView,"versions");
  assert.equal(renameRepositoryWorkspace(first,"src","source").historyView,"versions");
  const legacy=repository();delete legacy.historyView;
  assert.equal(normalizeWorkspace({...input,repositories:{first:legacy}}).repositories.first.historyView,"changes");
  for(const invalid of [null,false,0,"",{},"other"]){
    const recovered=normalizeWorkspace({...input,repositories:{first:{...repository(),historyView:invalid}}});
    assert.equal(recovered.repositories.first.historyView,"changes");
  }
  assert.equal(normalized.repositories.second.historyView,"changes");
  assert.deepEqual(input.repositories.first,{...repository(),historyView:"versions"});
});

Then("invalid workspace versions fields and coordinates recover safely", function () {
  const empty = { version: 1, repositoryId: "", page: "editor", repositories: {} };
  for (const value of [undefined, null, false, [], "broken", {}, { version: 2, repositories: { first: repository() } }])
    assert.deepEqual(normalizeWorkspace(value), empty);
  const store = normalizeWorkspace({ version: 1, page: "invalid", repositoryId: {}, repositories: {
    first: { tabs: ["README.md", "../outside", null, "README.md", ".git/config"], activeFile: "missing",
      expandedDirectories: ["src", "src", "/outside"], focus: "invalid", treeFocus: "../outside",
      scroll: { explorer: Infinity, tabs: -1, history: "20", settings: 12.5 },
      documents: { "README.md": { selection: [{ anchor: -1, head: 10.8 }, { anchor: Infinity, head: 1e30 }],
        mainIndex: 999, scrollTop: NaN, scrollLeft: -40 }, "empty.md": { selection: [], mainIndex: -1 }, "../outside": session() } },
    second: false
  } });
  assert.equal(store.repositoryId, "");
  assert.equal(store.page, "editor");
  const first = store.repositories.first;
  assert.deepEqual(first.tabs, ["README.md"]);
  assert.equal(first.activeFile, "README.md");
  assert.deepEqual(first.expandedDirectories, ["src"]);
  assert.equal(first.treeFocus, "");
  assert.equal(first.focus, "none");
  assert.deepEqual(first.scroll, { explorer: 0, tabs: 0, history: 0, settings: 12.5 });
  assert.deepEqual(first.documents["README.md"], { selection: [{ anchor: 0, head: 10 }, { anchor: 0, head: 2_147_483_647 }],
    mainIndex: 1, scrollTop: 0, scrollLeft: 0 });
  assert.deepEqual(first.documents["empty.md"], { selection: [{ anchor: 0, head: 0 }], mainIndex: 0, scrollTop: 0, scrollLeft: 0 });
  assert.equal(Object.hasOwn(first.documents, "../outside"), false);
  assert.deepEqual(store.repositories.second, emptyRepositoryWorkspace());
});

Then("workspace normalization preserves prototype-named files without trusting inherited values", function () {
  const source = JSON.parse('{"version":1,"repositoryId":"__proto__","repositories":{"__proto__":{},"constructor":{},"prototype":{},"safe":{"tabs":["__proto__","constructor","prototype"],"activeFile":"__proto__","documents":{"__proto__":{"scrollTop":40},"constructor":{"scrollTop":80},"prototype":{"scrollTop":120}}}}}');
  const store = normalizeWorkspace(source);
  assert.equal(store.repositoryId, "");
  assert.deepEqual(Object.keys(store.repositories), ["safe"]);
  assert.equal(Object.getPrototypeOf(store.repositories), Object.prototype);
  const files = store.repositories.safe.documents;
  assert.deepEqual(Object.keys(files), ["__proto__", "constructor", "prototype"]);
  assert.equal(Object.getPrototypeOf(files), Object.prototype);
  assert.equal(files.__proto__.scrollTop, 40);
  assert.equal(files.constructor.scrollTop, 80);
  assert.equal({}.scrollTop, undefined);
  assert.deepEqual(normalizeWorkspace(Object.create(source)), normalizeWorkspace(null));
  const inherited = normalizeWorkspace({ version: 1, repositories: { first: Object.create(repository()) } });
  assert.deepEqual(inherited.repositories.first, emptyRepositoryWorkspace());
});

Then("workspace reconciliation keeps surviving state and never opens an unseen file", function () {
  const input = repository();
  input.tabs.push("src/main.ts", "gone.ts");
  input.activeFile = "gone.ts";
  input.treeFocus = "src/lib";
  const before = structuredClone(input);
  const reconciled = reconcileRepositoryWorkspace(input, ["src/main.ts", "README.md", "closed.md", "unseen.ts"]);
  assert.deepEqual(reconciled.tabs, ["src/main.ts", "README.md"]);
  assert.equal(reconciled.activeFile, "src/main.ts");
  assert.deepEqual(reconciled.documents, input.documents);
  assert.deepEqual(reconciled.expandedDirectories, ["src"]);
  assert.equal(reconciled.treeFocus, "");
  assert.deepEqual(reconciled.scroll, input.scroll);
  assert.deepEqual(input, before);
  const deleted = reconcileRepositoryWorkspace(input, ["unseen.ts"]);
  assert.deepEqual(deleted.tabs, []);
  assert.equal(deleted.activeFile, "");
  assert.equal(deleted.focus, "none");
  assert.deepEqual(deleted.documents, {});
  assert.deepEqual(reconcileRepositoryWorkspace(emptyRepositoryWorkspace(), ["README.md"]), emptyRepositoryWorkspace());
});

Then("workspace renames remap whole path prefixes and preserve independent state", function () {
  const input = repository();
  input.tabs.push("src-extra/main.ts");
  input.activeFile = "src/main.ts";
  input.documents["src-extra/main.ts"] = session(33);
  const before = structuredClone(input);
  const renamed = renameRepositoryWorkspace(input, "src", "lib/source");
  assert.deepEqual(renamed.tabs, ["lib/source/main.ts", "README.md", "src-extra/main.ts"]);
  assert.equal(renamed.activeFile, "lib/source/main.ts");
  assert.deepEqual(renamed.expandedDirectories, ["lib/source", "lib/source/lib"]);
  assert.equal(renamed.treeFocus, "lib/source/main.ts");
  assert.deepEqual(renamed.documents["lib/source/main.ts"], input.documents["src/main.ts"]);
  assert.deepEqual(renamed.documents["src-extra/main.ts"], input.documents["src-extra/main.ts"]);
  assert.equal(Object.hasOwn(renamed.documents, "src/main.ts"), false);
  assert.deepEqual(renamed.scroll, input.scroll);
  assert.deepEqual(input, before);
  const literal = renameRepositoryWorkspace(renamed, "README.md", "__proto__");
  assert.equal(Object.hasOwn(literal.documents, "__proto__"), true);
  assert.deepEqual(literal.documents.__proto__, input.documents["README.md"]);
  assert.equal(Object.getPrototypeOf(literal.documents), Object.prototype);
});

Then('file diff choices survive workspace normalization and repository reconciliation',function(){
  const input={version:1,repositoryId:'repo',page:'editor',repositories:{repo:{...repository(),fileDiffOpen:true}}};
  const state=normalizeWorkspace(JSON.parse(JSON.stringify(input))).repositories.repo;
  assert.equal(state.fileDiffOpen,true);
  assert.equal(reconcileRepositoryWorkspace(state,['README.md']).fileDiffOpen,true);
  assert.equal(renameRepositoryWorkspace(state,'README.md','GUIDE.md').fileDiffOpen,true);
  assert.equal(normalizeWorkspace({...input,repositories:{repo:{...state,fileDiffOpen:'true'}}}).repositories.repo.fileDiffOpen,false);
});

Then('split tab collections migrate persist rename and reconcile independently',function(){
  const normalize=value=>normalizeWorkspace({version:1,repositories:{repo:value}}).repositories.repo;
  const first={...split('one','src/main.ts',7),tabs:['src/main.ts','src/lib/util.ts','README.md'],
    documents:{'src/main.ts':session(7),'src/lib/util.ts':session(15),'README.md':session(21),'closed.md':session(31)}};
  const state={...repository(),splitViews:[first,split('two','other.txt',17)],paneSizes:[.2,.3,.5]};
  const before=structuredClone(state);
  const roundtrip=normalize(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(roundtrip,state);
  assert.equal(roundtrip.splitViews[0].session,roundtrip.splitViews[0].documents['src/main.ts']);
  assert.notEqual(roundtrip.splitViews[0].documents,first.documents);
  assert.deepEqual(normalize({...state,splitViews:[{id:'old',file:'README.md',session:session(13)}]}).splitViews,
    [split('old','README.md',13)]);
  const alias=normalize({...state,splitViews:[{...first,session:session(99)}]}).splitViews[0];
  assert.deepEqual(alias.session,session(99));
  assert.equal(alias.session,alias.documents['src/main.ts']);
  assert.deepEqual(alias.documents['src/lib/util.ts'],session(15));
  const malformed=normalize({...state,splitViews:[{...first,file:'absent',tabs:['src/lib/util.ts','../bad','src/lib/util.ts',null],session:session(88)},
    {id:'primary',file:'README.md'}, {...first,id:'empty',tabs:[]}, {...first,id:'bad',tabs:null}, {...first,id:'one'}]});
  assert.equal(malformed.splitViews.length,1);
  assert.deepEqual(malformed.splitViews[0].tabs,['src/lib/util.ts']);
  assert.equal(malformed.splitViews[0].file,'src/lib/util.ts');
  assert.deepEqual(malformed.splitViews[0].session,session(15));
  const renamed=renameRepositoryWorkspace(roundtrip,'src','lib/source');
  assert.deepEqual(renamed.splitViews[0].tabs,['lib/source/main.ts','lib/source/lib/util.ts','README.md']);
  assert.deepEqual(renamed.splitViews[0].documents['lib/source/lib/util.ts'],session(15));
  assert.equal(renamed.splitViews[0].session,renamed.splitViews[0].documents['lib/source/main.ts']);
  const pruned=reconcileRepositoryWorkspace(roundtrip,['src/lib/util.ts','README.md','closed.md']);
  assert.equal(pruned.splitViews.length,1);
  assert.deepEqual(pruned.splitViews[0].tabs,['src/lib/util.ts','README.md']);
  assert.equal(pruned.splitViews[0].file,'src/lib/util.ts');
  assert.deepEqual(pruned.splitViews[0].session,session(15));
  assert.deepEqual(pruned.splitViews[0].documents['closed.md'],session(31));
  assert.deepEqual(pruned.paneSizes,[.2,.8]);
  const promoted=reconcileRepositoryWorkspace({...state,tabs:['gone'],activeFile:'gone'},['src/main.ts','src/lib/util.ts','README.md','other.txt']);
  assert.deepEqual(promoted.tabs,first.tabs);
  assert.deepEqual(promoted.documents['src/lib/util.ts'],session(15));
  assert.deepEqual(promoted.paneSizes,[.5,.5]);
  assert.deepEqual(state,before);
});

Then('workspace tab reordering preserves active files sessions and no-op identity',function(){
  const pane={...split('one','b.txt',11),tabs:['a.txt','b.txt','c.txt'],documents:{'a.txt':session(1),'b.txt':session(11),'c.txt':session(21)}};
  const state={...repository(),tabs:['a.txt','b.txt','c.txt'],activeFile:'b.txt',splitViews:[pane]};
  const before=structuredClone(state);
  const last=moveWorkspaceTab(state,'primary','primary','a.txt',3);
  assert.deepEqual(last.tabs,['b.txt','c.txt','a.txt']);
  assert.equal(last.activeFile,'b.txt');
  assert.equal(last.documents,state.documents);
  assert.equal(last.splitViews[0],pane);
  const first=moveWorkspaceTab(state,'one','one','c.txt',0);
  assert.deepEqual(first.splitViews[0].tabs,['c.txt','a.txt','b.txt']);
  assert.equal(first.splitViews[0].file,'b.txt');
  assert.equal(first.splitViews[0].session,pane.documents['b.txt']);
  assert.equal(first.splitViews[0].documents,pane.documents);
  for(const [from,to,file,index] of [
    ['primary','primary','a.txt',0],['primary','primary','a.txt',1],['one','one','b.txt',1],['one','one','b.txt',2],
    ['missing','one','a.txt',0],['one','missing','a.txt',0],['one','one','absent',0],['one','one','a.txt',-1],
    ['one','one','a.txt',4],['one','one','a.txt',.5],['one','one','a.txt',NaN],['one','one','../bad',0]
  ])assert.equal(moveWorkspaceTab(state,from,to,file,index),state);
  assert.deepEqual(state,before);
});

Then('workspace tab transfers activate targets preserve positions and select source neighbours',function(){
  const pane={...split('one','d.txt',31),tabs:['d.txt','a.txt'],documents:{'d.txt':session(31),'a.txt':session(41)}};
  const state={...repository(),tabs:['a.txt','b.txt','c.txt'],activeFile:'b.txt',documents:{'a.txt':session(1),'b.txt':session(11),'c.txt':session(21)},
    splitViews:[pane],paneSizes:[.4,.6]};
  const before=structuredClone(state);
  const moved=moveWorkspaceTab(state,'primary','one','b.txt',1);
  assert.deepEqual(moved.tabs,['a.txt','c.txt']);
  assert.equal(moved.activeFile,'c.txt');
  assert.equal(moved.documents,state.documents);
  assert.deepEqual(moved.splitViews[0].tabs,['d.txt','b.txt','a.txt']);
  assert.equal(moved.splitViews[0].file,'b.txt');
  assert.equal(moved.splitViews[0].session,state.documents['b.txt']);
  assert.deepEqual(moved.paneSizes,state.paneSizes);
  const duplicate=moveWorkspaceTab(state,'primary','one','a.txt',0);
  assert.deepEqual(duplicate.tabs,['b.txt','c.txt']);
  assert.equal(duplicate.activeFile,'b.txt');
  assert.deepEqual(duplicate.splitViews[0].tabs,['a.txt','d.txt']);
  assert.equal(duplicate.splitViews[0].session,pane.documents['a.txt']);
  assert.equal(duplicate.splitViews[0].documents,pane.documents);
  const reverse=moveWorkspaceTab(moved,'one','primary','a.txt',2);
  assert.deepEqual(reverse.tabs,['c.txt','a.txt']);
  assert.equal(reverse.activeFile,'a.txt');
  assert.equal(reverse.documents['a.txt'],state.documents['a.txt']);
  const previous=moveWorkspaceTab({...state,activeFile:'c.txt'},'primary','one','c.txt',0);
  assert.equal(previous.activeFile,'b.txt');
  const secondary=moveWorkspaceTab({...state,splitViews:[{...pane,file:'a.txt',session:pane.documents['a.txt']}]},'one','primary','a.txt',0);
  assert.equal(secondary.splitViews[0].file,'d.txt');
  assert.equal(secondary.splitViews[0].session,pane.documents['d.txt']);
  assert.deepEqual(state,before);
});

Then('empty tab viewport transfers preserve complete promoted panes and widths',function(){
  const pane={...split('one','a.txt',3),tabs:['a.txt','b.txt'],documents:{'a.txt':session(3),'b.txt':session(13)}};
  const state={...repository(),tabs:['last.txt'],activeFile:'last.txt',documents:{'last.txt':session(23),'closed.md':session(33)},
    splitViews:[pane,split('two','c.txt',43)],paneSizes:[.2,.3,.5]};
  const before=structuredClone(state);
  const promoted=moveWorkspaceTab(state,'primary','one','last.txt',1);
  assert.deepEqual(promoted.tabs,['a.txt','last.txt','b.txt']);
  assert.equal(promoted.activeFile,'last.txt');
  assert.equal(promoted.documents['b.txt'],pane.documents['b.txt']);
  assert.equal(promoted.documents['last.txt'],state.documents['last.txt']);
  assert.equal(promoted.documents['closed.md'],state.documents['closed.md']);
  assert.deepEqual(promoted.splitViews.map(view=>view.id),['two']);
  assert.deepEqual(promoted.paneSizes,[.5,.5]);
  const farther=moveWorkspaceTab(state,'primary','two','last.txt',1);
  assert.deepEqual(farther.tabs,['a.txt','b.txt']);
  assert.equal(farther.activeFile,'a.txt');
  assert.deepEqual(farther.splitViews[0].tabs,['c.txt','last.txt']);
  assert.equal(farther.splitViews[0].file,'last.txt');
  const closed=moveWorkspaceTab(state,'two','one','c.txt',2);
  assert.deepEqual(closed.splitViews.map(view=>view.id),['one']);
  assert.deepEqual(closed.splitViews[0].tabs,['a.txt','b.txt','c.txt']);
  assert.deepEqual(closed.paneSizes,[.2,.8]);
  const only=moveWorkspaceTab({...state,splitViews:[split('one','last.txt',63)],paneSizes:[.4,.6]},'one','primary','last.txt',1);
  assert.deepEqual(only.tabs,['last.txt']);
  assert.equal(only.documents['last.txt'],state.documents['last.txt']);
  assert.deepEqual(only.splitViews,[]);
  assert.deepEqual(only.paneSizes,[1]);
  assert.deepEqual(state,before);
});

Then('comparison tab kinds survive transfer rename reload and reconciliation',function(){
  const normalize=value=>normalizeWorkspace({version:1,repositories:{repo:value}}).repositories.repo;
  const comparison=diffTab('src/main.ts');
  const value={...repository(),tabs:['src/main.ts',comparison,'README.md'],activeFile:'src/main.ts',fileDiffOpen:true,
    splitViews:[split('right','other.txt',11)]};
  const state=normalize(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(state,value);assert.equal(activePaneTab(state),comparison);
  assert.equal(tabFile(comparison),'src/main.ts');
  const moved=moveWorkspaceTab(state,'primary','right',comparison,1);
  assert.deepEqual(moved.tabs,['src/main.ts','README.md']);assert.equal(moved.fileDiffOpen,false);
  assert.deepEqual(moved.splitViews[0].tabs,['other.txt',comparison]);
  assert.equal(moved.splitViews[0].file,'src/main.ts');assert.equal(moved.splitViews[0].diffOpen,true);
  assert.deepEqual(normalize(moved),moved);
  const renamed=renameRepositoryWorkspace(moved,'src','lib');
  assert.deepEqual(renamed.splitViews[0].tabs,['other.txt',diffTab('lib/main.ts')]);
  assert.equal(renamed.splitViews[0].file,'lib/main.ts');
  const pruned=reconcileRepositoryWorkspace(renamed,['README.md','other.txt']);
  assert.deepEqual(pruned.splitViews[0].tabs,['other.txt']);assert.equal(pruned.splitViews[0].diffOpen,undefined);
  const promoted=reconcileRepositoryWorkspace({...moved,tabs:['gone'],activeFile:'gone'},['src/main.ts','other.txt']);
  assert.deepEqual(promoted.tabs,['other.txt',comparison]);assert.equal(promoted.fileDiffOpen,true);
  assert.equal(promoted.activeFile,'src/main.ts');assert.deepEqual(promoted.splitViews,[]);
  assert.deepEqual(normalize({...repository(),fileDiffOpen:true}).tabs,['src/main.ts','README.md',diffTab('README.md')]);
});

Then('staged comparison tabs survive moves reload and staged deletions',function(){
  const normalize=value=>normalizeWorkspace({version:1,repositories:{repo:value}}).repositories.repo;
  const staged=diffTab('src/main.ts',true),working=diffTab('src/main.ts');
  const value={...repository(),tabs:['src/main.ts',working,staged,'README.md'],activeFile:'src/main.ts',fileDiffOpen:true,stagedDiffOpen:true,
    splitViews:[split('right','other.txt',11)]};
  const state=normalize(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(state,value);assert.equal(activePaneTab(state),staged);
  assert.equal(tabFile(staged),'src/main.ts');assert.equal(tabLabel(staged),'main.ts (staged diff)');
  const moved=moveWorkspaceTab(state,'primary','right',staged,1);
  assert.equal(activePaneTab(moved),'README.md');assert.equal(moved.stagedDiffOpen,undefined);
  assert.equal(activePaneTab(moved.splitViews[0]),staged);
  assert.deepEqual(normalize(moved),moved);
  const renamed=renameRepositoryWorkspace(moved,'src','lib');
  assert.equal(activePaneTab(renamed.splitViews[0]),diffTab('lib/main.ts',true));
  const deleted=reconcileRepositoryWorkspace(state,['README.md','other.txt']);
  assert.deepEqual(deleted.tabs,[staged,'README.md']);assert.equal(activePaneTab(deleted),staged);
  assert.deepEqual(deleted.documents['src/main.ts'],state.documents['src/main.ts']);
  assert.deepEqual(normalize(deleted),deleted);
  const promoted=reconcileRepositoryWorkspace({...moved,tabs:['gone'],activeFile:'gone'},[]);
  assert.deepEqual(promoted.tabs,[staged]);assert.equal(activePaneTab(promoted),staged);assert.deepEqual(promoted.splitViews,[]);
  const returned=moveWorkspaceTab(moved,'right','primary',staged,1);
  assert.equal(activePaneTab(returned),staged);assert.equal(returned.splitViews[0].stagedDiffOpen,undefined);
  assert.deepEqual(normalize(returned),returned);
  assert.equal(activePaneTab(normalize({...value,fileDiffOpen:false})),'src/main.ts');
});

Then('explorer widths normalize without changing default workspace layouts',function(){
  const base={version:1,repositoryId:'',page:'editor',repositories:{}};
  assert.deepEqual(normalizeWorkspace(base),base);
  assert.equal(normalizeWorkspace({...base,explorerWidth:320.4}).explorerWidth,320);
  assert.equal(normalizeWorkspace({...base,explorerWidth:1}).explorerWidth,160);
  assert.equal(normalizeWorkspace({...base,explorerWidth:9999}).explorerWidth,600);
  for(const explorerWidth of [null,'320',NaN,Infinity])assert.deepEqual(normalizeWorkspace({...base,explorerWidth}),base);
});

Then('Git pane widths normalize without changing default workspace layouts',function(){
  const base={version:1,repositoryId:'',page:'editor',repositories:{}};
  assert.deepEqual(normalizeWorkspace(base),base);
  assert.equal(normalizeWorkspace({...base,gitPaneWidth:600.4}).gitPaneWidth,600);
  assert.equal(normalizeWorkspace({...base,gitPaneWidth:1}).gitPaneWidth,320);
  assert.equal(normalizeWorkspace({...base,gitPaneWidth:9999}).gitPaneWidth,1600);
  for(const gitPaneWidth of [null,'600',NaN,Infinity])assert.deepEqual(normalizeWorkspace({...base,gitPaneWidth}),base);
  for (const rightPane of ['git', 'ai']) {
    const layout = normalizeWorkspace({...base, rightPane, aiPaneWidth: 480, gitPaneWidth: 720});
    assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(layout))), layout);
    assert.equal(layout.rightPane, rightPane);
    assert.equal(layout.aiPaneWidth, 480);
  }
  assert.equal(normalizeWorkspace({...base, aiPaneWidth: 1}).aiPaneWidth, 320);
  assert.equal(normalizeWorkspace({...base, aiPaneWidth: 9999}).aiPaneWidth, 640);
  for (const aiPaneWidth of [null, '480', NaN, Infinity]) assert.deepEqual(normalizeWorkspace({...base, aiPaneWidth}), base);
  assert.deepEqual(normalizeWorkspace({...base, rightPane: 'invalid'}), base);
  const stored=normalizeWorkspace({...base,gitPaneWidth:720,explorerWidth:300});
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(stored))),stored);
});

Then('both right panes survive reload and their widths keep room for the editor',function(){
  const base={version:1,repositoryId:'',page:'editor',repositories:{}};
  const state=normalizeWorkspace({...base,rightPanes:['git','ai','git','bad'],aiPaneWidth:480,gitPaneWidth:720});
  assert.deepEqual(state.rightPanes,['git','ai']);assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(state))),state);
  assert.deepEqual(normalizeWorkspace({...state,rightPanes:['ai']}).rightPanes,['ai']);
  for(const available of [1000,1200,1600,2000]){
    const widths=rightDockWidths(available,{ai:640,git:1600});assert.ok(widths.ai>=320);assert.ok(widths.git>=320);assert.ok(available-widths.ai-widths.git>=320);
  }
  assert.deepEqual(rightDockWidths(1600,{ai:380,git:320}),{ai:380,git:320,history:0,vault:0,resources:0,settings:0});
});

Then("History migrates into the independent dock and three pane widths preserve the editor", function () {
  const legacy = {version:1,repositoryId:"first",page:"history",rightPane:"ai",repositories:{first:repository()}};
  const migrated = normalizeWorkspace(legacy);
  assert.equal(migrated.page,"editor");
  assert.deepEqual(migrated.rightPanes,["ai","history"]);
  assert.equal(migrated.repositories.first.scroll.history,200);
  const state = normalizeWorkspace({...migrated,rightPanes:["history","git","ai","history"],historyPaneWidth:520});
  assert.deepEqual(state.rightPanes,["history","git","ai"]);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(state))),state);
  for (const available of [1280,1400,1800,2400]) {
    const widths = rightDockWidths(available,{history:520,git:640,ai:480});
    for (const pane of ["history","git","ai"]) assert.ok(widths[pane]>=320);
    assert.ok(Object.values(widths).reduce((sum,width)=>sum+width,320)<=available);
  }
  assert.deepEqual(rightDockWidths(1200,{history:440}),{history:440,git:0,ai:0,vault:0,resources:0,settings:0});
  assert.equal(rightDockWidths(800,{history:440}).history,440);
});

Then('the resized dock pane receives its requested width before neighbours share the remaining space',function(){
  const preferred={history:354,git:328,ai:341,vault:373,resources:362};
  const result=rightDockWidths(2048,preferred,'vault');
  assert.equal(result.vault,373);assert.ok(result.ai<341);assert.ok(result.resources<362);
  assert.ok(Object.keys(preferred).every(pane=>result[pane]>=320));
  assert.ok(Object.values(result).reduce((sum,width)=>sum+width,320)<=2048);
  assert.deepEqual(rightDockWidths(2048,{history:440},'vault'),rightDockWidths(2048,{history:440}));
  const input={version:1,repositoryId:'',page:'editor',repositories:{},explorerOpen:false,rightPanes:['history','git','ai','vault','resources']};
  for(const available of [320,600,1280,1920,2048,2400,3200]){
    const fitted=fitWorkspacePanes(available,input),editorMinimum=Math.min(320,available/2);
    const preferred=Object.fromEntries(fitted.rightPanes.map(pane=>[pane,pane==='ai'||pane==='vault'?640:1600]));
    const base=rightDockWidths(available,preferred),minimum=Math.min(320,available/(fitted.rightPanes.length+1));
    for(const pane of fitted.rightPanes){
      const request=base[pane]+48,cap=pane==='ai'||pane==='vault'?640:1600;
      const maximum=Math.min(cap,available-editorMinimum-minimum*(fitted.rightPanes.length-1));
      // Only visible panes participate in the width calculation.
      const visible=Object.fromEntries(fitted.rightPanes.map(key=>[key,base[key]]));
      const widths=rightDockWidths(available,{...visible,[pane]:request},pane);
      assert.equal(widths[pane],Math.min(request,maximum));
      for(const key of fitted.rightPanes)assert.ok(widths[key]>=Math.floor(minimum));
      assert.ok(Object.values(widths).reduce((sum,width)=>sum+width,editorMinimum)<=available);
    }
  }
});

Then('Settings migrate into an independent pane with durable widths and opening priority',function(){
  const legacy={version:1,repositoryId:'first',page:'settings',rightPane:'ai',repositories:{first:repository()}};
  const migrated=normalizeWorkspace(legacy);
  assert.equal(migrated.page,'editor');assert.deepEqual(migrated.rightPanes,['ai','settings']);
  assert.equal(migrated.repositories.first.scroll.settings,300);
  const base={...migrated,rightPanes:['history','git','ai','vault','resources','settings','settings'],paneOrder:['explorer','history','git','ai','vault','resources','settings'],settingsPaneWidth:640.4};
  const stored=normalizeWorkspace(base);
  assert.equal(stored.settingsPaneWidth,640);assert.equal(stored.paneOrder.at(-1),'settings');
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(stored))),stored);
  assert.equal(normalizeWorkspace({...base,settingsPaneWidth:10}).settingsPaneWidth,320);
  assert.equal(normalizeWorkspace({...base,settingsPaneWidth:2000}).settingsPaneWidth,1600);
  assert.equal(normalizeWorkspace({...base,settingsPaneWidth:NaN}).settingsPaneWidth,undefined);
  for(const available of [320,600,1280,2400,3200]){
    const fitted=fitWorkspacePanes(available,stored,'settings');
    assert.ok(fitted.rightPanes.includes('settings'));
    const explorer=fitted.explorerOpen?explorerDockWidth(available,fitted.rightPanes.length):0;
    const preferred=Object.fromEntries(fitted.rightPanes.map(pane=>[pane,480]));
    const widths=rightDockWidths(available-explorer,preferred,'settings');
    assert.ok(widths.settings>0);
    assert.ok(available-explorer-Object.values(widths).reduce((sum,width)=>sum+width,0)>=Math.min(320,(available-explorer)/2));
  }
  assert.equal(rightDockWidths(1600,{ai:380,settings:720},'settings').settings,720);
  assert.deepEqual(fitWorkspacePanes(600,stored,'settings').rightPanes,['settings']);
});

Then('Settings sections and per-section scroll positions normalize and persist independently',function(){
  const repo={...repository(),settingsScroll:{appearance:220.5,editor:340,remotes:-20,controls:Infinity,unknown:900}};
  const state=normalizeWorkspace({version:1,repositoryId:'first',page:'editor',settingsTab:'formatting',repositories:{first:repo}});
  assert.equal(state.settingsTab,'formatting');assert.deepEqual(state.repositories.first.settingsScroll,{appearance:220.5,editor:340,controls:0,remotes:0});
  assert.equal(settingsScrollTop(state.repositories.first,'editor'),340);assert.equal(settingsScrollTop(state.repositories.first,'formatting'),0);
  assert.equal(settingsScrollTop(repository(),'appearance'),300);assert.equal(settingsScrollTop(repository(),'editor'),0);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(state))),state);
  assert.equal(normalizeWorkspace({...state,settingsTab:'invalid'}).settingsTab,undefined);
  const renamed=renameRepositoryWorkspace(state.repositories.first,'src','lib');assert.deepEqual(renamed.settingsScroll,state.repositories.first.settingsScroll);
  assert.deepEqual(reconcileRepositoryWorkspace(state.repositories.first,['src/main.ts']).settingsScroll,state.repositories.first.settingsScroll);
  assert.equal(normalizeWorkspace(null).settingsTab,undefined);
});
