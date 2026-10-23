// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { createHash } from 'node:crypto';

// Keep room below Pages' 25 MiB limit without changing the logical package bytes.
export const packagePartBytes = 20 * 1024 * 1024;
export function publishPackageArtifact(assets, filename, bytes) {
  if (bytes.length <= packagePartBytes) {
    assets.set(filename, bytes);
    return { url: `./${filename}` };
  }
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += packagePartBytes) {
    const part = bytes.subarray(offset, offset + packagePartBytes);
    const path = `${filename}.part-${String(parts.length + 1).padStart(3, '0')}`;
    assets.set(path, part);
    parts.push({ url: `./${path}`, bytes: part.length, sha256: createHash('sha256').update(part).digest('hex') });
  }
  return { url: parts[0].url, parts };
}
