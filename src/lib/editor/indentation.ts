// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { EditorState, type Extension } from "@codemirror/state";
import { indentService, indentUnit } from "@codemirror/language";
import type { EditorSettings } from "./settings";

export function indentationExtensions(settings: Pick<EditorSettings, "tabSize" | "indentSize" | "indentWithTabs">): Extension {
  // CodeMirror needs a positive tab width and a nonempty, uniform indent unit.
  const tabWidth = Math.max(1, settings.tabSize);
  const indentation = settings.indentSize === 0 ? " "
    : settings.indentWithTabs && settings.indentSize % tabWidth === 0
      ? "\t".repeat(settings.indentSize / tabWidth)
      : " ".repeat(settings.indentSize);
  return [EditorState.tabSize.of(tabWidth), indentUnit.of(indentation),
    settings.indentSize === 0 ? indentService.of(() => 0) : []];
}
