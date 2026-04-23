import type { Arrangement, Beat, ChordFunction, Phrase, SongSection } from '../../lib/db';
import { parseChordFunction } from './chordFunction';

// Beat-based data model helpers. Legacy Phrase rows (pre-beat) carry
// `chords: string` + `lyrics: string`. This module derives the new
// shape on demand so the renderer can pretend everything is beat-based
// without forcing an eager DB rewrite. Whenever the user edits, the
// callers save the migrated shape back — so stored data drifts toward
// the new model over time.

export const BASIC_ARRANGEMENT_ID = 'basic';
export const ALTERNATES_ARRANGEMENT_ID = 'alternates';

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

// --- Phrase migration ----------------------------------------------

/**
 * Ensure a phrase exposes `beats` + `chordsByArrangement`. Safe to call
 * on already-migrated rows (returns the input unchanged when the new
 * fields are already present). Used by the renderer to normalise
 * whatever it reads out of the DB.
 */
export function normalizePhrase(phrase: Phrase): Required<Pick<Phrase, 'beats' | 'chordsByArrangement'>> & Phrase {
  if (phrase.beats && phrase.chordsByArrangement) {
    return phrase as Required<Pick<Phrase, 'beats' | 'chordsByArrangement'>> & Phrase;
  }

  const words = (phrase.lyrics ?? '').split(/\s+/).filter(Boolean);
  const beats: Beat[] = words.map(w => ({ id: uid('beat'), type: 'word', text: w }));

  // Map any pre-existing single-line chord tokens onto beats in order.
  // Each token parses to a ChordFunction (functional storage is the
  // new authoritative shape); tokens that don't parse are preserved
  // with `unparsed: true` so no input is silently lost.
  const chordTokens = (phrase.chords ?? '').split(/\s+/).filter(Boolean);
  const placements: Record<string, ChordFunction> = {};
  const paired = Math.min(chordTokens.length, beats.length);
  for (let i = 0; i < paired; i++) {
    const cf = parseChordFunction(chordTokens[i]);
    if (cf) placements[beats[i].id] = cf;
  }
  for (let i = paired; i < chordTokens.length; i++) {
    const extra: Beat = { id: uid('beat'), type: 'blank' };
    beats.push(extra);
    const cf = parseChordFunction(chordTokens[i]);
    if (cf) placements[extra.id] = cf;
  }

  return {
    ...phrase,
    beats,
    chordsByArrangement: {
      [BASIC_ARRANGEMENT_ID]: placements,
    },
  };
}

/**
 * Build an empty-but-valid phrase when a caller needs a fresh one
 * (e.g. "add phrase line" on an instrumental section). Starts with a
 * single blank beat so the user has something to click "+" around.
 */
export function newEmptyPhrase(): Phrase {
  return {
    id: uid('phrase'),
    beats: [{ id: uid('beat'), type: 'blank' }],
    chordsByArrangement: { [BASIC_ARRANGEMENT_ID]: {} as Record<string, ChordFunction> },
  };
}

// --- Section migration ---------------------------------------------

/**
 * Produce a normalised view of a section's arrangement metadata. When
 * the stored row has no arrangements array, synthesises a default
 * Basic arrangement. When the row has legacy `alternateChords` /
 * `alternateNote` content but no 'alternates' arrangement yet,
 * materialises one from those fields so the user's old work surfaces
 * under the new UI.
 */
export function normalizeArrangements(section: SongSection): Arrangement[] {
  const base: Arrangement[] = [{ id: BASIC_ARRANGEMENT_ID, name: 'Basic' }];
  const stored = section.arrangements ?? [];
  // Preserve whatever is in the stored list; fall back to default.
  const list: Arrangement[] = stored.length > 0
    ? stored.slice()
    : base;

  const hasAlternatesArrangement = list.some(a => a.id === ALTERNATES_ARRANGEMENT_ID);
  const hasLegacyAlternates =
    (section.alternateChords ?? '').trim() !== '' || (section.alternateNote ?? '').trim() !== '';

  if (hasLegacyAlternates && !hasAlternatesArrangement) {
    list.push({
      id: ALTERNATES_ARRANGEMENT_ID,
      name: 'Alternates',
      notes: (section.alternateNote ?? '') || undefined,
    });
  }
  return list;
}

