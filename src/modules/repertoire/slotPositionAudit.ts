import type { Song, SongSection } from '../../lib/db';
import {
  effectiveTimeSignature,
  materializeChordPlacements,
  parseTimeSignature,
  placementSlot,
} from './barGrid';
import { isInSlotUnits } from './eighthsMigration';

/**
 * DETECTOR for the `beatPos` damage shipped between 17d6927 (12.3) and
 * c08d840 (12.5). Read-only: this module computes, it never writes.
 *
 * THE DEFECT. `materializeChordPlacements` wrote the packer's position
 * counter straight into `ChordPlacement.beatPos`. On the eighths path
 * that counter is a SLOT index (0..7 in 4/4); `beatPos` is a BEAT
 * index (0..3) with `offbeat` carrying the half. So a chord that
 * belongs on beat 1 was recorded at "beat 2", and one on beat 2 was
 * recorded at "beat 4" — which is out of range, and
 * `deriveBarGridAnchored` filters `beatPos < beatsPerBar`, so it
 * vanished from the grid entirely and could take the bar count with it.
 *
 * HOW DAMAGE IS TOLD APART FROM LEGITIMATE DATA. Not by eyeballing
 * value ranges — the mistake that started all of this. `beatPos` 2 is
 * perfectly legitimate, and also exactly what a damaged beat-1 chord
 * looks like. So the detector RECONSTRUCTS instead of guessing.
 *
 * Materialised placements carry deterministic ids
 * (`mat-{arrangement}-{phrase}-{beat}`) derived from phrase data that
 * materialisation does not consume or delete. So the correct
 * (barIndex, beatPos, offbeat, beats) can be recomputed from the same
 * source and matched to the stored placement by id.
 *
 * Two further facts make the match sharp:
 *
 *   · `beatPos` is IDENTICAL whether the section materialises on the
 *     quarter or the eighths path — doubling the durations doubles the
 *     slots, and halving back lands on the same beat. So the
 *     reconstruction does not need to know which unit the section is
 *     in to check position.
 *   · Legacy durations are doubled before packing, so every start slot
 *     is EVEN and a legacy materialisation can never produce an
 *     offbeat. Damaged `beatPos` values are therefore always even, and
 *     always exactly `placementSlot(correct)`.
 *
 * That last point is a fingerprint, not a heuristic: a stored position
 * that equals `placementSlot(reconstructed)` while differing from
 * `reconstructed.beatPos` is slot-encoded, and nothing else produces
 * that relationship. A mismatch of any other shape is a user edit
 * (a chord dragged or added since) and is reported separately rather
 * than being counted as damage.
 *
 * THE BLIND SPOTS, named rather than papered over:
 *
 *   1. `beatPos === 0`. Slot 0 and beat 0 are the same number, so a
 *      damaged first-in-bar chord is indistinguishable from a correct
 *      one — and harmless, because the value is right either way.
 *   2. Sections whose PHRASES were edited after materialisation. The
 *      reconstruction reads today's phrase data; if that changed, the
 *      diff reflects the edit as much as any damage. Counted and
 *      reported as `unreconstructable` where the ids no longer line up.
 *   3. Placements with random uuids rather than `mat-` ids — added by
 *      hand, never materialised, never damaged by this defect. Skipped.
 *
 * A NOTE ON MISSING BARS. A dropped placement only shrinks the bar
 * count when it is the sole thing anchoring the final bar — the grid
 * sizes a section from the highest SURVIVING barIndex. Damage that
 * shares a bar with a healthy chord makes the chord invisible while
 * the bar count stays put, so `bars missing: 0` alongside real damage
 * is expected and is not the detector contradicting itself.
 *
 * A section can also carry a SECOND, independent injury from the same
 * window: materialised under eighths between 12.3 and 12.4 it was left
 * unstamped, so 12.4's repair read "unstamped" as "still in beats" and
 * doubled it a second time. The reconstruction catches that too, since
 * it recovers the original duration: correct is `expected × 2`, and
 * `expected × 4` is a double-double.
 */

/** How a stored placement differs from its reconstruction. */
export type PositionVerdict =
  /** Stored position equals `placementSlot(expected)` and differs from
   *  `expected.beatPos`. The slot-encoding fingerprint. */
  | 'slot-encoded'
  /** Position matches the reconstruction. */
  | 'clean'
  /** Differs in some other way — almost certainly a user edit since
   *  materialisation, not this defect. */
  | 'diverged';

