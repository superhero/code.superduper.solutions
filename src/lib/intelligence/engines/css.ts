// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { getCSSLanguageService, getSCSSLanguageService, getLESSLanguageService } from 'vscode-css-languageservice';
import { doc, result } from './common';
import type { EngineRequest } from '../catalog';
const services = { css: getCSSLanguageService(), scss: getSCSSLanguageService(), less: getLESSLanguageService() };
export async function run(request: EngineRequest) {
  const service = services[request.language as keyof typeof services] ?? services.css;
  const document = doc(request), sheet = service.parseStylesheet(document), position = document.positionAt(request.position);
  return result(request, request.method === 'completion' ? { completions: service.doComplete(document,position,sheet).items }
    : request.method === 'hover' ? { hover: service.doHover(document,position,sheet) } : { diagnostics: service.doValidation(document,sheet) });
}
