// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { EngineRequest, EngineResult } from '../catalog';
import type { CompletionItem, Diagnostic, Hover, MarkedString, MarkupContent } from 'vscode-languageserver-types';
export const uri = (path: string) => `file:///repository/${path.split('/').map(encodeURIComponent).join('/')}`;
export const filePath = (value: string) => decodeURIComponent(new URL(value).pathname).replace(/^\/repository\//,'');
const documentVersions = new Map<string,{text:string;version:number}>();
export function doc(request:EngineRequest) {
  const source=request.files[request.path]??'',previous=documentVersions.get(request.path);
  const version=previous?.text===source?previous.version:(previous?.version??0)+1;
  documentVersions.set(request.path,{text:source,version});
  return TextDocument.create(uri(request.path),request.language,version,source);
}
export function text(value: MarkedString | MarkupContent | MarkedString[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value.map(item=>text(item)).join('\n\n') : typeof value === 'string' ? value : value.value;
}
export function result(request: EngineRequest, value: { diagnostics?: Diagnostic[]; completions?: CompletionItem[]; hover?: Hover | null | undefined }): EngineResult {
  const document = doc(request), position = request.position;
  const word = document.getText().slice(0,position).match(/[\w$-]*$/)?.[0] ?? '';
  return {
    ...(value.diagnostics ? { diagnostics: value.diagnostics.map(item=>({ from: document.offsetAt(item.range.start), to: document.offsetAt(item.range.end), severity: item.severity === 1 ? 'error' as const : item.severity === 2 ? 'warning' as const : 'info' as const, message: text(item.message) })) } : {}),
    ...(value.completions ? { completions: value.completions.filter(item=>!item.additionalTextEdits?.length).slice(0,300).map(item=>{
      const edit = item.textEdit, range = edit && ('range' in edit ? edit.range : edit.replace);
      return { label: item.label, detail: item.detail ?? '', snippet: item.insertTextFormat === 2, insert: edit?.newText ?? item.insertText ?? item.label,
        from: range ? document.offsetAt(range.start) : position-word.length, to: range ? document.offsetAt(range.end) : position };
    }) } : {}),
    ...(value.hover ? { hover: { from: value.hover.range ? document.offsetAt(value.hover.range.start) : position-word.length,
      to: value.hover.range ? document.offsetAt(value.hover.range.end) : position, text: text(value.hover.contents) } } : {})
  };
}
export function schemaReader(files: Record<string,string>) {
  return async (address: string) => {
    if (!address.startsWith('file:///repository/')) throw new Error('Only repository-local schemas are available.');
    const content = files[filePath(address)];
    if (content === undefined) throw new Error('The schema was not found in this repository.');
    return content;
  };
}
