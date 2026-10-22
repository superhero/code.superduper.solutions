// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { HighlightStyle, language, syntaxHighlighting, syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { Facet, Prec, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { visibleSemanticHighlights } from "./semantic-highlights";
import { ACCENT_ROLES, colorMappingValues, type ColorMappings } from "./color-mappings";
import { nativeMainSelection } from "./selection-background";
import "./parameter-background.css";

export { semanticHighlights } from "./semantic-highlights";

type RGB = number[];
interface ColorPreferences { colorMappings: ColorMappings; selectionOpacity: number }
const colorPreferences = Facet.define<ColorPreferences, ColorPreferences>({
  combine: values => values[0] ?? { colorMappings: {}, selectionOpacity: 20 },
});

function luminance(rgb: RGB): number {
  return rgb.slice(0, 3).map(channel => channel / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
}

function contrast(a: RGB, b: RGB): number {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

// Adjust lightness while preserving hue and saturation, rather than washing
// dark accents out by mixing every RGB channel toward white.
function readable(accent: RGB, foreground: RGB, backgrounds: RGB[]): string {
  const minimumContrast = (color: RGB) => Math.min(...backgrounds.map(background => contrast(color, background)));
  const target = [foreground, [0, 0, 0], [255, 255, 255]]
    .sort((a, b) => minimumContrast(b) - minimumContrast(a))[0]!;
  const channels = accent.map(channel => channel / 255);
  const low = Math.min(...channels), high = Math.max(...channels);
  const lightness = (low + high) / 2, chroma = high - low;
  const saturation = chroma ? chroma / (1 - Math.abs(2 * lightness - 1)) : 0;
  const targetLightness = (Math.min(...target) + Math.max(...target)) / 510;
  for (let step = 0; step <= 100; step += 2) {
    const next = lightness + (targetLightness - lightness) * step / 100;
    const nextChroma = (1 - Math.abs(2 * next - 1)) * saturation;
    const color = channels.map(channel => Math.round(255 * (
      (chroma ? (channel - low) / chroma * nextChroma : 0) + next - nextChroma / 2)));

    if (backgrounds.every(background => contrast(color, background) >= 4.5)) return `rgb(${color.join(" ")})`;
  }
  return `rgb(${target.join(" ")})`;
}

/** One color adapter serves CodeMirror and the Settings swatches. */
export function colorMappingPreview(element: HTMLElement, preferences: ColorPreferences) {
    let current = preferences;
    const document = element.ownerDocument;
    const root = document.documentElement;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgb = (color: string): RGB => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const apply = () => {
      const styles = getComputedStyle(root);
      const role = (name: string) => rgb(styles.getPropertyValue(`--color-${name}`).trim());
      const foreground = role("foreground");
      const backgrounds = [role("background"), role("surface")];
      ACCENT_ROLES.forEach((name, index) => {
        const accent = rgb(styles.getPropertyValue(`--palette-${index + 7}`).trim());
        const color = readable(accent, foreground, backgrounds);
        element.style.setProperty(`--syntax-accent-${name}`, color);
        if (name === "string") root.style.setProperty("--color-git-added", color);
      });
      for (const [role, color] of Object.entries(colorMappingValues(current.colorMappings)))
        element.style.setProperty(`--syntax-${role}`, color);
      element.style.setProperty("--color-editor-selection-background",
        `color-mix(in srgb, var(--syntax-selection) ${current.selectionOpacity}%, transparent)`);
    };
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["data-palette", "data-theme"] });
    // Vite updates stylesheet text without changing palette/theme attributes.
    // Refresh existing editors as well as minimaps when live CSS is replaced.
    observer.observe(document.head, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["href", "media"] });
    apply();
    return { update(next: ColorPreferences) { current = next; apply(); }, destroy() { observer.disconnect(); } };
}

const paletteColors = ViewPlugin.fromClass(class {
  colors: ReturnType<typeof colorMappingPreview>;
  constructor(view: EditorView) {
    this.colors = colorMappingPreview(view.dom, view.state.facet(colorPreferences));
  }
  update(update: ViewUpdate) {
    if (update.startState.facet(colorPreferences) !== update.state.facet(colorPreferences))
      this.colors.update(update.state.facet(colorPreferences));
  }
  destroy() { this.colors.destroy(); }
});

export const syntaxHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "600" },
  { tag: [tags.operator, tags.function(tags.punctuation)], color: "var(--syntax-operator)" },
  { tag: tags.derefOperator, color: "var(--syntax-dot)" },
  { tag: tags.operatorKeyword, color: "var(--syntax-operator)", fontWeight: "600" },
  { tag: tags.string, color: "var(--syntax-string)", fontWeight: "700" },
  { tag: [tags.regexp, tags.inserted], color: "var(--syntax-string)" },
  { tag: [tags.number, tags.bool], color: "var(--syntax-number)", fontWeight: "700" },
  { tag: [tags.null, tags.escape], color: "var(--syntax-number)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--syntax-function)" },
  { tag: [tags.tagName, tags.typeName, tags.className, tags.namespace], color: "var(--syntax-type)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--syntax-property)" },
  { tag: [tags.meta, tags.annotation, tags.processingInstruction], color: "var(--syntax-keyword)" },
  { tag: tags.heading, color: "var(--syntax-function)", fontWeight: "700" },
  { tag: [tags.link, tags.url], color: "var(--syntax-function)", textDecoration: "underline" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.deleted, color: "var(--syntax-invalid)" },
  { tag: tags.invalid, color: "var(--syntax-invalid)", textDecoration: "underline wavy" }
]);


