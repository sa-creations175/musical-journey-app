/**
 * Generated card ids stay pointed at the cards they address.
 *
 * See `generatedCardPairing.ts` for why this pins the PAIRING rather
 * than the set of ids, and for what detaches when it does not.
 *
 * The assertions below are deliberately ordered from most specific to
 * least: the per-card pairing catches a renumber, and the two coarser
 * checks underneath it exist to say — in the failure output — what
 * KIND of change happened, so a reader knows whether they inserted,
 * appended, or renamed.
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { cardKind } from '../cardKind';
import { GENERATED_CARD_PAIRING } from './generatedCardPairing';

/**
 * Every category that contains generated cards.
 *
 * Six of these were generated from the start. The other six gained
 * generated cards with the twelve-key expansions and are pinned for the
 * same reason — `reverse-key-pivots` and `intervals` in particular now
 * hold BOTH positional ids from their original generator and
 * root-suffixed ids from the top-ups, and the positional half is
 * exactly what a mid-list insertion would renumber.
 */
const GENERATED_CATEGORIES = [
  'scale-degree-math',
  'degree-notes',
  'intervals',
  'enharmonic-equivalents',
  'pentatonic-scales',
  'functional-harmony',
  'modes',
  'slash-chords',
  'progressions',
  'key-signatures',
  'modal-improvisation',
] as const;

/**
 * Today's pairing, in the same `id|question` shape as the fixture.
 *
 * WALKED BY KIND, not by family, since Pentatonic Scales folded into
 * Scales & Modes (14 Sep 2026): the fixture's sections are the families
 * as they were, and not one card moved.
 */
function currentPairing(): string[] {
  const out: string[] = [];
  for (const cat of GENERATED_CATEGORIES) {
    for (const c of FLASHCARDS.filter(c => cardKind(c) === cat)) {
      out.push(`${c.id}|${c.question}`);
    }
  }
  return out;
}

/** The fixture without its category separator comments. */
const EXPECTED = GENERATED_CARD_PAIRING.filter(l => !l.startsWith('  //'));

describe('every generated id still addresses its own card', () => {
  it('matches the pinned pairing, card for card', () => {
    // The load-bearing assertion. An id that changed WHAT IT POINTS AT
    // shows up here as a diff naming both sides.
    expect(currentPairing()).toEqual([...EXPECTED]);
  });

  it('pins every generated category', () => {
    // Guards the fixture itself: a category dropped from
    // GENERATED_CATEGORIES would make the assertion above pass by
    // checking less.
    const pinned = new Set(EXPECTED.map(l => l.split('|')[0]));
    for (const cat of GENERATED_CATEGORIES) {
      const cards = FLASHCARDS.filter(c => cardKind(c) === cat);
      expect(cards.length).toBeGreaterThan(0);
      for (const c of cards) expect(pinned.has(c.id)).toBe(true);
    }
  });
});

describe('what kind of change happened', () => {
  // These cannot catch a renumber on their own — that is the trap this
  // file exists to avoid — but when the pairing test fails they narrow
  // the cause in the same run.

  it('says whether the id SET changed, separately from the pairing', () => {
    const now = new Set(currentPairing().map(l => l.split('|')[0]));
    const then = new Set(EXPECTED.map(l => l.split('|')[0]));
    // Additions are legitimate; this asserts nothing was REMOVED.
    for (const id of then) expect(now.has(id)).toBe(true);
  });

  it('keeps ids unique, so a collision reads as a collision', () => {
    const ids = FLASHCARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the ids the SM-2 history is keyed on', () => {
  it('asks about C minor pentatonic exactly once', () => {
    // `pent-8` HELD IT UNTIL COMMIT 8, when the family took the
    // `pent-notes-` prefix so a thirteenth major root could arrive
    // without minting a retired id. The claim survives the rename: the
    // question is still asked, once, and `pentatonicFoldIn` moved the
    // history rather than the id fitting the generator.
    const asking = FLASHCARDS.filter(
      c => c.question === 'In C minor pentatonic, the notes are _____',
    );
    expect(asking).toHaveLength(1);
    expect(asking[0].id).toBe('pent-notes-minor-C');
  });

  it('and the shared-notes card is gone rather than renamed', () => {
    // `pent-10` asked what C major and A minor pentatonic SHARE, and
    // answered "5 notes (identical pitch set)". Commit 8 replaced the
    // question rather than the id: `pent-lick-C` asks which minor
    // pentatonic to play in C, which is a different question with a
    // different answer, so no row moves onto it.
    expect(FLASHCARDS.some(c => c.id === 'pent-10')).toBe(false);
    expect(FLASHCARDS.some(c => c.correctAnswer.includes('identical pitch set')))
      .toBe(false);
  });
});
