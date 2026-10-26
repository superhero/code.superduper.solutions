// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { activateInstalledPackage, DEFAULT_SETTINGS, PALETTES, LANGUAGES, normalizeOverrides, normalizeSettings, resolveSettings, languageForPath } from "./settings.ts";

Then('retired pane visibility preferences are discarded from saved settings',()=>{
  const retired={showCommitHistoryButton:false,showGitButton:false,showStagedHistoryButton:false};
  const store=normalizeSettings({version:1,global:{...retired,showRedoButton:false},repositories:{local:{...retired,showUndoButton:false}},files:{local:{'file.js':{...retired,indentSize:4}}}});
  for(const key of Object.keys(retired))for(const value of [DEFAULT_SETTINGS,store.global,store.repositories.local,resolveSettings(store,'local','file.js')])assert.equal(Object.hasOwn(value,key),false);
  assert.deepEqual(normalizeOverrides(retired),{});
  assert.equal(store.global.showRedoButton,false);assert.equal(store.repositories.local.showUndoButton,false);
  assert.equal(Object.hasOwn(store,'files'),false);
});

Then('{word} minimap defaults off independently and preserves scoped preferences', view => {
  const key = `${view.toLowerCase()}Minimap`;
  assert.ok(['settingsMinimap', 'historyMinimap'].includes(key));
  const other = key === 'settingsMinimap' ? 'historyMinimap' : 'settingsMinimap';
  assert.equal(DEFAULT_SETTINGS.minimap, true);
  assert.equal(DEFAULT_SETTINGS[key], false);
  for (const global of [{}, { minimap: true, [other]: true }, { minimap: false, [other]: true }])
    assert.equal(normalizeSettings({ version: 1, global }).global[key], false);
  assert.deepEqual(normalizeOverrides({ [key]: 'true' }), {});
  assert.deepEqual(normalizeOverrides({ [key]: false }), { [key]: false });
  const store = normalizeSettings({ version: 1, global: { minimap: false, [key]: true, [other]: false },
    repositories: { local: { [key]: false } },
    files: { local: { 'file.js': { [key]: true } } } });
  assert.equal(resolveSettings(store, 'other')[key], true);
  assert.equal(resolveSettings(store, 'other')[other], false);
  assert.equal(resolveSettings(store, 'other').minimap, false);
  assert.equal(resolveSettings(store, 'local', 'file.js')[key], false);
  assert.equal(Object.hasOwn(store,'files'),false);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(store))), store);
});

Then('AI input settings preserve defaults and repository inheritance', () => {
  const defaults = normalizeSettings({});
  assert.equal(defaults.global.showAISendButton, false); assert.equal(defaults.global.aiEnterAction, 'send');
  assert.deepEqual(normalizeOverrides({showAISendButton:'true',aiEnterAction:'invalid'}), {});
  const settings = normalizeSettings({version:1,global:{showAISendButton:true,aiEnterAction:'newline'},
    repositories:{local:{showAISendButton:false,aiEnterAction:'send'}},files:{local:{'file.ts':{showAISendButton:true,aiEnterAction:'newline'}}}});
  assert.equal(resolveSettings(settings,'other').showAISendButton,true); assert.equal(resolveSettings(settings,'other').aiEnterAction,'newline');
  assert.equal(resolveSettings(settings,'local','file.ts').showAISendButton,false); assert.equal(resolveSettings(settings,'local','file.ts').aiEnterAction,'send');
  assert.equal(Object.hasOwn(settings,'files'),false);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(settings))),settings);
});

Then(/^persisted settings (.+) resolve to clean defaults$/, function (input) {
  const normalized = normalizeSettings(JSON.parse(input));
  assert.deepEqual(normalized, { version: 1, global: DEFAULT_SETTINGS, repositories: {} });
  assert.notEqual(normalized.global, DEFAULT_SETTINGS);
});