/** How a stored duration compares with the reconstructed original. */
export type DurationVerdict =
  /** `expected` — the section is in beats and says so. */
  | 'beats'
  /** `expected × 2` — correct slot units. */
  | 'slots'
  /** `expected × 4` — doubled twice (materialised unstamped in the
   *  12.3→12.4 window, then doubled again by the repair). */
  | 'double-doubled'
  /** Anything else, including odd values the user set by hand. */
  | 'user-set';

export interface PlacementFinding {
  placementId: string;
  storedBeatPos: number;
  expectedBeatPos: number;
  expectedOffbeat: boolean;
  position: PositionVerdict;
  storedBeats: number;
  expectedBeats: number;
  duration: DurationVerdict;
  /** True when the grid currently drops this placement outright
   *  (`beatPos >= beatsPerBar`), so the chord is invisible. */
  invisible: boolean;
}

export interface SectionFinding {
  sectionId: string;
  sectionName: string;
  beatsPerBar: number;
  inSlotUnits: boolean;
  /** Placements whose position is slot-encoded. */
  damaged: PlacementFinding[];
  /** Placements dropped from the render right now. */
  invisible: PlacementFinding[];
  /** Durations doubled twice. */
  doubleDoubled: PlacementFinding[];
  /** Differences that look like user edits, reported so a clean result
   *  is not claimed over data the detector cannot account for. */
  diverged: PlacementFinding[];
  /** Stored `mat-` placements with no counterpart in the
   *  reconstruction — phrases edited since, so nothing can be said. */
  unreconstructable: number;
  /** Placements skipped because they were never materialised. */
  handAdded: number;
  /** Bars the grid renders now vs. what it would render undamaged. */
  barsNow: number;
  barsIfRepaired: number;
}

export interface SongFinding {
  songId: string;
  title: string;
  eighths: boolean;
  sections: SectionFinding[];
  damagedPlacements: number;
  invisiblePlacements: number;
  doubleDoubledPlacements: number;
  divergedPlacements: number;
  barsLost: number;
  /** Syllable anchors sitting in a damaged section — they did not move,
   *  but what they line up against did. */
  anchorsInDamagedSections: number;
  /** Syllable anchors pointing past the last bar the section currently
   *  renders. Orphaned by placements the grid dropped. */
  orphanedAnchors: Array<{ sectionId: string; barIndex: number; text: string }>;
}

/** Rendered bar count for a section, applying the same filter and the
 *  same total-bars rule `deriveBarGridAnchored` uses. Kept local so the
 *  detector reports what the grid ACTUALLY shows rather than what a
 *  repaired grid would. */
function renderedBarCount(
  section: SongSection,
  beatsPerBar: number,
  applyFilter: boolean,
): number {
  const placements = (section.chordPlacements ?? []).filter(
    p => !applyFilter || (p.beatPos >= 0 && p.beatPos < beatsPerBar),
  );
  let maxBar = -1;
  for (const p of placements) {
    if (p.barIndex >= 0 && p.barIndex > maxBar) maxBar = p.barIndex;
  }
  let total = Math.max(maxBar + 1, section.barCount ?? 0);
  const layout = section.barLayout;
  if (layout && layout.length > total) total = layout.length;
  return total;
}

function classifyDuration(stored: number, expected: number): DurationVerdict {
  if (expected <= 0) return 'user-set';
  if (stored === expected) return 'beats';
  if (stored === expected * 2) return 'slots';
  if (stored === expected * 4) return 'double-doubled';
  return 'user-set';
}

/**
 * Inspect one section. Pure — takes the section and its song's time
 * signature, returns findings and writes nothing.
 */
