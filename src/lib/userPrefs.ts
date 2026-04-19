import { db } from './db';

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  const row = await db.userPrefs.get(key);
  if (!row) return fallback;
  return row.value as T;
}

export async function setPref(key: string, value: unknown): Promise<void> {
  await db.userPrefs.put({ key, value });
}
