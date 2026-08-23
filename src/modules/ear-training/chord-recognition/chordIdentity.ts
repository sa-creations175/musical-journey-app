/**
 * The chord-identity line the quiz reveals — "E♭ minor 7, 1st inversion".
 *
 * Extracted from ChordRecognitionQuiz so it can be tested. It was
 * already treated as logic rather than markup there ("derived as a
 * plain string so the inversion suffix can't get lost in JSX whitespace
 * nuances"); this only gives it a name and a home.
 */

import { spellNote, type Spelling } from '../../../lib/spelling';

/**
 * Note name for a root midi, in the reader's spelling.
 *
 * WAS SHARP-ONLY, AND NOT BY CHOICE. This module's ancestor in
 * ChordRecognitionQuiz held a single note table —
 * ['C','C#','D','D#',…] — with no flat counterpart anywhere in the
 * file. So the reveal printed "D# minor 7" and "A# major" on every
 * black-key root, for every user, with no setting that could change
 * it: six of the twelve roots the quiz can pick were named in an
 * alphabet the rest of the app does not use.
 *
 * That made this the one surface in the spelling work that was already
 * wrong rather than merely unconverted, which is why it ships on its
 * own rather than inside the sweep of the other ear-training tabs.
 */
export function rootNoteName(midi: number, spelling: Spelling): string {
  return spellNote(((midi % 12) + 12) % 12, spelling);
}

/**
 * Root + chord name, with ", <inversion>" appended when the card was
 * generated under inversion training and the answer was wrong — the
 * caller decides that and passes the label, or null.
 */
export function chordIdentityText(args: {
  rootMidi: number;
  chordName: string;
  inversionLabel: string | null;
  spelling: Spelling;
}): string {
  const root = rootNoteName(args.rootMidi, args.spelling);
  return args.inversionLabel
    ? `${root} ${args.chordName}, ${args.inversionLabel}`
    : `${root} ${args.chordName}`;
}