export function auditSectionPositions(
  song: Pick<Song, 'timeSignature'>,
  section: SongSection,
): SectionFinding | null {
  if (section.chordPlacements === undefined) return null;

  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song as Song, section),
  );

  // Reconstruct from the untouched phrase data. `eighths: false`
  // deliberately — position is unit-independent, and the beats this
  // returns are the ORIGINAL pre-doubling durations, which is what the
  // duration comparison needs.
  const rebuilt = materializeChordPlacements(
    { ...section, chordPlacements: undefined },
    beatsPerBar,
    false,
  );
  const expectedById = new Map(rebuilt.map(p => [p.id, p]));

  const finding: SectionFinding = {
    sectionId: section.id,
    sectionName: section.name,
    beatsPerBar,
    inSlotUnits: isInSlotUnits(section),
    damaged: [],
    invisible: [],
    doubleDoubled: [],
    diverged: [],
    unreconstructable: 0,
    handAdded: 0,
    barsNow: renderedBarCount(section, beatsPerBar, true),
    barsIfRepaired: renderedBarCount(section, beatsPerBar, false),
  };

  for (const stored of section.chordPlacements) {
    if (!stored.id.startsWith('mat-')) {
      finding.handAdded += 1;
      continue;
    }
    const expected = expectedById.get(stored.id);
    if (!expected) {
      finding.unreconstructable += 1;
      continue;
    }

    const expectedOffbeat = expected.offbeat === true;
    const slotOfExpected = placementSlot(expected, true);
    let position: PositionVerdict;
    if (
      stored.beatPos === expected.beatPos &&
      (stored.offbeat === true) === expectedOffbeat
    ) {
      position = 'clean';
    } else if (stored.beatPos === slotOfExpected && stored.offbeat !== true) {
      position = 'slot-encoded';
    } else {
      position = 'diverged';
    }

    const row: PlacementFinding = {
      placementId: stored.id,
      storedBeatPos: stored.beatPos,
      expectedBeatPos: expected.beatPos,
      expectedOffbeat,
      position,
      storedBeats: stored.beats,
      expectedBeats: expected.beats,
      duration: classifyDuration(stored.beats, expected.beats),
      invisible: stored.beatPos < 0 || stored.beatPos >= beatsPerBar,
    };

    if (position === 'slot-encoded') finding.damaged.push(row);
    if (position === 'diverged') finding.diverged.push(row);
    if (row.invisible) finding.invisible.push(row);
    if (row.duration === 'double-doubled') finding.doubleDoubled.push(row);
  }

  return finding;
}

/**
 * Inspect a whole song, including what its lyric anchors are sitting
 * on. Pure.
 *
 * Anchors were NEVER written with slot values — the drop path converts
 * through `slotToPosition`, which is why the eighths move was a no-op
 * for placed lyrics. So nothing on the lyric side is damaged. What the
 * anchors DO suffer is collateral: a syllable in a damaged section
 * still points at the beat it always did, while the chords around it
 * moved or disappeared, and an anchor past the last rendered bar has
 * nothing left to attach to.
 */
export function auditSongPositions(
  song: Song,
  sections: ReadonlyArray<SongSection>,
): SongFinding {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const findings: SectionFinding[] = [];
  for (const section of ordered) {
    const f = auditSectionPositions(song, section);
    if (f) findings.push(f);
  }

  const damagedSectionIds = new Set(
    findings.filter(f => f.damaged.length > 0).map(f => f.sectionId),
  );
  const barsBySection = new Map(findings.map(f => [f.sectionId, f.barsNow]));

  let anchorsInDamagedSections = 0;
  const orphanedAnchors: SongFinding['orphanedAnchors'] = [];
  for (const line of song.lyricLines ?? []) {
    for (const syllable of line.syllables ?? []) {
      const anchor = syllable.anchor;
      if (!anchor) continue;
      if (damagedSectionIds.has(anchor.sectionId)) anchorsInDamagedSections += 1;
      const bars = barsBySection.get(anchor.sectionId);
      if (bars !== undefined && anchor.barIndex >= bars) {
        orphanedAnchors.push({
          sectionId: anchor.sectionId,
          barIndex: anchor.barIndex,
          text: syllable.text,
        });
      }
    }
  }

  const sum = (pick: (f: SectionFinding) => number) =>
    findings.reduce((n, f) => n + pick(f), 0);

  return {
    songId: song.id,
    title: song.title,
    eighths: song.eighths === true,
    sections: findings,
    damagedPlacements: sum(f => f.damaged.length),
    invisiblePlacements: sum(f => f.invisible.length),
    doubleDoubledPlacements: sum(f => f.doubleDoubled.length),
    divergedPlacements: sum(f => f.diverged.length),
    barsLost: sum(f => f.barsIfRepaired - f.barsNow),
    anchorsInDamagedSections,
    orphanedAnchors,
  };
}
