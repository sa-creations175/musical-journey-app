import type { ChordFunction, Song, SongSection } from '../../lib/db';
import {
  deriveBarGrid,
  effectiveTimeSignature,
  parseTimeSignature,
} from './barGrid';
import { isEmpty, parseChordFunction } from './chordFunction';

/**
 * THE ONE READER FOR "WHAT CHORDS DOES THIS SECTION HAVE".
 *
 * A section's chords have been stored four different ways across the
 * life of this app, and until this module existed three separate
 * places each decided for themselves which of those ways to look in.
 * They disagreed, and the disagreement was invisible: the readiness
 * classifier called three charted songs `needs-chords` while the
 * chord-progression quiz was happily quizzing them.
 *
 * Everything that needs to know about a section's chords reads it
 * from here. The boolean is DERIVED from the list (`sectionHasChords`
 * is `readSectionChords(...).length > 0` and nothing else), so there
 * is no second place for the two answers to drift apart.
 *
 * ---------------------------------------------------------------
 * READ ORDER — first shape that yields chords wins.
 *
 *   1. `section.chordPlacements` — bar-anchored, AUTHORITATIVE.
 *      Written by the bar-grid editor since the Lead Sheet Redesign
 *      (May 2026). `deriveBarGrid` takes this path whenever the field
 *      is defined and ignores the phrase data entirely, which is what
 *      makes it authoritative rather than merely preferred.
 *
 *   2. `phrases[].chordsByArrangement` — the pre-redesign shape.
 *      `deriveBarGrid` packs these in document order when there are
 *      no placements.
 *
 *   3. `phrases[].chords` — deprecated whole-line chord string.
 *      Already handled inside the step-2 path: `collectChordCells`
 *      runs every phrase through `normalizePhrase`, which parses this
 *      string onto beats for any phrase that lacks the newer fields.
 *      Step 4 below catches the one case that misses.
 *
 *   4. `basicChords` / `alternateChords` — deprecated section-level
 *      space-separated token strings, plus any `phrases[].chords`
 *      string stranded on a phrase that already has `beats` and
 *      `chordsByArrangement` (`normalizePhrase` returns early on
 *      those and never reads the string).
 *
 *      NOTHING IN THE CODEBASE WRITES THESE. They are read-only
 *      legacy, reachable only in data old enough to predate the beat
 *      model. They are last on purpose: the bar grid is what the user
 *      sees, and a stale token string must never outrank it.
 *
 * ---------------------------------------------------------------
 * COST. One `deriveBarGrid` per section — O(chords in the section),
 * with no I/O and no allocation beyond the returned cells. The
 * readiness counter runs it across every section of every song; at
 * repertoire scale (tens of songs, single-digit sections each) that
 * is a few thousand array operations per pass, which is why the
 * boolean can afford to derive from the full list rather than
 * short-circuit. Should the library ever grow enough for that to
 * matter, the fix is to memoise per (section.id, updatedAt) here —
 * NOT to reintroduce a cheap private predicate at a call site, which
 * is exactly how the three readers diverged in the first place.
 */

/**
 * All the reader wants from the song: the time signature that sizes a
 * bar, which is what `effectiveTimeSignature` falls back to when the
 * section does not override it.
 *
 * Stated as the narrow shape rather than `Song` because it is the
 * truth — and because the section-delete guard in `SongDetailView`
 * holds a `Song | undefined` from a live query. A wider parameter
 * there would have meant a non-null assertion at the call site,
 * which is a claim about loading state made to satisfy a signature
 * that was never reading the field it demanded.
 */
type SongTiming = Pick<Song, 'timeSignature'> | undefined | null;

/**
 * Whether a chord is meaningful (not a blank slot). Mirrors the
 * bar-grid packer's filter so phrase-mode arrangement counts line up.
 *
 * DELIBERATELY NOT `isEmpty`. The two disagree on one input: a chord
 * flagged `unparsed` whose `raw` is blank is meaningful here and empty
 * there. `mostCompleteArrangementId` has always used this predicate
 * and `readSectionChords`'s cell filter has always used `isEmpty`;
 * that split is preserved verbatim from `progressionQuiz.ts` so the
 * quiz picks the same arrangement it always has.
 */
function isMeaningfulChord(c: ChordFunction): boolean {
  return Boolean(c.unparsed) || c.function !== '' || c.quality !== '' || Boolean(c.bass);
}

/**
 * Every chord charted in a section's most-complete arrangement, in
 * bar order, left to right. Repeats included — this is the sequence
 * as charted, not a collapsed harmonic line.
 *
 * Empty placeholder chords are dropped (`isEmpty`), so a section
 * holding nothing but blank slots reads as having no chords. A chord
 * the parser could not resolve is NOT empty: the user typed
 * something and it counts as charted.
 */
