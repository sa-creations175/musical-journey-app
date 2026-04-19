import { db, type IntervalData } from '../../../lib/db';

export type IntervalSeed = Pick<
  IntervalData,
  'id' | 'name' | 'semitones' | 'ascAnchorDefault' | 'descAnchorDefault'
>;

export const INTERVAL_SEEDS: IntervalSeed[] = [
  { id: 'P1', name: 'Unison',       semitones: 0,  ascAnchorDefault: 'Same note held twice',            descAnchorDefault: 'Same note, step down' },
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

export async function seedIntervals(): Promise<void> {
  await db.transaction('rw', db.intervals, async () => {
    for (const seed of INTERVAL_SEEDS) {
      const existing = await db.intervals.get(seed.id);
      if (!existing) {
        await db.intervals.put({
          ...seed,
          ascCorrect: 0,
          ascTotal: 0,
          descCorrect: 0,
          descTotal: 0,
        });
      } else {
        await db.intervals.update(seed.id, {
          name: seed.name,
          semitones: seed.semitones,
          ascAnchorDefault: seed.ascAnchorDefault,
          descAnchorDefault: seed.descAnchorDefault,
        });
      }
    }
  });
}
