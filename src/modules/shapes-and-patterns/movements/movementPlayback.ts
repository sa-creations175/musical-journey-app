/**
 * Turning what was pressed into something that can be heard.
 *
 * =====================================================================
 * EVERY NUMBER THAT COMES OUT IS AN OFFSET ABOVE THE TONIC, WHICH IS
 * WHY CHANGING KEY IS ONE ARGUMENT.
 *
 * A placement stores its chord as a SCALE DEGREE and its voicing as
 * semitone offsets from that chord's own root. Neither names a pitch.
 * So the translation resolves the degree to a distance above the tonic,
 * adds it to every pressed offset, and hands `playSeqChords` a root
 * MIDI note. Play it in D♭ by passing a different root. Nothing is
 * re-derived and nothing is re-entered.
 *
 * =====================================================================
 * IT READS THE DURATION-UNIT STAMP RATHER THAN ASSUMING THE UNIT.
 *
 * `SongSection.eighthsDurationVersion` records whether `beats` counts
 * beats or eighth-slots, and its own comment says why it exists: the
 * unit used to be INFERRED, and an inference that is only probably
 * right is how a whole song's durations stayed in beats after the
 * toggle moved them to eighths without anyone noticing.
 *
 * A movement never carries the stamp — it has no eighths toggle — and
 * passes `undefined`. The parameter exists anyway, because the same
 * translation is what a lead-sheet section would use and a translator
 * that assumed would play that section at double speed.
 *
 * The halving factor is DERIVED from `slotsPerBar(beatsPerBar, true) =
 * beatsPerBar * 2`: a stamped bar holds twice as many slots as beats,
 * so a slot is half a beat.
 *
 * =====================================================================
 * A CHORD WITH NO PRESSED NOTES IS FILLED IN, NEVER SILENCED AND NEVER
 * SKIPPED (ruling 11).
 *
 * Silencing it makes the play control lie about the sequence — a gap
 * where a chord is written. Skipping it is worse: it changes the
 * rhythm, which is the thing being checked. So the quality supplies a
 * voicing, through the same `qualityIdFromSuffix` bridge the voicing
 * carousel uses, whose contract is that it never fails.
 *
 * AND IT COMES BACK MARKED. `derived: true` on the output is what lets
 * the screen show which chords are his hands and which are the app's
 * guess. An unmarked filled-in voicing is how a reader comes to
 * distrust the playback.
 * =====================================================================
 */
import type { ChordPlacement, VoicingEntry } from '../../../lib/db';
import type { SeqChord } from '../../../lib/audio';
import { normalizeVoicing } from '../../../lib/voicingColors';
import { SEMI_BY_DEGREE } from '../../repertoire/chordFunction';
import { pitchClassOfKey } from '../../repertoire/chordFunction';
import { parseTimeSignature } from '../../repertoire/barGrid';
import { EIGHTHS_DURATION_VERSION } from '../../repertoire/eighthsMigration';
import { QUALITY_INTERVALS } from '../catalog';
import { qualityIdFromSuffix } from '../voicingQualityMap';

/**
 * Where the tonic sits when a movement plays.
 *
 * C3. The pressed offsets reach up from a chord root and down to a
 * left-hand bass note, so the tonic needs an octave underneath it —
 * the prototype's own anchor, and the register a walk-up's bass line
 * lives in.
 */
export const MOVEMENT_TONIC_MIDI = 48;

/** How a filled-in voicing is laid out when nothing was pressed. */
const DERIVED_BASS_OFFSET = -12;
const DERIVED_RIGHT_OCTAVE = 12;

export interface PlayablePlacement {
  /** The placement this came from, so a highlight can name it. */
  placementId: string;
  /** Semitone offsets above the movement's tonic. */
  intervals: number[];
  /** Index-aligned with `intervals`. */
  hands: Array<'L' | 'R'>;
  /** Length in BEATS, whatever unit the stamp said the storage was in. */
  beats: number;
  /** True when nothing was pressed and the quality supplied the notes. */
  derived: boolean;
}

export interface PlayableMovement {
  /** In the order they sound. */
  placements: PlayablePlacement[];
  /** What `playSeqChords` takes. */
  chords: SeqChord[];
  rootMidi: number;
  beatsPerBar: number;
}

