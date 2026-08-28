/**
 * What the reader has written on a voice-leading cell.
 *
 * =====================================================================
 * TWO BOXES, BECAUSE A NOTE NAME IS ONLY TRUE OF ONE KEY.
 *
 * The PATTERN note belongs to the row and follows it into all twelve
 * keys — it is about the shape, and it never names a note. The KEY
 * note belongs to one cell, and it is where note names live.
 *
 * That split is not tidiness. One box would mean wording written while
 * practising in E♭ showing up in F, claiming things that are false
 * there. The only way a note can be safely written down is if the
 * thing it is written on is a single key.
 * =====================================================================
 *
 * THE DEFAULT IS NEVER WRITTEN, so it is never at risk. The catalog
 * keeps it; an edit stores an override; a read checks the override and
 * falls back. There is no copy-on-write step that could capture a
 * default and freeze it, which is what makes "Reset To Default"
 * genuinely a reset rather than a second guess at the original words.
 *
 * A SPARSE MAP IN ONE `userPrefs` ROW, not a Dexie table. It already
 * syncs, already round-trips through JSONB, needs no schema version
 * and no sync/tables entry. A table would cost a migration on a
 * database holding real practice history, bought for indexing nobody
 * needs — this is read by exact key, one cell at a time.
 */
import { getPref, setPref } from '../../lib/userPrefs';

export const PREF_VL_NOTES = 'shapesAndPatternsVoiceLeadingNotes';

/** key → the reader's text. Absent means "no override" — which is not
 *  the same as an empty string, and is why clearing DELETES. */
export type VoiceLeadingNotes = Readonly<Record<string, string>>;

/**
 * The key a pattern note is filed under: `patternId:rowId`.
 *
 * Follows the row into every key, so `keyName` is deliberately absent.
 * Per ROW rather than per type: the Extended Voicings rows on Major
 * 2-5-1 and Minor 2-5-1 share a default string, and editing one must
 * not rewrite the other.
 */
export function patternNoteKey(patternId: string, rowId: string): string {
  return `${patternId}:${rowId}`;
}

/** The key a per-key note is filed under: `patternId:rowId:keyName`. */
export function keyNoteKey(
  patternId: string,
  rowId: string,
  keyName: string,
): string {
  return `${patternId}:${rowId}:${keyName}`;
}

export async function loadVoiceLeadingNotes(): Promise<VoiceLeadingNotes> {
  const raw = await getPref<VoiceLeadingNotes>(PREF_VL_NOTES, {});
  return raw && typeof raw === 'object' ? raw : {};
}

/**
 * Store `text` under `key`, or REMOVE the entry when the override has
 * nothing left to say.
 *
 * =====================================================================
 * CLEARING AND RESETTING ARE THE SAME GESTURE, and that is the whole
 * reason this is one function rather than a setter and a deleter.
 *
 * An override is removed when the text is empty, and removed when the
 * text equals the default — because in both cases the fallback already
 * produces exactly what the reader would see. Storing either would be
 * keeping a row that changes nothing, and worse: a stored duplicate of
 * a default silently stops tracking that default if the catalog's
 * wording is ever improved.
 * =====================================================================
 */
export function applyNote(
  notes: VoiceLeadingNotes,
  key: string,
  text: string,
  fallback = '',
): VoiceLeadingNotes {
  const trimmed = text.trim();
  const next = { ...notes };
  if (trimmed === '' || trimmed === fallback.trim()) delete next[key];
  else next[key] = trimmed;
  return next;
}

/** Remove an override outright — what Reset To Default and Clear both
 *  do. Separate from `applyNote` only so a caller can say which it
 *  meant; the effect is identical and deliberately so. */
export function clearNote(
  notes: VoiceLeadingNotes,
  key: string,
): VoiceLeadingNotes {
  const next = { ...notes };
  delete next[key];
  return next;
}

export async function saveVoiceLeadingNotes(
  notes: VoiceLeadingNotes,
): Promise<void> {
  await setPref(PREF_VL_NOTES, notes);
}

/**
 * What a box shows: the override where one exists, the default where
 * it does not.
 *
 * `undefined` in the map and `''` in the map cannot both happen —
 * `applyNote` never stores an empty string — so a present entry is
 * always the reader's words.
 */
export function noteText(
  notes: VoiceLeadingNotes,
  key: string,
  fallback = '',
): string {
  return notes[key] ?? fallback;
}

/** True when the reader has written over the default. Drives the
 *  "edited" marker and which of the two reset controls shows. */
export function isOverridden(notes: VoiceLeadingNotes, key: string): boolean {
  return notes[key] !== undefined;
}
