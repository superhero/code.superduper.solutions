<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Annotation, Compartment, EditorSelection, EditorState } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import { setCommittedText } from "$lib/editor/git-gutter";
  import { editorExtensions } from "$lib/editor/configuration";
  import { FoldMotion } from "$lib/editor/fold-motion";
  import { engineFor, intelligenceLanguage as resolveIntelligenceLanguage } from "$lib/intelligence/catalog";
  import { syntaxRegistry } from "$lib/syntax/registry";
  import { subscribeLanguagePackages } from "$lib/intelligence/registry";
  import { forceLinting } from "@codemirror/lint";
  import { nativeFilteredCompletion } from "$lib/editor/completion-filter";
  import { languageIntelligence } from "$lib/intelligence/extension";
  import { languageForPath, mappedLanguageForPath } from "$lib/editor/languages";
  import { loadLanguage } from "$lib/editor/languages";
  import { formattingChanges, type FormattingSnapshot } from "$lib/editor/formatting";
  import { EditGrouping } from "$lib/editor/edit-grouping";
  import type { EditGroup } from "$lib/repository/types";
  import type { EditorSettings } from "$lib/editor/settings";
  import type { EditorSession, EditorViewport } from "$lib/editor/workspace";

  let { documentLabel = "Code editor document", documentId, path, value, settings, disabled = false, isLocked, session, active = true, restoreFocus = false, restoreEpoch = 0,
    loadBaseline, baselineRevision, loadWorkspace, workspacePaths = [], workspaceRevision = "", onchange, onundo, onredo, oncursor, onsession, onfocus, onready, onprogress }:
    { documentLabel?:string; documentId: string; path: string; value: string; settings: EditorSettings; disabled?: boolean; isLocked?():boolean;
      loadBaseline(): Promise<string|null>; baselineRevision: string|null;
      loadWorkspace(): Promise<Record<string,string>>; workspacePaths?: readonly string[]; workspaceRevision?: string;
      session?: EditorSession | undefined; active?: boolean; restoreFocus?: boolean; restoreEpoch?: number;
      onchange(value: string, beforeSession: EditorSession, afterSession: EditorSession, action?: "format", group?: EditGroup): void;
      onundo(): void; onredo(): void; oncursor?(line: number, column: number): void;
      onsession?(documentId: string, session: EditorSession): void; onfocus?(): void;
      onready?(documentId: string, restoreEpoch: number): void;
      onprogress?(item: "editor.language" | "editor.layout", status: "running" | "complete" | "error"): void } = $props();

  let container: HTMLDivElement;
  let view = $state.raw<EditorView>();
  const configuration = new Compartment();
  const editability = new Compartment();
  const languageConfiguration = new Compartment();
  const intelligenceConfiguration = new Compartment();
  let intelligenceError = $state("");
  let packageEpoch = $state(0);
  let syntaxEpoch = $state(0);
  const languageMode = $derived(languageForPath(path,"auto",settings.languageMappings));
  const intelligenceLanguage = $derived(resolveIntelligenceLanguage(path,mappedLanguageForPath(path,settings.languageMappings)??"auto",languageMode));
  const selectedEngine = $derived(engineFor(intelligenceLanguage,settings.languageEngines));
  const selectedTypeLibraries = $derived(Object.keys(settings.typeLibraries).filter(id=>settings.typeLibraries[id]).sort().join(','));
  let languageError = $state("");
  let baselineError = $state("");
  const external = Annotation.define<boolean>();
  const documents = new Map<string, EditorState>();
  const foldMotion = new FoldMotion();
  const grouping = new EditGrouping();
  function undo() { grouping.reset(); onundo(); }
  function redo() { grouping.reset(); onredo(); }
  let currentId = "";
  let documentGeneration = 0;
  let lastSession: EditorSession | undefined;
  let pendingSession: EditorSession | undefined;
  let restoring = false;
  let restoration = 0;
  let sessionTimer: ReturnType<typeof setTimeout> | undefined;
  let readyRestoration = -1;
  let languageReadyFor = "";
  let languageCompletion = Promise.resolve();
  let wasActive = false;
  let lastRestoreEpoch = untrack(() => restoreEpoch);

  function reportReady() {
    const editor = view;
    const id = currentId;
    const generation = restoration;
    const epoch = lastRestoreEpoch;
    const valid = () => view === editor && currentId === id && active && !restoring
      && languageReadyFor === id && restoration === generation && restoreEpoch === epoch
      && readyRestoration !== generation;
    if (!editor || !onready || !valid()) return;
    void document.fonts.ready.then(() => {
      if (!valid()) return;
      editor.requestMeasure({
        read: () => editor.scrollDOM.clientHeight > 0,
        write: visible => {
          if (!visible || !valid()) return;
          readyRestoration = generation;
          onprogress?.("editor.layout", "complete");
          onready?.(id, epoch);
        }
      });
    });
  }

  function reportCursor(state: EditorState) {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    oncursor?.(line.number, head - line.from + 1);
  }

  function readSession(editor: EditorView, state = editor.state): EditorSession {
    // A hidden panel has no usable scroll geometry. Keep its last visible viewport.
    const visible = editor.scrollDOM.clientHeight > 0;
    return {
      selection: state.selection.ranges.map(({ anchor, head }) => ({ anchor, head })),
      mainIndex: state.selection.mainIndex,
      scrollTop: visible ? editor.scrollDOM.scrollTop : lastSession?.scrollTop ?? 0,
      scrollLeft: visible ? editor.scrollDOM.scrollLeft : lastSession?.scrollLeft ?? 0
    };
  }

  function reportSession() {
    clearTimeout(sessionTimer);
    if (!view || !currentId || restoring) return;
    lastSession = readSession(view);
    onsession?.(currentId, lastSession);
  }

  function rememberBlur() {
    grouping.reset();
    clearTimeout(sessionTimer);
    const editor = view, id = currentId;
    if (!editor || !id || restoring) return;
    const saved = lastSession = readSession(editor);
    // Removing focused DOM emits blur before Svelte runs component cleanup.
    // Report after that render, only if this document is still mounted.
    queueMicrotask(() => {
      if (view === editor && currentId === id && !restoring) onsession?.(id, saved);
    });
  }

  function rememberScroll() {
    if (!view || !currentId || restoring) return;
    lastSession = readSession(view);
    // Scrolling is restoration context. Keep it locally while moving instead
    // of rerendering the workspace on every frame; actions flush synchronously.
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(reportSession, 120);
  }

  export function focus() { view?.focus(); }

  export function flushSession() {
    reportSession();
  }
  export function captureViewport():EditorViewport|undefined {
    if(!view||!view.scrollDOM.clientHeight)return;
    const top=view.scrollDOM.getBoundingClientRect().top;
    const block=view.lineBlockAtHeight(Math.max(0,top-view.documentTop));
    return {documentId:currentId,from:block.from,offset:view.documentTop+block.top-top,scrollLeft:view.scrollDOM.scrollLeft};
  }

  export function captureFormatting(): FormattingSnapshot | undefined {
    if (!view || !active || disabled || settings.readOnly || currentId !== documentId) return;
    return { documentId: currentId, generation: documentGeneration, text: view.state.sliceDoc() };
  }

  export function applyFormatting(snapshot: FormattingSnapshot, formatted: string): boolean {
    const editor = view;
    if (!editor || !active || disabled || settings.readOnly || editor.state.readOnly
      || currentId !== documentId || snapshot.documentId !== currentId
      || snapshot.generation !== documentGeneration || snapshot.text !== editor.state.sliceDoc()) return false;
    grouping.reset();
    const changes = formattingChanges(editor.state.doc, formatted);
    if (!changes.length) return true;
    cancelRestoration();
    editor.dispatch({ changes, effects: editor.scrollSnapshot(), userEvent: "input.format" });
    editor.focus();
    return true;
  }

  function cancelRestoration() {
    restoration++;
    restoring = false;
    pendingSession = undefined;
  }

  function restoreSession(saved: EditorSession | undefined, focus: boolean) {
    const editor = view;
    if (!editor) return;
    cancelRestoration();
    const target = saved ?? { ...readSession(editor), scrollTop: 0, scrollLeft: 0 };
    const clamp = (position: number) => Math.max(0, Math.min(editor.state.doc.length, position));
    const ranges = target.selection.map(({ anchor, head }) => EditorSelection.range(clamp(anchor), clamp(head)));
    const selection = ranges.length ? EditorSelection.create(ranges, Math.max(0, Math.min(target.mainIndex, ranges.length - 1)))
      : EditorSelection.cursor(0);
    restoring = true;
    pendingSession = target;
    lastSession = target;
    editor.dispatch({ selection, annotations: external.of(true) });
    reportCursor(editor.state);
    if (!active) return;

    const generation = restoration;
    const id = currentId;
    const valid = () => generation === restoration && currentId === id && view === editor && active;
    // Font metrics and CodeMirror's measured document height must settle before
    // restoring pixels. A second measurement handles its newly rendered viewport.
    void document.fonts.ready.then(async () => {
      await languageCompletion;
      if (!valid()) return;
      const position = (finish: boolean) => {
        // CodeMirror already schedules measurement at the next frame. Wrapping
        // each pass in another animation frame doubles history's layout wait.
        editor.requestMeasure({
          read: () => editor.scrollDOM.clientHeight > 0,
          write: visible => {
            if (!valid() || !visible) return;
            if (focus && restoreFocus && !finish && !editor.dom.closest("[inert]")) editor.focus();
            editor.scrollDOM.scrollTop = target.scrollTop;
            editor.scrollDOM.scrollLeft = target.scrollLeft;
            if (!finish) position(true);
            else {
              restoring = false;
              pendingSession = undefined;
              reportSession();
              reportReady();
            }
          }
        });
      };
      position(false);
    });
  }

  function readOnlyExtensions() {
    // Lock transactions without rebuilding parsers, minimaps or completion.
    // Keep contenteditable enabled so focus and keyboard history survive locks.
    const readOnly=settings.readOnly||disabled;
    return [EditorState.readOnly.of(readOnly),EditorView.contentAttributes.of({"aria-readonly":String(readOnly)})];
  }

  function createState(contents: string) {
    return EditorState.create({ doc: contents, extensions: [
      // Navigation locks reject edits without sending rendering transactions
      // through every unaffected pane. External shared-document updates still apply.
      EditorState.transactionFilter.of(transaction=>transaction.docChanged&&!transaction.annotation(external)&&untrack(()=>isLocked?.())?[]:transaction),
      EditorState.lineSeparator.of(contents.includes("\r\n") ? "\r\n" : "\n"),
      languageConfiguration.of([]),
      intelligenceConfiguration.of([]),
      configuration.of(editorExtensions(settings, { undo, redo },documentLabel)),
      editability.of(readOnlyExtensions()),
      EditorView.domEventHandlers({
        focus: (_event, editor) => { if (!editor.dom.closest("[inert]")) onfocus?.(); },
        blur: rememberBlur,
        pointerdown: () => { grouping.reset(); }
      }),
      EditorView.updateListener.of(update => {
        for (const transaction of update.transactions) {
          if (transaction.docChanged) documentGeneration++;
          if (transaction.docChanged && !transaction.annotation(external)) onchange(transaction.state.sliceDoc(),
            readSession(update.view, transaction.startState), readSession(update.view, transaction.state),
            transaction.isUserEvent("input.format") ? "format" : undefined, grouping.next(transaction, currentId));
          else if (transaction.selection || transaction.annotation(external)) grouping.reset();
        }
        if (update.selectionSet || update.docChanged) {
          reportCursor(update.state);
          reportSession();
        }
      })
    ] });
  }

  onMount(() => {
    const unsubscribeSyntax = syntaxRegistry.subscribe(() => { syntaxEpoch++; });
    const unsubscribePackages = subscribeLanguagePackages(() => { packageEpoch++; });
    onprogress?.("editor.layout", "running");
    currentId = documentId;
    wasActive = active;
    view = new EditorView({ state: createState(value), parent: container,
      dispatchTransactions: (transactions, editor) => foldMotion.dispatch(transactions, editor) });
    const editor = view;
    const stopRestoring = () => {
      if (restoring) {
        cancelRestoration();
        reportReady();
      }
    };
    editor.scrollDOM.addEventListener("scroll", rememberScroll, { passive: true });
    // User interaction always wins over a pending font/layout restoration.
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) {
      editor.dom.addEventListener(event, stopRestoring, { passive: true, capture: true });
    }
    window.addEventListener("pagehide", reportSession);
    window.addEventListener("beforeunload", reportSession);
    restoreSession(session, restoreFocus);
    return () => {
      unsubscribePackages(); unsubscribeSyntax();
      // Destruction runs against Svelte's previous reactive snapshot. Report the
      // captured position afterward so it cannot restore a pane that just closed.
      const closingId = currentId, closingSession = readSession(editor), report = onsession;
      queueMicrotask(() => report?.(closingId, closingSession));
      clearTimeout(sessionTimer);
      cancelRestoration();
      editor.scrollDOM.removeEventListener("scroll", rememberScroll);
      for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) {
        editor.dom.removeEventListener(event, stopRestoring, { capture: true });
      }
      window.removeEventListener("pagehide", reportSession);
      window.removeEventListener("beforeunload", reportSession);
      foldMotion.cancel();
      documentGeneration++;
      editor.destroy();
      view = undefined;
      documents.clear();
    };
  });

  $effect(() => {
    const editor = view;
    if (!editor) return;
    const measure = () => editor.requestMeasure();
    document.fonts.addEventListener("loadingdone", measure);
    window.addEventListener("code-editor-font-installed", measure);
    return () => { document.fonts.removeEventListener("loadingdone", measure); window.removeEventListener("code-editor-font-installed", measure); };
  });
  $effect(() => {
    if (!view) return;
    const switching = currentId !== documentId;
    const replaying = lastRestoreEpoch !== restoreEpoch;
    if (switching || replaying) documentGeneration++;
    lastRestoreEpoch = restoreEpoch;
    if (switching) {
      grouping.reset();
      reportSession();
      cancelRestoration();
      foldMotion.cancel();
      documents.set(currentId, view.state);
      currentId = documentId;
      lastSession = undefined;
      restoring = true;
      view.setState(documents.get(documentId) ?? untrack(()=>createState(value)));
    }
    // Explicit workspace replay restores positions even when the file stays open.
    // Suppress intermediate position reports while replacing its contents.
    if (replaying) { grouping.reset(); restoring = true; }
    if (view.state.sliceDoc() !== value) {
      view.dispatch({ changes: formattingChanges(view.state.doc,value), annotations: external.of(true) });
    }
    if (switching || replaying) restoreSession(untrack(() => session), untrack(() => restoreFocus));
  });

  $effect(() => {
    const editor=view;void documentId;
    if(editor)editor.dispatch({effects:configuration.reconfigure(editorExtensions(settings,{undo,redo},documentLabel))});
  });
  $effect(() => {
    const editor=view;void documentId;
    if(editor)editor.dispatch({effects:editability.reconfigure(readOnlyExtensions())});
  });

  $effect(() => {
    const visible = active;
    if (!visible) grouping.reset();
    if (!view) return;
    if (visible && !wasActive) restoreSession(pendingSession ?? lastSession ?? untrack(() => session), untrack(() => restoreFocus));
    wasActive = visible;
  });

  $effect(() => {
    const editor = view;
    const file = path;
    const mappings = settings.languageMappings;
    const syntaxChoices = settings.syntaxPackages;
    void syntaxEpoch;
    const id = documentId;
    if (!editor) return;
    let cancelled = false;
    languageError = "";
    languageReadyFor = "";
    onprogress?.("editor.language", "running");
    editor.dispatch({ effects: languageConfiguration.reconfigure([]) });
    languageCompletion = loadLanguage(file, "auto", syntaxChoices, mappings).then(extension => {
      if (!cancelled && currentId === id) {
        editor.dispatch({ effects: languageConfiguration.reconfigure(extension) });
        onprogress?.("editor.language", "complete");
      }
    }).catch(error => {
      if (!cancelled) {
        languageError = error instanceof Error ? error.message : String(error);
        onprogress?.("editor.language", "error");
      }
    }).then(() => {
      if (!cancelled && currentId === id) {
        languageReadyFor = id;
        reportReady();
      }
    });
    return () => { cancelled = true; };
  });
  $effect(()=>{
    const editor=view,id=documentId;void baselineRevision;
    if(!editor)return;
    let cancelled=false;baselineError="";
    editor.dispatch({effects:setCommittedText.of(undefined)});
    void untrack(()=>loadBaseline()).then(text=>{
      if(!cancelled&&currentId===id)editor.dispatch({effects:setCommittedText.of(text??"")});
    }).catch(error=>{if(!cancelled)baselineError=error instanceof Error?error.message:String(error);});
    return()=>{cancelled=true;};
  });
  $effect(() => {
    const editor = view, engine = selectedEngine, language = intelligenceLanguage, visible = active;
    const requestLanguage=engine==="typescript" && ["jsx","tsx"].includes(languageMode)?languageMode:language;
    const id = documentId, autocomplete = settings.autocomplete;
    const types=Object.fromEntries(selectedTypeLibraries.split(',').filter(Boolean).map(id=>[id,true]));
    void packageEpoch;
    if (!editor) return;
    intelligenceError = "";
    editor.dispatch({ effects: intelligenceConfiguration.reconfigure(engine && visible
      ? languageIntelligence(engine, path, requestLanguage, () => untrack(loadWorkspace), autocomplete,
          message => { if (currentId === id) intelligenceError = message; }, () => untrack(() => workspacePaths),types) : autocomplete && visible ? nativeFilteredCompletion() : []) });
  });
  $effect(() => {
    void workspaceRevision;
    void settings.languageMappings;
    const editor = view;
    if (!editor || !active || !selectedEngine) return;
    const timeout = setTimeout(() => forceLinting(editor), 400);
    return () => clearTimeout(timeout);
  });
