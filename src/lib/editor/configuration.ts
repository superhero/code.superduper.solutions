// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import { editorKeybindings } from "./editor-keybindings";
import { gitChangeGutter } from "./git-gutter";
import { editorScrolling } from "./scrolling";
import { editorMinimap } from "./minimap";
import { completionLabels } from "./completion-labels";
import { completionNavigation } from "./completion-navigation";
import { editorFontStack } from "./fonts";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, highlightWhitespace } from "@codemirror/view";
import { temporarilySetTabFocusMode } from "@codemirror/commands";
import { foldGutter, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { highlightSelectionMatches } from "@codemirror/search";
import type { EditorSettings } from "./settings";
import { indentationExtensions } from "./indentation";
import { syntaxColors } from "./highlighting";
import { selectionMatchOutlines } from "./match-outlines";
import { joinedSelectionBackground } from "./selection-background";
import { bracketScope } from "./bracket-scope";

/** Explicit extension composition: Git owns history; CodeMirror never does. */
export function editorExtensions(settings: EditorSettings,
  callbacks: { undo(): void; redo(): void }, documentLabel="Code editor document"): Extension[] {
  return [
    settings.autocomplete ? [completionNavigation(settings.keybindings), completionLabels] : [],
    editorKeybindings(settings, callbacks),
    EditorView.domEventHandlers({ beforeinput(event) {
      if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") return false;
      event.preventDefault();
      if (event.inputType === "historyUndo") callbacks.undo(); else callbacks.redo();
      return true;
    } }),
    // Arm the native Tab escape even when Escape also dismisses completion
    // or clears a selection before CodeMirror's fallback handler sees it.
    settings.tabBehavior === "indent" ? EditorView.domEventObservers({
      keydown(event, view) {
        if (event.key === "Escape") temporarilySetTabFocusMode(view);
      },
    }) : [],
    EditorState.allowMultipleSelections.of(true),
    EditorView.contentAttributes.of({ "aria-label": documentLabel, spellcheck: "false" }),
    indentationExtensions(settings),
    editorScrolling(settings),
    highlightSpecialChars(), drawSelection(), dropCursor(), rectangularSelection(), highlightSelectionMatches(),
    joinedSelectionBackground, selectionMatchOutlines(),
    settings.lineWrapping ? EditorView.lineWrapping : [],
    settings.lineNumbers ? lineNumbers() : [],
    settings.minimap ? editorMinimap : [],
    settings.foldGutter ? foldGutter() : [],
    gitChangeGutter,
    settings.highlightActiveLine ? [highlightActiveLine(), highlightActiveLineGutter()] : [],
    settings.bracketMatching ? bracketScope : [],
    settings.closeBrackets ? closeBrackets() : [],
    settings.autocomplete ? autocompletion({ defaultKeymap: false, interactionDelay: 0, activateOnTypingDelay: 25, updateSyncTime: 25 }) : [],
    settings.indentOnInput ? indentOnInput() : [],
    settings.highlightWhitespace ? highlightWhitespace() : [],
    syntaxColors(settings),
    editorTheme(settings)
  ];
}

// Inset edges separate contiguous change blocks without changing line height.
const changeBlockEdges:Record<string,Record<string,string>>={};
for(const selector of [
  '.cm-line.cm-git-added-line','.cm-line.cm-git-modified-line',
  '.cm-gutterElement.cm-git-added','.cm-gutterElement.cm-git-modified',
  ...['added','modified','removed'].flatMap(kind=>[`.cm-line.cm-diff-${kind}`,`.cm-gutterElement.cm-diff-${kind}`])
]){
  changeBlockEdges[selector]={
    '--change-edge-top':'0px','--change-edge-bottom':'0px',
    boxShadow:'inset 0 var(--change-edge-top) 0 0 color-mix(in srgb,var(--color-surface) 20%,var(--color-background)), inset 0 var(--change-edge-bottom) 0 0 color-mix(in srgb,var(--color-surface) 20%,var(--color-background))'
  };
  changeBlockEdges[`${selector}:not(${selector} + ${selector})`]={'--change-edge-top':'1px'};
  changeBlockEdges[`${selector}:not(:has(+ ${selector}))`]={'--change-edge-bottom':'-1px'};
}

/** Shared visual foundation for the editor and read-only file diff. */
export function editorTheme(settings:EditorSettings){
  return EditorView.theme({
      ...changeBlockEdges,
      "&": { height: "100%", fontSize: `${settings.fontSize}px`, color: "var(--syntax-text, var(--color-foreground))", backgroundColor: "var(--color-background)" },
      ".cm-scroller": { overflow: "auto", overscrollBehavior: "contain", fontFamily: editorFontStack(settings.fontFamily), lineHeight: String(settings.lineHeight) },
      ...(!settings.scrollbars ? {
        ".cm-scroller.cm-has-minimap": { scrollbarWidth: "none" },
        ".cm-scroller.cm-has-minimap::-webkit-scrollbar": { display: "none" }
      } : {}),
      ".cm-content": { padding: "20px 0", caretColor: "var(--color-foreground)" },
      ".cm-line.cm-fold-boundary": { position: "relative" },
      ".cm-line.cm-fold-boundary::after": { content: '""', position: "absolute", bottom: "0", left: "0", right: "0", height: "2px", backgroundColor: "color-mix(in srgb, var(--color-surface) 20%, var(--color-background))", pointerEvents: "none" },
      ".cm-line": { padding: "0 24px 0 16px" },
      // Fold widgets have zero-width cursor buffers. Keep their 1em boxes inside
      // the text bounds instead of raising the baseline at tight line heights.
      "& .cm-foldPlaceholder": { backgroundColor: "transparent", color: "var(--color-foreground)", border: "none", borderRadius: "4px", padding: "0 3px", cursor: "pointer" },
      ".cm-widgetBuffer:has(+ .cm-foldPlaceholder), .cm-foldPlaceholder + .cm-widgetBuffer": { verticalAlign: "middle" },
      ".cm-gutters": { backgroundColor: "var(--color-background)", color: "var(--color-foreground)", borderWidth: "0 2px 0 0", borderStyle: "solid", borderColor: "color-mix(in srgb, var(--color-surface) 20%, var(--color-background))", padding: "0" },
      "& .cm-gutters.cm-gutters-before": { borderLeftWidth: "0px", borderTopWidth: "0px", borderBottomWidth: "0px", borderRightWidth: "2px", borderRightStyle: "solid", borderRightColor: "color-mix(in srgb, var(--color-surface) 20%, var(--color-background))" },
      ".cm-lineNumbers .cm-gutterElement": { backgroundColor: "var(--color-background)", color: "var(--color-foreground)" },
      // The open/closed glyphs can use different fallback-font widths.
      ".cm-foldGutter .cm-gutterElement": { width: "1.2em", textAlign: "center" },
      ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--syntax-activeLine, var(--color-surface)) 25%, transparent)" },
      "& .cm-gutters .cm-gutterElement.cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--syntax-activeLine, var(--color-surface)) 25%, var(--color-background))", color: "var(--color-foreground)" },
      "&.cm-focused": { outline: "none" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-foreground)" },
      ".cm-joinedSelectionLayer .cm-selectionBackground": { backgroundColor: "var(--color-editor-selection-background)", boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--color-foreground) 20%, var(--color-background)), inset 0 -1px 0 0 color-mix(in srgb, var(--color-foreground) 20%, var(--color-background))" },
      // Keep syntax colors; drawSelection suppresses this native fill where used.
      "& ::selection": { backgroundColor: "var(--color-editor-selection-background)", color: "currentColor" },
      ".cm-selectionMatch, .cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--color-surface)", borderWidth: "0px", borderRadius: "4px", outline: "none" },
      ".cm-panels": { backgroundColor: "var(--color-surface)", color: "var(--color-foreground)", border: "none" },
      ".cm-tooltip": { backgroundColor: "var(--color-surface)", color: "var(--color-foreground)", border: "2px solid var(--color-border)", borderRadius: "4px" },
      ".cm-tooltip-autocomplete > ul": { borderRadius: "2px" },
      ".cm-completionMatchGap": { textDecoration: "line-through" },
      ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "700" },
      ".cm-tooltip-autocomplete > ul > li[aria-selected=\"true\"]": { backgroundColor: "var(--color-toolbar-background)", color: "var(--color-toolbar-foreground)" },
      "& .cm-panels-bottom": { borderTop: "2px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background))" },
      ".cm-search": { padding: "8px" },
      ".cm-search-row": { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" },
      ".cm-search .cm-textfield": { height: "28px", width: "260px", maxWidth: "100%", boxSizing: "border-box", padding: "0 10px", fontSize: "inherit" },
      "& .cm-panel.cm-search .cm-button": { background: "transparent", border: "none", boxShadow: "none", minHeight: "28px", padding: "0 12px", fontSize: "inherit", boxSizing: "border-box" },
      ".cm-search-input-group": { display: "inline-flex", alignItems: "center", backgroundColor: "var(--color-background)", borderRadius: "4px", maxWidth: "100%", overflow: "hidden", paddingRight: "10px", marginRight: "0" },
      "& .cm-search-input-group .cm-textfield": { background: "transparent", margin: "0", minWidth: "0" },
      "& .cm-panel.cm-search .cm-search-input-group .cm-search-icon-button": { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0", margin: "0", width: "22px", height: "24px", minHeight: "0", flexShrink: "0" },
      ".cm-search-input-group .cm-search-icon-button .material-symbols-rounded": { fontSize: "18px" },
      "& .cm-panel.cm-search .cm-search-icon-button + .cm-search-icon-button": { marginLeft: "8px" },
      "& .cm-search-input-group :focus-visible": { outline: "none" },
      '& .cm-panel.cm-search button[name="toggle-replace"].cm-button': { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0", background: "transparent", border: "none", boxShadow: "none", minHeight: "0", cursor: "pointer", position: "absolute", left: "0", top: "0", width: "24px", height: "28px", margin: "0", lineHeight: "1" },
      '& .cm-panel.cm-search button[name="toggle-replace"].cm-button:focus-visible': { outline: "none", boxShadow: "none" },
      ".cm-search-row label": { display: "inline-flex", alignItems: "center", gap: "4px", margin: "0", cursor: "pointer" },
      "& .cm-panel.cm-search .cm-search-row label": { margin: "0 0 0 8px" },
      ".cm-search-row label input[type=checkbox]": { appearance: "none", position: "relative", margin: "0", flexShrink: "0", width: "28px", height: "16px", border: "none", outline: "none", boxShadow: "none", borderRadius: "999px", backgroundColor: "var(--color-background)", cursor: "pointer" },
      ".cm-search-row label input[type=checkbox]::after": { content: '""', position: "absolute", top: "3px", left: "3px", width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "var(--color-foreground)", opacity: "0.5", transition: "transform 120ms ease, opacity 120ms ease" },
      ".cm-search-row label input[type=checkbox]:checked::after": { transform: "translateX(12px)", opacity: "1" },
      ".cm-search-row label input[type=checkbox]:focus-visible": { backgroundColor: "var(--color-foreground)" },
      ".cm-search-row label input[type=checkbox]:focus-visible::after": { backgroundColor: "var(--color-background)", opacity: "1" },
      "@media (prefers-reduced-motion: reduce)": { ".cm-search-row label input[type=checkbox]::after": { transition: "none" }, ".cm-search-expansion": { transition: "none" } },
      '& .cm-panel.cm-search button[name="toggle-replace"] .material-symbols-rounded': { display: "block", lineHeight: "1", fontSize: "20px" },
      '.cm-search button[hidden]': { display: "none" },
      ".cm-search-row[hidden]": { display: "none" },
      ".cm-search-find-row": { position: "relative", paddingLeft: "30px" },
      ".cm-search-replace-row": { paddingLeft: "30px", paddingTop: "6px" },
      ".cm-search-expansion": { display: "grid", gridTemplateRows: "0fr", transition: "grid-template-rows 160ms ease-in-out" },
      ".cm-search-expansion.cm-expanded": { gridTemplateRows: "1fr" },
      ".cm-search-expansion-clip": { minHeight: "0", overflow: "hidden" },
      ".cm-textfield": { backgroundColor: "var(--color-background)", color: "var(--color-foreground)", border: "none", borderRadius: "4px", outline: "none", boxShadow: "none" },
      ".cm-button": { background: "var(--color-background)", color: "var(--color-foreground)", border: "none", borderRadius: "4px", outline: "none", boxShadow: "none" }

  });
}