Then(/^the override record (.+) is discarded$/, function (input) {
  assert.deepEqual(normalizeOverrides(JSON.parse(input)), {});
});

Then("valid editor preferences survive normalization as a fresh object", function () {
  const input = { ...DEFAULT_SETTINGS, palette: PALETTES.at(-1), mode: "system", fontFamily: "courier", interfaceFont: "serif", interfaceSize: "large",
    tabBehavior: "indent", indentWithTabs: true, lineWrapping: true, lineNumbers: false,
    foldGutter: false, highlightActiveLine: false, bracketMatching: false, closeBrackets: false,
    autocomplete: false, indentOnInput: false, highlightWhitespace: true, readOnly: true,
    languageMappings: {".sample":LANGUAGES.at(-1)}, unknownPreference: "discard me" };
  const before = structuredClone(input);
  const expected = { ...input };
  delete expected.unknownPreference;
  const normalized = normalizeOverrides(input);
  assert.deepEqual(normalized, expected);
  assert.notEqual(normalized, input);
  assert.deepEqual(input, before);
});

Then("legacy global Tab preferences migrate once while preserving other settings and scoped choices", function () {
  const input = {
    global: { ...DEFAULT_SETTINGS, tabBehavior: "focus", palette: "sunset", mode: "dark", fontSize: 19 },
    repositories: { first: { tabBehavior: "focus", indentSize: 4 } },
    files: { second: { "notes.txt": { tabBehavior: "focus", lineWrapping: true } } }
  };
  const before = structuredClone(input);
  const store = normalizeSettings(input);
  assert.equal(store.version, 1);
  assert.deepEqual(store.global, { ...input.global, tabBehavior: "indent" });
  assert.deepEqual(store.repositories, input.repositories);
  assert.equal(Object.hasOwn(store,'files'),false);
  assert.equal(resolveSettings(store, "first").tabBehavior, "focus");
  assert.equal(resolveSettings(store, "second", "notes.txt").tabBehavior, "indent");
  assert.equal(resolveSettings(store, "second", "other.txt").tabBehavior, "indent");
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(store))), store);
  assert.deepEqual(input, before);
});

Then("versioned Tab focus preferences survive normalization and serialization", function () {
  const store = normalizeSettings({ version: 1, global: { tabBehavior: "focus" },
    repositories: { first: { tabBehavior: "indent" } },
    files: { first: { "notes.txt": { tabBehavior: "focus" } } } });
  assert.equal(store.global.tabBehavior, "focus");
  assert.equal(resolveSettings(store, "first").tabBehavior, "indent");
  assert.equal(resolveSettings(store, "first", "notes.txt").tabBehavior, "indent");
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(store))), store);
});

Then("malformed editor preference fields are discarded", function () {
  assert.deepEqual(normalizeOverrides({ palette: "nonexistent", mode: 12, fontFamily: "remote-font", interfaceFont: "remote-font", interfaceSize: "huge",
    tabBehavior: "execute", language: "unknown", fontSize: Infinity, lineHeight: NaN,
    indentSize: "4", tabSize: null, lineWrapping: "true", readOnly: 1 }), {});
  const inherited = normalizeSettings({ global: { fontSize: 19, readOnly: true },
    repositories: { first: { fontSize: "broken", readOnly: false } } });
  assert.equal(resolveSettings(inherited, "first").fontSize, 19);
  assert.equal(resolveSettings(inherited, "first").readOnly, false);
});

Then("preference {string} with value {float} normalizes to {float}", function (property, input, expected) {
  assert.deepEqual(normalizeOverrides({ [property]: input }), { [property]: expected });
});

Then(/^repository preference collection (.+) is ignored$/, function (input) {
  const normalized = normalizeSettings({ global: { fontSize: 16 }, repositories: JSON.parse(input) });
  assert.equal(normalized.global.fontSize, 16);
  assert.deepEqual(normalized.repositories, {});
});

