// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { handlebarsLanguage } from '@gentrace/codemirror-lang-handlebars';
import { handlebarsSupport } from '../editor/handlebars.ts';
export function create() { return handlebarsSupport(handlebarsLanguage); }
