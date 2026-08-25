/**
 * Intervals' three facets, built from the catalog.
 *
 * =====================================================================
 * THE TAGS ARE READ, NEVER RE-DERIVED.
 *
 * `intervalFacets(id)` is the one join from an interval to its
 * consonance and distance — 452c093 added it so that a consumer stopped
 * by the narrowed stored-row type has one obvious way through, rather
 * than an inline `INTERVAL_SEEDS.find(...)` per call site each with its
 * own answer for an unknown id. This is that consumer.
 *
 * DIRECTION IS DERIVED FROM `directionsFor`, not listed, because a
 * unison has one direction and a hard-coded pair would offer a
 * descending unison the drill cannot serve.
 * =====================================================================
 *
 * KEYS ARE `${id}|${direction}`, which is what `IntervalsQuiz` matches
 * its candidates on. An interval with two directions therefore appears
 * under a consonance value twice — once per direction — which is
 * correct: those are two drillable items, and the count has to say two.
 */
import type { Facet, FacetValue } from '../../../lib/facetSelection';
import {
  INTERVAL_SEEDS, directionsFor, intervalFacets,
  type Consonance, type Distance, type PlayDirection,
} from './seed';

/** The quiz's own candidate key. Kept identical to `keyOf` there. */
export function intervalFacetKey(id: string, direction: PlayDirection): string {
  return `${id}|${direction}`;
}

/** Every drillable key, in catalog order — the unnarrowed pool. */
export function allIntervalKeys(): string[] {
  return INTERVAL_SEEDS.flatMap(seed =>
    directionsFor(seed.semitones).map(dir => intervalFacetKey(seed.id, dir)));
}

/** Keys whose interval satisfies `matches`, in catalog order. */
function keysWhere(
  matches: (seed: typeof INTERVAL_SEEDS[number]) => boolean,
): string[] {
  return INTERVAL_SEEDS.filter(matches).flatMap(seed =>
    directionsFor(seed.semitones).map(dir => intervalFacetKey(seed.id, dir)));
}

const CONSONANCE_VALUES: ReadonlyArray<{ id: Consonance; label: string }> = [
  { id: 'perfect', label: 'perfect' },
  { id: 'imperfect', label: 'imperfect' },
  { id: 'dissonant', label: 'dissonant' },
];

const DISTANCE_VALUES: ReadonlyArray<{ id: Distance; label: string }> = [
  { id: 'near', label: 'near' },
  { id: 'middle', label: 'middle' },
  { id: 'far', label: 'far' },
];

const DIRECTION_LABEL: Readonly<Record<PlayDirection, string>> = {
  asc: 'ascending',
  desc: 'descending',
};

/**
 * The directions any interval in the catalog can be drilled in.
 *
 * Collected from `directionsFor` rather than written as a pair: it is
 * the union across the catalog, so it stays right if an interval is
 * ever added that only one direction applies to.
 */
function catalogDirections(): PlayDirection[] {
  const seen: PlayDirection[] = [];
  for (const seed of INTERVAL_SEEDS) {
    for (const dir of directionsFor(seed.semitones)) {
      if (!seen.includes(dir)) seen.push(dir);
    }
  }
  return seen;
}

export function intervalFacetList(): Facet[] {
  const consonance: FacetValue[] = CONSONANCE_VALUES.map(v => ({
    id: v.id,
    label: v.label,
    keys: keysWhere(s => intervalFacets(s.id)?.consonance === v.id),
  }));

  const distance: FacetValue[] = DISTANCE_VALUES.map(v => ({
    id: v.id,
    label: v.label,
    keys: keysWhere(s => intervalFacets(s.id)?.distance === v.id),
  }));

  const direction: FacetValue[] = catalogDirections().map(dir => ({
    id: dir,
    label: DIRECTION_LABEL[dir],
    keys: INTERVAL_SEEDS
      .filter(s => directionsFor(s.semitones).includes(dir))
      .map(s => intervalFacetKey(s.id, dir)),
  }));

  return [
    { id: 'consonance', label: 'sound', values: consonance },
    { id: 'distance', label: 'distance', values: distance },
    { id: 'direction', label: 'direction', values: direction },
  ];
}