Then("repository preferences inherit global changes without leaking between repositories", function () {
  const store = normalizeSettings({ global: { fontSize: 16, mode: "dark" },
    repositories: { first: { fontSize: 20 }, second: { lineWrapping: true }, invalid: false } });
  const before = structuredClone(store);
  assert.deepEqual(resolveSettings(store), store.global);
  assert.deepEqual(resolveSettings(store, "missing"), store.global);
  assert.deepEqual(resolveSettings(store, ""), store.global);
  assert.equal(resolveSettings(store, "first").fontSize, 20);
  assert.equal(resolveSettings(store, "first").mode, "dark");
  assert.equal(resolveSettings(store, "second").fontSize, 16);
  assert.equal(resolveSettings(store, "second").lineWrapping, true);
  assert.deepEqual(store, before);
  store.global.fontSize = 18;
  assert.equal(resolveSettings(store, "first").fontSize, 20);
  assert.equal(resolveSettings(store, "second").fontSize, 18);
  delete store.repositories.first.fontSize;
  assert.equal(resolveSettings(store, "first").fontSize, 18);
  const resolved = resolveSettings(store, "first");
  resolved.mode = "light";
  assert.equal(store.global.mode, "dark");
});

Then("prototype-related repository keys are removed from persisted settings", function () {
  const input = JSON.parse('{"repositories":{"__proto__":{"fontSize":30},"constructor":{"fontSize":30},"prototype":{"fontSize":30},"safe":{"fontSize":18}}}');
  const store = normalizeSettings(input);
  assert.deepEqual(Object.keys(store.repositories), ["safe"]);
  assert.equal(Object.getPrototypeOf(store.repositories), Object.prototype);
  assert.equal({}.fontSize, undefined);
  assert.equal(resolveSettings(store, "safe").fontSize, 18);
});

Then(/^file preference collection (.+) is ignored$/, function (input) {
  assert.equal(Object.hasOwn(normalizeSettings({ files: JSON.parse(input) }),"files"),false);
});

Then("legacy file overrides are discarded while global and repository preferences survive", function () {
  const input = {version:1,global:{indentSize:2,readOnly:false},repositories:{first:{indentSize:3}},
    files:JSON.parse('{"__proto__":{},"constructor":{},"first":{"notes.txt":{"indentSize":8,"readOnly":true},"__proto__":{"tabSize":12}}}')};
  const before=structuredClone(input),store=normalizeSettings(input);
  assert.equal(Object.hasOwn(store,'files'),false);assert.equal(store.global.indentSize,2);
  assert.deepEqual(store.repositories.first,{indentSize:3});
  assert.equal(resolveSettings(store,'first','notes.txt').indentSize,3);
  assert.equal(resolveSettings(store,'first','notes.txt').readOnly,false);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(store))),store);
  assert.deepEqual(input,before);assert.equal({}.tabSize,undefined);
});

Then("EditorConfig resolves over repository defaults without legacy file overrides", function () {
  const store = normalizeSettings({ global: { indentSize: 2, fontSize: 16 },
    repositories: { first: { indentSize: 3 } }, files: { first: { "notes.txt": { indentSize: 5 } } } });
  const before = structuredClone(store);
  assert.equal(resolveSettings(store, "first", "notes.txt", { indentSize: 4 }).indentSize, 4);
  assert.equal(resolveSettings(store, "first", "other.txt", { indentSize: 4 }).indentSize, 4);
  assert.equal(resolveSettings(store, "first", "other.txt").indentSize, 3);
  assert.equal(resolveSettings(store, "missing", "notes.txt").indentSize, 2);
  assert.equal(resolveSettings(store, undefined, "notes.txt", { indentSize: 4 }).indentSize, 4);
  assert.equal(resolveSettings(store, "first", undefined, { indentSize: 4 }).indentSize, 3);
  assert.equal(resolveSettings(store, "first", "", { indentSize: 4 }).indentSize, 3);
  assert.equal(resolveSettings(store, "first", "notes.txt").fontSize, 16);
  assert.deepEqual(store, before);
  const legacy={...store,files:{first:{"notes.txt":{indentSize:8}}}};
  assert.equal(resolveSettings(legacy,"first","notes.txt").indentSize,3);
  assert.equal(resolveSettings(store, "first", "notes.txt", { indentSize: 4 }).indentSize, 4);
});

