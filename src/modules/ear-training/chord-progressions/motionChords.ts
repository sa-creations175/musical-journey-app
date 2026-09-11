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
import { bassDrop, chordStep, handsForSetting, playerMarks } from '../../../lib/player/voices';
import { intervalFromSemitones, moveWords } from './intervalQuality';
import type { PlayerSettings } from '../../../lib/player/settings';
import type { KeyMark } from '../../../lib/builtAnswers/board';
import { handTones, type QualityId } from '../../../lib/builtAnswers/chordShapes';
import type { PlayerChord } from '../../../lib/player/voices';
import { spellNote, type Spelling } from '../../../lib/spelling';
import type { ProgressionSpelling } from '../../../lib/progressionSpellingShape';
import type { ChordQuality } from './catalog';
import { qualityText } from './motionDegrees';
import { degreeEntry, type DegreeLabel, type Direction } from './chordMotionPool';
import type { Thickness } from '../../../lib/builtAnswers/chordShapes';

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

/** The rungs Chord Motion's ladder offers. */
export type MotionRung = Extract<Thickness, 'triads' | 'guide' | 'seventh' | 'full'>;

/**
 * What a chord of this quality is called, in a key, at a rung.
 *
 * THE SYMBOL READS THE SAME FORMATTER AS THE CHIP (`qualityText`), so a
 * card that writes ♯4ø on its chip writes F♯ø7 in its verdict, and the
 * m7♭5 setting changes both at once. At Triads it is the triad that
 * sounds, so it is the triad that is named: F, Fm, G, F♯°.
 */
function chordName(
  root: string, quality: ChordQuality, rung: MotionRung,
  settings: ProgressionSpelling | undefined,
): string {
  return `${root}${qualityText(quality, rung, settings, 'symbol')}`;
}

export interface MotionVoicing {
  chords: PlayerChord[];
  /** Each chord's root pitch class, for the ring and for grading. */
  rootPcs: number[];
}

/** The board's lowest key, and its highest. */
const BOARD_LOW = 36;
const BOARD_HIGH = 84;

/**
 * The two chords of a motion, in a key, at a thickness.
 *
 * `keyPc` is the key's tonic pitch class. `from` and `to` are the
 * motion's own degree labels, which carry their quality. `direction`
 * is the card's: the bass goes that way. Absent, it is the direction
 * the pair always had — up when the destination sits higher in the
 * octave — which is what a legacy id means.
 */
export function motionChords(
  keyPc: number,
  from: DegreeLabel,
  to: DegreeLabel,
  rung: MotionRung,
  spelling: Spelling = 'flat',
  direction?: Direction,
  /** Settings' Note & Progression Spelling — how the diminished family
   *  is written. Absent, the app's defaults (° and ø). */
  rowSpelling?: ProgressionSpelling,
): MotionVoicing {
  const steps = [from, to].map(label => {
    const entry = degreeEntry(label);
    // A closed union, so this cannot happen — a guard rather than a
    // case, and it keeps a bad id from silently voicing as a C major.
    const semi = entry?.semi ?? 0;
    const quality = entry?.quality ?? 'major';
    // =====================================================================
    // THE LETTER FOLLOWS THE DEGREE'S ACCIDENTAL. Silas's ruling of 10
    // Sep 2026: the question says ♯4, so the chord is F♯m7♭5 in the key
    // of C, never G♭; ♭2 is D♭, ♭3 E♭, ♭6 A♭, ♭7 B♭ — whatever the
    // note-name setting says. A diatonic degree has no accidental of its
    // own and keeps following the setting, as it always has.
    // =====================================================================
    const degree = entry?.degree ?? label;
    const letters: Spelling = degree.startsWith('b') ? 'flat'
      : degree.startsWith('#') ? 'sharp' : spelling;
    return { rootPc: (((keyPc + semi) % 12) + 12) % 12, quality, letters };
  });

  const rootPcs = steps.map(s => s.rootPc);
  const fromSemi = degreeEntry(from)?.semi ?? 0;
  const toSemi = degreeEntry(to)?.semi ?? 0;
  const dir: Direction = direction ?? (toSemi === fromSemi ? 'same'
    : toSemi > fromSemi ? 'asc' : 'desc');
  // =====================================================================
  // THE BASS MAKES THE JUMP THE CARD NAMES. Silas's ruling of 10 Sep
  // 2026. The move is handed to the bass rule, which goes to the next
  // instance of the root that way — up a major 6th, or down a minor 3rd,
  // never more than a 7th — and then shifts the WHOLE line by octaves
  // into the bass register. A note is never moved on its own, so the
  // jump is never bent to fit.
  // =====================================================================
  let ruled = bassLine(rootPcs, dir === 'same' ? [] : [dir === 'asc' ? 'up' : 'down']) as number[];
  // THE SAME NOTE TWICE ON A SAME-ROOT MOVE. The bass rule, handed a
  // root it already has, goes an octave up or down — a leap that is
  // not the move. Silas's ruling of 10 Sep 2026: 4 → 4m keeps its bass
  // where the first chord put it, and a Forward drop moves the whole
  // line, so it stays there with Forward too.
  if (rootPcs[0] === rootPcs[1]) ruled = [ruled[0], ruled[0]];
  const line = ruled;

  // THE CHORDS STAY VOICE-LED: the first at its lowest voicing, the
  // second the nearest to it, as before.
  const hands: number[][] = [];
  let previous: number[] | null = null;
  steps.forEach(step => {
    const tones = handTones(SHAPE_OF_QUALITY[step.quality] ?? 'maj7', rung);
    const pcs = tones.map(t => (step.rootPc + t) % 12);
    const hand = previous === null
      ? allVoicings(pcs)[0] ?? []
      : nearest(pcs, previous, 'auto');
    if (hand.length > 0) previous = hand;
    hands.push(hand);
  });

  // =====================================================================
  // THE BASS STAYS UNDER THE HAND. A jump up a 7th can carry the bass
  // into the chord above it. The whole line comes down an octave if the
  // board's floor allows; if it does not, the CHORDS go up an octave
  // instead. Never the direction, and never one note.
  // =====================================================================
  const crosses = () => hands.some((h, i) => h.length > 0 && line[i] >= Math.min(...h));
  if (crosses() && Math.min(...line) - 12 >= BOARD_LOW) {
    line.splice(0, line.length, ...line.map(m => m - 12));
  }
  if (crosses() && hands.every(h => h.every(m => m + 12 <= BOARD_HIGH))) {
    hands.forEach((h, i) => { hands[i] = h.map(m => m + 12); });
  }

  const chords: PlayerChord[] = [];
  steps.forEach((step, i) => {
    chords.push({
      hand: hands[i],
      bass: line[i] ?? null,
      rootPc: step.rootPc,
      name: chordName(spellNote(step.rootPc, step.letters), step.quality, rung, rowSpelling),
      rootLetter: spellNote(step.rootPc, step.letters),
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
  // THE HANDS ROW APPLIED TO THE LIST, as the sequencer applies it.
  const played = handsForSetting(chords, settings);
  return playerMarks(played[index] ?? null, settings, bassDrop(chords, settings));
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
 * the left hand's root, or the bass alone for Bass only. The Hands row
 * never moves it.
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
  return { from, to, direction, interval, words: moveWords(to - from) };
}
