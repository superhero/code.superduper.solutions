// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { getLanguageService } from 'vscode-html-languageservice';
import { doc, result } from './common';
import type { EngineRequest } from '../catalog';
const service = getLanguageService();
export async function run(request: EngineRequest) {
  const document = doc(request), html = service.parseHTMLDocument(document), position = document.positionAt(request.position);
  return result(request, request.method === 'completion' ? { completions: service.doComplete(document, position, html).items }
    : request.method === 'hover' ? { hover: service.doHover(document,position,html) } : { diagnostics: [] });
}