Then("{string} selects the {string} syntax mode automatically", function (path, language) {
  assert.equal(languageForPath(path, "auto"), language);
});

Then("legacy language overrides cannot force a language for unrelated filenames", function () {
  const store=normalizeSettings({global:{language:"python"},repositories:{one:{language:"javascript"}},files:{one:{"test.txt":{language:"markdown"}}}});
  assert.ok(!Object.hasOwn(store.global,"language"));assert.deepEqual(store.repositories.one,{});assert.equal(Object.hasOwn(store,"files"),false);
  assert.equal(languageForPath("test.txt","auto",resolveSettings(store,"one","test.txt").languageMappings),"text");
});

Then("zero and mixed indentation settings create valid editor states", async function () {
  const { EditorState } = await import("@codemirror/state");
  const { indentUnit, getIndentation } = await import("@codemirror/language");
  const { indentationExtensions } = await import("./indentation.ts");
  for (const indentWithTabs of [false, true]) {
    for (const indentSize of [0, 3, 12]) {
      for (const tabSize of [0, 2, 12]) {
        const state = EditorState.create({ doc: "text", extensions: indentationExtensions(
          { indentWithTabs, indentSize, tabSize }) });
        assert.equal(state.tabSize, Math.max(1, tabSize));
        assert.ok(state.facet(indentUnit).length > 0);
        if (indentSize === 0) assert.equal(getIndentation(state, 0), 0);
      }
    }
  }
});

Then("installed packages activate their personal settings without changing repository overrides", function () {
  const original=normalizeSettings({repositories:{one:{syntaxPackages:{hcl:false},languageEngines:{typescript:'none'},formatters:{javascript:'none'}}}});
  let store=activateInstalledPackage(original,'syntax','hcl');
  assert.equal(store.global.syntaxPackages.hcl,true);
  store=activateInstalledPackage(store,'syntax','handlebars-beta');
  assert.equal(store.global.syntaxPackages.handlebars,true);
  assert.equal(store.global.syntaxPackages['handlebars-beta'],true);
  store=activateInstalledPackage(store,'engine','typescript');
  assert.equal(store.global.languageEngines.javascript,'typescript');
  assert.equal(store.global.languageEngines.typescript,'typescript');
  store=activateInstalledPackage(store,'formatter','dprint-typescript');
  for(const language of ['javascript','typescript','jsx','tsx'])assert.equal(store.global.formatters[language],'dprint-typescript');
  assert.equal(resolveSettings(store,'one').syntaxPackages.hcl,false);
  assert.equal(resolveSettings(store,'one').languageEngines.typescript,'none');
  assert.equal(resolveSettings(store,'one').formatters.javascript,'none');
  assert.deepEqual(original.global.syntaxPackages,DEFAULT_SETTINGS.syntaxPackages);
  assert.equal(activateInstalledPackage(store,'engine','unknown'),store);
});

Then("package defaults select the first provider without replacing explicit choices", function () {
  const store=normalizeSettings({global:{formatters:{yaml:'none'},languageEngines:{typescript:'none'},syntaxPackages:{hcl:false}}});
  assert.equal(store.global.formatters.yaml,'none');
  assert.equal(store.global.languageEngines.typescript,'none');
  assert.equal(store.global.syntaxPackages.hcl,false);
  assert.equal(store.global.syntaxPackages['handlebars-beta'],false);
  assert.equal(store.global.formatters.javascript,'dprint-typescript');
  assert.equal(store.global.languageEngines.javascript,'typescript');
  assert.equal(normalizeSettings(null).global.syntaxPackages.hcl,true);
});

