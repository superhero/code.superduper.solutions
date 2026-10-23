<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { TOOL_CHOICES } from "$lib/assistant/configuration";
  import SkillsSettings from "$lib/components/assistant/SkillsSettings.svelte";
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
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import { activateInstalledPackage, DEFAULT_SETTINGS, FILE_OVERRIDE_KEYS, PALETTES, resolveSettings, type EditorSettings, type SettingsStore } from "$lib/editor/settings";

  let { settings, scope = $bindable("global"), repositoryId, files, path = "", fileConfiguration = {}, disabled = false, onchange }:
    { settings: SettingsStore; scope?: "global" | "repository" | "file"; repositoryId?: string; files?: readonly string[] | undefined; path?: string; fileConfiguration?: Partial<EditorSettings>; disabled?: boolean; onchange(value: SettingsStore): void } = $props();
  let keybindingSettings: KeybindingSettings | undefined = $state();
  export function resetKeybindings() { if (!disabled && !fileScope) keybindingSettings?.reset(); }
  let sliderValues = $state<Partial<Record<"indentSize" | "tabSize" | "fontSize" | "lineHeight" | "scrollSpeed" | "historyLimit", number>>>({});
  const repositoryScope = $derived(scope === "repository" && Boolean(repositoryId));
  const fileScope = $derived(scope === "file" && Boolean(repositoryId && path));
  const active = $derived(fileScope ? resolveSettings(settings, repositoryId, path, fileConfiguration) : repositoryScope ? resolveSettings(settings, repositoryId) : settings.global);
  const overrides = $derived(repositoryId ? (fileScope ? settings.files[repositoryId]?.[path] ?? {} : settings.repositories[repositoryId] ?? {}) : {});
  $effect(() => {
    if (scope === "file" && (!repositoryId || !path)) scope = repositoryId ? "repository" : "global";
    if (scope === "repository" && !repositoryId) scope = "global";
  });
  const toolbarGroups: { title: string; buttons: { key: keyof EditorSettings; label: string }[] }[] = [
    { title: "Editor", buttons: [
    { key: "showUndoButton", label: "Undo" },
    { key: "showRedoButton", label: "Redo" },
    { key: "showStagedHistoryButton", label: "Staged history" },
    { key: "showZoomInButton", label: "Zoom in" },
    { key: "showZoomOutButton", label: "Zoom out" },
    { key: "showFormatButton", label: "Format file" },
    { key: "showDiffButton", label: "File diff" },
    { key: "showCommitHistoryButton", label: "Commit history" },
    { key: "showGitButton", label: "Git operations" },
    ] },
    { title: "Settings", buttons: [
      { key: "showSettingsUndoButton", label: "Undo" },
      { key: "showSettingsRedoButton", label: "Redo" },
      { key: "showSettingsResetButton", label: "Reset settings" },
      { key: "showSettingsKeybindingsResetButton", label: "Reset keybindings" },
    ] },
  ];
  const toggles: { key: keyof EditorSettings; label: string; description: string }[] = [
    { key: "editorFooter", label: "Editor footer", description: "Show cursor position, indentation, encoding and language below the editor." },
    { key: "fileExplorerIcons", label: "File explorer icons", description: "Show file and folder symbols in the explorer." },
    { key: "lineWrapping", label: "Line wrapping", description: "Keep long lines within the editor width." },
    { key: "smoothScrolling", label: "Smooth scrolling", description: "Ease wheel and minimap keyboard scrolling; respect reduced motion." },
    { key: "minimap", label: "Minimap", description: "Show a scrolling overview in the editor, History and Settings." },
    { key: "scrollbars", label: "Scrollbars", description: "Show scrollbars alongside minimaps." },
    { key: "lineNumbers", label: "Line numbers", description: "Show a numbered gutter beside your code." },
    { key: "foldGutter", label: "Fold gutter", description: "Show controls for collapsing code blocks. Folding shortcuts remain available." },
    { key: "highlightActiveLine", label: "Highlight active line", description: "Mark the line containing your cursor." },
    { key: "highlightWhitespace", label: "Show whitespace", description: "Reveal spaces and tabs without changing the file." },
    { key: "bracketMatching", label: "Bracket matching", description: "Highlight matching brackets near the cursor." },
    { key: "closeBrackets", label: "Close brackets", description: "Insert matching brackets and quotation marks." },
    { key: "autocomplete", label: "Autocompletion", description: "Offer language and document completions as you type." },
    { key: "indentOnInput", label: "Automatic indentation", description: "Reindent language constructs while typing." },
    { key: "tabBehavior", label: "Tab key", description: "Indent code with Tab; switch off to move keyboard focus." },
    { key: "readOnly", label: "Read-only editor", description: "Keep code selectable while preventing document edits." }
  ];

  function change(key: keyof EditorSettings, value: EditorSettings[keyof EditorSettings]) {
    if (fileScope && repositoryId) {
      onchange({ ...settings, files: { ...settings.files, [repositoryId]: { ...settings.files[repositoryId], [path]: { ...overrides, [key]: value } } } });
    } else if (repositoryScope && repositoryId) {
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
    if (fileScope && repositoryId) {
      const next = { ...settings.files[repositoryId] }; delete next[path];
      onchange({ ...settings, files: { ...settings.files, [repositoryId]: next } });
    } else if (repositoryScope && repositoryId) {
      const next = { ...settings.repositories }; delete next[repositoryId];
      onchange({ ...settings, repositories: next });
    } else onchange({ ...settings, global: { ...DEFAULT_SETTINGS } });
  }
  const title = (value: string) => value.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());

