// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { getLanguageService } from 'vscode-json-languageservice';
import { doc, result, schemaReader } from './common';
import type { EngineRequest } from '../catalog';
export async function run(request: EngineRequest) {
  const service = getLanguageService({ schemaRequestService: schemaReader(request.files) });
  service.configure({ allowComments: request.language === 'jsonc', validate: true });
  const document = doc(request), parsed = service.parseJSONDocument(document), position = document.positionAt(request.position);
  return result(request, request.method === 'completion' ? { completions: (await service.doComplete(document,position,parsed))?.items ?? [] }
    : request.method === 'hover' ? { hover: await service.doHover(document,position,parsed) }
    : { diagnostics: await service.doValidation(document,parsed,{ comments: request.language === 'jsonc' ? 'ignore' : 'error', trailingCommas: request.language === 'jsonc' ? 'ignore' : 'error' }) });
}
