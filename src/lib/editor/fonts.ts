// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import catalog from './google-fonts.json' with {type:'json'};
import interfaceCatalog from './interface-fonts.json' with {type:'json'};
export const interfaceFonts = interfaceCatalog;
export const interfaceFontChoices = ['montserrat','system','serif','monospace',...interfaceCatalog.map(font=>`google:${font.family}`)];
export const editorFonts = catalog;
export const isBundledEditorFont = (key: string) => ['google:JetBrains Mono','google:Montserrat','google:Geomini'].includes(key);
export const editorFontChoices = ['system', 'courier', ...catalog.map(font => `google:${font.family}`)];
export const googleFont = (key: string) => interfaceCatalog.find(font => `google:${font.family}` === key);
export function editorFontStack(key: string): string {
  const font = googleFont(key);
  return font ? `${JSON.stringify(font.family)}, ui-monospace, monospace` : key === 'courier' ? "'Courier New', monospace" : 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
}
export function fontStylesheet(key: string): string {
  const font = googleFont(key);
  if (!font) throw new Error('Unknown editor font.');
  const styles = font.styles.map(style => `${style.endsWith('i') ? 1 : 0},${parseInt(style)}`).sort((a,b) => a.localeCompare(b, 'en', {numeric:true}));
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family).replaceAll('%20','+')}:ital,wght@${styles.join(';')}&display=swap`;
}

export function interfaceFontStack(key: string): string {
  const font = googleFont(key);
  if(font)return `${JSON.stringify(font.family)}, ${font.category === 'Monospace' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`;
  return ({montserrat:'Montserrat, sans-serif',system:'system-ui, sans-serif',serif:'ui-serif, Georgia, serif',monospace:'ui-monospace, monospace',rationale:'Rationale, sans-serif'} as Record<string,string>)[key] ?? 'Montserrat, sans-serif';
}