</script>

{#snippet fieldTitle(key: keyof EditorSettings, label: string, group = false)}
  <div class="field-title">{#if group}<span id={`setting-${key}-label`}>{label}</span>{:else}<label for={`setting-${key}`}>{label}</label>{/if}
    {#if (repositoryScope || fileScope) && Object.hasOwn(overrides, key)}<span class="inherited">Override</span>{/if}
    {#if key === "indentSize" || key === "tabSize" || key === "fontSize" || key === "historyLimit" || (key === "lineHeight" || key === "scrollSpeed")}<span aria-hidden="true">·</span><output for={`setting-${key}`}>{sliderValues[key] ?? active[key]}{key === "historyLimit" ? " changes" : key === "fontSize" ? " px" : (key === "lineHeight" || key === "scrollSpeed") ? "×" : " cols"}</output>{/if}
  </div>
{/snippet}

{#snippet selectControl(key: keyof EditorSettings, label: string, value: string, items: { value: string; label: string; icon: string }[])}
  <NavigationDropdown matchTriggerWidth id={`setting-${key}`} {label} {value} placeholder={label} {items} {disabled}
    onchange={next => change(key, key === "indentWithTabs" ? next === "tabs" : next)} />
{/snippet}

<section class="settings-page" aria-label="Editor settings">
  <fieldset class="settings-fields" {disabled}>
  <div class="settings-grid">
    {#if fileScope}<section class="settings-card wide file-heading"><h2>{path}</h2></section>{/if}
    {#if !fileScope}<section class="settings-card"><div class="card-heading"><MaterialIcon name="palette" /><div><h2>User interface</h2></div></div>
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
    </section>{/if}
    <section class="settings-card"><div class="card-heading"><MaterialIcon name="custom_typography" /><div><h2>Editor typography</h2></div></div>
      <div class="field">{@render fieldTitle("indentWithTabs", "Indentation")}{@render selectControl("indentWithTabs", "Indentation", active.indentWithTabs ? "tabs" : "spaces", [{ value: "spaces", label: "Spaces", icon: "space_bar" }, { value: "tabs", label: "Tabs", icon: "keyboard_tab" }])}</div>
      <div class="field-pair slider-fields"><div class="field">{@render fieldTitle("indentSize", "Indent size")}<input id="setting-indentSize" type="range" min="0" max="12" step="1" value={active.indentSize} oninput={e => sliderValues.indentSize = Number(e.currentTarget.value)} onchange={e => { change("indentSize", Number(e.currentTarget.value)); delete sliderValues.indentSize; }} /></div><div class="field">{@render fieldTitle("tabSize", "Tab width")}<input id="setting-tabSize" type="range" min="0" max="12" step="1" value={active.tabSize} oninput={e => sliderValues.tabSize = Number(e.currentTarget.value)} onchange={e => { change("tabSize", Number(e.currentTarget.value)); delete sliderValues.tabSize; }} /></div></div>
      {#if !fileScope}
      <div class="editor-font-divider" role="separator"></div>
      <div class="field">{@render fieldTitle("fontFamily", "Editor font")}<FontSelect value={active.fontFamily} {disabled} onchange={value=>change("fontFamily",value)} /></div>
      <div class="field-pair slider-fields"><div class="field">{@render fieldTitle("fontSize", "Font size")}<input id="setting-fontSize" type="range" min="7" max="32" value={active.fontSize} oninput={e => sliderValues.fontSize = Number(e.currentTarget.value)} onchange={e => { change("fontSize", Number(e.currentTarget.value)); delete sliderValues.fontSize; }} /></div><div class="field">{@render fieldTitle("lineHeight", "Line height")}<input id="setting-lineHeight" type="range" min="1.2" max="2.4" step="0.1" value={active.lineHeight} oninput={e => sliderValues.lineHeight = Number(e.currentTarget.value)} onchange={e => { change("lineHeight", Number(e.currentTarget.value)); delete sliderValues.lineHeight; }} /></div></div>
      {/if}
    </section>
    {#if !fileScope}<div class="wide"><EditorColorSettings value={repositoryScope ? (overrides.colorMappings ?? {}) : settings.global.colorMappings}
      inherited={repositoryScope ? settings.global.colorMappings : {}} repository={repositoryScope} selectionOpacity={active.selectionOpacity}
      opacityOverride={Object.hasOwn(overrides, "selectionOpacity")} {disabled} onchange={value => change("colorMappings", value)}
      onopacitychange={value => change("selectionOpacity", value)} onresetopacity={resetSelectionOpacity} /></div>{/if}
    <section class="settings-card" class:wide={!fileScope} class:file-details={fileScope}><div class="card-heading"><MaterialIcon name="rule" /><div><h2>Editor details</h2></div></div><div class="field-pair slider-fields details-sliders">{#if !fileScope}<div class="field">{@render fieldTitle("scrollSpeed", "Scroll speed")}<input id="setting-scrollSpeed" type="range" min="0.25" max="5" step="0.25" value={active.scrollSpeed} oninput={e => sliderValues.scrollSpeed = Number(e.currentTarget.value)} onchange={e => { change("scrollSpeed", Number(e.currentTarget.value)); delete sliderValues.scrollSpeed; }} /></div>{/if}<div class="field">{@render fieldTitle("historyLimit", "Retained history changes per file")}<input id="setting-historyLimit" type="range" min="0" max={Math.log1p(10000)} step="any" value={Math.log1p(active.historyLimit)} aria-valuetext={`${sliderValues.historyLimit ?? active.historyLimit} changes`} oninput={e => sliderValues.historyLimit = Math.round(Math.expm1(Number(e.currentTarget.value)))} onchange={e => { change("historyLimit", Math.round(Math.expm1(Number(e.currentTarget.value)))); delete sliderValues.historyLimit; }} /></div></div><div class="editor-font-divider" role="separator"></div><div class="toggle-grid">{#each toggles.filter(toggle => !fileScope || (FILE_OVERRIDE_KEYS as readonly string[]).includes(toggle.key)).sort((a, b) => a.label.localeCompare(b.label, "en")) as toggle}<div class="toggle-field"><input id={`setting-${toggle.key}`} type="checkbox" role="switch" checked={toggle.key === "tabBehavior" ? active.tabBehavior === "indent" : Boolean(active[toggle.key])} onchange={e => change(toggle.key, toggle.key === "tabBehavior" ? (e.currentTarget.checked ? "indent" : "focus") : e.currentTarget.checked)} /><div>{@render fieldTitle(toggle.key, toggle.label)}<p>{toggle.description}</p></div></div>{/each}</div></section>
    {#if !fileScope}<section class="settings-card wide" aria-label="AI">
      <div class="card-heading"><MaterialIcon name="robot" /><h2>AI</h2></div>
      <div class="field">{@render fieldTitle("aiInstructions", "System instructions")}<textarea id="setting-aiInstructions" class="ai-instructions" rows="5" maxlength="16000" value={active.aiInstructions} onchange={event => change("aiInstructions", event.currentTarget.value)}></textarea></div>
      <div class="field">{@render fieldTitle("aiSkills", "Skills")}<SkillsSettings value={repositoryScope ? overrides.aiSkills ?? {} : settings.global.aiSkills} inherited={repositoryScope ? settings.global.aiSkills : {}} {disabled} onchange={value=>change("aiSkills",value)}/></div>
      <div class="field">{@render fieldTitle("aiTools", "Tools")}<div class="toggle-grid">{#each [...TOOL_CHOICES].sort((a, b) => a.label.localeCompare(b.label, "en")) as tool}<div class="toggle-field"><input id={`setting-ai-tool-${tool.id}`} type="checkbox" role="switch" checked={active.aiTools[tool.id]} onchange={event => change("aiTools", { ...active.aiTools, [tool.id]: event.currentTarget.checked })} /><div><label for={`setting-ai-tool-${tool.id}`}>{tool.label}</label><p>{tool.description}</p></div></div>{/each}
        <div class="editor-font-divider ai-controls-divider" role="separator"></div>
        <div class="field"><div class="toggle-field"><input id="setting-showAISendButton" type="checkbox" role="switch" checked={active.showAISendButton} onchange={event => change("showAISendButton", event.currentTarget.checked)} /><div>{@render fieldTitle("showAISendButton", "Show Send button")}<p>Show a Send button below the AI message input.</p></div></div></div>
        <div class="field"><div class="toggle-field"><input id="setting-aiEnterAction" type="checkbox" role="switch" checked={active.aiEnterAction === "send"} onchange={event => change("aiEnterAction", event.currentTarget.checked ? "send" : "newline")} /><div>{@render fieldTitle("aiEnterAction", "Send on Enter")}<p>When off, Enter inserts a newline.</p></div></div></div>
      </div></div>
    </section>{/if}
    {#if !fileScope}<section class="settings-card wide" aria-label="Toolbar">
      <div class="card-heading"><MaterialIcon name="switch" /><div><h2>Toolbar</h2></div></div>
      <div class="toolbar-groups">{#each toolbarGroups as group}<section aria-label={`${group.title} toolbar buttons`}><h3>{group.title}</h3><div class="toggle-grid">{#each group.buttons as button}
        <div class="toggle-field" class:button-group-start={button.key === "showZoomInButton" || button.key === "showFormatButton" || button.key === "showDiffButton"}><input id={`setting-${button.key}`} type="checkbox" role="switch" checked={Boolean(active[button.key])} onchange={event => change(button.key, event.currentTarget.checked)} /><div>{@render fieldTitle(button.key, button.label)}</div></div>
      {/each}</div></section>{/each}</div>
    </section>{/if}
  </div>
  </fieldset>
  {#if !fileScope}<UpstreamSettings {disabled} />{/if}
  {#if !fileScope}<KeybindingSettings bind:this={keybindingSettings} value={repositoryScope ? (overrides.keybindings ?? {}) : settings.global.keybindings}
    inherited={repositoryScope ? settings.global.keybindings : {}} repository={repositoryScope} {disabled} onchange={value=>change("keybindings",value)} />{/if}
  {#if !fileScope}<div class="language-panes"><FilenameMappings {files} value={repositoryScope ? (overrides.languageMappings ?? {}) : settings.global.languageMappings}
    inherited={repositoryScope ? settings.global.languageMappings : {}} repository={repositoryScope} {disabled} onchange={value=>change("languageMappings",value)} />
  <SyntaxSettings oninstalled={id=>onchange(activateInstalledPackage(settings,"syntax",id))} {files} mappings={active.languageMappings} value={repositoryScope ? (overrides.syntaxPackages ?? {}) : settings.global.syntaxPackages}
    inherited={settings.global.syntaxPackages} repository={repositoryScope} {disabled} onchange={value=>change("syntaxPackages",value)} /></div>{/if}
  {#if !fileScope}<LanguageEnginePreferences oninstalled={id=>onchange(activateInstalledPackage(settings,"engine",id))} {files} mappings={active.languageMappings} value={repositoryScope ? (overrides.languageEngines ?? {}) : settings.global.languageEngines}
    inherited={settings.global.languageEngines} repository={repositoryScope} {disabled} onchange={value=>change("languageEngines",value)} />{/if}
  {#if !fileScope}<TypeLibraryPreferences value={repositoryScope?(overrides.typeLibraries??{}):settings.global.typeLibraries}
    inherited={settings.global.typeLibraries} repository={repositoryScope} {disabled} onchange={value=>change("typeLibraries",value)} />{/if}
  {#if !fileScope}<FormatterPreferences {files} mappings={active.languageMappings} oninstalled={id=>onchange(activateInstalledPackage(settings,"formatter",id))} value={repositoryScope ? (overrides.formatters ?? {}) : settings.global.formatters}
    inherited={settings.global.formatters} repository={repositoryScope} {disabled} onchange={value=>change("formatters",value)} />{/if}
  {#if !fileScope}<LicensesAndNotices />{/if}
</section>

<style>
  .toolbar-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .toolbar-groups > section { min-width: 0; padding: 18px; border-radius: 4px; background: var(--color-background); }
  .toolbar-groups h3 { margin: 0 0 12px; padding-bottom: 8px; font-size: .8125rem; font-weight: 650; }
  .toolbar-groups .toggle-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .toolbar-groups .toggle-field { padding-top: 0; }
  .toolbar-groups .button-group-start { margin-top: 16px; }
  .toolbar-groups input[type="checkbox"]:not(:checked) { background: var(--color-surface); }
  @media (max-width: 650px) { .toolbar-groups { grid-template-columns: minmax(0, 1fr); } }
  .settings-page { max-width: 1080px; margin: 0; padding: 16px 16px 40px; }
  .settings-page :global(:is([data-slot="button"], .navigation-trigger, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]))) { box-sizing: border-box; height: 36px; min-height: 36px; }
  .settings-page :global([data-slot="button"]) { background: var(--color-menu-background); color: var(--color-background); border-radius: 4px; font-size: 0.6875rem; font-weight: 700; }
  .settings-page :global([data-slot="button"]:is(:hover, :focus-visible):not(:disabled):not([aria-disabled="true"])) { background: var(--color-foreground); color: var(--color-background); }
  .settings-page :global([data-slot="button"]:hover:not(:disabled):not([aria-disabled="true"])) { color: var(--color-hover-foreground); }
  .settings-page :global([data-slot="button"]:disabled) { background: color-mix(in srgb, var(--color-menu-background) 35%, var(--color-surface)); color: var(--color-muted-foreground); }
  .settings-page :global(.navigation-trigger) { display: flex; width: 100%; padding-inline: 11px; background: var(--color-background); }
  .settings-page :global(.navigation-trigger > .material-symbols-rounded:last-child) { margin-left: auto; }
  .language-panes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 20px; align-items: stretch; margin-top: 20px; }
  .language-panes :global(.filename-mappings), .language-panes :global(.syntax-preferences) { min-width: 0; margin-top: 0; }
  .settings-fields { margin: 0; padding: 0; border: 0; min-width: 0; }
  .file-heading h2 { overflow-wrap: anywhere; }
  .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
  .settings-card { min-width: 0; background: var(--color-surface); padding: 24px; border-radius: 4px; }
  .card-heading { display: flex; gap: 12px; margin-bottom: 22px; align-items: center; }
  h2 { margin: 0; font-size: 0.9375rem; font-weight: 650; }
  .field { margin-top: 18px; min-width: 0; }.field-title { display: flex; gap: 8px; align-items: center; font-size: 0.6875rem; font-weight: 650; min-height: 18px; margin-bottom: 3px; }
  .inherited { font-size: 0.5625rem; font-weight: 450; }
  .ai-instructions { width: 100%; padding: 10px; border: 0; border-radius: 4px; background: var(--color-background); color: var(--color-foreground); font: inherit; resize: vertical; }
  input[type="range"] { display: block; appearance: none; width: 100%; height: 18px; margin: 3px 0; border: 0; background: transparent; cursor: pointer; }
  input[type="range"]::-webkit-slider-runnable-track { height: 4px; border: 0; box-shadow: none; border-radius: 4px; background: var(--color-background); }
  input[type="range"]::-moz-range-track { height: 4px; border: 0; box-shadow: none; border-radius: 4px; background: var(--color-background); }
  input[type="range"]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; margin-top: -5px; border: 0; border-radius: 50%; background: var(--color-foreground); }
  input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--color-foreground); }
  output { font-size: 0.75rem; line-height: 1; font-variant-numeric: tabular-nums; }
  .field-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .size-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 6rem), 1fr)); gap: 8px; }
  .size-option { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 8px; border-radius: 4px; background: var(--color-background); font-size: .6875rem; font-weight: 700; cursor: pointer; }
  .size-option input { appearance: none; flex: 0 0 14px; width: 14px; height: 14px; margin: 0; border: 0; border-radius: 50%; background: var(--color-surface); cursor: pointer; }
  .size-option input:checked { background: radial-gradient(circle, var(--color-foreground) 0 3px, var(--color-surface) 3.5px); }
  .size-option:has(input:focus-visible) { background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .editor-font-divider { height: 1px; margin-block: 25px; background: repeating-linear-gradient(to right, var(--color-background) 0 6px, transparent 6px 14px); }
  .ai-controls-divider { grid-column: 1 / -1; margin-block: 7px; }
  .editor-font-divider + .field { margin-top: 0; }
  .toggle-grid > .field { margin-top: 0; }
  .toggle-grid > .field > .toggle-field { padding-top: 0; }
  .details-sliders { grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); }
  .slider-fields { padding-inline: 2px; }
  .palette-preview { height: 26px; display: flex; gap: 3px; margin-top: 10px; }.palette-preview span { flex: 1; border: 1px solid var(--color-background); border-radius: 3px; }

  .wide { grid-column: 1 / -1; }.toggle-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px 32px; }
  .toggle-field { display: flex; gap: 12px; align-items: center; padding-top: 15px; }.toggle-field > div { flex: 1; }.toggle-field p { font-size: 0.625rem; margin: 0; }.toggle-field .field-title { margin-bottom: 2px; }
  input[type="checkbox"] { appearance: none; flex: 0 0 32px; height: 19px; border: 0; border-radius: 20px; background: var(--color-background); cursor: pointer; position: relative; }
  input[type="checkbox"]::before { content: ""; position: absolute; width: 11px; height: 11px; top: 4px; left: 4px; background: var(--color-foreground); border-radius: 50%; }input[type="checkbox"]:checked { background: var(--color-foreground); }input[type="checkbox"]:checked::before { left: 17px; background: var(--color-background); }
  .toggle-field:has(input:focus-visible) { background: var(--color-hover-background); border-radius: 4px; }
  .file-details .toggle-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 1000px) { .toggle-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 850px) { .settings-grid { grid-template-columns: minmax(0, 1fr); }.wide { grid-column: auto; } }
  @media (max-width: 650px) { .toggle-grid, .file-details .toggle-grid { grid-template-columns: 1fr; } }
  @media (max-width: 650px) { .settings-page { padding-inline: 3px; } }
</style>
