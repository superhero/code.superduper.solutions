// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { languageDataProp } from "@codemirror/language";
import type { Text } from "@codemirror/state";
import { NodeProp, type SyntaxNode, type Tree } from "@lezer/common";

export type NameScope = "local" | "parent" | "global" | "imported" | "unresolved";
export interface ScopedName { from: number; to: number; name: string; scope: NameScope; className?: true; constant?: true; literalConstant?: true; callClose?: number; callOpen?: number }
type BindingKind = "local" | "imported" | "parameter" | "method-parameter" | "class" | "const" | "literal-const";
interface ParameterRange { from: number; to: number; callClose?: number; callOpen?: number }
interface ScriptAnalysis { names: ScopedName[]; parameters: ParameterRange[]; methodParameters: ParameterRange[] }

// Runtime candidates, not a claim that every host provides every API. Imports
// and declarations always win, including names declared later in the scope.
const globals = new Set(`
  globalThis undefined NaN Infinity eval isFinite isNaN parseFloat parseInt
  decodeURI decodeURIComponent encodeURI encodeURIComponent
  Object Function Boolean Symbol Number BigInt Math Date String RegExp Array
  Error AggregateError EvalError RangeError ReferenceError SyntaxError TypeError URIError
  ArrayBuffer SharedArrayBuffer DataView Int8Array Uint8Array Uint8ClampedArray
  Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array
  Map Set WeakMap WeakSet WeakRef FinalizationRegistry JSON Promise Reflect Proxy Intl Atomics WebAssembly
  Iterator DisposableStack AsyncDisposableStack SuppressedError
  window self top parent frames document navigator location history screen console performance
  localStorage sessionStorage indexedDB caches crypto fetch atob btoa structuredClone
  alert confirm prompt open close requestAnimationFrame cancelAnimationFrame
  setTimeout clearTimeout setInterval clearInterval queueMicrotask
  URL URLSearchParams URLPattern TextEncoder TextDecoder TextEncoderStream TextDecoderStream
  Blob File FileList FileReader FormData Headers Request Response AbortController AbortSignal
  ReadableStream WritableStream TransformStream CompressionStream DecompressionStream
  Event EventTarget CustomEvent MessageEvent MessageChannel MessagePort
  Worker SharedWorker ServiceWorker WebSocket EventSource BroadcastChannel
  MutationObserver ResizeObserver IntersectionObserver PerformanceObserver DOMException
  Node Element HTMLElement Document DOMParser XMLSerializer Image Audio CSS CSSStyleSheet
  Buffer process global require module exports __dirname __filename setImmediate clearImmediate
`.trim().split(/\s+/));

const globalClasses = new Set(`
  Object Function Boolean Symbol Number BigInt Date String RegExp Array
  Error AggregateError EvalError RangeError ReferenceError SyntaxError TypeError URIError
  ArrayBuffer SharedArrayBuffer DataView Int8Array Uint8Array Uint8ClampedArray
  Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array
  Map Set WeakMap WeakSet WeakRef FinalizationRegistry Promise
  Iterator DisposableStack AsyncDisposableStack SuppressedError
  URL URLSearchParams URLPattern TextEncoder TextDecoder TextEncoderStream TextDecoderStream
  Blob File FileList FileReader FormData Headers Request Response AbortController AbortSignal
  ReadableStream WritableStream TransformStream CompressionStream DecompressionStream
  Event EventTarget CustomEvent MessageEvent MessageChannel MessagePort
  Worker SharedWorker ServiceWorker WebSocket EventSource BroadcastChannel
  MutationObserver ResizeObserver IntersectionObserver PerformanceObserver DOMException
  Node Element HTMLElement Document DOMParser XMLSerializer Image Audio CSSStyleSheet Buffer
`.trim().split(/\s+/));

type Kind = "script" | "function" | "body" | "block" | "class" | "catch" | "static" | "namespace" | "enum";
interface Scope {
  node: SyntaxNode;
  kind: Kind;
  parent?: Scope;
  group?: Scope;
  thisOwner?: Scope;
  names: Map<string, BindingKind>;
}
const functions = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunction", "MethodDeclaration"]);
const bindingOwners = new Set([...functions, "VariableDeclaration", "ParamList", "CatchClause", "ImportDeclaration", "ForOfSpec", "ForInSpec", "ClassDeclaration", "ClassExpression", "NamespaceDeclaration"]);
const typeOnly = new Set(["TypeParamList", "FunctionSignature", "MethodType"]);
const dataOperators = new Set(["+", "-", "*", "/", "%", "**", "<<", ">>", ">>>", "&", "|", "^"]);
const cache = new WeakMap<Tree, ScriptAnalysis & { document: Text }>();

