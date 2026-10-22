// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { openDB, type DBSchema } from 'idb';
import type { FormatterMeasurement } from './formats.ts';
interface MeasurementDB extends DBSchema { measurements: { key: string; value: FormatterMeasurement & { id: string } } }
const database = () => openDB<MeasurementDB>('code-formatter-measurements', 1, { upgrade(db) { db.createObjectStore('measurements', { keyPath: 'id' }); } });
export async function readMeasurements(): Promise<FormatterMeasurement[]> {
  const db = await database();
  try { return await db.getAll('measurements'); } finally { db.close(); }
}
export async function saveMeasurement(value: FormatterMeasurement): Promise<void> {
  const db = await database();
  try { await db.put('measurements', { ...value, id: `${value.format}:${value.provider}` }); } finally { db.close(); }
}
