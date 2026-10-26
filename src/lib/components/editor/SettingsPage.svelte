<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import type { SettingsTab } from "$lib/editor/settings-tabs";
  import { TOOL_CHOICES } from "$lib/assistant/configuration";
  import SkillsSettings from "$lib/components/assistant/SkillsSettings.svelte";
  import MarkdownComposer from "$lib/components/assistant/MarkdownComposer.svelte";
  import ConnectionsView from "$lib/components/assistant/ConnectionsView.svelte";
  import type { AIConnection } from "$lib/assistant/connections";
  import KeybindingSettings from "./KeybindingSettings.svelte";
  import FontSelect from "./FontSelect.svelte";
  import FilenameMappings from "./FilenameMappings.svelte";
  import SyntaxSettings from "./SyntaxSettings.svelte";
  import EditorColorSettings from "./EditorColorSettings.svelte";
  import LanguageEnginePreferences from "./LanguageEnginePreferences.svelte";
  import TypeLibraryPreferences from "./TypeLibraryPreferences.svelte";
  import LicensesAndNotices from "./LicensesAndNotices.svelte";
  import FormatterPreferences from "./FormatterPreferences.svelte";
  import UpstreamSettings from "./UpstreamSettings.svelte";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import HintButton from "$lib/components/HintButton.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import { activateInstalledPackage, DEFAULT_SETTINGS, PALETTES, resolveSettings, type EditorSettings, type SettingsStore } from "$lib/editor/settings";

  let { settings, tab = "appearance", scope = $bindable("global"), repositoryId, files, disabled = false, vaultRevision = 0, initialAIConnection, onconnectionchange, onconnectionselect, onchange }:
    { settings: SettingsStore; tab?: SettingsTab; scope?: "global" | "repository"; repositoryId?: string; files?: readonly string[] | undefined; disabled?: boolean; vaultRevision?: number; initialAIConnection?: AIConnection | undefined; onconnectionchange(connection?: AIConnection, removed?: string): Promise<void>; onconnectionselect(connection: AIConnection): void; onchange(value: SettingsStore): void } = $props();
  let keybindingSettings: KeybindingSettings | undefined = $state();
  export function resetKeybindings() { if (!disabled) keybindingSettings?.reset(); }
  let sliderValues = $state<Partial<Record<"indentSize" | "tabSize" | "fontSize" | "lineHeight" | "scrollSpeed" | "historyLimit", number>>>({});
  const repositoryScope = $derived(scope === "repository" && Boolean(repositoryId));
  const active = $derived(repositoryScope ? resolveSettings(settings, repositoryId) : settings.global);
  const overrides = $derived(repositoryId ? (settings.repositories[repositoryId] ?? {}) : {});
  const aiToolGroups = [
    { label: "Git tools", tools: TOOL_CHOICES.filter(tool => tool.id.startsWith("git_")) },
    { label: "Repository tools", tools: TOOL_CHOICES.filter(tool => !tool.id.startsWith("git_")) },
  ].map(group => ({ ...group, tools: [...group.tools].sort((a, b) => a.label.localeCompare(b.label, "en")) }));
  $effect(() => {
    if (scope === "repository" && !repositoryId) scope = "global";
  });
  const toolbars: { title: string; groups: { label: string; buttons: { key: keyof EditorSettings; label: string; description: string }[] }[] }[] = [
    { title: "Editor", groups: [
      { label: "History", buttons: [
        { key: "showUndoButton", label: "Undo", description: "Show the Editor toolbar button for undoing the previous action." },
        { key: "showRedoButton", label: "Redo", description: "Show the Editor toolbar button for redoing an undone action." },
      ] },
      { label: "Zoom", buttons: [
        { key: "showZoomInButton", label: "Zoom in", description: "Show the Zoom in button in the Editor toolbar." },
        { key: "showZoomOutButton", label: "Zoom out", description: "Show the Zoom out button in the Editor toolbar." },
      ] },
      { label: "Formatting", buttons: [{ key: "showFormatButton", label: "Format file", description: "Show the button for formatting the current file." }] },
      { label: "Comparison", buttons: [{ key: "showDiffButton", label: "File diff", description: "Show the button for opening the current file diff." }] },
    ] },
    { title: "AI", groups: [
      { label: "Connections", buttons: [
        { key: "showAIConnectionsButton", label: "Connection settings", description: "Show the AI toolbar shortcut to inference connection settings." },
      ] },
    ] },
    { title: "Settings", groups: [
      { label: "History", buttons: [
        { key: "showSettingsUndoButton", label: "Undo", description: "Show the button for undoing changes in the current settings scope." },
        { key: "showSettingsRedoButton", label: "Redo", description: "Show the button for redoing changes in the current settings scope." },
      ] },
      { label: "Reset", buttons: [
        { key: "showSettingsResetButton", label: "Reset settings", description: "Show the button for restoring defaults or inherited values in the current settings scope." },
        { key: "showSettingsKeybindingsResetButton", label: "Reset keybindings", description: "Show the button for resetting shortcuts in the current settings scope." },
      ] },
    ] },
  ];
  const editorOptionGroups: { label: string; options: { key: keyof EditorSettings; label: string; description: string }[] }[] = [
    { label: "Editing", options: [
      { key: "autocomplete", label: "Autocompletion", description: "Offer language and document completions as you type." },
      { key: "indentOnInput", label: "Automatic indentation", description: "Reindent language constructs while typing." },
      { key: "bracketMatching", label: "Bracket matching", description: "Highlight matching brackets near the cursor." },
      { key: "closeBrackets", label: "Close brackets", description: "Insert matching brackets and quotation marks." },
      { key: "readOnly", label: "Read-only editor", description: "Keep code selectable while preventing document edits." },
      { key: "tabBehavior", label: "Tab key", description: "Indent code with Tab; switch off to move keyboard focus." },
      { key: "middleClickClosesTabs", label: "Middle-click closes tabs", description: "Close a file tab with the middle mouse button." },
    ] },
    { label: "Display", options: [
      { key: "editorFooter", label: "Editor footer", description: "Show cursor position, indentation, encoding and language below the editor." },
      { key: "fileExplorerIcons", label: "File explorer icons", description: "Show file and folder symbols in the explorer." },
      { key: "foldGutter", label: "Fold gutter", description: "Show controls for collapsing code blocks. Folding shortcuts remain available." },
      { key: "highlightActiveLine", label: "Highlight active line", description: "Mark the line containing your cursor." },
      { key: "lineNumbers", label: "Line numbers", description: "Show a numbered gutter beside your code." },
      { key: "lineWrapping", label: "Line wrapping", description: "Keep long lines within the editor width." },
      { key: "highlightWhitespace", label: "Show whitespace", description: "Reveal spaces and tabs without changing the file." },
    ] },
    { label: "Minimaps", options: [
      { key: "historyMinimap", label: "History minimap", description: "Show a scrolling overview in History. Off by default." },
      { key: "minimap", label: "Minimap", description: "Show a scrolling overview in editors and comparisons." },
      { key: "settingsMinimap", label: "Settings minimap", description: "Show a scrolling overview in Settings. Off by default." },
    ] },
    { label: "Scrolling", options: [
      { key: "scrollbars", label: "Scrollbars", description: "Show scrollbars alongside minimaps." },
      { key: "smoothScrolling", label: "Smooth scrolling", description: "Ease wheel and minimap keyboard scrolling; respect reduced motion." },
    ] },
  ];

  function change(key: keyof EditorSettings, value: EditorSettings[keyof EditorSettings]) {
    if (repositoryScope && repositoryId) {
      onchange({ ...settings, repositories: { ...settings.repositories, [repositoryId]: { ...overrides, [key]: value } } });
    } else onchange({ ...settings, global: { ...settings.global, [key]: value } });
  }
  function resetSelectionOpacity() {
    if (repositoryScope && repositoryId) {
      const next = { ...overrides }; delete next.selectionOpacity;
      onchange({ ...settings, repositories: { ...settings.repositories, [repositoryId]: next } });
    } else change("selectionOpacity", DEFAULT_SETTINGS.selectionOpacity);
  }
  export function resetAll() {
    if (disabled) return;
    if (repositoryScope && repositoryId) {
      const next = { ...settings.repositories }; delete next[repositoryId];
      onchange({ ...settings, repositories: next });
    } else onchange({ ...settings, global: { ...DEFAULT_SETTINGS } });
  }
  const title = (value: string) => value.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());

