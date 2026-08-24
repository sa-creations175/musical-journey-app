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
import { GENERATED_CARD_PAIRING } from './generatedCardPairing';

const GENERATED_CATEGORIES = [
  'scale-degree-math',
  'named-notes',
  'reverse-key-pivots',
  'intervals',
  'tritone-pairs',
  'enharmonic-equivalents',
] as const;

/** Today's pairing, in the same `id|question` shape as the fixture. */
function currentPairing(): string[] {
  const out: string[] = [];
  for (const cat of GENERATED_CATEGORIES) {
    for (const c of FLASHCARDS.filter(c => c.category === cat)) {
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
      const cards = FLASHCARDS.filter(c => c.category === cat);
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
  it('keeps the C minor pentatonic card at pent-8', () => {
    // Hand-written today, and about to be generated. The generator
    // must fit the existing id rather than the id fitting the
    // generator — the alternative is migrating drilled history to
    // match a new scheme.
    const card = FLASHCARDS.find(c => c.id === 'pent-8');
    expect(card?.question).toContain('C minor pentatonic');
  });

  it('keeps the shared-notes card at pent-10', () => {
    const card = FLASHCARDS.find(c => c.id === 'pent-10');
    expect(card?.question).toContain('C major pentatonic');
  });
});
