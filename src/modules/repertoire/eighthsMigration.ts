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

// =====================================================================
// The repair pass
// =====================================================================

/**
 * WHY THIS EXISTS. The toggle doubled durations from the moment it
 * shipped, but songs that had `eighths` turned on BEFORE that wiring
 * landed never got the pass — their durations are still counted in
 * beats while the song renders in slots. A dry run over real data
 * found 74 such placements across 7 sections, topping out at 4 with
 * no value above it: nothing had been doubled, so the repair is
 * blanket rather than selective.
 *
 * WHY A STAMP RATHER THAN A LOOK AT THE VALUES. "Does this look
 * doubled?" is unanswerable — 4 is a legitimate duration in either
 * unit. Inferring the unit from the value range is precisely what let
 * this go unnoticed, so the unit becomes a recorded fact
 * (`eighthsDurationVersion`) that a later pass reads instead of
 * guessing. Unstamped means beats; stamped means slots.
 */

/** True when a section's stored durations are already slot units. */
export function isInSlotUnits(
  section: Pick<SongSection, 'eighthsDurationVersion'>,
): boolean {
  return section.eighthsDurationVersion === EIGHTHS_DURATION_VERSION;
}

/** Why the repair left a section alone. Named rather than implied, so
 *  the exclusion is something a test can assert on instead of a
 *  property of how the loop happens to iterate. */
export type RepairSkipReason =
  /** No stored `chordPlacements`. These sections were NEVER broken:
   *  their durations live in phrase data, and `materializeChordPlacements`
   *  converts them to slots at the moment they first become placements.
   *  They arrive already correct, so doubling them here would double
   *  them a second time. */
  | 'no-stored-placements'
  /** Already stamped at the current version. */
  | 'already-in-slot-units';

export interface RepairDecision {
  sectionId: string;
  /** True when the repair will rewrite this section. */
  double: boolean;
  /** Set exactly when `double` is false. */
  skipped?: RepairSkipReason;
  /** Placements in the section (0 when there are none stored). */
  placements: number;
}

export interface RepairPlan {
  decisions: RepairDecision[];
  /** Sections the repair will rewrite. */
  sectionsToDouble: number;
  /** Placements the repair will touch. */
  placementsToDouble: number;
}

/**
 * Decide, per section, what the repair would do. Pure and inspectable
 * — the caller can log or dry-run it before writing anything.
 *
 * The two exclusions are checked EXPLICITLY and in order. In
 * particular "no stored placements" is tested first and on its own
 * terms, not left to fall out of `chordPlacements ?? []` quietly
 * producing an empty map.
 */
export function planDurationRepair(
  sections: ReadonlyArray<SongSection>,
): RepairPlan {
  const decisions: RepairDecision[] = [];
  let sectionsToDouble = 0;
  let placementsToDouble = 0;

  for (const section of sections) {
    if (section.chordPlacements === undefined) {
      decisions.push({
        sectionId: section.id,
        double: false,
        skipped: 'no-stored-placements',
        placements: 0,
      });
      continue;
    }
    const placements = section.chordPlacements.length;
    if (isInSlotUnits(section)) {
      decisions.push({
        sectionId: section.id,
        double: false,
        skipped: 'already-in-slot-units',
        placements,
      });
      continue;
    }
    decisions.push({ sectionId: section.id, double: true, placements });
    sectionsToDouble += 1;
    placementsToDouble += placements;
  }

  return { decisions, sectionsToDouble, placementsToDouble };
}

/**
 * The patch that repairs one section, or `null` when the section is
 * excluded. Doubles `beats` and records the unit in the same write, so
 * a section can never be left doubled-but-unstamped and get doubled
 * again by the next pass.
 *
 * A section with a defined-but-empty `chordPlacements` still gets
 * stamped: it IS migrated, it simply holds no chords yet, and leaving
 * it unstamped would make the next pass reconsider it forever.
 */
export function repairSectionDurations(
  section: SongSection,
): Pick<SongSection, 'chordPlacements' | 'eighthsDurationVersion'> | null {
  if (section.chordPlacements === undefined) return null;
  if (isInSlotUnits(section)) return null;
  return {
    chordPlacements: doubleChordDurations(section.chordPlacements),
    eighthsDurationVersion: EIGHTHS_DURATION_VERSION,
  };
}

// =====================================================================
// Turning eighths back off — all or nothing
// =====================================================================

/**
 * WHY THE WHOLE SONG REFUSES RATHER THAN EACH SECTION DECIDING.
 *
 * `halveChordDurations` refuses a value that would not round-trip,
 * which is right. But the caller used to apply that refusal PER
 * SECTION and flip the song anyway: the setting said quarters while a
 * refusing section still held slot units. Two things disagreeing about
 * one fact is the same class of bug the stamp was introduced to end,
 * so the refusal is lifted to the song.
 *
 * Note that offbeat OCCUPANCY is not the test. A section can hold an
 * odd duration — a genuine eighth-length chord created with the
 * stepper — while no offbeat POSITION is occupied, so the occupancy
 * guard passes and the halve still cannot round-trip. Halve-ability
 * is the actual question, so it is the one asked.
 */

/** A section that cannot go back to beats, and the durations to blame.
 *  Carries enough to name the section to the user — a refusal that
 *  doesn't say what is blocking is worse than the drift it prevents. */
export interface HalveBlocker {
  sectionId: string;
  sectionName: string;
  /** The odd durations, in slot units. */
  odd: Array<{ placementId: string; beats: number }>;
}

export interface HalvePlan {
  /** Per-section patches to apply, in order. Empty when the song has
   *  nothing in slot units. */
  patches: Array<{
    sectionId: string;
    chordPlacements: ChordPlacement[];
  }>;
  /** Non-empty means the ENTIRE operation refuses and none of
   *  `patches` may be written. */
  blockers: HalveBlocker[];
}

/**
 * Decide what turning eighths off would do, without writing anything.
 * Pure, so the decision is inspectable and the caller can check before
 * it touches Dexie — a partial flip followed by a rollback would be
 * the same drift with extra steps.
 *
 * Only sections actually IN slot units are halved. A section with
 * stored placements but no stamp is already in beats (nothing doubled
 * it), so halving it would make every chord half as long; it is left
 * alone. A section with no stored placements has nothing to halve —
 * its durations live in phrase data, in beats, untouched by any of
 * this.
 */
export function planDurationHalving(
  sections: ReadonlyArray<SongSection>,
): HalvePlan {
  const patches: HalvePlan['patches'] = [];
  const blockers: HalveBlocker[] = [];

  for (const section of sections) {
    if (section.chordPlacements === undefined) continue;
    if (!isInSlotUnits(section)) continue;

    const halved = halveChordDurations(section.chordPlacements);
    if (halved === null) {
      blockers.push({
        sectionId: section.id,
        sectionName: section.name,
        odd: section.chordPlacements
          .filter(p => p.beats % 2 !== 0)
          .map(p => ({ placementId: p.id, beats: p.beats })),
      });
      continue;
    }
    patches.push({ sectionId: section.id, chordPlacements: halved });
  }

  return { patches, blockers };
}

/** Convenience for the refusal copy: "Chorus and Bridge" from the
 *  blocking sections, in section order. */
export function describeHalveBlockers(
  blockers: ReadonlyArray<HalveBlocker>,
): string {
  const names = blockers.map(b => b.sectionName.trim() || 'an untitled section');
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
