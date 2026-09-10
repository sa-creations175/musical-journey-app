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
import { bassDrop, chordStep, playerMarks } from '../../../lib/player/voices';
import { intervalFromSemitones } from './intervalQuality';
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
  'half-dim': 'm7b5',
  // THE DIM7 IS VOICED BY THE NORMAL RULES, like any other shape: the
  // rung's tones from `handTones`, the bass rule underneath.
  diminished: 'dim7',
};

/** What a chord of this quality is called, in a key. */
function chordName(rootPc: number, quality: string, spelling: Spelling): string {
  const suffix = quality === 'minor' ? 'm7'
    : quality === 'dominant' ? '7'
      : quality === 'half-dim' ? 'm7♭5'
        : quality === 'diminished' ? 'dim7'
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
  const ruled = bassLine(rootPcs, []) as number[];
  // THE SAME NOTE TWICE ON A SAME-ROOT MOVE. The bass rule, handed a
  // root it already has, goes an octave up or down — a leap that is
  // not the move. Silas's ruling of 10 Sep 2026: 4 → 4m keeps its bass
  // where the first chord put it, and a Forward drop moves the whole
  // line, so it stays there with Forward too.
  const line = rootPcs[0] === rootPcs[1] ? [ruled[0], ruled[0]] : ruled;

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

/** What the bass did between the two chords, as it was heard. */
export interface BassMove {
  /** The two bass notes that sounded, as MIDI. */
  from: number;
  to: number;
  /** `'same'` when the bass holds its note — a same-root move. */
  direction: 'up' | 'down' | 'same';
  /** "minor 3rd", "tritone" — the interval's quality and size; empty
   *  when the bass holds. */
  interval: string;
  /** The verdict's middle part: "down a minor 3rd", or "same root". */
  words: string;
}

/**
 * The bass move, read off the schedule.
 *
 * =====================================================================
 * THE VERDICT SAYS WHAT THE BASS DID. Silas's ruling of 10 Sep 2026.
 *
 * It said "up a 6th" for 1 → 6m because the pool files a motion by
 * scale position — the 6 is above the 1 in the octave — while the bass
 * rule, choosing the smaller move, took the bass DOWN a minor 3rd. The
 * reader heard one thing and read another. So the words come from the
 * two bass notes that actually sounded, with the interval's quality:
 * Cmaj7 → Am7 is "down a minor 3rd" when the bass falls C to A, and
 * "up a major 6th" when it climbs.
 *
 * FROM THE STEP THE PLAYER SCHEDULES, not from the chords. `chordStep`
 * is what the sequencer is handed, so the Forward bass (dropped an
 * octave with the whole line) and the Blended one are both read as
 * they sound. The first note of a step is its bass in every mode —
 * the left hand's root, the root placed in the chord for one hand,
 * the bass alone for Bass only.
 *
 * THE FILTERS DO NOT MOVE. Distance and Direction still describe the
 * pool, which is what they narrow; this describes one voicing of it.
 * An octave never happens: a same-root move holds its bass instead.
 * =====================================================================
 */
export function bassMove(
  chords: ReadonlyArray<PlayerChord>,
  settings: PlayerSettings,
): BassMove | null {
  if (chords.length < 2) return null;
  const drop = bassDrop(chords, settings);
  const [from, to] = [chords[0], chords[1]]
    .map(c => chordStep(c, settings, 2, drop).intervals[0]);
  if (from === undefined || to === undefined) return null;
  // NO DIRECTION AND NO INTERVAL when the bass holds: the verdict reads
  // `4 → 4m · same root · F → Fm`.
  if (from === to) return { from, to, direction: 'same', interval: '', words: 'same root' };
  const direction = to > from ? 'up' : 'down';
  const interval = intervalFromSemitones(to - from).name.toLowerCase();
  return { from, to, direction, interval, words: `${direction} a ${interval}` };
}
