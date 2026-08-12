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
 * index (0..3) with `offbeat` carrying the half. A chord belonging on
 * beat 2 was recorded at "beat 4", which is out of range, and
 * `deriveBarGridAnchored` filters `beatPos < beatsPerBar`, so it
 * vanished from the grid.
 *
 * WHAT THE FIRST VERSION OF THIS FILE GOT WRONG, because the shape of
 * the mistake is the reason for most of the rules below.
 *
 * It classified every song, including songs that had never been on
 * eighths, and reported five findings that were all ordinary editing:
 *
 *   · It called `stored === expected × 2` a fingerprint of slot
 *     encoding. In 4/4 the only in-range case of that is beat 1 → 2,
 *     which is equally what dragging a chord one beat right looks
 *     like. The relation is decisive ONLY when the slot value lands
 *     at or past `beatsPerBar`, where no drag can reach.
 *   · It classified durations by the same kind of multiple. On a song
 *     in beats the stepper's whole range is 1..beatsPerBar, so ×2 and
 *     ×4 are both reachable by hand and mean nothing.
 *   · It reported divergence from the reconstruction next to damage
 *     counts, implying a relationship that does not exist.
 *
 * The defect can only reach a section that goes legacy → materialised
 * WHILE its song is on eighths. With eighths off, the packer counts
 * beats and `beatPos` is written correctly. So the eighths flag is now
 * the first gate, and a song that has never been on it is counted and
 * skipped rather than measured against rules that cannot apply to it.
 *
 * HOW DAMAGE IS TOLD APART FROM LEGITIMATE DATA. By reconstruction,
 * not by eyeballing value ranges. Materialised placements carry
 * deterministic ids (`mat-{arrangement}-{phrase}-{beat}`) derived from
 * phrase data that materialisation neither consumes nor deletes, so
 * the correct position can be recomputed and matched by id.
 *
 * Two facts sharpen the match:
 *
 *   · `beatPos` is IDENTICAL on the quarter and eighths paths —
 *     doubling the durations doubles the slots and halving lands on
 *     the same beat — so the reconstruction needs no knowledge of
 *     which unit a section is in.
 *   · Legacy durations are doubled before packing, so every start slot
 *     is EVEN and a legacy materialisation can never produce an
 *     offbeat.
 *
 * BLIND SPOTS AND LIMITS, stated rather than papered over. Every one
 * of these is surfaced in the console output too.
 *
 *   1. `beatPos === 0`. Slot 0 and beat 0 are the same number, so a
 *      damaged first-in-bar chord cannot be seen — and needs nothing
 *      done, because the stored value is correct either way.
 *   2. `stored === expected × 2` below `beatsPerBar` is AMBIGUOUS. It
 *      is reported in its own bucket and explicitly not counted as
 *      damage; an ordinary drag produces it just as readily.
 *   3. Sections whose PHRASES changed after materialisation. The
 *      reconstruction reads today's phrase data, so where ids no
 *      longer line up nothing can be said. Counted as
 *      `unreconstructable`.
 *   4. Hand-added placements (random uuids) are skipped — this defect
 *      only ever touched materialisation.
 *   5. Non-eighths songs are not assessed for damage at all. That is
 *      correct, not a gap: the defect cannot reach them.
 *
 * EDITING IS NOT DAMAGE. Once a section is migrated, edits go to
 * placements and never back to phrases, so the reconstruction is a
 * frozen snapshot of the pre-migration state and divergence from it
 * accumulates permanently and harmlessly with ordinary use. One action
 * can move many placements: `cascadeChordPlacements` pushes everything
 * after a lengthened chord forward, and a bar delete or reorder shifts
 * every downstream `barIndex`. The `edited` bucket is a diagnostic of
 * "has this been touched", never a health signal, and is split by
 * shape so a bar reorder is distinguishable from a cascade.
 *
 * A NOTE ON MISSING BARS. A dropped placement only shrinks the bar
 * count when it is the sole thing anchoring the final bar — the grid
 * sizes a section from the highest SURVIVING barIndex. Damage sharing
 * a bar with a healthy chord makes the chord invisible while the count
 * stays put, so `bars missing: 0` alongside real damage is expected.
 *
 * A section can also carry a SECOND, independent injury from the same
 * window: materialised under eighths between 12.3 and 12.4 it was left
 * unstamped, so 12.4's repair read "unstamped" as "still in beats" and
 * doubled it again. The reconstruction recovers the original duration,
 * so a correct ×2 and a double-doubled ×4 are distinguishable — but
 * only on a stamped section of an eighths song, where those multiples
 * mean something.
 */

