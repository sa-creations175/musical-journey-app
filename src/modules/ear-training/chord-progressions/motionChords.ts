/**
 * A chord motion, as the shared player takes it.
 *
 * =====================================================================
 * TWO CHORDS, VOICE-LED, WITH THE APP'S OWN BASS RULE.
 *
 * Chord Motion had a player of its own: a cadence lead-in, three
 * listening modes, a speed multiplier, a "no octave crossing" rule and
 * chords placed in root position from their own degree. Every one of
 * those was a second answer to a question the shared player already
 * answers, and the reader met a different sound here from the one every
 * other ear card makes.
 *
 * So the two chords come here instead, and here does what
 * `passVoicing.voiceEntry` does for a pass: the bass line by the app's
 * bass rule, the right hand rootless, the first chord's shape the
 * lowest voicing and the second the NEAREST one. Whichever inversion
 * falls out of that is the inversion, which is Silas's ruling of 10 Sep
 * 2026 and why "no octave crossing" retires.
 *
 * =====================================================================
 * ROOTLESS RIGHT HAND, ROOT IN THE BASS — the same shape a pass takes.
 *
 * `handTones` gives the rung's tones and the bass line supplies the
 * root, so the two chords share one voice-leading rule with the Full
 * Progression card rather than each having their own.
 * =====================================================================
 */
import { bassLine, nearest, allVoicings } from '../../../lib/builtAnswers/voiceLeading';
import { bassDrop, playerMarks } from '../../../lib/player/voices';
import type { PlayerSettings } from '../../../lib/player/settings';
import type { KeyMark } from '../../../lib/builtAnswers/board';
import { handTones, type QualityId } from '../../../lib/builtAnswers/chordShapes';
import type { PlayerChord } from '../../../lib/player/voices';
import { spellNote, type Spelling } from '../../../lib/spelling';
import { degreeEntry, type DegreeLabel } from './chordMotionPool';
import type { ListRung } from './sharedList';

/**
 * The chord-shape id for a motion degree's quality.
 *
 * The motion pool speaks the progression catalog's four qualities;
 * `handTones` speaks the chord-shape vocabulary. One map, here, rather
 * than a `quality as QualityId` cast that would be wrong in silence.
 */
const SHAPE_OF_QUALITY: Readonly<Record<string, QualityId>> = {
  major: 'maj7',
  minor: 'm7',
  dominant: '7',
  diminished: 'm7b5',
};

/** What a chord of this quality is called, in a key. */
function chordName(rootPc: number, quality: string, spelling: Spelling): string {
  const suffix = quality === 'minor' ? 'm7'
    : quality === 'dominant' ? '7'
      : quality === 'diminished' ? 'm7♭5'
        : 'maj7';
  return `${spellNote(rootPc, spelling)}${suffix}`;
}

export interface MotionVoicing {
  chords: PlayerChord[];
  /** Each chord's root pitch class, for the ring and for grading. */
  rootPcs: number[];
}

/**
 * The two chords of a motion, in a key, at a thickness.
 *
 * `keyPc` is the key's tonic pitch class. `from` and `to` are the
 * motion's own degree labels, which carry their diatonic quality.
 */
export function motionChords(
  keyPc: number,
  from: DegreeLabel,
  to: DegreeLabel,
  rung: ListRung,
  spelling: Spelling = 'flat',
): MotionVoicing {
  const steps = [from, to].map(label => {
    const entry = degreeEntry(label);
    // A closed union, so this cannot happen — a guard rather than a
    // case, and it keeps a bad id from silently voicing as a C major.
    const semi = entry?.semi ?? 0;
    const quality = entry?.quality ?? 'major';
    return { rootPc: (((keyPc + semi) % 12) + 12) % 12, quality };
  });

  const rootPcs = steps.map(s => s.rootPc);
  // NO MOVES PASSED: the bass rule chooses, which is the whole point of
  // retiring "no octave crossing". A fourth or a fifth alternates and
  // everything else takes the smaller move — see `bassLine`.
  const line = bassLine(rootPcs, []) as number[];

  const chords: PlayerChord[] = [];
  let previous: number[] | null = null;
  steps.forEach((step, i) => {
    const tones = handTones(SHAPE_OF_QUALITY[step.quality] ?? 'maj7', rung);
    const pcs = tones.map(t => (step.rootPc + t) % 12);
    const hand = previous === null
      ? allVoicings(pcs)[0] ?? []
      : nearest(pcs, previous, 'auto');
    if (hand.length > 0) previous = hand;
    chords.push({
      hand,
      bass: line[i] ?? null,
      rootPc: step.rootPc,
      name: chordName(step.rootPc, step.quality, spelling),
    });
  });

  return { chords, rootPcs };
}

/**
 * What the reveal's board paints for one chord of the motion.
 *
 * THE LIT KEYS ARE THE SOUNDING KEYS, which is law (a) of the shared
 * player. Both the board and the test read this one function, so a test
 * asserting the painted set equals the scheduled set is asserting
 * something about the board a reader actually sees rather than about a
 * second copy of the rule.
 */
export function motionMarks(
  chords: ReadonlyArray<PlayerChord>,
  index: number,
  settings: PlayerSettings,
): ReadonlyMap<number, KeyMark> {
  return playerMarks(chords[index] ?? null, settings, bassDrop(chords, settings));
}