Then("cataloged Google editor fonts survive settings validation without arbitrary families", async function () {
  const {editorFonts, fontStylesheet, editorFontStack} = await import("./fonts.ts");
  assert.ok(editorFonts.length >= 45);
  assert.ok(!editorFonts.some(font => font.family === "Monofett"));
  assert.ok(!editorFonts.some(font => font.family === "Sixtyfour Convergence"));
  for (const font of editorFonts) {
    const key = `google:${font.family}`;
    assert.equal(normalizeOverrides({fontFamily:key}).fontFamily,key);
    assert.ok(fontStylesheet(key).startsWith("https://fonts.googleapis.com/css2?family="));
    assert.ok(editorFontStack(key).includes(font.family));
  }
  assert.deepEqual(normalizeOverrides({fontFamily:"google:Not a catalog font"}),{});
});

Then("fresh editor defaults use bundled JetBrains Mono at thirteen pixels without replacing saved choices", async function () {
  const {isBundledEditorFont} = await import("./fonts.ts");
  assert.equal(DEFAULT_SETTINGS.fontFamily,"google:JetBrains Mono");
  assert.equal(DEFAULT_SETTINGS.interfaceFont,"google:Geomini");
  assert.ok(isBundledEditorFont(DEFAULT_SETTINGS.interfaceFont));
  assert.equal(DEFAULT_SETTINGS.fontSize,13);
  assert.ok(isBundledEditorFont(DEFAULT_SETTINGS.fontFamily));
  const existing = normalizeSettings({version:1,global:{fontFamily:"courier",fontSize:19}});
  assert.equal(existing.global.fontFamily,"courier");assert.equal(existing.global.fontSize,19);
});

Then("interface Google font choices include sans-serif and monospace without widening editor fonts", async function () {
  const {interfaceFonts,interfaceFontStack}=await import("./fonts.ts");
  assert.equal(interfaceFonts.length,599);
  for(const family of ["Englebert","Momo Signature","Tirra","Story Script","Kite One","Timmana","Sixtyfour Convergence","Monofett"]) {
    assert.ok(!interfaceFonts.some(font=>font.family===family));
    assert.deepEqual(normalizeOverrides({interfaceFont:`google:${family}`}),{});
  }
  for(const font of interfaceFonts)assert.equal(normalizeOverrides({interfaceFont:`google:${font.family}`}).interfaceFont,`google:${font.family}`);
  assert.equal(normalizeOverrides({interfaceFont:"google:Roboto"}).interfaceFont,"google:Roboto");
  assert.equal(normalizeOverrides({interfaceFont:"google:JetBrains Mono"}).interfaceFont,"google:JetBrains Mono");
  assert.deepEqual(normalizeOverrides({fontFamily:"google:Roboto",interfaceFont:"google:Roboto Slab"}),{});
  assert.ok(interfaceFontStack("google:Roboto").includes("sans-serif"));
  assert.ok(interfaceFontStack("google:JetBrains Mono").includes("monospace"));
});

Then("compact fonts cannot be selected for the interface or editor", async function () {
  const {default:audit}=await import("../../../build/font-width-audit.json",{with:{type:"json"}});
  const {interfaceFonts,editorFonts}=await import("./fonts.ts");
  const excluded=audit.results.filter(font=>font.excluded);
  assert.equal(excluded.length,161);
  for(const {family} of excluded){
    assert.ok(!interfaceFonts.some(font=>font.family===family));
    assert.ok(!editorFonts.some(font=>font.family===family));
    assert.deepEqual(normalizeOverrides({interfaceFont:`google:${family}`,fontFamily:`google:${family}`}),{});
  }
  assert.ok(excluded.some(font=>font.family==="BBH Bartle"));
  assert.deepEqual(normalizeOverrides({interfaceFont:"rationale"}),{});
  assert.equal(normalizeOverrides({interfaceFont:"google:Work Sans"}).interfaceFont,"google:Work Sans");
});

