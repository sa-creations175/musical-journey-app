/**
 * The reader's marks on the chord-qualities chart: which cells they
 * reach for, and where.
 *
 * =====================================================================
 * THE READER'S DATA, SO IT SYNCS, AND NO NEW TABLE WAS NEEDED FOR IT.
 *
 * Silas's decision of 13 Sep 2026: marks are stored per user and synced,
 * keyed by scale and degree, the value the note text. `userPrefs` is
 * already exactly that shape — a synced key and a value — so each mark
 * is one row, `chordQualityMark:harmonic-7` → "the pass into the 1".
 *
 * ONE ROW PER MARK, NOT ONE ROW HOLDING THEM ALL. Last write wins per
 * row, so a note typed on the phone and a dot switched on the laptop
 * both survive; a single map would keep whichever device saved last.
 * Switching a dot off DELETES its row, and the sync layer's deleting
 * hook carries that to the other devices.
 *
 * =====================================================================
 * SEEDED ONCE, THEN NEVER AGAIN.
 *
 * A new reader's chart starts with Silas's marks (`SEED_MARKS`). The
 * seed waits for the first pull to finish — a seed written during it
 * would be swept away as an orphan — and then sets a synced flag, so a
 * reader who switches every dot off does not get them back on this
 * device or the next.
 * =====================================================================
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { whenSyncReady } from './sync/syncReady';
import { getPref, setPref } from './userPrefs';
import { SEED_MARKS } from './chordQualitiesByScale';

export const MARK_KEY_PREFIX = 'chordQualityMark:';
export const MARKS_SEEDED_KEY = 'chordQualityMarksSeeded';

/** Mark a cell, or change its note. An empty note is still a mark. */
export async function setMark(cell: string, note: string): Promise<void> {
  await db.userPrefs.put({ key: MARK_KEY_PREFIX + cell, value: note });
}

/** Take a cell's mark off, note and all. */
export async function clearMark(cell: string): Promise<void> {
  await db.userPrefs.delete(MARK_KEY_PREFIX + cell);
}

/** Every mark, cell key → note. */
export async function readMarks(): Promise<Record<string, string>> {
  const rows = await db.userPrefs.where('key').startsWith(MARK_KEY_PREFIX).toArray();
  return Object.fromEntries(rows.map(r => [
    r.key.slice(MARK_KEY_PREFIX.length),
    typeof r.value === 'string' ? r.value : '',
  ]));
}

/** The marks, live. Undefined until the first read lands. */
export function useChordQualityMarks(): Readonly<Record<string, string>> | undefined {
  return useLiveQuery(readMarks, []);
}

let seeding: Promise<void> | null = null;

/** Give a new reader Silas's marks, once. Safe to call on every open. */
export function seedMarksIfNeeded(): Promise<void> {
  if (seeding !== null) return seeding;
  seeding = (async () => {
    await whenSyncReady();
    if (await getPref<number>(MARKS_SEEDED_KEY, 0)) return;
    const have = await readMarks();
    for (const [cell, note] of Object.entries(SEED_MARKS)) {
      if (!(cell in have)) await setMark(cell, note);
    }
    await setPref(MARKS_SEEDED_KEY, 1);
  })().finally(() => { seeding = null; });
  return seeding;
}
