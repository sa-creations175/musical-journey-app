import type { ChordPlacement, SongSection } from '../../lib/db';

/**
 * Chord DURATIONS move from beats to eighths.
 *
 * Offbeat POSITIONS were free — `beatPos` is untouched and an offbeat
 * is a separate flag, so nothing already placed moves. Durations are
 * the other half, and they are not free: the moment a chord sits on
 * beat 1 and another on the "and of 1", the first one lasts an eighth,
 * and `beats` is an integer count of beats.
 *
 * WHY DOUBLE RATHER THAN LEAVE `beats` ADVISORY. The alternative was
 * to keep durations in beats and let the renderer clip a chord at the
 * next occupied position — no migration, but "declared duration" and
 * "rendered width" would stop agreeing. Stored-vs-derived divergence
 * is what caused both bar-count bugs; a third invitation was declined.
 *
 * The doubling is MECHANICALLY INVERTIBLE: every value is multiplied
 * by exactly 2, so halving restores the original bit for bit. There is
 * one case where that is not true and it is worth naming rather than
 * glossing — a value that was not an integer to begin with, or one
 * already odd after migration (i.e. a genuine eighth-length chord
 * created after the move). Halving those would not round-trip, which
 * is why `halveChordDurations` reports them rather than silently
 * flooring.
 */

export const EIGHTHS_DURATION_VERSION = 1;

/** One placement's duration, doubled. Nothing else is touched. */
function doubled(p: ChordPlacement): ChordPlacement {
  return { ...p, beats: p.beats * 2 };
}

export function doubleChordDurations(
  placements: ReadonlyArray<ChordPlacement>,
): ChordPlacement[] {
  return placements.map(doubled);
}

/**
 * The inverse. Returns `null` when any value would not round-trip, so
 * a caller can refuse rather than quietly losing a genuine eighth.
 */
export function halveChordDurations(
  placements: ReadonlyArray<ChordPlacement>,
): ChordPlacement[] | null {
  if (placements.some(p => p.beats % 2 !== 0)) return null;
  return placements.map(p => ({ ...p, beats: p.beats / 2 }));
}

export interface DurationAudit {
  sections: number;
  placements: number;
  /** Values that are not positive integers — the migration would still
   *  double them, but they are worth eyeballing first. */
  anomalies: Array<{
    sectionId: string;
    placementId: string;
    beats: number;
    reason: string;
  }>;
  /** Distribution of current `beats` values, commonest first. */
  histogram: Array<{ beats: number; count: number }>;
}

/**
 * DRY RUN. Reports what the migration would do without writing
 * anything, so the change can be inspected against real songs before
 * it touches them.
 */
export function auditChordDurations(
  sections: ReadonlyArray<SongSection>,
): DurationAudit {
  const anomalies: DurationAudit['anomalies'] = [];
  const counts = new Map<number, number>();
  let placements = 0;
  let touched = 0;

  for (const section of sections) {
    const list = section.chordPlacements;
    if (!list) continue;
    touched += 1;
    for (const p of list) {
      placements += 1;
      counts.set(p.beats, (counts.get(p.beats) ?? 0) + 1);
      const reason =
        !Number.isFinite(p.beats)
          ? 'not a finite number'
          : !Number.isInteger(p.beats)
            ? 'not an integer — halving would not round-trip'
            : p.beats < 1
              ? 'less than one beat, which the model says cannot happen'
              : '';
      if (reason) {
        anomalies.push({
          sectionId: section.id,
          placementId: p.id,
          beats: p.beats,
          reason,
        });
      }
    }
  }

  return {
    sections: touched,
    placements,
    anomalies,
    histogram: [...counts.entries()]
      .map(([beats, count]) => ({ beats, count }))
      .sort((a, b) => b.count - a.count || a.beats - b.beats),
  };
}

/**
 * The invariant that decides whether the migration is right, expressed
 * the way it is actually experienced: **every chord must render at the
 * same width it did before.**
 *
 * Width is `beats / beatsPerBar`, and the migration doubles both the
 * numerator (each `beats`) and the denominator (positions per bar goes
 * from `beatsPerBar` to `beatsPerBar * 2`). So the ratio is unchanged
 * — which is the whole argument, and is asserted rather than assumed.
 */
export function renderedWidth(
  beats: number,
  slotsPerBar: number,
): number {
  return beats / slotsPerBar;
}