Then("history limits default to three hundred and inherit global and repository bounds", function () {
  assert.equal(normalizeSettings(null).global.historyLimit,300);
  const store=normalizeSettings({global:{historyLimit:2000},repositories:{first:{historyLimit:2500}},
    files:{first:{"one.ts":{historyLimit:0},"two.ts":{historyLimit:10001},"three.ts":{historyLimit:-1}}}});
  assert.equal(resolveSettings(store,"first","one.ts").historyLimit,2500);
  assert.equal(resolveSettings(store,"first","two.ts").historyLimit,2500);
  assert.equal(resolveSettings(store,"first","three.ts").historyLimit,2500);
  assert.equal(resolveSettings(store,"first","other.ts").historyLimit,2500);
  assert.equal(resolveSettings(store,"second","other.ts").historyLimit,2000);
  assert.equal(normalizeSettings({global:{historyLimit:NaN}}).global.historyLimit,300);
  assert.equal(normalizeSettings({global:{historyLimit:10001}}).global.historyLimit,10000);
  assert.equal(resolveSettings(normalizeSettings({repositories:{first:{historyLimit:-1}}}),"first").historyLimit,0);
  assert.equal(normalizeSettings({global:{historyLimit:12.7}}).global.historyLimit,13);
});
Then('keybinding choices preserve disabled commands and repository overrides',async function(){
  const {normalizeKeybindings,shortcutsFor}=await import('./keybindings.ts');
  assert.deepEqual(normalizeKeybindings({undo:['Shift-Mod-Z','Mod-Shift-z'],redo:[],unknown:['Mod-a'],find:['broken-key-name']}),{undo:['Mod-Shift-z'],redo:[]});
  const store=normalizeSettings({global:{keybindings:{undo:['F9'],find:['Mod-F']}},repositories:{first:{keybindings:{find:[]}}},files:{first:{'one.ts':{keybindings:{undo:['F8']}}}}});
  const resolved=resolveSettings(store,'first','one.ts');
  assert.deepEqual(resolved.keybindings,{undo:['F9'],find:[]});
  assert.deepEqual(shortcutsFor('undo',resolved.keybindings),['F9']);
  assert.deepEqual(shortcutsFor('find',resolved.keybindings),[]);
  assert.deepEqual(shortcutsFor('redo',resolved.keybindings,false),['Mod-Shift-z','Mod-y']);
  assert.deepEqual(normalizeSettings(store),store);
});
Then('shortcut matching distinguishes modifiers contexts and conflicting actions',async function(){
  const {eventShortcut,matchesShortcut,shortcutConflict,normalizeShortcut}=await import('./keybindings.ts');
  const event={key:'Z',ctrlKey:true,metaKey:false,altKey:false,shiftKey:true};
  assert.equal(eventShortcut(event,false),'Mod-Shift-z');
  assert.equal(matchesShortcut(event,'Mod-Shift-z',false),true);
  assert.equal(matchesShortcut(event,'Mod-z',false),false);
  assert.equal(matchesShortcut({...event,ctrlKey:false,metaKey:true},'Mod-Shift-z',true),true);
  assert.equal(shortcutConflict('find','Ctrl-z',{},false),'Undo');
  assert.equal(shortcutConflict('find','Ctrl-z',{undo:[]},false),null);
  assert.equal(shortcutConflict('acceptCompletion','Tab',{},false),null);
  assert.equal(normalizeShortcut('Mod--'),'Mod--');
  assert.equal(normalizeShortcut('Mod-Unknown-Key'),null);
  assert.equal(normalizeShortcut('Ctrl-Ctrl-a'),null);
});

