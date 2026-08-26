/**
 * Chord recognition's tier facet.
 *
 * =====================================================================
 * THE KEYS ARE `chordId:inversion`, AND THAT IS THE POINT.
 *
 * The label this replaces counted chord QUALITIES — "all chords — 30 in
 * pool" — while the drill draws from chord × inversion. So it
 * understated the pool by however many inversions were enabled, and a
 * reader turning on the fourth position saw the same 30.
 *
 * Counting the refs the drill will actually serve fixes that, and it
 * means this count MOVES with the inversion setting. That is correct
 * here and wrong one layer over — see the note on `positions` below.
 * =====================================================================
 */
import type { Facet, FacetValue } from '../../../lib/facetSelection';
import type { ChordData } from '../../../lib/db';
import {
  attemptItemId, inversionsForIntervalCount, positionsForTier, reachableInversions,
  type Inversion, type InversionSettings,
} from './inversionUtils';

/** Tier ids in ladder order — foundational first, extensions last. */
export const CHORD_TIER_ORDER: ReadonlyArray<ChordData['tier']> =
  ['foundational', 'seventh', 'dominant', 'extensions'];

const TIER_LABEL: Readonly<Record<ChordData['tier'], string>> = {
  foundational: 'triads',
  seventh: 'sevenths',
  dominant: 'dominants',
  extensions: 'extensions',
};

/**
 * The refs a chord will be served under, given the reader's enabled
 * inversion positions.
 *
 * =====================================================================
 * THIS IS NOT THE COVERAGE DENOMINATOR, AND MUST NOT BECOME IT.
 *
 * `reachableChordRefs` answers "what can EVER be asked" and is
 * deliberately blind to settings — a coverage total that fell when
 * someone narrowed the inversion drawer would report progress nobody
 * made (2ff315c).
 *
 * This answers a different question: "what am I about to drill, now,
 * with my settings". The two are the same shape and must stay separate
 * functions, however tempting a shared one looks. If you are here to
 * unify them, the thing to read first is the comment above.
 * =====================================================================
 */
export function servedRefsFor(
  chord: Pick<ChordData, 'id' | 'tier' | 'intervals'>,
  settings: InversionSettings,
): string[] {
  // PER TIER, because triads and sevenths are not at the same stage for
  // the same reader. `positionsForTier` answers root-only for a tier
  // that is not inversion-trained at all.
  const positions = positionsForTier(settings, chord.tier);
  const reachable = reachableInversions(chord);
  // The drill's own composition: step two fires only when the chord has
  // more than one reachable inversion AND the reader has at least two
  // positions enabled.
  const stepTwo = reachable.length > 1 && positions.length >= 2;
  const valid = inversionsForIntervalCount(chord.intervals.length);
  const serving: Inversion[] = stepTwo
    ? positions.filter(p => reachable.includes(p) && valid.includes(p))
    : [0];
  // A filter that eliminated everything would serve nothing; root
  // position is what the drill falls back to.
  const final = serving.length > 0 ? serving : ([0] as Inversion[]);
  return final.map(inv => attemptItemId(chord.id, inv));
}

export function chordRecognitionFacets(
  chords: ReadonlyArray<ChordData>,
  settings: InversionSettings,
): Facet[] {
  const values: FacetValue[] = CHORD_TIER_ORDER
    .map(tier => ({
      id: tier,
      label: TIER_LABEL[tier],
      keys: chords
        .filter(c => c.tier === tier)
        .flatMap(c => servedRefsFor(c, settings)),
    }))
    // A tier the seed list does not populate is not offered. Rendering
    // an empty chip would invite a tap that resolves to nothing.
    .filter(v => v.keys.length > 0);

  return [{ id: 'tier', label: 'tier', values }];
}

/** The chord ids behind a set of served refs — what the drill's pool
 *  is built from, since it selects a quality and asks the inversion
 *  second. */
export function chordIdsFromRefs(refs: readonly string[]): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    const id = ref.split(':')[0];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * The inversion chips a tier's own row should offer.
 *
 * =====================================================================
 * DERIVED FROM THE CHORDS, NOT WRITTEN PER TIER.
 *
 * Triads get Root / 1st / 2nd and sevenths get those plus 3rd — not
 * because a table here says so, but because that is what
 * `inversionsForIntervalCount` returns for the widest chord the tier
 * actually holds. A tier of six-note chords would offer what its
 * chords have without anyone editing this.
 *
 * READS THE WIDEST REACHABLE CHORD, not the widest chord. `dim7` is a
 * four-note seventh excluded from inversion training entirely, so
 * counting it would offer a chip for a position no chord in the tier
 * can be asked in.
 * =====================================================================
 *
 * Empty for a tier with no inversion training at all, which is how a
 * caller knows to draw no chips rather than a row of dead ones.
 */
export function inversionChoicesForTier(
  chords: ReadonlyArray<ChordData>,
  tier: string,
): Inversion[] {
  let widest: Inversion[] = [];
  for (const chord of chords) {
    if (chord.tier !== tier) continue;
    const reachable = reachableInversions(chord);
    if (reachable.length > widest.length) widest = reachable;
  }
  return widest.length > 1 ? widest : [];
}
