import { db, type IntervalData } from '../../../lib/db';

export type PlayDirection = 'asc' | 'desc';

export type IntervalSeed = Pick<
  IntervalData,
  'id' | 'name' | 'semitones' | 'ascAnchorDefault' | 'descAnchorDefault'
>;

/**
 * Which directions an interval is actually drilled in.
 *
 * =====================================================================
 * A UNISON HAS NO DIRECTION, AND THE AUDIO ALREADY SAID SO.
 *
 * `playInterval` computes `first = ascending ? root : root + semitones`
 * and `second` as the other. At zero semitones both branches play the
 * SAME MIDI note twice, so "descending unison" was a second name for a
 * sound already in the catalog — 26 rows describing 25 sounds.
 *
 * The old descending anchor gave it away: "Same note, step down"
 * describes a step, which is a minor 2nd, not what the drill played.
 *
 * DERIVED FROM `semitones`, NOT LISTED BY ID. An id list is a second
 * place to state the rule, and the day something else is added at zero
 * semitones it would be wrong. The condition is the definition:
 * direction is which of two pitches comes first, and there is only one
 * pitch here.
 *
 * ONLY THE UNISON. An octave is twelve semitones — root-then-octave and
 * octave-then-root are genuinely different to hear — so P8 keeps both
 * and this must not be generalised to "symmetrical intervals".
 * =====================================================================
 */
export function directionsFor(semitones: number): readonly PlayDirection[] {
  return semitones === 0 ? DIRECTIONLESS : BOTH_DIRECTIONS;
}

const BOTH_DIRECTIONS: readonly PlayDirection[] = ['asc', 'desc'];
const DIRECTIONLESS: readonly PlayDirection[] = ['asc'];

/** As above, by interval id. Unknown ids keep both directions — a ref
 *  we cannot resolve must not be silently collapsed. */
export function directionsForId(id: string): readonly PlayDirection[] {
  const semis = SEMITONES_BY_ID.get(id);
  return semis === undefined ? BOTH_DIRECTIONS : directionsFor(semis);
}

/**
 * The direction an itemRef for `id` should be recorded and read under.
 *
 * Historical `P1:desc` rows resolve to `asc`, which is what MERGES them
 * with the ascending ones rather than stranding them. They are real
 * unison data: the drill played two identical notes for both.
 */
export function normaliseDirection(id: string, direction: PlayDirection): PlayDirection {
  return directionsForId(id).includes(direction) ? direction : 'asc';
}

/** Every drillable `${id}:${direction}` ref, in catalog order. */
export function intervalItemRefs(): string[] {
  return INTERVAL_SEEDS.flatMap(
    seed => directionsFor(seed.semitones).map(dir => `${seed.id}:${dir}`),
  );
}

export const INTERVAL_SEEDS: IntervalSeed[] = [
  // No `descAnchorDefault`: see `directionsFor`. The retired anchor was
  // "Same note, step down", which describes a minor 2nd rather than the
  // two identical notes the drill actually played.
  { id: 'P1', name: 'Unison',       semitones: 0,  ascAnchorDefault: 'Same note held twice' },
  { id: 'm2', name: 'Minor 2nd',    semitones: 1,  ascAnchorDefault: 'Jaws theme',                      descAnchorDefault: 'Joy to the World opening' },
  { id: 'M2', name: 'Major 2nd',    semitones: 2,  ascAnchorDefault: 'Happy Birthday (first 2 notes)',  descAnchorDefault: 'Mary Had a Little Lamb' },
  { id: 'm3', name: 'Minor 3rd',    semitones: 3,  ascAnchorDefault: 'Smoke on the Water',              descAnchorDefault: 'Hey Jude (Hey-Jude)' },
  { id: 'M3', name: 'Major 3rd',    semitones: 4,  ascAnchorDefault: 'Oh When the Saints',              descAnchorDefault: 'Swing Low Sweet Chariot' },
  { id: 'P4', name: 'Perfect 4th',  semitones: 5,  ascAnchorDefault: 'Here Comes the Bride',            descAnchorDefault: 'Oh Come All Ye Faithful' },
  { id: 'TT', name: 'Tritone',      semitones: 6,  ascAnchorDefault: 'The Simpsons theme',              descAnchorDefault: 'Maria (West Side Story)' },
  { id: 'P5', name: 'Perfect 5th',  semitones: 7,  ascAnchorDefault: 'Star Wars theme',                 descAnchorDefault: 'Flintstones theme' },
  { id: 'm6', name: 'Minor 6th',    semitones: 8,  ascAnchorDefault: 'The Entertainer',                 descAnchorDefault: 'Love Story theme' },
  { id: 'M6', name: 'Major 6th',    semitones: 9,  ascAnchorDefault: 'My Bonnie Lies Over the Ocean',   descAnchorDefault: 'Nobody Knows the Trouble' },
  { id: 'm7', name: 'Minor 7th',    semitones: 10, ascAnchorDefault: 'Somewhere (West Side Story)',     descAnchorDefault: 'Watermelon Man intro' },
  { id: 'M7', name: 'Major 7th',    semitones: 11, ascAnchorDefault: 'Take on Me (synth)',              descAnchorDefault: 'I Love You (Cole Porter)' },
  { id: 'P8', name: 'Octave',       semitones: 12, ascAnchorDefault: 'Somewhere Over the Rainbow',      descAnchorDefault: 'Willow Weep for Me' },
];

/** Built from the seed list, so it cannot fall out of step with it.
 *  Declared after `INTERVAL_SEEDS`; nothing calls the lookups during
 *  module evaluation. */
const SEMITONES_BY_ID: ReadonlyMap<string, number> = new Map(
  INTERVAL_SEEDS.map(s => [s.id, s.semitones]),
);

export async function seedIntervals(): Promise<void> {
  await db.transaction('rw', db.intervals, async () => {
    for (const seed of INTERVAL_SEEDS) {
      const existing = await db.intervals.get(seed.id);
      // A directionless interval gets NO descending columns at all —
      // not zeroes. `Object.hasOwn(iv, 'descTotal') === false` is what
      // makes "unison has one case" checkable; a zero is indistinguish-
      // able from an untouched direction that still exists.
      const twoWay = directionsFor(seed.semitones).length === 2;
      if (!existing) {
        await db.intervals.put({
          ...seed,
          ascCorrect: 0,
          ascTotal: 0,
          ...(twoWay ? { descCorrect: 0, descTotal: 0 } : {}),
        } as IntervalData);
      } else {
        await db.intervals.update(seed.id, {
          name: seed.name,
          semitones: seed.semitones,
          ascAnchorDefault: seed.ascAnchorDefault,
          ...(twoWay
            ? { descAnchorDefault: seed.descAnchorDefault }
            // Retire the columns on a row seeded before the merge.
            : {
              descAnchorDefault: undefined,
              descAnchorCustom: undefined,
              descCorrect: undefined,
              descTotal: undefined,
            }),
        });
      }
    }
  });
}