export interface TranslationInput {
  placements: readonly ChordPlacement[];
  /** The key the movement is PLAYED in — not necessarily the one it was
   *  captured in. This is the whole transposition mechanism. */
  key: string | undefined;
  timeSignature: string;
  /** `SongSection.eighthsDurationVersion`, or undefined for a movement. */
  eighthsDurationVersion?: number;
}

/** Where a placement sits, for ordering. */
function slotOf(p: ChordPlacement, beatsPerBar: number): number {
  return (p.barIndex * beatsPerBar + p.beatPos) * 2 + (p.offbeat ? 1 : 0);
}

/**
 * How far above the tonic this chord's root sits.
 *
 * FROM THE DEGREE, NOT FROM A NOTE NAME. `SEMI_BY_DEGREE` is the same
 * table `chordRootNote` reads; going through a spelled note name and
 * back would put a display decision inside a pitch calculation.
 */
function rootOffset(chord: ChordPlacement['chord']): number | null {
  const semi = SEMI_BY_DEGREE[chord.function];
  return semi === undefined ? null : semi;
}

/** The notes a quality supplies when nothing was pressed. */
export function derivedVoicing(chord: ChordPlacement['chord']): VoicingEntry[] {
  const { id } = qualityIdFromSuffix(chord.quality);
  const intervals = QUALITY_INTERVALS[id] ?? QUALITY_INTERVALS.maj;
  // The bass takes the slash degree where there is one, so a D/F♯ fills
  // in with an F♯ underneath rather than a D.
  const bassSemi = chord.bass === undefined ? 0 : (SEMI_BY_DEGREE[chord.bass] ?? 0);
  const bassFromRoot = chord.bass === undefined
    ? 0
    : bassSemi - (SEMI_BY_DEGREE[chord.function] ?? 0);
  return [
    { offset: DERIVED_BASS_OFFSET + bassFromRoot, hand: 'L' },
    ...intervals.map(i => ({ offset: DERIVED_RIGHT_OCTAVE + i, hand: 'R' as const })),
  ];
}

/**
 * What a placement sounds — what was pressed, or the filled-in voicing
 * where nothing was.
 *
 * ONE ANSWER FOR BOTH READERS. The player needs it to schedule notes
 * and the "what is sounding" keyboard needs it to draw them, and two
 * ways of deciding what a silent chord plays is how a screen comes to
 * show one thing and sound another.
 */
export function voicingForPlacement(placement: ChordPlacement): VoicingEntry[] {
  const pressed = normalizeVoicing(placement.voicing);
  return pressed.length > 0 ? pressed : derivedVoicing(placement.chord);
}

/**
 * Placements, a key and a time signature in; something playable out.
 *
 * Returns `null` where there is no key (ruling 10) — a voicing anchors
 * to a chord root and a root resolves from key + degree, so without one
 * there is nothing honest to play. The caller shows the reason rather
 * than guessing a key.
 */
export function toPlayableMovement(input: TranslationInput): PlayableMovement | null {
  if (!input.key) return null;
  const keyPc = pitchClassOfKey(input.key);
  if (keyPc < 0) return null;

  const { beatsPerBar } = parseTimeSignature(input.timeSignature);
  const slotIsHalfABeat =
    input.eighthsDurationVersion === EIGHTHS_DURATION_VERSION;

  const ordered = [...input.placements]
    .sort((a, b) => slotOf(a, beatsPerBar) - slotOf(b, beatsPerBar));

  const placements: PlayablePlacement[] = [];
  for (const p of ordered) {
    const root = rootOffset(p.chord);
    // A chord whose degree did not parse has no root to anchor to. It is
    // dropped rather than guessed at, and the caller can see it went by
    // comparing the counts.
    if (root === null) continue;
    const derived = normalizeVoicing(p.voicing).length === 0;
    const notes = voicingForPlacement(p);
    placements.push({
      placementId: p.id,
      intervals: notes.map(n => root + n.offset),
      hands: notes.map(n => n.hand),
      beats: Math.max(1, p.beats) * (slotIsHalfABeat ? 0.5 : 1),
      derived,
    });
  }

  return {
    placements,
    chords: placements.map(p => ({
      intervals: p.intervals, hands: p.hands, beats: p.beats,
    })),
    rootMidi: MOVEMENT_TONIC_MIDI + keyPc,
    beatsPerBar,
  };
}