export function readSectionChords(
  song: SongTiming,
  section: SongSection,
): ChordFunction[] {
  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song, section),
  );
  const bars = deriveBarGrid(
    section,
    mostCompleteArrangementId(section),
    beatsPerBar,
  );
  const chords: ChordFunction[] = [];
  for (const bar of bars) {
    for (const cell of bar.cells) {
      if (isEmpty(cell.chord)) continue;
      chords.push(cell.chord);
    }
  }
  if (chords.length > 0) return chords;

  // A DEFINED `chordPlacements` means this section has been through the
  // bar-grid editor, so the grid is the whole truth about it — an empty
  // one means the user cleared their chords, not that they are hiding
  // in an older field. Resurrecting a deprecated token string here
  // would put chords back on screen that someone deliberately deleted.
  if (section.chordPlacements !== undefined) return [];

  return readLegacyStringChords(section);
}

/**
 * Does this section have any chords charted, in any storage shape?
 *
 * DERIVED, NEVER REIMPLEMENTED. Every caller that used to answer this
 * with its own field walk now calls here.
 */
export function sectionHasChords(song: SongTiming, section: SongSection): boolean {
  return readSectionChords(song, section).length > 0;
}

/**
 * The arrangement to read from: the MOST COMPLETE one — the
 * arrangement with the most charted chords — so a half-finished
 * alternate never wins over the full chart. Ties break to the
 * earliest-created arrangement (earliest in `section.arrangements`).
 * Falls back to the section's selected/first arrangement, then the
 * implicit 'basic', when nothing is charted.
 *
 * Moved here verbatim from `progressionQuiz.ts`, which re-exports it
 * so the quiz keeps the identical behaviour it already had.
 */
export function mostCompleteArrangementId(section: SongSection): string {
  const counts = new Map<string, number>();
  for (const p of section.chordPlacements ?? []) {
    if (!isMeaningfulChord(p.chord)) continue;
    counts.set(p.arrangementId, (counts.get(p.arrangementId) ?? 0) + 1);
  }
  // Legacy phrase-anchored sections: count chords per arrangement from
  // the phrase beat maps.
  if (counts.size === 0) {
    for (const phrase of section.phrases ?? []) {
      for (const [arrId, beatMap] of Object.entries(phrase.chordsByArrangement ?? {})) {
        const n = Object.values(beatMap).filter(isMeaningfulChord).length;
        if (n > 0) counts.set(arrId, (counts.get(arrId) ?? 0) + n);
      }
    }
  }
  const fallback =
    section.activeArrangementId || section.arrangements?.[0]?.id || 'basic';
  if (counts.size === 0) return fallback;

  // Earliest-created order = position in section.arrangements.
  const order = new Map((section.arrangements ?? []).map((a, i) => [a.id, i]));
  let bestId = fallback;
  let bestCount = -1;
  let bestOrder = Number.POSITIVE_INFINITY;
  for (const [id, count] of counts) {
    const ord = order.get(id) ?? Number.POSITIVE_INFINITY;
    if (count > bestCount || (count === bestCount && ord < bestOrder)) {
      bestId = id;
      bestCount = count;
      bestOrder = ord;
    }
  }
  return bestId;
}

/**
 * Step 4 of the read order — the deprecated token strings, consulted
 * only when the bar grid came back empty.
 *
 * These are space-separated chord tokens from before the beat model
 * ("1 4 5", "Cm Ab Eb"). Parsed through the same `parseChordFunction`
 * the phrase migration uses, so an unparseable token survives as an
 * `unparsed` ChordFunction rather than being silently dropped.
 *
 * Order within this step: `basicChords`, then `alternateChords`, then
 * stranded phrase strings — the basic chart first, matching how
 * `normalizePhrase` treats the basic arrangement as the default.
 */
function readLegacyStringChords(section: SongSection): ChordFunction[] {
  const out: ChordFunction[] = [];
  const pushTokens = (raw: string | undefined) => {
    for (const token of (raw ?? '').split(/\s+/)) {
      if (token === '') continue;
      const cf = parseChordFunction(token);
      if (cf && !isEmpty(cf)) out.push(cf);
    }
  };

  pushTokens(section.basicChords);
  pushTokens(section.alternateChords);

  // A phrase carrying BOTH the new fields and a leftover `chords`
  // string: `normalizePhrase` returns early on those and never reads
  // the string, so the bar grid cannot have seen it.
  for (const phrase of section.phrases ?? []) {
    if (phrase.beats && phrase.chordsByArrangement) pushTokens(phrase.chords);
  }

  return out;
}
