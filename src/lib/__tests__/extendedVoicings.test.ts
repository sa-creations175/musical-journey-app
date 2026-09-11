/**
 * Silas's notes, checked note for note.
 *
 * =====================================================================
 * THE TEST SPELLS THE CHORDS THE WAY THE NOTES DO.
 *
 * `~/cc-scratch/SILAS_NOTES_VOICINGS_AND_MODAL_INTERCHANGE.md` writes
 * every voicing twice — once in degrees and once in letters, "1 + [b7,
 * 9, 3, 13] or G + [F, A, B, E]". A test written in semitone offsets
 * would restate the table it is checking and pass on any transcription
 * slip that got into both. So the expectations here are the LETTERS,
 * turned back into notes over a named root, which is the half of the
 * notes the table was not typed from.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  EXTENDED_QUALITY_OF,
  EXTENDED_VOICINGS,
  extendedShape,
  extendedTones,
  isDominantExtended,
  type ExtendedPosition,
  type ExtendedQuality,
} from '../extendedVoicings';
import { CHORD_SEEDS } from '../../modules/ear-training/chord-recognition/seed';
import { handTones } from '../builtAnswers/chordShapes';
import { voicingFor } from '../../modules/ear-training/chord-progressions/progressionTheory';
import {
  VOICE_LEADING_PATTERN_BY_ID,
  voiceLeadingExtendedRule,
  voiceLeadingExtendedRun,
} from '../../modules/shapes-and-patterns/catalog';

/** Flat names, which is the alphabet the notes are written in. */
const NAMES = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];
const PC: Readonly<Record<string, number>> = Object.fromEntries(
  NAMES.map((n, i) => [n, i]),
);

/** A list of semitones over a named root, spelled back out. */
function over(root: string, tones: ReadonlyArray<number>): string[] {
  return tones.map(t => NAMES[(PC[root] + t) % 12]);
}

/** One shape as Silas writes it: `left | right`. */
function spell(
  quality: ExtendedQuality, position: ExtendedPosition, root: string,
): string {
  const shape = extendedShape(quality, position)!;
  return `${over(root, shape.left).join(' ')} | ${over(root, shape.right).join(' ')}`;
}

describe("the voicings are Silas's, note for note", () => {
  it('stage 2 — the dominant 9(13)', () => {
    // A: G + [B, E, F, A] · B: G + [F, A, B, E]
    expect(spell('dom9-13', 'A', 'G')).toBe('G | B E F A');
    expect(spell('dom9-13', 'B', 'G')).toBe('G | F A B E');
  });

  it('stage 4 — the dominant 7♯9♯5', () => {
    // A: C + [E, Ab, Bb, Eb] · B: C + [Bb, Eb, E, Ab]
    expect(spell('dom7#9#5', 'A', 'C')).toBe('C | E Ab Bb Eb');
    expect(spell('dom7#9#5', 'B', 'C')).toBe('C | Bb Eb E Ab');
  });

  it('stage 6 — the minor 6/9', () => {
    // A: C + [Eb, G, A, D] · B: C + [A, D, Eb, G]
    expect(spell('m6-9', 'A', 'C')).toBe('C | Eb G A D');
    expect(spell('m6-9', 'B', 'C')).toBe('C | A D Eb G');
  });

  it('stage 7 — the minor 9', () => {
    // A: C + [Eb, G, Bb, D] · B: C + [Bb, D, Eb, G]
    //
    // THE B'S DEGREE LIST IN STAGE 7 IS A SLIP and the letters are the
    // source: it reads `[b7, b3, 9, 5]` and then spells `Bb, D, Eb, G`,
    // which is ♭7, 9, ♭3, 5. Stage 10 writes the same voicing again and
    // agrees with the letters.
    expect(spell('m9', 'A', 'C')).toBe('C | Eb G Bb D');
    expect(spell('m9', 'B', 'C')).toBe('C | Bb D Eb G');
    expect(EXTENDED_VOICINGS.m9.B!.rightDegrees).toEqual(['b7', '9', 'b3', '5']);
  });

  it('stage 8 — the major 9', () => {
    // A: C + [E, G, B, D] · B: C + [B, D, E, G]
    expect(spell('maj9', 'A', 'C')).toBe('C | E G B D');
    expect(spell('maj9', 'B', 'C')).toBe('C | B D E G');
  });

  it('stage 10 — the minor 7♭5(11), whose left hand holds two notes', () => {
    // A: [D + G] + [Ab, C, F] · B: [D + Ab] + [C, F, G]
    expect(spell('m7b5-11', 'A', 'D')).toBe('D G | Ab C F');
    expect(spell('m7b5-11', 'B', 'D')).toBe('D Ab | C F G');
    expect(EXTENDED_VOICINGS['m7b5-11'].A!.left).toHaveLength(2);
    expect(EXTENDED_VOICINGS['m7b5-11'].B!.left).toHaveLength(2);
  });

  it('stage 10 — the two dominants of the minor 2 5 1, one position each', () => {
    // Dom7♯5 B: G + [F, B, Eb] · Dom7(♭9♯9♭13) A: [G + D + Ab] + [B, Eb, F, Bb]
    expect(spell('dom7#5', 'B', 'G')).toBe('G | F B Eb');
    expect(spell('dom7b9#9b13', 'A', 'G')).toBe('G D Ab | B Eb F Bb');
    // ONE POSITION EACH, and the absence is the point: each is written
    // for one run, so there is no second voicing of it to hand out.
    expect(extendedShape('dom7#5', 'A')).toBeNull();
    expect(extendedShape('dom7b9#9b13', 'B')).toBeNull();
  });

  it('never voices a note twice and always ascends', () => {
    // A SWEEP, so a row typed in later cannot arrive out of order or
    // with the same key pressed by both hands.
    for (const [quality, voicing] of Object.entries(EXTENDED_VOICINGS)) {
      for (const [position, shape] of Object.entries(voicing)) {
        const all = extendedTones(shape);
        const where = `${quality} ${position}`;
        expect(new Set(all).size, where).toBe(all.length);
        expect([...all].sort((a, b) => a - b), where).toEqual(all);
      }
    }
  });
});