/**
 * Given a section with legacy `alternateChords` content, seed the
 * Alternates arrangement's chord placements from the token list —
 * mapped onto word beats in order, overflow into trailing blank beats.
 * Used once at first post-refactor render so the user's old
 * alternates show up inline with their beats.
 *
 * Returns a deep-ish clone of the phrase with the Alternates placements
 * merged in; callers save this back when the user edits.
 */
export function seedLegacyAlternatesInto(
  phrase: Phrase,
  section: SongSection,
): Phrase {
  const alternates = (section.alternateChords ?? '').trim();
  if (alternates === '') return phrase;
  const normalised = normalizePhrase(phrase);
  if (normalised.chordsByArrangement[ALTERNATES_ARRANGEMENT_ID]) return normalised;
  const tokens = alternates.split(/\s+/).filter(Boolean);
  const placements: Record<string, ChordFunction> = {};
  const beats = [...normalised.beats];
  const paired = Math.min(tokens.length, beats.length);
  for (let i = 0; i < paired; i++) {
    const cf = parseChordFunction(tokens[i], section.id /* key unknown, functional parse only */);
    if (cf) placements[beats[i].id] = cf;
  }
  for (let i = paired; i < tokens.length; i++) {
    const extra: Beat = { id: uid('beat'), type: 'blank' };
    beats.push(extra);
    const cf = parseChordFunction(tokens[i]);
    if (cf) placements[extra.id] = cf;
  }
  return {
    ...normalised,
    beats,
    chordsByArrangement: {
      ...normalised.chordsByArrangement,
      [ALTERNATES_ARRANGEMENT_ID]: placements,
    },
  };
}

// --- Beat manipulation ---------------------------------------------

export function insertBeatAt(
  beats: Beat[],
  index: number,
  type: Beat['type'] = 'blank',
  text?: string,
): { beats: Beat[]; inserted: Beat } {
  const inserted: Beat = { id: uid('beat'), type, text };
  const next = [...beats.slice(0, index), inserted, ...beats.slice(index)];
  return { beats: next, inserted };
}

export function removeBeat(
  beats: Beat[],
  chordsByArrangement: Record<string, Record<string, ChordFunction>>,
  beatId: string,
): { beats: Beat[]; chordsByArrangement: Record<string, Record<string, ChordFunction>> } {
  const nextBeats = beats.filter(b => b.id !== beatId);
  const nextChords: Record<string, Record<string, ChordFunction>> = {};
  for (const [arrId, placements] of Object.entries(chordsByArrangement)) {
    const { [beatId]: _removed, ...rest } = placements;
    void _removed;
    nextChords[arrId] = rest;
  }
  return { beats: nextBeats, chordsByArrangement: nextChords };
}

/** Write a ChordFunction onto a (arrangement, beat) pair. Passing
 *  `null` clears the placement. */
export function setChordOnBeat(
  chordsByArrangement: Record<string, Record<string, ChordFunction>>,
  arrangementId: string,
  beatId: string,
  chord: ChordFunction | null,
): Record<string, Record<string, ChordFunction>> {
  const current = chordsByArrangement[arrangementId] ?? {};
  const nextPlacements = { ...current };
  if (chord === null) {
    delete nextPlacements[beatId];
  } else {
    nextPlacements[beatId] = chord;
  }
  return { ...chordsByArrangement, [arrangementId]: nextPlacements };
}

// --- Helpers for the progression detector --------------------------

/** Ordered chord-function records for a given arrangement, skipping
 *  empty slots and unparsed inputs. */
export function chordSequenceForArrangement(
  phrase: Phrase,
  arrangementId: string,
): ChordFunction[] {
  const normalised = normalizePhrase(phrase);
  const placements = normalised.chordsByArrangement[arrangementId] ?? {};
  const out: ChordFunction[] = [];
  for (const beat of normalised.beats) {
    const c = placements[beat.id];
    if (c && !c.unparsed && c.function !== '') out.push(c);
  }
  return out;
}

/** True when no word beats carry text. Used to switch the lyric row
 *  to an "[Instrumental]" placeholder. */
export function isInstrumentalPhrase(phrase: Phrase): boolean {
  const normalised = normalizePhrase(phrase);
  if (normalised.beats.length === 0) return false;
  return normalised.beats.every(
    b => b.type === 'blank' || !b.text || b.text.trim() === '',
  );
}