Then('middle click closes only the pointed tab when its binding is enabled',async function(){
  const {normalizeKeybindings,shortcutsFor,middleClickClosesTab,shortcutLabel}=await import('./keybindings.ts');
  const event={button:1,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false};
  const settings={keybindings:{},middleClickClosesTabs:true};
  assert.deepEqual(shortcutsFor('closeTab',{}),['MouseMiddle']);
  assert.equal(shortcutLabel(['MouseMiddle']),'Middle click');
  assert.equal(middleClickClosesTab(settings,event),true);
  assert.equal(middleClickClosesTab(settings,{...event,button:0}),false);
  assert.equal(middleClickClosesTab(settings,{...event,shiftKey:true}),false);
  assert.equal(middleClickClosesTab({...settings,keybindings:{closeTab:[]}},event),false);
  assert.equal(middleClickClosesTab({...settings,keybindings:{closeTab:['F8']}},event),false);
  assert.equal(middleClickClosesTab({...settings,middleClickClosesTabs:false},event),false);
  assert.equal(middleClickClosesTab({...settings,middleClickClosesTabs:false,keybindings:{closeTab:['MouseMiddle']}},event),true);
  assert.equal(middleClickClosesTab({...settings,keybindings:{closeTab:['Shift-MouseMiddle']}},{...event,shiftKey:true}),true);
  assert.deepEqual(normalizeKeybindings({closeTab:['MouseMiddle','F8'],find:['MouseMiddle']}),{closeTab:['MouseMiddle','F8']});
});

Then('zoom wheel shortcuts are restricted to zoom actions and preserve modifiers',async function(){
  const {normalizeKeybindings,shortcutsFor,matchesShortcut,shortcutLabel}=await import('./keybindings.ts');
  assert.deepEqual(shortcutsFor('zoomIn',{}),['Shift-WheelUp']);
  assert.deepEqual(shortcutsFor('zoomOut',{}),['Shift-WheelDown']);
  assert.deepEqual(normalizeKeybindings({zoomIn:['Shift-WheelUp','F10'],zoomOut:[],find:['WheelUp']}),{zoomIn:['Shift-WheelUp','F10'],zoomOut:[]});
  const event={key:'WheelUp',shiftKey:true,ctrlKey:false,metaKey:false,altKey:false};
  assert.equal(matchesShortcut(event,'Shift-WheelUp'),true);
  assert.equal(matchesShortcut({...event,shiftKey:false},'Shift-WheelUp'),false);
  assert.equal(shortcutLabel(['Shift-WheelUp']),'Shift + Wheel up');
});

Then('toolbar button preference {string} is validated and inherited without file overrides',function(key){
  assert.equal(normalizeSettings({}).global[key],!['showSettingsResetButton','showSettingsKeybindingsResetButton','showAIConnectionsButton'].includes(key));
  for(const invalid of [null,0,'false',[],{}])assert.deepEqual(normalizeOverrides({[key]:invalid}),{});
  const settings=normalizeSettings({global:{[key]:false},repositories:{repo:{[key]:true}},files:{repo:{'main.js':{[key]:false}}}});
  assert.equal(resolveSettings(settings)[key],false);
  assert.equal(resolveSettings(settings,'other')[key],false);
  assert.equal(resolveSettings(settings,'repo')[key],true);
  assert.equal(resolveSettings(settings,'repo','main.js')[key],true);
  assert.equal(Object.hasOwn(settings,'files'),false);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(settings))),settings);
});

Then('new settings match the chosen appearance and typography defaults',function(){
  const expected={mode:'dark',palette:'bonfire',interfaceFont:'google:Geomini',interfaceSize:'medium',
    fontFamily:'google:JetBrains Mono',fontSize:13,lineHeight:1.7,indentWithTabs:false,indentSize:2,tabSize:4};
  const actual=normalizeSettings({}).global;
  for(const [key,value] of Object.entries(expected))assert.equal(actual[key],value,key);
  const saved=normalizeSettings({version:1,global:{mode:'light',palette:'default',tabSize:2}});
  assert.equal(saved.global.mode,'light');assert.equal(saved.global.palette,'default');assert.equal(saved.global.tabSize,2);
});