/** How a stored placement's POSITION compares with its reconstruction. */
export type PositionVerdict =
  /** Matches the reconstruction. */
  | 'clean'
  /** Stored position is at or past `beatsPerBar` and equals
   *  `placementSlot(expected)`. No drag can reach there, so this is
   *  the defect and nothing else. */
  | 'slot-encoded'
  /** Stored is `expected × 2` but still inside beat range. Could be
   *  the defect; could equally be a chord dragged one beat right.
   *  NOT counted as damage. */
  | 'ambiguous'
  /** Moved some other way — ordinary editing. */
  | 'edited';

/** Which coordinate an edit moved. Distinguishes a bar reorder or
 *  delete (bar-only) from a cascade or in-bar drag (beat-only). */
export type EditShape = 'bar-only' | 'beat-only' | 'both';

/** How a stored duration compares with the reconstructed original.
 *  Only meaningful on a stamped section of an eighths song. */
export type DurationVerdict =
  /** `expected × 2` — correct slot units. */
  | 'slots'
  /** `expected × 4` — doubled twice. */
  | 'double-doubled'
  /** Anything else, including values set with the stepper. */
  | 'user-set'
  /** Song not on eighths, or section not in slot units. The multiples
   *  are reachable by hand there, so classifying would be noise. */
  | 'not-assessed';

/** Whether a section's stamp and its song's setting agree. */
export type StampMismatch =
  /** Section says slot units; song says beats. The drift the stamp
   *  exists to prevent. */
  | 'section-slots-song-beats'
  /** Song is on eighths but the section holds placements with no
   *  stamp. Either the lazy repair has not run yet, or it is genuinely
   *  still in beats. */
  | 'section-unstamped-song-eighths';

export interface PlacementFinding {
  placementId: string;
  storedBarIndex: number;
  expectedBarIndex: number;
  storedBeatPos: number;
  expectedBeatPos: number;
  expectedOffbeat: boolean;
  position: PositionVerdict;
  /** Set only when `position` is 'edited'. */
  editShape?: EditShape;
  storedBeats: number;
  expectedBeats: number;
  duration: DurationVerdict;
  /** True when the grid drops this placement outright
   *  (`beatPos >= beatsPerBar`), so the chord is invisible. */
  invisible: boolean;
}

export interface SectionFinding {
  sectionId: string;
  sectionName: string;
  beatsPerBar: number;
  placements: number;
  /** The stamp. Reported for EVERY section, so a clean result can be
   *  confirmed rather than assumed. */
  inSlotUnits: boolean;
  /** Null when the stamp and the song's setting agree. */
  stampMismatch: StampMismatch | null;
  /** False when the song has never been on eighths — the damage
   *  buckets below are then empty by design, not by luck. */
  assessedForDamage: boolean;
  /** Decisive damage. */
  damaged: PlacementFinding[];
  /** Could be damage, could be a drag. Never counted as damage. */
  ambiguous: PlacementFinding[];
  /** Placements the grid is dropping right now. */
  invisible: PlacementFinding[];
  /** Durations doubled twice. Only ever populated when assessed. */
  doubleDoubled: PlacementFinding[];
  /** Ordinary editing since migration. Not a health signal. */
  edited: PlacementFinding[];
  /** Stored `mat-` placements with no counterpart — phrases changed. */
  unreconstructable: number;
  /** Placements never materialised, so never touched by this defect. */
  handAdded: number;
  barsNow: number;
  barsIfRepaired: number;
}

export interface SongFinding {
  songId: string;
  title: string;
  eighths: boolean;
  sections: SectionFinding[];
  damagedPlacements: number;
  ambiguousPlacements: number;
  invisiblePlacements: number;
  doubleDoubledPlacements: number;
  editedPlacements: number;
  barsLost: number;
  stampMismatches: number;
  /** Syllable anchors sitting in a section with decisive damage. */
  anchorsInDamagedSections: number;
  /** Anchors pointing past the last bar their section renders. */
  orphanedAnchors: Array<{ sectionId: string; barIndex: number; text: string }>;
}

/** Rendered bar count, applying the same filter and total-bars rule
 *  `deriveBarGridAnchored` uses, so the detector reports what the grid
 *  ACTUALLY shows rather than what a repaired grid would. */
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

function classifyDuration(
  stored: number,
  expected: number,
  assessable: boolean,
): DurationVerdict {
  if (!assessable) return 'not-assessed';
  if (expected <= 0) return 'user-set';
  if (stored === expected * 2) return 'slots';
  if (stored === expected * 4) return 'double-doubled';
  return 'user-set';
}

function editShapeFor(
  storedBar: number,
  expectedBar: number,
  positionMoved: boolean,
): EditShape {
  const barMoved = storedBar !== expectedBar;
  if (barMoved && positionMoved) return 'both';
  return barMoved ? 'bar-only' : 'beat-only';
}

