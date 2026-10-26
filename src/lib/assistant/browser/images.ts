// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Preserves the handoff's 10 MiB / 16 megapixel source bounds and aspect-ratio resize.
import type { ChatImage } from '../ollama.ts';
export async function prepareImage(file: File, pixels: number): Promise<ChatImage> {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error('Choose a PNG, JPEG or WebP up to 10 MiB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 16_000_000) throw new Error('Images are limited to 16 megapixels before resizing.');
    const scale = Math.min(1, Math.sqrt(pixels / (bitmap.width * bitmap.height))), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(bitmap.width * scale)); canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Image decoding is unavailable.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { type: 'image', mimeType: 'image/png', width: canvas.width, height: canvas.height, data: canvas.toDataURL('image/png').split(',')[1]! };
  } finally { bitmap.close(); }
}
