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

/**
 * Deep-clone a phrase with freshly-generated ids on the phrase, its
 * beats, and every chord-placement key that referenced the old beats.
 * Used by the "duplicate phrase line" affordance so a copied phrase
 * is independently editable and doesn't share state with its source.
 *
 * Beat-id remapping preserves chord placements verbatim: if the
 * original phrase had chord X on beat A, the clone has the same
 * chord on the new beat that occupies A's slot.
 */
export function clonePhraseWithFreshIds(
  phrase: Phrase,
): Required<Pick<Phrase, 'beats' | 'chordsByArrangement'>> & Phrase {
  const idMap = new Map<string, string>();
  const beats: Beat[] = (phrase.beats ?? []).map(b => {
    const freshId = uid('beat');
    idMap.set(b.id, freshId);
    return { ...b, id: freshId };
  });
  const chordsByArrangement: Record<string, Record<string, ChordFunction>> = {};
  for (const [arrId, placements] of Object.entries(phrase.chordsByArrangement ?? {})) {
    const copy: Record<string, ChordFunction> = {};
    for (const [oldBeatId, chord] of Object.entries(placements)) {
      const newBeatId = idMap.get(oldBeatId);
      if (newBeatId) copy[newBeatId] = chord;
    }
    chordsByArrangement[arrId] = copy;
  }
  return {
    ...phrase,
    id: uid('phrase'),
    beats,
    chordsByArrangement,
  };
}

/**
 * Build a phrase from a raw lyric string. Whitespace-separated tokens
 * become word beats in order; chord placements start empty so the user
 * can fill them in above. Empty / whitespace-only input falls back to
 * `newEmptyPhrase()` — the instrumental-line case (single blank beat).
 */
export function phraseFromLyrics(lyrics: string): Phrase {
  const tokens = lyrics.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return newEmptyPhrase();
  const beats: Beat[] = tokens.map(text => ({
    id: uid('beat'),
    type: 'word',
    text,
  }));
  return {
    id: uid('phrase'),
    beats,
    chordsByArrangement: {
      [BASIC_ARRANGEMENT_ID]: {} as Record<string, ChordFunction>,
    },
  };
}

/**
 * Multi-phrase variant of `phraseFromLyrics`. When `maxWordsPerLine`
 * is omitted (or non-positive) returns exactly one phrase — same
 * shape as the single-phrase function, used on desktop so paste
 * behaviour is unchanged.
 *
 * When a positive `maxWordsPerLine` is supplied (mobile auto-break):
 *   1. Explicit `\n` line breaks in the input are honoured — each
 *      becomes the start of a new phrase. So a user who paste-formats
 *      lyrics line-by-line keeps that structure.
 *   2. Within each line, words are chunked into phrases of at most
 *      `maxWordsPerLine` tokens, splitting only at word boundaries
 *      (we tokenise first, so mid-word splits are impossible).
 *
 * Always returns at least one phrase; empty input falls back to
 * `newEmptyPhrase()` like the single-phrase variant.
 */
export function phrasesFromLyrics(
  lyrics: string,
  maxWordsPerLine?: number,
): Phrase[] {
  const cap = maxWordsPerLine && maxWordsPerLine > 0 ? maxWordsPerLine : 0;
  if (!cap) {
    // Desktop: existing single-phrase behaviour. Preserves
    // backwards-compat with all callers that already use the
    // singular helper.
    return [phraseFromLyrics(lyrics)];
  }
  const lines = lyrics.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [newEmptyPhrase()];
  const phrases: Phrase[] = [];
  for (const line of lines) {
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    for (let i = 0; i < tokens.length; i += cap) {
      phrases.push(phraseFromLyrics(tokens.slice(i, i + cap).join(' ')));
    }
  }
  if (phrases.length === 0) return [newEmptyPhrase()];
  return phrases;
}

/**
 * Edit-as-text round-trip: rebuild a phrase from a new lyric string
 * while preserving chord placements that still apply.
 *
 * Carries the phrase's existing id forward so the caller can keep
 * its in-place reference. For each new word beat at position i, if
 * the old beat at the same position has the same `text`, copy any
 * chord placements (across every arrangement) from old-beat-id →
 * new-beat-id. Unmatched chords are dropped — the user changed the
 * word, so the chord no longer belongs to a recognisable target.
 *
 * Empty lyrics input still falls through to `newEmptyPhrase()` plus
 * the original id, so all chords are dropped (no positions match).
 */
