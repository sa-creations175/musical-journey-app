/**
 * An ear-training progression, as the shared player takes it.
 *
 * =====================================================================
 * ONE CONVERTER, TWO SURFACES, AND NO SECOND VOICING RULE.
 *
 * Key detection plays a passage and asks where home is; the harmonic
 * diary plays whatever an entry is about. Both sounded through
 * `playProgression`, which is this module's own sequencer — its own
 * tonic lead-in, its own bass boost, its own speed multiplier — and
 * neither needed any of that to be different from the rest of the app.
 *
 * So both come here instead. The intervals are still `voicingFor`'s,
 * which since 10 Sep 2026 reads Silas's own extended voicings; what
 * changes is that the result is a `PlayerChord` the shared panel can
 * sound, draw and pause.
 *
 * =====================================================================
 * ROOT POSITION, NOT VOICE-LED, AND THAT IS DELIBERATE.
 *
 * Key detection's question is which note is home, and its passage has
 * always been built from each chord's own root — see the playback
 * audit. Voice-leading it would change the sound of a measurement that
 * has months of history behind it. The Full Progression card is where
 * voice-led passes are asked about; this is not that card.
 * =====================================================================
 */
import type { PlayerChord } from '../../../lib/player/voices';
import { spellNote, type Spelling } from '../../../lib/spelling';
import type { ChordQuality } from './catalog';
import {
  numeralOffset, parseSlashChord, voicingFor, type Complexity,
} from './progressionTheory';

/** One chord of a passage, as the catalogs describe one. */
export interface ProgressionChordSpec {
  /** The numeral, which may carry a slash bass. */
  numeral: string;
  quality: ChordQuality;
  /** How long it lasts, in beats. */
  beats: number;
}

/** How far below the chord the bass sits. */
const BASS_DROP = 12;

/**
 * The chords of a passage in a key.
 *
 * `rootMidi` is the key's tonic, as `keyToRootMidi` gives it, and every
 * chord is placed from it — so passing a different one transposes the
 * passage.
 */
export function progressionChords(
  steps: ReadonlyArray<ProgressionChordSpec>,
  rootMidi: number,
  opts: {
    complexity?: Complexity;
    requiresDominant?: boolean;
    spelling?: Spelling;
  } = {},
): PlayerChord[] {
  const complexity = opts.complexity ?? 'seventh';
  const spelling = opts.spelling ?? 'flat';
  return steps.map(step => {
    const parsed = parseSlashChord(step.numeral);
    const chordRoot = rootMidi + numeralOffset(parsed.chord);
    const intervals = voicingFor(
      step.quality, complexity, opts.requiresDominant ?? false,
    );
    // A SLASH CHORD PUTS ITS OWN NOTE UNDERNEATH, which is the one
    // place this module's passages are not a chord over its own root.
    const bass = (parsed.bassOffset === undefined
      ? chordRoot
      : rootMidi + parsed.bassOffset) - BASS_DROP;
    return {
      hand: intervals.map(iv => chordRoot + iv),
      bass,
      rootPc: ((chordRoot % 12) + 12) % 12,
      beats: step.beats,
      name: `${spellNote(((chordRoot % 12) + 12) % 12, spelling)}${
        parsed.bassOffset === undefined
          ? ''
          : `/${spellNote((((rootMidi + parsed.bassOffset) % 12) + 12) % 12, spelling)}`}`,
    };
  });
}