// Object-literal methods use Property, unlike class MethodDeclaration nodes.
const isFunction = (node: SyntaxNode) => functions.has(node.name)
  || node.name === "Property" && node.getChild("ParamList") !== null;

function previousCode(node: SyntaxNode): SyntaxNode | null {
  let previous = node.prevSibling;
  while (previous?.name === "LineComment" || previous?.name === "BlockComment") previous = previous.prevSibling;
  return previous;
}

function typeImport(node: SyntaxNode, declaration: SyntaxNode): boolean {
  if (declaration.getChild("type")) return true;
  for (let previous = previousCode(node); previous && previous.name !== "," && previous.name !== "{"; previous = previousCode(previous)) {
    if (previous.name === "type") return true;
  }
  return false;
}

function analyzeScript(root: SyntaxNode, document: Text, offset: number): ScriptAnalysis {
  let current: Scope = { node: root, kind: "script", names: new Map() };
  const owners = [root];
  const pending: { node: SyntaxNode; scope: Scope }[] = [];
  const parameters: ParameterRange[] = [];
  const methodParameters: ParameterRange[] = [];
  const parameterRange = (node: SyntaxNode): ParameterRange => {
    const called = node.name === "VariableName" && node.parent?.name === "CallExpression"
      && node.parent.firstChild?.from === node.from;
    const argumentsList = called ? node.parent!.getChild("ArgList") : null;
    const open = argumentsList?.getChild("("), close = argumentsList?.getChild(")");
    return { from: node.from + offset, to: node.to + offset,
      ...(open ? { callOpen: open.from + offset } : {}),
      ...(close ? { callClose: close.from + offset } : {}) };
  };
  const parameter = (node: SyntaxNode) => parameters.push(parameterRange(node));
  interface ConstantValue { node: SyntaxNode | null; scope: Scope; result?: boolean; visiting?: boolean }
  const constantValues = new Map<Scope, Map<string, ConstantValue>>();
  const bindingScope = (scope: Scope, identifier: string): Scope | undefined => {
    let found: Scope | undefined = scope;
    while (found && !found.names.has(identifier)) found = found.parent;
    return found;
  };
  const dataBinding = (scope: Scope, identifier: string): boolean => {
    const found = bindingScope(scope, identifier);
    if (!found) return ["undefined", "NaN", "Infinity"].includes(identifier);
    const value = constantValues.get(found)?.get(identifier);
    if (!value || value.visiting) return false;
    if (value.result !== undefined) return value.result;
    value.visiting = true;
    value.result = dataValue(value.node, value.scope);
    value.visiting = false;
    return value.result;
  };
  const children = (node: SyntaxNode): SyntaxNode[] => {
    const result: SyntaxNode[] = [];
    for (let child = node.firstChild; child; child = child.nextSibling)
      if (!["LineComment", "BlockComment"].includes(child.name)) result.push(child);
    return result;
  };
  const dataValue = (initializer: SyntaxNode | null, scope: Scope): boolean => {
    let value = initializer;
    while (value) {
      if (value.name === "ParenthesizedExpression") value = value.firstChild?.nextSibling ?? null;
      else if (value.name === "BinaryExpression" && (value.getChild("as") || value.getChild("satisfies"))) value = value.firstChild;
      else break;
    }
    if (!value || value.type.isError) return false;
    if (["BooleanLiteral", "Number", "String", "TemplateString", "null"].includes(value.name)) return true;
    if (value.name === "VariableName") return dataBinding(scope, name(value));
    if (value.name === "BinaryExpression") {
      const parts = children(value);
      return parts.length === 3 && dataOperators.has(name(parts[1]!))
        && dataValue(parts[0]!, scope) && dataValue(parts[2]!, scope);
    }
    if (value.name === "UnaryExpression")
      return Boolean(value.getChild("Number")) && ["+", "-"].includes(name(value.firstChild!));
    if (value.name === "ArrayExpression")
      return children(value).filter(child => !["[", "]", ",", "Spread"].includes(child.name)).every(child => dataValue(child, scope));
    if (value.name === "ObjectExpression") return children(value).filter(child => !["{", "}", ","].includes(child.name)).every(property => {
      if (property.name !== "Property" || property.getChild("ParamList")) return false;
      const parts = children(property);
      const colon = parts.findIndex(child => child.name === ":");
      if (property.getChild("[")) {
        const key = parts[1];
        if (!key || !dataValue(key, scope)) return false;
      }
      if (colon >= 0) return dataValue(parts[colon + 1] ?? null, scope);
      if (parts[0]?.name === "Spread") return dataValue(parts[1] ?? null, scope);
      return parts.length === 1 && parts[0]?.name === "PropertyDefinition" && dataBinding(scope, name(parts[0]));
    });
    if (value.name === "NewExpression") {
      const parts = children(value), constructor = parts.find(child => child.name !== "new" && child.name !== "ArgList");
      let builtin = false;
      if (constructor?.name === "VariableName")
        builtin = ["Set", "Map"].includes(name(constructor)) && !bindingScope(scope, name(constructor));
      else if (constructor?.name === "MemberExpression") {
        const receiver = constructor.firstChild, property = constructor.getChild("PropertyName");
        builtin = Boolean(receiver && receiver.name === "VariableName" && name(receiver) === "globalThis"
          && !bindingScope(scope, "globalThis") && property && ["Set", "Map"].includes(name(property)));
      }
      if (!builtin) return false;
      const argumentsList = value.getChild("ArgList");
      if (!argumentsList) return true;
      const argumentsValues = children(argumentsList).filter(child => !["(", ")", ","].includes(child.name));
      return argumentsValues.length <= 1 && argumentsValues.every(argument => dataValue(argument, scope));
    }
    return false;
  };
  const name = (node: SyntaxNode) => document.sliceString(node.from + offset, node.to + offset);
  const bind = (scope: Scope, node: SyntaxNode | null, kind: BindingKind = "local") => {
    if (node) { scope.names.set(name(node), kind); if (kind === "parameter") parameter(node); else if (kind === "method-parameter") methodParameters.push(parameterRange(node)); }
  };
  root.cursor().iterate(cursor => {
    const node = cursor.node;
    if (typeOnly.has(node.name)) return false;
    if (bindingOwners.has(node.name) || isFunction(node)) owners.push(node);
    const outer = current;
    let kind: Kind | undefined;
    if (isFunction(node)) kind = "function";
    else if (["ClassDeclaration", "ClassExpression"].includes(node.name)) kind = "class";
    else if (node.name === "CatchClause") kind = "catch";
    else if (node.name === "StaticBlock") kind = "static";
    else if (node.name === "NamespaceDeclaration") kind = "namespace";
    else if (node.name === "EnumDeclaration") kind = "enum";
    else if (node.name === "Block") {
      kind = isFunction(node.parent!) ? "body" : "block";
    } else if (node.name === "ForStatement" || node.name === "SwitchBody") kind = "block";
    if (kind) {
      current = { node, kind, parent: outer, names: new Map() };
      // Keep lexical bindings distinct for shadowing, but only an independent
      // `this` context makes a reference visually belong to a parent scope.
      if (kind === "body" || kind === "block" || kind === "catch" || node.name === "ArrowFunction")
        current.thisOwner = outer.thisOwner ?? outer;
      if (kind === "body" || (node.name === "Block" && ["catch", "static", "namespace"].includes(outer.kind))) current.group = outer;
      if (kind === "function" && node.name !== "ArrowFunction") current.names.set("arguments", "local");
      const identifier = node.getChild("VariableDefinition") ?? node.getChild("TypeDefinition");
      if (["FunctionDeclaration", "ClassDeclaration", "NamespaceDeclaration", "EnumDeclaration"].includes(node.name)) {
        bind(outer, identifier, node.name === "ClassDeclaration" ? "class" : "local");
      }
      if (["FunctionExpression", "ClassExpression", "ClassDeclaration"].includes(node.name)) bind(current, identifier, kind === "class" ? "class" : "local");
    }
    if (node.name === "VariableDefinition") {
      const owner = owners.at(-1)!;
      if (owner.name === "ImportDeclaration") {
        if (!typeImport(node, owner)) {
          bind(current, node, "imported");
          pending.push({ node, scope: current });
        }
      } else if (["VariableDeclaration", "ForOfSpec", "ForInSpec"].includes(owner.name)) {
        let target = current;
        if (owner.getChild("var")) {
          while (target.parent && !["script", "body", "static", "namespace"].includes(target.kind)) target = target.parent;
        }
        let initializer = node.nextSibling;
        while (initializer && ["LineComment", "BlockComment", "TypeAnnotation"].includes(initializer.name)) initializer = initializer.nextSibling;
        if (initializer?.name === "Equals") initializer = initializer.nextSibling;
        while (initializer && ["LineComment", "BlockComment"].includes(initializer.name)) initializer = initializer.nextSibling;
        bind(target, node, owner.getChild("var") && ["parameter", "method-parameter"].includes((target.group ?? target).names.get(name(node)) ?? "") ? (target.group ?? target).names.get(name(node))!
          : initializer?.name === "ClassExpression" ? "class" : owner.getChild("const") ? "const" : "local");
        if (owner.getChild("const") && node.parent?.name === owner.name && target.names.get(name(node)) === "const") {
          let values = constantValues.get(target);
          if (!values) constantValues.set(target, values = new Map());
          values.set(name(node), { node: initializer, scope: current });
        }
      } else if (owner.name === "ParamList" && isFunction(owner.parent!)) {
        bind(current, node, owner.parent!.name === "FunctionDeclaration" ? "parameter" : "method-parameter");
      } else if (owner.name === "ArrowFunction" || owner.name === "CatchClause") bind(current, node, owner.name === "ArrowFunction" ? "method-parameter" : "local");
    } else if (node.name === "PropertyName" && node.parent?.name === "EnumBody") bind(current, node);
    else if (node.name === "VariableName") {
      // An imported source name is not a reference; its alias is the binding.
      if (owners.at(-1)!.name !== "ImportDeclaration") pending.push({ node, scope: current });
    }
  }, cursor => {
    const owner = owners.at(-1)!;
    if (cursor.from === owner.from && cursor.to === owner.to && cursor.type === owner.type) owners.pop();
    if (current.parent && cursor.from === current.node.from && cursor.to === current.node.to && cursor.type === current.node.type) current = current.parent;
  });
  for (const [scope, values] of constantValues)
    for (const identifier of values.keys())
      if (dataBinding(scope, identifier)) scope.names.set(identifier, "literal-const");
  const names = pending.map(({ node, scope }) => {
    const identifier = name(node);
    let binding: Scope | undefined = scope;
    while (binding && !binding.names.has(identifier)) binding = binding.parent;
    if (binding?.names.get(identifier) === "parameter") parameter(node);
    if (binding?.names.get(identifier) === "method-parameter") methodParameters.push(parameterRange(node));
    const category: NameScope = binding
      ? binding.names.get(identifier) === "imported" ? "imported"
        : (binding.thisOwner ?? binding) === (scope.thisOwner ?? scope) ? "local" : "parent"
      : globals.has(identifier) ? "global" : "unresolved";
    const className = (binding ? binding.names.get(identifier) === "class" : globalClasses.has(identifier))
      || node.parent?.name === "NewExpression";
    return { ...parameterRange(node), name: identifier, scope: category,
      ...(className ? { className: true as const } : {}),
      ...(["const", "literal-const"].includes(binding?.names.get(identifier) ?? "") ? { constant: true as const } : {}),
      ...(binding?.names.get(identifier) === "literal-const" ? { literalConstant: true as const } : {}) };
  });
  return { names, parameters, methodParameters };
}