</script>

{#if intelligenceError}<p class="intelligence-notice" role="status">{intelligenceError}</p>{/if}
{#if baselineError}<p role="alert">Git change markers could not load: {baselineError}</p>{/if}
{#if languageError}<p role="alert">Syntax highlighting could not load: {languageError}</p>{/if}
<div class="code-editor" bind:this={container}></div>

<style>
  .intelligence-notice { margin: 0; padding: 6px 16px; font-size: 11px; background: var(--color-surface); }
  :global(.cm-tooltip-hover:has(.cm-language-hover)) { max-height: min(480px, 70vh); overflow: auto; box-sizing: border-box; overscroll-behavior: contain; }
  :global(.cm-language-hover) { max-width: min(640px, 80vw); padding: 4px; font-size: 13px; line-height: 1.6; }
  :global(.cm-hover-metadata) { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 2px; font-family: var(--font-interface); font-size: 11px; }
  :global(.cm-hover-metadata > span) { padding: 1px 6px; border-radius: 4px; background: var(--color-toolbar-background); color: var(--color-toolbar-foreground); }
  :global(.cm-hover-signature) { margin: 0; padding: 8px 10px; border-radius: 2px; background: var(--color-background); white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
  :global(.cm-hover-signature > code) { font: inherit; }
  :global(.cm-hover-description) { padding: 8px 10px; border-radius: 2px; background: var(--color-background); font-family: var(--font-interface); white-space: normal; overflow-wrap: anywhere; }
  :global(.cm-hover-signature + .cm-hover-description) { margin-top: 2px; }
  :global(.cm-hover-description p) { margin: 0; }
  :global(.cm-hover-description p + p) { margin-top: 6px; }
  :global(.cm-hover-description pre) { margin: 6px 0; padding: 6px 8px; background: var(--color-surface); border-radius: 2px; white-space: pre-wrap; overflow-wrap: anywhere; }
  :global(.cm-hover-description code) { font-family: var(--font-editor, monospace); font-size: .95em; }
  :global(.cm-hover-description :not(pre) > code) { background: var(--color-surface); border-radius: 2px; padding: 0 3px; }
  :global(.cm-hover-description a) { color: var(--palette-8); text-decoration: underline; }
  :global(.cm-hover-description ul), :global(.cm-hover-description ol) { margin: 6px 0; padding-left: 20px; }
  :global(.cm-hover-description :is(h1,h2,h3,h4,h5,h6)) { margin: 6px 0; font-size: 1em; font-weight: 700; }
  :global(.cm-hover-description > :first-child) { margin-top: 0; }
  :global(.cm-hover-description > :last-child) { margin-bottom: 0; }
  .code-editor { height: 100%; min-height: 0; min-width:0; overflow: hidden; }
</style>