describe('the runs', () => {
  it('knows which qualities behave as a dominant', () => {
    // `shapeInRun` WAS TESTED HERE. It derived a chord's shape from
    // whether it was a dominant, which held on the two 2 5 1 runs and
    // failed on a pass that starts on the dominant. The rule is the
    // row's FIRST chord now — Silas, 10 Sep 2026 — and it lives in the
    // catalog, where the row is.
    expect(isDominantExtended('dom9-13')).toBe(true);
    expect(isDominantExtended('m9')).toBe(false);
  });

  /** A pattern's Extended Voicings row, spelled in one key. */
  function run(patternId: string, position: ExtendedPosition, roots: string[]) {
    const pattern = VOICE_LEADING_PATTERN_BY_ID.get(patternId)!;
    const chords = voiceLeadingExtendedRun(pattern, position)!;
    expect(chords).toHaveLength(roots.length);
    return chords.map((c, i) => (
      `${over(roots[i], c.shape.left).join(' ')} | `
      + `${over(roots[i], c.shape.right).join(' ')}`
    ));
  }

  it('reads the major 2 5 1 exactly as stage 9 writes it', () => {
    // ABA — A: D + [F, A, C, E] · B: G + [F, A, B, E] · A: C + [E, G, B, D]
    expect(run('major-251', 'A', ['D', 'G', 'C'])).toEqual([
      'D | F A C E', 'G | F A B E', 'C | E G B D',
    ]);
    // BAB — B: D + [C, E, F, A] · A: G + [B, E, F, A] · B: C + [B, D, E, G]
    expect(run('major-251', 'B', ['D', 'G', 'C'])).toEqual([
      'D | C E F A', 'G | B E F A', 'C | B D E G',
    ]);
  });

  it('reads the minor 2 5 1 exactly as stage 10 writes it', () => {
    // ABA — [D + G] + [Ab, C, F] · G + [F, B, Eb] · C + [Eb, G, Bb, D]
    expect(run('minor-251', 'A', ['D', 'G', 'C'])).toEqual([
      'D G | Ab C F', 'G | F B Eb', 'C | Eb G Bb D',
    ]);
    // BAB — [D + Ab] + [C, F, G] · [G + D + Ab] + [B, Eb, F, Bb]
    //       · C + [Bb, D, Eb, G]
    expect(run('minor-251', 'B', ['D', 'G', 'C'])).toEqual([
      'D Ab | C F G', 'G D Ab | B Eb F Bb', 'C | Bb D Eb G',
    ]);
  });

  it('gives the minor 2 5 1 a different 5 in each position', () => {
    // The plain 7 is the SEVENTH-CHORD reading and stays; the extended
    // row plays the two chords Silas wrote for the two runs.
    const pattern = VOICE_LEADING_PATTERN_BY_ID.get('minor-251')!;
    expect(pattern.chords[1].quality).toBe('7');
    expect(voiceLeadingExtendedRun(pattern, 'A')![1].quality).toBe('dom7#5');
    expect(voiceLeadingExtendedRun(pattern, 'B')![1].quality)
      .toBe('dom7b9#9b13');
  });

  it('names the row\'s FIRST chord, and alternates from there', () => {
    // =================================================================
    // THE 5 → 1 WAS BACKWARDS, AND THIS IS THE CASE THAT SHOWED IT.
    //
    // The old rule read the two 2 5 1 runs and concluded that the
    // DOMINANT takes B in Position 1. True where the dominant is in the
    // middle; wrong on a pass that STARTS on it, which then played
    // Position 2's shape under Position 1. Silas ruled on 10 Sep 2026
    // that the position names the row's first chord.
    // =================================================================
    const five = VOICE_LEADING_PATTERN_BY_ID.get('five-one')!;
    expect(voiceLeadingExtendedRun(five, 'A')!.map(c => `${c.quality}:${c.position}`))
      .toEqual(['dom9-13:A', 'maj9:B']);
    expect(voiceLeadingExtendedRun(five, 'B')!.map(c => `${c.quality}:${c.position}`))
      .toEqual(['dom9-13:B', 'maj9:A']);
  });

  it('leaves the two 2 5 1 runs exactly where the notes put them', () => {
    // The new rule has to give the same answer as the old one wherever
    // the old one was right, and the two 2 5 1s are what it was read
    // off: their first chord is the 2, so A-B-A and B-A-B fall out.
    for (const [id, first] of [['major-251', 'm9'], ['minor-251', 'm7b5-11']] as const) {
      const pattern = VOICE_LEADING_PATTERN_BY_ID.get(id)!;
      expect(voiceLeadingExtendedRun(pattern, 'A')!.map(c => c.position), id)
        .toEqual(['A', 'B', 'A']);
      expect(voiceLeadingExtendedRun(pattern, 'B')!.map(c => c.position), id)
        .toEqual(['B', 'A', 'B']);
      expect(voiceLeadingExtendedRun(pattern, 'A')![0].quality, id).toBe(first);
    }
  });

  it('says which rows alternate and which take the nearer move', () => {
    // Silas's own list, not a derivation off the chord count — which
    // would have swept up the backdoor, a cadence in his own words.
    for (const id of ['1-5-6-4', '1-6-4-5', '1-6-2-5', '1-4-5', 'diatonic-cycle']) {
      expect(voiceLeadingExtendedRule(id), id).toBe('nearest');
    }
    for (const id of ['five-one', 'major-251', 'minor-251', 'backdoor', 'minor-aba']) {
      expect(voiceLeadingExtendedRule(id), id).toBe('alternate');
    }
  });

  it('has no run where the page draws no Extended Voicings row', () => {
    for (const id of ['diatonic-cycle', 'minor-aba', 'dom7b9', 'dim7']) {
      const pattern = VOICE_LEADING_PATTERN_BY_ID.get(id)!;
      expect(voiceLeadingExtendedRun(pattern, 'A'), id).toBeNull();
      expect(voiceLeadingExtendedRun(pattern, 'B'), id).toBeNull();
    }
  });
});

