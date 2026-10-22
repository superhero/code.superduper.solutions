// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { buildSchema } from 'graphql';
import { Position, getDiagnostics, getAutocompleteSuggestions, getHoverInformation } from 'graphql-language-service';
import { doc, result } from './common';
import type { EngineRequest } from '../catalog';
export async function run(request: EngineRequest) {
  const source = request.files[request.path]??'', document = doc(request), position = document.positionAt(request.position);
  const schemaSource = request.files['schema.graphql'];
  const schema = schemaSource ? buildSchema(schemaSource) : undefined;
  if (request.method === 'diagnostics') return result(request,{ diagnostics:getDiagnostics(source,schema) });
  if (!schema) return {};
  return result(request,request.method === 'completion' ? { completions:getAutocompleteSuggestions(schema,source,new Position(position.line,position.character)) }
    : { hover:{ contents:getHoverInformation(schema,source,new Position(position.line,position.character)) } });
}