const scopedNames = ViewPlugin.fromClass(class {
  baseDecorations = Decoration.none;
  decorations = Decoration.none;
  constructor(view: EditorView) { this.build(view); this.select(view); }
  update(update: ViewUpdate) {
    const languageChanged = update.startState.facet(language) !== update.state.facet(language);
    const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
    if (languageChanged) this.baseDecorations = Decoration.none;
    else if (update.docChanged) this.baseDecorations = this.baseDecorations.map(update.changes);
    if (languageChanged || update.docChanged || update.viewportChanged || treeChanged) this.build(update.view);
    if (languageChanged || update.docChanged || update.viewportChanged || treeChanged || update.selectionSet) this.select(update.view);
  }
  select(view: EditorView) {
    const selected: Range<Decoration>[] = [];
    for (const range of view.state.selection.ranges) {
      if (range.empty || nativeMainSelection && range === view.state.selection.main) continue;
      this.baseDecorations.between(range.from, range.to, (from, to, mark) => {
        const selectedClass = /(?:^| )(?:cm-scope-parent|cm-scope-global|cm-scope-imported|cm-method-parameter|cm-function-parameter|cm-call-open|cm-call-close)(?: |$)/.test(mark.spec.class ?? "") ? "cm-scope-selection"
          : undefined;
        if (!selectedClass) return;
        const start = Math.max(from, range.from), end = Math.min(to, range.to);
        if (start < end) selected.push(Decoration.mark({ class: selectedClass }).range(start, end));
      });
    }
    this.decorations = selected.length ? this.baseDecorations.update({ add: selected, sort: true }) : this.baseDecorations;
  }
  build(view: EditorView) {
    // Wait for complete bindings instead of briefly misclassifying names whose
    // declarations lie in the parser's unfinished suffix. Keep mapped marks meanwhile.
    if (!syntaxTreeAvailable(view.state, view.state.doc.length)) return;
    const references = visibleSemanticHighlights(syntaxTree(view.state), view.state.doc, view.visibleRanges);
    this.baseDecorations = Decoration.set(references
      .map(reference => Decoration.mark({ class: reference.classes }).range(reference.from, reference.to)), true);
  }
}, { decorations: plugin => plugin.decorations });

export const syntaxColors = (preferences: ColorPreferences) => [colorPreferences.of(preferences), paletteColors, syntaxHighlighting(syntaxHighlightStyle), Prec.highest(scopedNames),
  EditorView.baseTheme({
    ".cm-scope-global": { color: "var(--syntax-globalText)", "--cm-token-background": "var(--syntax-global)" },
    ".cm-scope-parent": { color: "var(--syntax-parentText)", "--cm-token-background": "var(--syntax-parent)" },
    ".cm-scope-imported": { color: "var(--syntax-imported)", "--cm-token-background": "var(--syntax-importedBackground)" },
    ".cm-scope-class": { color: "var(--syntax-type)" },
    ".cm-syntax-undefined": { color: "var(--syntax-number)" },
    ".cm-parent-const": { fontWeight: "700" },
    ".cm-delimiter-keyword": { color: "var(--syntax-keyword)" },
    ".cm-delimiter-function": { color: "var(--syntax-function)" },
    ".cm-delimiter-operator": { color: "var(--syntax-operator)", fontWeight: "700" },
    ".cm-arrow-operator": { fontWeight: "700" },
    ".cm-delimiter-type": { color: "var(--syntax-type)" },
    ".cm-literal-delimiter": { fontWeight: "700" },
    ".cm-delimiter-string": { color: "var(--syntax-string)", fontWeight: "400" },
    ".cm-delimiter-property": { color: "var(--syntax-property)" },
    ".cm-delimiter-text": { color: "var(--syntax-text)" },
    ".cm-delimiter-parentText": { color: "var(--syntax-parentText)" },
    ".cm-delimiter-globalText": { color: "var(--syntax-globalText)" },
    ".cm-delimiter-imported": { color: "var(--syntax-imported)" },
    ".cm-delimiter-parameterText": { color: "var(--syntax-parameterText)" },
    ".cm-syntax-operator": { color: "var(--syntax-operator)" },
    ".cm-syntax-dot": { color: "var(--syntax-dot)" },
    ".cm-syntax-semicolon": { color: "var(--syntax-semicolon)" },
    ".cm-function-parameter": {
      color: "var(--syntax-parameterText)", "--cm-token-background": "var(--syntax-parameterBackground)"
    }
  })];
