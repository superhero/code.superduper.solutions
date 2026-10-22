// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { getLanguageService } from 'yaml-language-server/out/src/languageservice/yamlLanguageService.js';
import { doc, result, schemaReader } from './common';
import type { EngineRequest } from '../catalog';
export async function run(request: EngineRequest) {
  const service = getLanguageService({ schemaRequestService: schemaReader(request.files),
    workspaceContext: { resolveRelativePath: (relative,resource)=>new URL(relative,resource).href } });
  service.configure({ validate:true, hover:true, completion:true, format:false });
  const document = doc(request), position = document.positionAt(request.position);
  return result(request,request.method === 'completion' ? { completions:(await service.doComplete(document,position,false)).items }
    : request.method === 'hover' ? { hover:await service.doHover(document,position) } : { diagnostics:await service.doValidation(document,false) });
}
