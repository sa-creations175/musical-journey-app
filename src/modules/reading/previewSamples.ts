/**
 * The twenty-one preview samples — a fixed, deliberately extreme set.
 *
 * Weighted toward where notation rendering actually breaks: ledger
 * lines two out either side, six-accidental signatures, stacked
 * inversions, a bass-clef signature, an open shape spanning a tenth.
 * A set of comfortable middle-of-the-staff cards would prove nothing.
 *
 * Each entry is an itemRef plus its render options. NOTHING here is a
 * caption — captions come from `resolveReadingCard`, so this file
 * cannot make the label and the picture disagree. What it CAN do is
 * pick which card gets drawn, which is the whole job.
 *
 * Kept after step 4 on purpose: it is the notation check for a reader
 * who is still learning, and the place to re-verify when the key
 * overlay lands.
 */

import type { ReadingRenderOptions } from './renderCard';

export interface ReadingSample {
  /** Slot number in the fixed set, so a report can name a card. */
  n: number;
  itemRef: string;
  options?: ReadingRenderOptions;
  /** What this slot is here to exercise. Shown nowhere; it documents
   *  why the sample was chosen. */
  why: string;
}

export const SIGNATURE_SAMPLES: ReadonlyArray<ReadingSample> = [
  { n: 1, itemRef: 'sig:0:major:name',  options: { clef: 'treble' }, why: 'no accidentals at all' },
  { n: 2, itemRef: 'sig:1s:major:name', options: { clef: 'treble' }, why: 'single sharp placement' },
  { n: 3, itemRef: 'sig:1f:major:name', options: { clef: 'treble' }, why: 'single flat placement' },
  { n: 4, itemRef: 'sig:6s:major:name', options: { clef: 'treble' }, why: 'six sharps — full sharp order' },
  { n: 5, itemRef: 'sig:6f:major:name', options: { clef: 'treble' }, why: 'six flats — full flat order' },
  { n: 6, itemRef: 'sig:2s:minor:name', options: { clef: 'treble' }, why: 'minor mode captions the relative minor' },
  { n: 7, itemRef: 'sig:3f:major:name', options: { clef: 'bass' },   why: 'signature glyphs shift on the bass staff' },
];

export const NOTE_SAMPLES: ReadonlyArray<ReadingSample> = [
  { n: 8,  itemRef: 'note:treble:12', why: 'two ledger lines above the treble staff' },
  { n: 9,  itemRef: 'note:bass:-4',   why: 'two ledger lines below the bass staff' },
  { n: 10, itemRef: 'note:treble:-2', why: 'middle C, first ledger below treble' },
  { n: 11, itemRef: 'note:treble:4',  why: 'treble, on a line (middle line)' },
  { n: 12, itemRef: 'note:treble:3',  why: 'treble, in a space' },
  { n: 13, itemRef: 'note:bass:6',    why: 'bass, on a line (the F-clef line)' },
  { n: 14, itemRef: 'note:bass:1',    why: 'bass, in a space' },
];

export const CHORD_SAMPLES: ReadonlyArray<ReadingSample> = [
  { n: 15, itemRef: 'chord:maj:root:treble',
    options: { root: { letter: 'C', octave: 4 } },
    why: 'plain triad, root position' },
  { n: 16, itemRef: 'chord:maj:inv1:treble',
    options: { root: { letter: 'C', octave: 4 } },
    why: 'inversion rotates the stack — same letters, new bottom' },
  { n: 17, itemRef: 'chord:dom7:root:treble',
    options: { root: { letter: 'G', octave: 4 } },
    why: 'four-note stack' },
  { n: 18, itemRef: 'chord:dom7:inv3:treble',
    options: { root: { letter: 'G', octave: 4 } },
    why: 'third inversion — seventh in the bass, tightest spacing' },
  { n: 19, itemRef: 'chord:min7:root:bass',
    options: { root: { letter: 'A', octave: 2 } },
    why: 'stack on the bass staff' },
  { n: 20, itemRef: 'chord:r10:root:bass',
    options: { root: { letter: 'C', octave: 2 } },
    why: 'open shape spanning a tenth, into ledger territory' },
  { n: 21, itemRef: 'chord:dim:root:treble',
    options: { root: { letter: 'C', octave: 4 } },
    // C rather than B deliberately: B diminished needs no accidentals
    // and neither does any other chord sample, so nothing on this page
    // would exercise accidental placement on a notehead.
    why: 'accidentals written on noteheads (Eb, Gb)' },
];

export const PREVIEW_SECTIONS: ReadonlyArray<{
  heading: string;
  samples: ReadonlyArray<ReadingSample>;
}> = [
  { heading: 'Key signatures', samples: SIGNATURE_SAMPLES },
  { heading: 'Notes',          samples: NOTE_SAMPLES },
  { heading: 'Chords',         samples: CHORD_SAMPLES },
];

export const ALL_SAMPLES: ReadonlyArray<ReadingSample> = [
  ...SIGNATURE_SAMPLES,
  ...NOTE_SAMPLES,
  ...CHORD_SAMPLES,
];
