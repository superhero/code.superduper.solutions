// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { changedLineRanges } from "./line-changes.ts";

const identifier = "[\\p{L}_$][\\p{L}\\p{N}_$]*";
const modifiers = "(?:(?:export|default|async|pub|public|private|protected|static|abstract|declare)\\s+)*";
const declarations = [
  ["function", new RegExp(`^${modifiers}(?:function\\s*\\*?\\s+|def\\s+|fn\\s+|func\\s+)(${identifier})`, "u")],
  ["class", new RegExp(`^${modifiers}class\\s+(${identifier})`, "u")],
  ["interface", new RegExp(`^${modifiers}interface\\s+(${identifier})`, "u")],
  ["type", new RegExp(`^${modifiers}type\\s+(${identifier})`, "u")],
  ["enum", new RegExp(`^${modifiers}enum\\s+(${identifier})`, "u")],
  ["struct", new RegExp(`^${modifiers}struct\\s+(${identifier})`, "u")],
  ["variable", new RegExp(`^${modifiers}(?:const|let|var)\\s+(${identifier})`, "u")],
] as const;
function declaration(text: string): { kind: string; name: string } | undefined {
  for (const [kind, pattern] of declarations) {
    const match = pattern.exec(text);
    if (match) return { kind, name: match[1]! };
  }
  return undefined;
}
// Preserve complete literals and operators when finding the changed tokens.
// A character-prefix comparison would describe 5000 → 10000 as 5 → 10.
const tokens = (text: string): string[] => text.match(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|(?:0[xob][\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)n?|[\p{L}_$][\p{L}\p{N}_$]*|===|!==|==|!=|<=|>=|=>|&&|\|\||\?\?|\?\.|\+\+|--|\+=|-=|\*=|\/=|[^\s]/giu) ?? [];
const scalar = (text: string): boolean => /^(?:[\p{L}_$][\p{L}\p{N}_$]*|(?:0[xob][\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)n?|[=!<>+*/%&|?^-]{1,3})$/iu.test(text);
const quoted = (text: string): boolean => /^["'`]/.test(text);
function target(text: string): string | undefined {
  const declared = declaration(text);
  if (declared) return declared.kind === "variable" ? declared.name : `${declared.kind} ${declared.name}`;
  if (/^return\b/.test(text)) return "return value";
  if (/^(?:else\s+)?(?:if|while|for)\s*\(/.test(text)) return "condition";
  if (/^(?:import|from|use|require)\b/.test(text)) return "import";
  const assignment = /^((?:[\p{L}_$][\p{L}\p{N}_$]*\.)*[\p{L}_$][\p{L}\p{N}_$]*)\s*(?:=(?!=)|:=|\+=|-=)/u.exec(text);
  if (assignment) return assignment[1];
  const property = /^(?:"([\p{L}\p{N}_$.-]+)"|'([\p{L}\p{N}_$.-]+)'|([\p{L}_$-][\p{L}\p{N}_$.-]*))\s*:/u.exec(text);
  if (property) return property[1] ?? property[2] ?? property[3];
  const call = /^(?:await\s+|new\s+)?([\p{L}_$][\p{L}\p{N}_$]*(?:\.[\p{L}_$][\p{L}\p{N}_$]*)*)\s*\(/u.exec(text);
  return call ? `call to ${call[1]}` : undefined;
}
function title(text: string): string {
  // History renders Markdown. Keep generated identifiers/operators literal and
  // keep every automatic subject to one short line, including escaped markup.
  const escaped = text.replace(/\s+/g, " ").trim().replace(/[\\`*_[\]<>]/g, "\\$&");
  const characters = Array.from(escaped);
  return characters.length <= 72 ? escaped : characters.slice(0, 71).join("").replace(/\\$/, "").trimEnd() + "…";
}

/** Describe observable changes; do not invent intent or copy string contents. */
export function editMessage(path: string, before: string, after: string, action?: "format"): string {
  if (action === "format") return "Format document";
  if (before === after) return "Restore original content";
  const oldLines = before.replace(/\r\n?/g, "\n").split("\n"), newLines = after.replace(/\r\n?/g, "\n").split("\n");
  if (oldLines.join("\n") === newLines.join("\n")) return "Change line endings";
  if (!before.endsWith("\n") && after === before + "\n") return "Add final newline";
  if (!after.endsWith("\n") && before === after + "\n") return "Remove final newline";
  let start = 0, endBefore = oldLines.length, endAfter = newLines.length;
  while (start < endBefore && start < endAfter && oldLines[start] === newLines[start]) start++;
  while (endBefore > start && endAfter > start && oldLines[endBefore - 1] === newLines[endAfter - 1]) { endBefore--; endAfter--; }
  const removed = oldLines.slice(start, endBefore).join("\n").trim(), added = newLines.slice(start, endAfter).join("\n").trim();
  if (removed === added) return oldLines.map(line => line.replace(/^[ \t]+/, "")).join("\n") === newLines.map(line => line.replace(/^[ \t]+/, "")).join("\n") ? "Adjust indentation" : "Adjust whitespace";
  const oldDeclaration = declaration(removed), newDeclaration = declaration(added);
  if (!removed && newDeclaration) return title(`Add ${newDeclaration.kind} ${newDeclaration.name}`);
  if (!added && oldDeclaration) return title(`Remove ${oldDeclaration.kind} ${oldDeclaration.name}`);
  if (endBefore - start <= 1 && endAfter - start <= 1) {
    const comment = (text: string) => /^(?:\/\/|\/\*|\*\s)/.test(text) || (/\.(?:py|rb|sh|ya?ml|toml|env|conf)$/i.test(path) && text.startsWith("#"));
    if (comment(removed) && comment(added)) return "Update comment";
    const oldTokens = tokens(removed), newTokens = tokens(added);
    let from = 0, toBefore = oldTokens.length, toAfter = newTokens.length;
    while (from < toBefore && from < toAfter && oldTokens[from] === newTokens[from]) from++;
    while (toBefore > from && toAfter > from && oldTokens[toBefore - 1] === newTokens[toAfter - 1]) { toBefore--; toAfter--; }
    if (from === toBefore && from === toAfter) return "Adjust whitespace";
    const oldPart = oldTokens.slice(from, toBefore), newPart = newTokens.slice(from, toAfter);
    if (oldPart.length === 1 && newPart.length === 1 && oldDeclaration && newDeclaration && oldDeclaration.kind === newDeclaration.kind &&
      oldPart[0] === oldDeclaration.name && newPart[0] === newDeclaration.name)
      return title(`Rename ${oldDeclaration.kind} ${oldDeclaration.name} → ${newDeclaration.name}`);
    const oldTarget = target(removed), newTarget = target(added), subject = oldTarget === newTarget ? newTarget : undefined;
    const code = /\.(?:[cm]?[jt]sx?|css|scss|less|py|rb|rs|go|java|[ch](?:pp)?|cs|php|sql|sh|svelte|vue)$/i.test(path);
    const value = (text: string) => /^(?:true|false|null|undefined|None|True|False|(?:0[xob][\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)n?|[=!<>+*/%&|?^-]{1,3})$/iu.test(text);
    if (oldPart.length === 1 && newPart.length === 1 && scalar(oldPart[0]!) && scalar(newPart[0]!) && (subject || code) &&
      (code || value(oldPart[0]!) && value(newPart[0]!)))
      return title(`Change ${subject ? `${subject}: ` : ""}${oldPart[0]} → ${newPart[0]}`);
    if (subject) return title(`Update ${subject}${oldPart.length === 1 && newPart.length === 1 && quoted(oldPart[0]!) && quoted(newPart[0]!) ? " string" : ""}`);
  }
  if (oldDeclaration && newDeclaration && oldDeclaration.kind === newDeclaration.kind && oldDeclaration.kind !== "variable" && oldDeclaration.name === newDeclaration.name)
    return title(`Update ${newDeclaration.kind} ${newDeclaration.name}`);
  const ranges = changedLineRanges(before, after), count = (side: typeof ranges.before) => side.reduce((sum, range) => sum + range.to - range.from + 1, 0);
  const oldCount = count(ranges.before), newCount = count(ranges.after);
  if (!oldCount) return newCount === 1 ? "Add line" : `Add ${newCount} lines`;
  if (!newCount) return oldCount === 1 ? "Remove line" : `Remove ${oldCount} lines`;
  return oldCount === 1 && newCount === 1 ? "Update text" : oldCount === newCount ? `Update ${newCount} lines` : `Replace ${oldCount} lines with ${newCount}`;
}
