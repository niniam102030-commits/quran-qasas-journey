// src/services/metaStore.ts
// خواندن و نوشتن متمرکز کلید/مقدار روی جدول ldb.meta
import { ldb } from "../db/learningDb";

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await ldb.meta.get(key);
  if (!row || row.value === undefined) return fallback;
  return row.value as T;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await ldb.meta.put({ key, value });
}