/**
 * Inspect one section. Pure — returns findings, writes nothing.
 *
 * `songOnEighths` gates every damage rule. The defect cannot reach a
 * section whose song was in beats when it materialised, and measuring
 * one against rules that cannot apply is how the first version of this
 * detector produced five false positives.
 */
export function auditSectionPositions(
  song: Pick<Song, 'timeSignature' | 'eighths'>,
  section: SongSection,
): SectionFinding | null {
  if (section.chordPlacements === undefined) return null;

  const songOnEighths = song.eighths === true;
  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song as Song, section),
  );
  const inSlotUnits = isInSlotUnits(section);

  // Reconstruct from the untouched phrase data. `eighths: false`
  // deliberately: position is unit-independent, and the beats this
  // returns are the ORIGINAL pre-doubling durations, which is what a
  // duration comparison needs.
  const rebuilt = materializeChordPlacements(
    { ...section, chordPlacements: undefined },
    beatsPerBar,
    false,
  );
  const expectedById = new Map(rebuilt.map(p => [p.id, p]));

  let stampMismatch: StampMismatch | null = null;
  if (inSlotUnits && !songOnEighths) stampMismatch = 'section-slots-song-beats';
  else if (!inSlotUnits && songOnEighths) {
    stampMismatch = 'section-unstamped-song-eighths';
  }

  const finding: SectionFinding = {
    sectionId: section.id,
    sectionName: section.name,
    beatsPerBar,
    placements: section.chordPlacements.length,
    inSlotUnits,
    stampMismatch,
    assessedForDamage: songOnEighths,
    damaged: [],
    ambiguous: [],
    invisible: [],
    doubleDoubled: [],
    edited: [],
    unreconstructable: 0,
    handAdded: 0,
    barsNow: renderedBarCount(section, beatsPerBar, true),
    barsIfRepaired: renderedBarCount(section, beatsPerBar, false),
  };

  // Durations are only classifiable where the multiples mean
  // something: a stamped section of a song on eighths. Anywhere else
  // the stepper can reach ×2 and ×4 by hand.
  const durationsAssessable = songOnEighths && inSlotUnits;

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
    const positionMatches =
      stored.beatPos === expected.beatPos &&
      (stored.offbeat === true) === expectedOffbeat;
    const slotOfExpected = placementSlot(expected, true);
    const barMatches = stored.barIndex === expected.barIndex;

    let position: PositionVerdict;
    if (positionMatches && barMatches) {
      position = 'clean';
    } else if (
      songOnEighths &&
      !positionMatches &&
      stored.offbeat !== true &&
      stored.beatPos === slotOfExpected &&
      stored.beatPos >= beatsPerBar
    ) {
      // Out of beat range and exactly the slot value. Unreachable by
      // any edit — the UI cannot place a chord past the last beat.
      position = 'slot-encoded';
    } else if (
      songOnEighths &&
      !positionMatches &&
      stored.offbeat !== true &&
      stored.beatPos === slotOfExpected
    ) {
      position = 'ambiguous';
    } else {
      position = 'edited';
    }

    const row: PlacementFinding = {
      placementId: stored.id,
      storedBarIndex: stored.barIndex,
      expectedBarIndex: expected.barIndex,
      storedBeatPos: stored.beatPos,
      expectedBeatPos: expected.beatPos,
      expectedOffbeat,
      position,
      storedBeats: stored.beats,
      expectedBeats: expected.beats,
      duration: classifyDuration(
        stored.beats,
        expected.beats,
        durationsAssessable,
      ),
      invisible: stored.beatPos < 0 || stored.beatPos >= beatsPerBar,
    };
    if (position === 'edited') {
      row.editShape = editShapeFor(
        stored.barIndex,
        expected.barIndex,
        !positionMatches,
      );
    }

    if (position === 'slot-encoded') finding.damaged.push(row);
    if (position === 'ambiguous') finding.ambiguous.push(row);
    if (position === 'edited') finding.edited.push(row);
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
 * for placed lyrics. Nothing on the lyric side is corrupt. What is
 * reported is collateral: a syllable in a damaged section still points
 * at the beat it always did while the chords around it moved, and an
 * anchor past the last rendered bar has nothing left to attach to.
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
    ambiguousPlacements: sum(f => f.ambiguous.length),
    invisiblePlacements: sum(f => f.invisible.length),
    doubleDoubledPlacements: sum(f => f.doubleDoubled.length),
    editedPlacements: sum(f => f.edited.length),
    barsLost: sum(f => f.barsIfRepaired - f.barsNow),
    stampMismatches: sum(f => (f.stampMismatch === null ? 0 : 1)),
    anchorsInDamagedSections,
    orphanedAnchors,
  };
}