function analyze(tree: Tree, document: Text): ScriptAnalysis {
  const existing = cache.get(tree);
  if (existing?.document === document) return existing;
  const names: ScopedName[] = [];
  const parameters: ParameterRange[] = [];
  const methodParameters: ParameterRange[] = [];
  forEachJavaScriptRegion(tree, (root, offset) => {
    const result = analyzeScript(root, document, offset);
    names.push(...result.names); parameters.push(...result.parameters); methodParameters.push(...result.methodParameters);
  });
  names.sort((a, b) => a.from - b.from);
  parameters.sort((a, b) => a.from - b.from);
  methodParameters.sort((a, b) => a.from - b.from);
  const result = { document, names, parameters, methodParameters };
  cache.set(tree, result);
  return result;
}

/** Resolve value references and runtime import bindings, including embedded JS/TS. */
export const javascriptScopeNames = (tree: Tree, document: Text): readonly ScopedName[] => analyze(tree, document).names;

/** Ordinary function-declaration parameters and their bound uses; methods/arrows stay unchanged. */
export const javascriptFunctionParameters = (tree: Tree, document: Text): readonly ParameterRange[] => analyze(tree, document).parameters;

export const javascriptMethodParameters = (tree: Tree, document: Text): readonly ParameterRange[] => analyze(tree, document).methodParameters;

/** Visit independent JavaScript grammar regions, including mounted/fenced code. */
export function forEachJavaScriptRegion(tree: Tree, region: (root: SyntaxNode, offset: number) => void) {
  function visit(tree: Tree, offset: number) {
    tree.iterate({ enter(cursor) {
      if (cursor.type.prop(languageDataProp) === javascriptLanguage.data) {
        region(cursor.node, offset);
        return false;
      }
      const mount = cursor.tree?.prop(NodeProp.mounted);
      if (mount?.overlay?.length) visit(mount.tree, offset + cursor.from + mount.overlay[0]!.from);
    } });
  }
  visit(tree, 0);
}