describe('one table, and the players read it', () => {
  it("the built-answer full rung is Silas's A shape", () => {
    // THE DOMINANT IS THE ONE THAT MOVED: the rung stacked 3-5-7-9 and
    // Silas's dominant holds the 13 where that had the 5.
    expect(handTones('7', 'full')).toEqual([4, 9, 10, 14]);
    expect(handTones('9', 'full')).toEqual([4, 9, 10, 14]);
    // The major and the minor were already right, and still are.
    expect(handTones('maj7', 'full')).toEqual([4, 7, 11, 14]);
    expect(handTones('m7', 'full')).toEqual([3, 7, 10, 14]);
    expect(handTones('7#9#5', 'full')).toEqual([4, 8, 10, 15]);
    // The right hand only — the half-diminished's second left-hand note
    // is the bass's, not the hand's.
    expect(handTones('m7b5', 'full')).toEqual([6, 10, 15]);
  });

  it('keeps a quality the notes do not cover, and its own ninth', () => {
    // A 7♭9 stacked 3-5-7 and handed a 14 would lose the ♭9 that IS the
    // chord and gain a natural 9 a semitone off it.
    expect(handTones('7b9', 'full')).toEqual([4, 7, 10, 13]);
    // A plain triad has no seventh to build on, so the rung stacks the
    // octave — unchanged.
    expect(handTones('', 'full')).toEqual([4, 7, 12]);
  });

  it("the ear-training jazz rung is the same table", () => {
    expect(voicingFor('dominant', 'jazz')).toEqual([0, 4, 9, 10, 14]);
    expect(voicingFor('major', 'jazz')).toEqual([0, 4, 7, 11, 14]);
    expect(voicingFor('minor', 'jazz')).toEqual([0, 3, 7, 10, 14]);
    expect(voicingFor('half-dim', 'jazz')).toEqual([0, 5, 6, 10, 15]);
    expect(voicingFor('dom7#9#5', 'jazz')).toEqual([0, 4, 8, 10, 15]);
  });

  it('agrees with what chord recognition teaches a 7♯9♯5 is', () => {
    // The ladder used to read this off `CHORD_SEEDS` and now reads the
    // notes. Both still say the same chord, and this is what fails the
    // day they stop.
    const seed = CHORD_SEEDS.find(s => s.id === 'dom7#9#5')!;
    expect(extendedTones(extendedShape('dom7#9#5', 'A')!))
      .toEqual([...seed.intervals]);
  });

  it('translates the deck\'s quality strings once', () => {
    expect(EXTENDED_QUALITY_OF.maj7).toBe('maj9');
    expect(EXTENDED_QUALITY_OF['7']).toBe('dom9-13');
    expect(EXTENDED_QUALITY_OF.m7b5).toBe('m7b5-11');
    // A quality with no extended voicing has no entry, and its callers
    // keep their own rule. The dim7 has one since 10 Sep 2026 — a rule
    // rather than a transcription (see the table's header).
    expect(EXTENDED_QUALITY_OF.dim7).toBe('dim7');
    expect(EXTENDED_QUALITY_OF['7b9']).toBeUndefined();
  });
});