</script>

{#snippet fieldTitle(key: keyof EditorSettings, label: string, group = false)}
  <div class="field-title">{#if group}<span id={`setting-${key}-label`}>{label}</span>{:else}<label for={`setting-${key}`}>{label}</label>{/if}
    {#if repositoryScope && Object.hasOwn(overrides, key)}<span class="inherited">Override</span>{/if}
    {#if key === "indentSize" || key === "tabSize" || key === "fontSize" || key === "historyLimit" || (key === "lineHeight" || key === "scrollSpeed")}<span aria-hidden="true">·</span><output for={`setting-${key}`}>{sliderValues[key] ?? active[key]}{key === "historyLimit" ? " changes" : key === "fontSize" ? " px" : (key === "lineHeight" || key === "scrollSpeed") ? "×" : " cols"}</output>{/if}
  </div>
{/snippet}

{#snippet preferenceSwitch(id: string, label: string, description: string, checked: boolean, onchecked: (checked: boolean) => void, settingKey?: keyof EditorSettings)}
  <HintButton {id} label={description} labelAsName={false} {disabled}>
    {#snippet child({ props })}
      {@const { onpointerenter, onpointermove, onpointerleave, onpointerdown, onpointerup, ...switchProps } = props as HTMLAttributes<HTMLElement>}
      <div class="toggle-field" {...{ onpointerenter, onpointermove, onpointerleave, onpointerdown, onpointerup }}>
        <input {...switchProps} type="checkbox" role="switch" {checked} onchange={event => onchecked(event.currentTarget.checked)}/>
        <div>{#if settingKey}{@render fieldTitle(settingKey, label)}{:else}<div class="field-title"><label for={id}>{label}</label></div>{/if}</div>
      </div>
    {/snippet}
  </HintButton>
{/snippet}

{#snippet selectControl(key: keyof EditorSettings, label: string, value: string, items: { value: string; label: string; icon: string }[])}
  <NavigationDropdown matchTriggerWidth id={`setting-${key}`} {label} {value} placeholder={label} {items} {disabled}
    onchange={next => change(key, key === "indentWithTabs" ? next === "tabs" : next)} />
{/snippet}

<section class="settings-page" aria-label="Editor settings">
  <div class="settings-tab-panel" id="settings-section-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" data-settings-section="appearance" hidden={tab !== "appearance"} tabindex="-1">
    <fieldset class="settings-fields" {disabled}><div class="settings-grid">
<section class="settings-card"><div class="card-heading"><MaterialIcon name="palette" /><div><h2>User interface</h2></div></div>
      <div class="field">{@render fieldTitle("mode", "Color mode")}{@render selectControl("mode", "Color mode", active.mode, [{ value: "light", label: "Light", icon: "light_mode" }, { value: "dark", label: "Dark", icon: "dark_mode" }, { value: "system", label: "System", icon: "contrast" }])}</div>
      <div class="field">{@render fieldTitle("palette", "Palette")}{@render selectControl("palette", "Palette", active.palette, PALETTES.map(palette => ({ value: palette, label: title(palette), icon: "palette" })))}<div class="palette-preview" data-palette-preview={active.palette} aria-hidden="true">{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as slot}<span style={`background: var(--palette-${slot})`}></span>{/each}</div></div>
      <div class="field">{@render fieldTitle("interfaceFont", "Interface font")}<FontSelect kind="interface" value={active.interfaceFont} {disabled} onchange={value=>change("interfaceFont",value)} /></div>
      <div class="field">{@render fieldTitle("interfaceSize", "Interface size", true)}
        <div class="size-options" role="radiogroup" aria-labelledby="setting-interfaceSize-label">
          {#each ["small", "medium", "large"] as size}
            <label class="size-option"><input type="radio" name="interfaceSize" value={size} checked={active.interfaceSize === size} onchange={() => change("interfaceSize", size)} /><span>{title(size)}</span></label>
          {/each}
        </div>
      </div>
    </section>
<section class="settings-card"><div class="card-heading"><MaterialIcon name="custom_typography" /><div><h2>Editor typography</h2></div></div>
      <div class="field">{@render fieldTitle("fontFamily", "Editor font")}<FontSelect value={active.fontFamily} {disabled} onchange={value=>change("fontFamily",value)} /></div>
      <div class="field-pair slider-fields"><div class="field">{@render fieldTitle("fontSize", "Font size")}<input id="setting-fontSize" type="range" min="7" max="32" value={active.fontSize} oninput={e => sliderValues.fontSize = Number(e.currentTarget.value)} onchange={e => { change("fontSize", Number(e.currentTarget.value)); delete sliderValues.fontSize; }} /></div><div class="field">{@render fieldTitle("lineHeight", "Line height")}<input id="setting-lineHeight" type="range" min="1.2" max="2.4" step="0.1" value={active.lineHeight} oninput={e => sliderValues.lineHeight = Number(e.currentTarget.value)} onchange={e => { change("lineHeight", Number(e.currentTarget.value)); delete sliderValues.lineHeight; }} /></div></div>

    </section>
<div class="wide"><EditorColorSettings value={repositoryScope ? (overrides.colorMappings ?? {}) : settings.global.colorMappings}
      inherited={repositoryScope ? settings.global.colorMappings : {}} repository={repositoryScope} selectionOpacity={active.selectionOpacity}
      opacityOverride={Object.hasOwn(overrides, "selectionOpacity")} {disabled} onchange={value => change("colorMappings", value)}
      onopacitychange={value => change("selectionOpacity", value)} onresetopacity={resetSelectionOpacity} /></div>
    </div></fieldset>
  </div>
  <div class="settings-tab-panel" id="settings-section-editor" role="tabpanel" aria-labelledby="settings-tab-editor" data-settings-section="editor" hidden={tab !== "editor"} tabindex="-1">
    <fieldset class="settings-fields" {disabled}><div class="settings-grid">
<section class="settings-card wide"><div class="card-heading"><MaterialIcon name="space_bar"/><h2>Indentation</h2></div>
<div class="field">{@render fieldTitle("indentWithTabs", "Indentation")}{@render selectControl("indentWithTabs", "Indentation", active.indentWithTabs ? "tabs" : "spaces", [{ value: "spaces", label: "Spaces", icon: "space_bar" }, { value: "tabs", label: "Tabs", icon: "keyboard_tab" }])}</div>
      <div class="field-pair slider-fields"><div class="field">{@render fieldTitle("indentSize", "Indent size")}<input id="setting-indentSize" type="range" min="0" max="12" step="1" value={active.indentSize} oninput={e => sliderValues.indentSize = Number(e.currentTarget.value)} onchange={e => { change("indentSize", Number(e.currentTarget.value)); delete sliderValues.indentSize; }} /></div><div class="field">{@render fieldTitle("tabSize", "Tab width")}<input id="setting-tabSize" type="range" min="0" max="12" step="1" value={active.tabSize} oninput={e => sliderValues.tabSize = Number(e.currentTarget.value)} onchange={e => { change("tabSize", Number(e.currentTarget.value)); delete sliderValues.tabSize; }} /></div></div>
</section>
<section class="settings-card wide">
  <div class="card-heading"><MaterialIcon name="rule"/><h2>Editor details</h2></div>
  <div class="field">{@render fieldTitle("scrollSpeed", "Scroll speed")}<input id="setting-scrollSpeed" type="range" min="0.25" max="5" step="0.25" value={active.scrollSpeed} oninput={e => sliderValues.scrollSpeed = Number(e.currentTarget.value)} onchange={e => { change("scrollSpeed", Number(e.currentTarget.value)); delete sliderValues.scrollSpeed; }}/></div>
  <div class="option-groups editor-option-groups">
    {#each editorOptionGroups as group}
      <div class="option-group" role="group" aria-label={`Editor ${group.label.toLowerCase()} options`}>
        <div class="option-grid preference-option-grid">
          {#each group.options as toggle}
            {@render preferenceSwitch(`setting-${toggle.key}`, toggle.label, toggle.description,
              toggle.key === "tabBehavior" ? active.tabBehavior === "indent" : Boolean(active[toggle.key]),
              checked => change(toggle.key, toggle.key === "tabBehavior" ? (checked ? "indent" : "focus") : checked), toggle.key)}
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>
    </div></fieldset>
  </div>
  <div class="settings-tab-panel" id="settings-section-languages" role="tabpanel" aria-labelledby="settings-tab-languages" data-settings-section="languages" hidden={tab !== "languages"} tabindex="-1">
<div class="language-panes"><FilenameMappings {files} value={repositoryScope ? (overrides.languageMappings ?? {}) : settings.global.languageMappings}
    inherited={repositoryScope ? settings.global.languageMappings : {}} repository={repositoryScope} {disabled} onchange={value=>change("languageMappings",value)} />
  <SyntaxSettings oninstalled={id=>onchange(activateInstalledPackage(settings,"syntax",id))} {files} mappings={active.languageMappings} value={repositoryScope ? (overrides.syntaxPackages ?? {}) : settings.global.syntaxPackages}
    inherited={settings.global.syntaxPackages} repository={repositoryScope} {disabled} onchange={value=>change("syntaxPackages",value)} /></div>
  <LanguageEnginePreferences oninstalled={id=>onchange(activateInstalledPackage(settings,"engine",id))} {files} mappings={active.languageMappings} value={repositoryScope ? (overrides.languageEngines ?? {}) : settings.global.languageEngines}
    inherited={settings.global.languageEngines} repository={repositoryScope} {disabled} onchange={value=>change("languageEngines",value)} />
  <TypeLibraryPreferences value={repositoryScope?(overrides.typeLibraries??{}):settings.global.typeLibraries}
    inherited={settings.global.typeLibraries} repository={repositoryScope} {disabled} onchange={value=>change("typeLibraries",value)} />
  </div>
  <div class="settings-tab-panel" id="settings-section-formatting" role="tabpanel" aria-labelledby="settings-tab-formatting" data-settings-section="formatting" hidden={tab !== "formatting"} tabindex="-1">
<FormatterPreferences {files} mappings={active.languageMappings} oninstalled={id=>onchange(activateInstalledPackage(settings,"formatter",id))} value={repositoryScope ? (overrides.formatters ?? {}) : settings.global.formatters}
    inherited={settings.global.formatters} repository={repositoryScope} {disabled} onchange={value=>change("formatters",value)} />
  </div>
  <div class="settings-tab-panel" id="settings-section-controls" role="tabpanel" aria-labelledby="settings-tab-controls" data-settings-section="controls" hidden={tab !== "controls"} tabindex="-1">
    <fieldset class="settings-fields" {disabled}><div class="settings-grid">
      <div class="toolbar-cards wide" role="region" aria-label="Toolbar">
        {#each toolbars as toolbar}
          <section class="settings-card" aria-label={`${toolbar.title} toolbar buttons`}>
            <div class="card-heading"><MaterialIcon name="switch"/><h2>{toolbar.title} toolbar</h2></div>
            <div class="option-groups">
              {#each toolbar.groups as group}
                <div class="option-group" role="group" aria-label={`${toolbar.title} ${group.label.toLowerCase()} buttons`}>
                  <div class="option-grid">
                    {#each group.buttons as button}
                      {@render preferenceSwitch(`setting-${button.key}`, button.label, button.description,
                        Boolean(active[button.key]), checked => change(button.key, checked), button.key)}
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </div></fieldset>
<KeybindingSettings bind:this={keybindingSettings} value={repositoryScope ? (overrides.keybindings ?? {}) : settings.global.keybindings}
    inherited={repositoryScope ? settings.global.keybindings : {}} repository={repositoryScope} {disabled} onchange={value=>change("keybindings",value)} />
  </div>
  <div class="settings-tab-panel ai-settings-panel" id="settings-section-ai" role="tabpanel" aria-labelledby="settings-tab-ai" data-settings-section="ai" hidden={tab !== "ai"} tabindex="-1">
    {#if tab === "ai"}<ConnectionsView {vaultRevision} initialConnection={initialAIConnection} onchange={onconnectionchange} onselect={onconnectionselect}/>{/if}
    <fieldset class="settings-fields" {disabled}><div class="settings-grid">
<section class="settings-card wide" aria-labelledby="setting-aiInstructions-label">
      <div class="card-heading"><MaterialIcon name="robot" /><h2 id="setting-aiInstructions-label">System instructions</h2>
        {#if repositoryScope && Object.hasOwn(overrides, "aiInstructions")}<span class="inherited">Override</span>{/if}
      </div>
        {#if tab === "ai"}{#key repositoryScope ? repositoryId : "global"}<div class="ai-instructions"><MarkdownComposer id="setting-aiInstructions" label="System instructions" placeholderText="System instructions" value={active.aiInstructions} enterAction="newline" autoGrow maxLength={16000} {disabled} onchange={value => change("aiInstructions", value)}/></div>{/key}{/if}
    </section>
    <section class="settings-card wide" aria-labelledby="setting-aiSkills-label">
      <div class="card-heading"><MaterialIcon name="school" /><h2 id="setting-aiSkills-label">Skills</h2>
        {#if repositoryScope && Object.hasOwn(overrides, "aiSkills")}<span class="inherited">Override</span>{/if}
      </div>
      <SkillsSettings value={repositoryScope ? overrides.aiSkills ?? {} : settings.global.aiSkills} inherited={repositoryScope ? settings.global.aiSkills : {}} {disabled} onchange={value=>change("aiSkills",value)}/>
    </section>
    <section class="settings-card wide" aria-labelledby="setting-aiTools-label">
      <div class="card-heading"><MaterialIcon name="tools_power_drill" class="mirrored-tool" /><h2 id="setting-aiTools-label">Tools</h2>
        {#if repositoryScope && Object.hasOwn(overrides, "aiTools")}<span class="inherited">Override</span>{/if}
      </div>
        <div class="option-groups" role="group" aria-labelledby="setting-aiTools-label">
          {#each aiToolGroups as group}
            <div class="option-group" role="group" aria-label={`AI ${group.label}`}>
              <div class="option-grid preference-option-grid">
                {#each group.tools as tool}
                  {@render preferenceSwitch(`setting-ai-tool-${tool.id}`, tool.label, tool.description, active.aiTools[tool.id],
                    checked => change("aiTools", { ...active.aiTools, [tool.id]: checked }))}
                {/each}
              </div>
            </div>
          {/each}
        </div>
    </section>
    <section class="settings-card wide" aria-labelledby="ai-message-controls-heading">
      <div class="card-heading"><MaterialIcon name="switch" /><h2 id="ai-message-controls-heading">Message controls</h2></div>
      <div class="option-groups">
        <div class="option-group" role="group" aria-label="AI message controls">
          <div class="option-grid preference-option-grid">
            {@render preferenceSwitch("setting-showAISendButton", "Show Send button", "Show a Send button below the AI message input.",
              active.showAISendButton, checked => change("showAISendButton", checked), "showAISendButton")}
            {@render preferenceSwitch("setting-aiEnterAction", "Send on Enter", "When off, Enter inserts a newline.",
              active.aiEnterAction === "send", checked => change("aiEnterAction", checked ? "send" : "newline"), "aiEnterAction")}
          </div>
        </div>
      </div>
    </section>
    </div></fieldset>
  </div>
  <div class="settings-tab-panel" id="settings-section-remotes" role="tabpanel" aria-labelledby="settings-tab-remotes" data-settings-section="remotes" hidden={tab !== "remotes"} tabindex="-1">
    <fieldset class="settings-fields" {disabled}>
      <section class="settings-card">
        <div class="card-heading"><MaterialIcon name="history"/><h2>Staging history</h2></div>
        <p id="staging-history-description" class="history-description">File edits for Undo/Redo are stored in the IDE’s private Git history. Repository commits are unaffected.</p>
        <div class="field">{@render fieldTitle("historyLimit", "Changes retained per file")}<input id="setting-historyLimit" type="range" aria-describedby="staging-history-description" min="0" max={Math.log1p(10000)} step="any" value={Math.log1p(active.historyLimit)} aria-valuetext={`${sliderValues.historyLimit ?? active.historyLimit} changes`} oninput={e => sliderValues.historyLimit = Math.round(Math.expm1(Number(e.currentTarget.value)))} onchange={e => { change("historyLimit", Math.round(Math.expm1(Number(e.currentTarget.value)))); delete sliderValues.historyLimit; }}/></div>
      </section>
    </fieldset>
    <UpstreamSettings {disabled}/>
  </div>
  <div class="settings-tab-panel" id="settings-section-licenses" role="tabpanel" aria-labelledby="settings-tab-licenses" data-settings-section="licenses" hidden={tab !== "licenses"} tabindex="-1">
    <LicensesAndNotices/>
  </div>
</section>

<style>
  :global(.mirrored-tool) { transform:scaleX(-1); }
  .settings-tab-panel[hidden] { display:none; }
  .ai-settings-panel { display:grid; gap:var(--pane-gap); }
  .settings-tab-panel > :global(:first-child) { margin-top:0; }
  .toolbar-cards, .option-groups { display:grid; gap:var(--pane-gap); min-width:0; }
  .editor-option-groups { margin-top:var(--pane-padding); }
  .option-group { min-width:0; padding:var(--pane-padding); border-radius:4px; background:var(--color-background); }
  .option-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap:12px 20px; }
  .preference-option-grid { grid-template-columns:repeat(auto-fit, minmax(min(100%, 230px), 1fr)); }
  .option-groups .toggle-field { padding-top:0; align-items:center; }
  .option-groups .toggle-field > div { min-width:0; }
  .option-groups .toggle-field .field-title { margin-bottom:0; flex-wrap:wrap; overflow-wrap:anywhere; }
  .option-groups input[type="checkbox"] { margin:0; }
  .option-groups input[type="checkbox"]:not(:checked) { background:var(--color-surface); }
  .settings-page { width: 100%; margin: 0; padding: var(--pane-gap); }
  .settings-page :global(:is([data-slot="button"], .navigation-trigger, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]))) { box-sizing: border-box; height: 36px; min-height: 36px; }
  .settings-page :global([data-slot="button"]) { --control-hover-foreground: var(--color-hover-foreground); background: var(--color-background); color: var(--color-foreground); border-radius: 4px; font-size: 0.6875rem; font-weight: 700; }
  .settings-page :global([data-slot="button"]:focus-visible:not(:disabled):not([aria-disabled="true"])) { background: var(--color-foreground); color: var(--color-background); }
  .settings-page :global([data-slot="button"]:is(:disabled, [aria-disabled="true"])) { background: var(--color-background); color: color-mix(in srgb, var(--color-foreground) 45%, var(--color-background)); }
  .settings-page :global(.navigation-trigger) { display: flex; width: 100%; padding-inline: 11px; background: var(--color-background); }
  .settings-page :global(.navigation-trigger > .material-symbols-rounded:last-child) { margin-left: auto; }
  .language-panes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: var(--pane-gap); align-items: stretch; margin-top: var(--pane-gap); }
  .language-panes :global(.filename-mappings), .language-panes :global(.syntax-preferences) { min-width: 0; margin-top: 0; }
  .settings-fields { margin: 0; padding: 0; border: 0; min-width: 0; }
  .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pane-gap); }
  .settings-card { min-width: 0; background: var(--color-surface); padding: var(--pane-padding); border-radius: 4px; }
  .card-heading { display: flex; gap: 12px; margin-bottom: var(--pane-padding); align-items: center; }
  h2 { margin: 0; font-size: 0.9375rem; font-weight: 650; }
  /* One section-heading scale across every Settings tab, including child cards. */
  .settings-page :global(:is(.card-heading, .heading, .card-heading > h4, .speech-settings > h4, .license-notices > details > summary)) { gap:.5rem; }
  .settings-page :global(:is(.card-heading h2, .heading h2, .card-heading > h4, .speech-settings > h4, .license-notices > details > summary)) { font-size:.875rem; font-weight:650; line-height:1.4; }
  .settings-page :global(:is(.card-heading, .heading, .card-heading > h4, .speech-settings > h4, .license-notices > details > summary) > .material-symbols-rounded) { flex:0 0 1.25rem; width:1.25rem; height:1.25rem; font-size:1.25rem; line-height:1; }
  .field { margin-top: var(--pane-padding); min-width: 0; }.field-title { display: flex; gap: 8px; align-items: center; font-size: 0.6875rem; font-weight: 650; min-height: 18px; margin-bottom: 3px; }
  .inherited { font-size: 0.5625rem; font-weight: 450; }
  .history-description { margin: 0; font-size: .6875rem; line-height: 1.5; }
  .ai-instructions { width: 100%; min-width: 0; border-radius: 4px; overflow: hidden; }
  .ai-instructions :global(.markdown-composer), .ai-instructions :global(.cm-editor) { background: var(--color-background); }
  input[type="range"] { display: block; appearance: none; width: 100%; height: 18px; margin: 3px 0; border: 0; background: transparent; cursor: pointer; }
  input[type="range"]::-webkit-slider-runnable-track { height: 4px; border: 0; box-shadow: none; border-radius: 4px; background: var(--color-background); }
  input[type="range"]::-moz-range-track { height: 4px; border: 0; box-shadow: none; border-radius: 4px; background: var(--color-background); }
  input[type="range"]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; margin-top: -5px; border: 0; border-radius: 50%; background: var(--color-foreground); }
  input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--color-foreground); }
  output { font-size: 0.75rem; line-height: 1; font-variant-numeric: tabular-nums; white-space:nowrap; }
  .field-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--pane-padding); }
  .size-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 6rem), 1fr)); gap: 8px; }
  .size-option { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 8px; border-radius: 4px; background: var(--color-background); font-size: .6875rem; font-weight: 700; cursor: pointer; }
  .size-option input { appearance: none; flex: 0 0 14px; width: 14px; height: 14px; margin: 0; border: 0; border-radius: 50%; background: var(--color-surface); cursor: pointer; }
  .size-option input:checked { background: radial-gradient(circle, var(--color-foreground) 0 3px, var(--color-surface) 3.5px); }
  .size-option:has(input:focus-visible) { background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .slider-fields { padding-inline: 2px; }
  .slider-fields > .field { display:flex; flex-direction:column; }
  .slider-fields .field-title { align-items:baseline; }
  .slider-fields input[type="range"] { margin-top:auto; }
  .palette-preview { height: 26px; display: flex; gap: 3px; margin-top: 10px; }.palette-preview span { flex: 1; border: 1px solid var(--color-background); border-radius: 3px; }

  .wide { grid-column: 1 / -1; }
  .toggle-field { display: flex; gap: 12px; align-items: center; }.toggle-field > div { flex: 1; }
  input[type="checkbox"] { appearance: none; flex: 0 0 32px; height: 19px; border: 0; border-radius: 20px; background: var(--color-background); cursor: pointer; position: relative; }
  input[type="checkbox"]::before { content: ""; position: absolute; width: 11px; height: 11px; top: 4px; left: 4px; background: var(--color-foreground); border-radius: 50%; }input[type="checkbox"]:checked { background: var(--color-foreground); }input[type="checkbox"]:checked::before { left: 17px; background: var(--color-background); }
  .toggle-field:has(input:focus-visible) { background: var(--color-hover-background); border-radius: 4px; }
  @container settings-pane (max-width: 850px) { .settings-grid { grid-template-columns: minmax(0, 1fr); }.wide { grid-column: auto; } }
  @container settings-pane (max-width: 650px) { .settings-page { padding-inline: var(--pane-gap); } }
</style>