export function phraseFromLyricsPreserveChords(
  lyrics: string,
  oldPhrase: Phrase,
): Phrase {
  const fresh = phraseFromLyrics(lyrics);
  const oldBeats = oldPhrase.beats ?? [];
  const oldChords = oldPhrase.chordsByArrangement ?? {};
  const newBeats = fresh.beats ?? [];

  // Initialise the per-arrangement maps so every arrangement that
  // existed on the old phrase survives even when no chords match
  // (caller can keep editing without losing the arrangement).
  const nextChords: Record<string, Record<string, ChordFunction>> = {};
  for (const arrId of Object.keys(oldChords)) {
    nextChords[arrId] = {};
  }
  if (!nextChords[BASIC_ARRANGEMENT_ID]) nextChords[BASIC_ARRANGEMENT_ID] = {};

  for (let i = 0; i < newBeats.length; i++) {
    const newBeat = newBeats[i];
    const oldBeat = oldBeats[i];
    if (!oldBeat) continue;
    if ((newBeat.text ?? '') !== (oldBeat.text ?? '')) continue;
    for (const [arrId, placements] of Object.entries(oldChords)) {
      const chord = placements[oldBeat.id];
      if (chord) {
        nextChords[arrId][newBeat.id] = chord;
      }
    }
  }

  return {
    ...fresh,
    id: oldPhrase.id,
    chordsByArrangement: nextChords,
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

// --- Syllable splitting --------------------------------------------

/**
 * Find the contiguous syllable group that includes the given beat.
 * A group is a run of `word` beats chained by `joinToNext`. Returns
 * the starting index + the beats in the group (length >= 1).
 */
export function syllableGroupAt(
  beats: Beat[],
  beatId: string,
): { startIndex: number; beats: Beat[] } | null {
  const idx = beats.findIndex(b => b.id === beatId);
  if (idx < 0 || beats[idx].type !== 'word') return null;

  let start = idx;
  // Walk backward through the chain of joinToNext=true beats.
  while (start > 0) {
    const prev = beats[start - 1];
    if (prev.type !== 'word' || prev.joinToNext !== true) break;
    start -= 1;
  }
  // Walk forward until we hit a beat that doesn't join to its next.
  let end = idx;
  while (end < beats.length - 1) {
    const cur = beats[end];
    if (cur.joinToNext !== true) break;
    end += 1;
  }
  return { startIndex: start, beats: beats.slice(start, end + 1) };
}

/** Concatenated text for a syllable group — used when opening the
 *  split modal on a single syllable (we re-compose the whole word so
 *  the user can re-split from scratch). */
export function concatGroupText(group: Beat[]): string {
  return group.map(b => b.text ?? '').join('');
}

/**
 * Split a word into N syllables at the supplied split indices.
 * `splitIndices` are character positions within the concatenated
 * text; each index marks the start of a new syllable. Indices are
 * deduplicated + sorted before use. Returns a new beat array where
 * `group` is replaced with the new syllable beats.
 */
export function applySyllableSplit(
  beats: Beat[],
  groupStartIndex: number,
  groupLength: number,
  text: string,
  splitIndices: number[],
): { beats: Beat[]; inserted: Beat[] } {
  const sanitized = Array.from(new Set(splitIndices))
    .filter(i => i > 0 && i < text.length)
    .sort((a, b) => a - b);
  const syllables: string[] = [];
  let prev = 0;
  for (const idx of sanitized) {
    syllables.push(text.slice(prev, idx));
    prev = idx;
  }
  syllables.push(text.slice(prev));
  const inserted: Beat[] = syllables
    .filter(s => s.length > 0)
    .map((s, i, arr) => ({
      id: uid('beat'),
      type: 'word' as const,
      text: s,
      joinToNext: i < arr.length - 1 ? true : false,
    }));
  const next = [
    ...beats.slice(0, groupStartIndex),
    ...inserted,
    ...beats.slice(groupStartIndex + groupLength),
  ];
  return { beats: next, inserted };
}

/**
 * When a caller inserts a blank beat in the middle of a syllable
 * group the join should break (otherwise the rendering produces
 * "syl-[blank]-lable" which reads nonsense). Returns a copy of
 * `beats` with the join broken at the supplied index.
 */
export function breakJoinBefore(beats: Beat[], index: number): Beat[] {
  if (index <= 0 || index > beats.length) return beats;
  const prev = beats[index - 1];
  if (!prev || prev.joinToNext !== true) return beats;
  return beats.map((b, i) => (i === index - 1 ? { ...b, joinToNext: false } : b));
}
