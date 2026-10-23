// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export interface FormatterPackage {
  id: string; name: string; languages: string; version: string; kind: 'wasm' | 'module' | 'data';
  github: string; bytes: number; payloadBytes: number; sha256: string; url: string;
  parts?: readonly { url: string; bytes: number; sha256: string }[];
}
export interface FormatterNotice { name: string; version: string; identifier?: string; text: string }
export interface PackageEnvelope {
  schema: 1; id: string; version: string; kind: 'wasm' | 'module' | 'data'; payload: string; wasm?: string; resources?: Record<string,string>; notices: FormatterNotice[];
}
export async function validatePackage(bytes: ArrayBuffer, expected: FormatterPackage): Promise<PackageEnvelope> {
  if (bytes.byteLength !== expected.bytes) throw new Error('The package size does not match this application version.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== expected.sha256) throw new Error('The package checksum does not match. Nothing was installed.');
  const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as PackageEnvelope;
  if (envelope.schema !== 1 || envelope.id !== expected.id || envelope.version !== expected.version
    || envelope.kind !== expected.kind || typeof envelope.payload !== 'string' || !Array.isArray(envelope.notices)
    || !envelope.notices.length || envelope.notices.some(notice => !notice.name || !notice.text)) {
    throw new Error('The package metadata is invalid.');
  }
  return envelope;
}
export function decodePayload(envelope: PackageEnvelope): Uint8Array<ArrayBuffer> {
  const binary = atob(envelope.payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
export function packageSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(2)} MB` : `${Math.ceil(bytes / 1000)} kB`;
}
