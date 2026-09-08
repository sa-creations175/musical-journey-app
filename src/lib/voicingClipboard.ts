/**
 * Carrying a voicing from one chord to another BY CHORD TONE.
 *
 * =====================================================================
 * A C VOICING PASTED ONTO A MINOR SIX COMES OUT MINOR.
 *
 * Ruling 13. The alternatives were both ruled out and both are worse in
 * the same way:
 *
 *   · EXACT KEYS — paste the same notes. Pasting a C major shape onto
 *     A minor gives a C major chord sitting on an A minor placement,
 *     which is not a voicing, it is a mistake with a name.
 *   · A PLAIN SEMITONE SHAPE — keep the distances from the root. Better,
 *     and still wrong the moment the two chords have different
 *     qualities: a major third stays a major third over a minor chord.
 *
 * So each note is remembered as the ROLE it plays — root, third, fifth,
 * seventh — plus which octave it sits in and which hand plays it, and
 * pasting REBUILDS those roles from the target chord's own quality.
 * Nothing to fix afterwards, which is the whole point.
 *
 * =====================================================================
 * A ROLE IS A POSITION IN THE QUALITY'S INTERVAL LIST, and that is the
 * ruled model rather than a chosen one. It has one honest limit worth
 * writing down: an extension has no counterpart in a shorter quality,
 * so a ninth copied off a min9 and pasted onto a plain minor triad has
 * no role to become. Those notes keep their own pitch class rather than
 * being dropped — the voicing arrives whole and the reader can see what
 * it did.
 *
 * A note that is not a chord tone at all — a passing colour someone
 * pressed — has no role either, and keeps its pitch class for the same
 * reason.
 * =====================================================================
 */
import { QUALITY_INTERVALS } from '../modules/shapes-and-patterns/catalog';
import { qualityIdFromSuffix } from '../modules/shapes-and-patterns/voicingQualityMap';
import type { VoicingEntry, VoicingHand } from './db';

/** One copied note: what it does, where it sat, who played it. */
export interface CopiedTone {
  /** Index into the source quality's interval list, or -1 when the note
   *  is not one of its chord tones. */
  role: number;
  /** Its pitch class above the root, kept as the fallback. */
  pc: number;
  /** Which octave band it sat in, as a multiple of 12. */
  octave: number;
  hand: VoicingHand;
}

export interface CopiedVoicing {
  /** The quality it was copied from, for the report and for tests. */
  fromQuality: string;
  tones: CopiedTone[];
}

/** The intervals a chord quality is built from, always in-catalog. */
function intervalsFor(quality: string | undefined): number[] {
  const { id } = qualityIdFromSuffix(quality);
  return QUALITY_INTERVALS[id] ?? QUALITY_INTERVALS.maj;
}

export function copyVoicing(
  voicing: readonly VoicingEntry[],
  quality: string | undefined,
): CopiedVoicing {
  const intervals = intervalsFor(quality);
  return {
    fromQuality: quality ?? '',
    tones: voicing.map(({ offset, hand }) => {
      // FLOOR, NOT TRUNCATION. A left-hand note sits BELOW the root at a
      // negative offset, and truncating -12 toward zero would put it in
      // the root's own octave — the bass note of every walk-up, moved.
      const octave = Math.floor(offset / 12) * 12;
      const pc = ((offset % 12) + 12) % 12;
      return { role: intervals.findIndex(i => i % 12 === pc), pc, octave, hand };
    }),
  };
}

export function pasteVoicing(
  copied: CopiedVoicing,
  quality: string | undefined,
): VoicingEntry[] {
  const intervals = intervalsFor(quality);
  return copied.tones.map(tone => {
    const rebuilt = tone.role >= 0 && tone.role < intervals.length
      ? intervals[tone.role] % 12
      : tone.pc;
    return { offset: tone.octave + rebuilt, hand: tone.hand };
  });
}
