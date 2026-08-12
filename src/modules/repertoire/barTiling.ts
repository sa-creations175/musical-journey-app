import type { ChordPlacement, Song, SongSection } from '../../lib/db';
import {
  effectiveTimeSignature,
  parseTimeSignature,
  placementSlot,
  slotsPerBar,
} from './barGrid';
import { normalizeArrangements } from './beatsModel';
import { EIGHTHS_DURATION_VERSION } from './eighthsMigration';

/**
 * STRUCTURAL inspection of what a bar actually contains, in slots.
 * Read-only: this module computes, it never writes.
 *
 * WHY THIS EXISTS SEPARATELY FROM `slotPositionAudit`. That detector
 * asks "is this placement where the reconstruction says it should be,
 * and is its duration a recognised multiple of the original?" Both are
 * comparisons against a remembered past. Neither asks the question a
 * person actually asks when looking at the grid: DO THE CHORDS IN THIS
 * BAR TILE IT — no gaps, no overlaps, no overflow?
 *
 * A chord can sit at exactly the right `beatPos`, carry a duration
 * that is a perfectly ordinary number, and still leave half the bar
 * empty because the duration is counted in the wrong unit. Position
 * clean, duration unrecognised, bar visibly wrong. That combination is
 * invisible to a comparison-based check and obvious to a tiling one.
 *
 * The specific hole it covers: `classifyDuration` in slotPositionAudit
 * recognises `stored === expected × 2` (correct slots) and
 * `stored === expected × 4` (doubled twice), and files EVERYTHING ELSE
 * as 'user-set' — a bucket that is never surfaced. So a section
 * stamped as slot units whose durations are still in BEATS
 * (`stored === expected`, the exact inverse of a double-double) is
 * reported as entirely clean. Every chord renders at half its width
 * and the bar shows gaps.
 *
 * Tiling makes no reference to any past state, so it cannot be fooled
 * by a stale baseline or a legitimate edit. It reports what is there.
 */

/** One chord's footprint inside a bar, in slots. */
export interface SlotSpan {
  placementId: string;
  /** Human-readable chord, e.g. "1maj/5". */
  label: string;
  beatPos: number;
  offbeat: boolean;
  /** Where the chord starts, in slots from the bar's left edge. */
  startSlot: number;
  /** Stored `beats` verbatim — slots when the section is in slot
   *  units, beats when it is not. The whole point is that this value's
   *  unit is exactly what is in question. */
  beats: number;
  /** startSlot + beats. May exceed the bar when the chord ties over. */
  endSlot: number;
}

export interface BarTiling {
  barIndex: number;
  slotsPerBar: number;
  spans: SlotSpan[];
  /** Slots inside the bar covered by at least one chord. */
  covered: number;
  /** Maximal uncovered runs, as [from, to) in slots. */
  gaps: Array<{ from: number; to: number }>;
  /** Slots covered by more than one chord. */
  overlaps: number[];
  /** True when the bar is fully covered with no overlap. An empty bar
   *  is not "full" but is not a problem either — see `isEmpty`. */
  fillsBar: boolean;
  isEmpty: boolean;
  /** Slots of chord that spill past the end of the bar (ties). */
  overflow: number;
  /** True when any chord in the bar carries `offbeat`. */
  anyOffbeat: boolean;
  /** A right-aligned partial bar with everything on the beat — the
   *  shape of a pickup / anacrusis. Under-covered but not damaged, so
   *  it is excluded from problem counts. */
  looksLikePickup: boolean;
  /** Chords from the downbeat then silence — an ordinary partial bar.
   *  Also excluded from problem counts. */
  looksLikeTrailingRest: boolean;
  /** Slots in this bar covered by a chord that started in an earlier
   *  bar. Counted so a tie is not mistaken for a leading gap. */
  tiedInFrom: number;
}

export interface SectionTiling {
  sectionId: string;
  sectionName: string;
  beatsPerBar: number;
  slotsPerBar: number;
  /** Raw stamp value, or null when absent. */
  stamp: number | null;
  /** What the stamp claims the `beats` values are counted in. */
  claimedUnit: 'slots' | 'beats';
  songOnEighths: boolean;
  arrangementId: string;
  placements: number;
  bars: BarTiling[];
  /** Bars that are neither empty nor cleanly tiled. */
  problemBars: number[];
}

/** Render a chord the way the user reads it in the grid. Deliberately
 *  plain — this is a dump, not a display surface. */
export function chordLabel(p: ChordPlacement): string {
  const c = p.chord;
  const base = `${c.function}${c.quality}`;
  return c.bass ? `${base}/${c.bass}` : base;
}

/** Resolve the arrangement the grid is currently showing, the same way
 *  `songBeatAxis` does, so the dump matches what is on screen. */
export function activeArrangementIdFor(section: SongSection): string {
  const arrangements = normalizeArrangements(section);
  return section.activeArrangementId &&
    arrangements.some(a => a.id === section.activeArrangementId)
    ? section.activeArrangementId
    : arrangements[0].id;
}

/**
 * Lay out one section's chords in slot space and report, per bar, what
 * is covered and what is not. Pure.
 *
 * `beats` is read verbatim. No unit is assumed and nothing is scaled —
 * if the stored values are in the wrong unit, that is precisely what
 * shows up as a gap, and correcting for it here would hide the thing
 * we are looking for.
 */
export function analyseSectionTiling(
  song: Pick<Song, 'timeSignature' | 'eighths'>,
  section: SongSection,
): SectionTiling | null {
  if (section.chordPlacements === undefined) return null;

  const songOnEighths = song.eighths === true;
  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song as Song, section),
  );
  const perBar = slotsPerBar(beatsPerBar, songOnEighths);
  const arrangementId = activeArrangementIdFor(section);
  const mine = section.chordPlacements.filter(
    p => p.arrangementId === arrangementId,
  );

  const byBar = new Map<number, ChordPlacement[]>();
  let maxBar = -1;
  for (const p of mine) {
    if (p.barIndex < 0) continue;
    if (p.barIndex > maxBar) maxBar = p.barIndex;
    const list = byBar.get(p.barIndex);
    if (list) list.push(p);
    else byBar.set(p.barIndex, [p]);
  }

  let totalBars = Math.max(maxBar + 1, section.barCount ?? 0);
  const layout = section.barLayout;
  if (layout && layout.length > totalBars) totalBars = layout.length;

  // Coverage is computed in ABSOLUTE slot space across the whole
  // section, then sliced per bar. Computing it per bar would miss a
  // chord tying over from the previous bar and report the slots it
  // covers as a leading gap — a phantom that made every bar after a
  // tie look broken.
  const totalSlots = totalBars * perBar;
  const cover = new Array<number>(Math.max(0, totalSlots)).fill(0);
  const tiedInFrom = new Array<number>(totalBars).fill(0);
  for (const pl of mine) {
    if (pl.barIndex < 0) continue;
    const start = pl.barIndex * perBar + placementSlot(pl, songOnEighths);
    const end = start + Math.max(0, pl.beats);
    for (let s = start; s < end; s++) {
      if (s < 0 || s >= totalSlots) continue;
      cover[s] += 1;
      const owningBar = Math.floor(s / perBar);
      if (owningBar > pl.barIndex) tiedInFrom[owningBar] += 1;
    }
  }

  const bars: BarTiling[] = [];
  const problemBars: number[] = [];

  for (let barIndex = 0; barIndex < totalBars; barIndex++) {
    const here = (byBar.get(barIndex) ?? [])
      .slice()
      .sort(
        (a, b) =>
          placementSlot(a, songOnEighths) - placementSlot(b, songOnEighths),
      );

    const spans: SlotSpan[] = here.map(p => {
      const startSlot = placementSlot(p, songOnEighths);
      return {
        placementId: p.id,
        label: chordLabel(p),
        beatPos: p.beatPos,
        offbeat: p.offbeat === true,
        startSlot,
        beats: p.beats,
        endSlot: startSlot + p.beats,
      };
    });

    // This bar's window onto the section-wide coverage, so a chord
    // tied in from an earlier bar counts as covering what it covers.
    const base = barIndex * perBar;
    const local = cover.slice(base, base + perBar);
    let overflow = 0;
    for (const s of spans) {
      if (s.endSlot > perBar) overflow += s.endSlot - perBar;
    }

    const gaps: BarTiling['gaps'] = [];
    let run: number | null = null;
    for (let slot = 0; slot <= perBar; slot++) {
      const empty = slot < perBar && (local[slot] ?? 0) === 0;
      if (empty && run === null) run = slot;
      if (!empty && run !== null) {
        gaps.push({ from: run, to: slot });
        run = null;
      }
    }

    const overlaps: number[] = [];
    for (let slot = 0; slot < perBar; slot++) {
      if ((local[slot] ?? 0) > 1) overlaps.push(slot);
    }

    const covered = local.filter(n => n > 0).length;
    const isEmpty = spans.length === 0 && tiedInFrom[barIndex] === 0;
    const fillsBar = !isEmpty && covered === perBar && overlaps.length === 0;
    const anyOffbeat = spans.some(s => s.offbeat);

    // A pickup is right-aligned and ON THE BEAT: one gap, at the very
    // start, everything after it covered through to the bar's end,
    // nothing tied over, nothing on an "and". The on-the-beat clause
    // is what stops a damaged bar — which also shows a leading gap —
    // from being waved through as a pickup.
    const partialButTidy =
      !isEmpty &&
      !fillsBar &&
      overlaps.length === 0 &&
      overflow === 0 &&
      !anyOffbeat &&
      gaps.length === 1;
    const looksLikePickup =
      partialButTidy && gaps[0].from === 0 && gaps[0].to < perBar;
    // A trailing rest is as legitimate as a leading one — chords from
    // the downbeat, then silence. Counting it as damage was inflating
    // the scope number with ordinary partial bars.
    const looksLikeTrailingRest = partialButTidy && gaps[0].to === perBar;

    bars.push({
      barIndex,
      slotsPerBar: perBar,
      spans,
      covered,
      gaps,
      overlaps,
      fillsBar,
      isEmpty,
      overflow,
      anyOffbeat,
      looksLikePickup,
      looksLikeTrailingRest,
      tiedInFrom: tiedInFrom[barIndex],
    });
    if (!isEmpty && !fillsBar && !looksLikePickup && !looksLikeTrailingRest) {
      problemBars.push(barIndex);
    }
  }

  const stamp = section.eighthsDurationVersion ?? null;
  return {
    sectionId: section.id,
    sectionName: section.name,
    beatsPerBar,
    slotsPerBar: perBar,
    stamp,
    claimedUnit: stamp === EIGHTHS_DURATION_VERSION ? 'slots' : 'beats',
    songOnEighths,
    arrangementId,
    placements: mine.length,
    bars,
    problemBars,
  };
}

/**
 * A bar's gap pattern read as a hypothesis about the unit.
 *
 * When every chord in a bar covers exactly half the slots it should,
 * and the uncovered slots sit immediately after each chord, the stored
 * durations are behaving like BEATS in a bar measured in SLOTS. That
 * is the signature of a section stamped as slot units whose durations
 * were never doubled.
 *
 * Returned as a hypothesis and named as one. It is suggestive, not
 * proof — a bar genuinely half-full of chords with real rests looks
 * similar, which is why the caller is told to compare against a bar
 * known to render correctly rather than trusting this alone.
 */
/**
 * Every placement carrying an ODD duration, in slots.
 *
 * An odd duration is not itself wrong — a genuine eighth-length chord
 * is exactly that, and `halveChordDurations` refusing to round-trip
 * one is deliberate. It matters because of what it does to the
 * CASCADE: `cascadeChordPlacements` advances its cursor by each
 * chord's duration, so one odd value flips the parity of the cursor
 * and every chord it subsequently pushes lands on an odd slot — which
 * is to say, on an "and". One odd duration can therefore convert an
 * unbroken run of downstream chords to offbeats.
 *
 * Reported so the seed of a contiguous offbeat run can be located
 * rather than guessed at: it sits at, or immediately before, the first
 * bar of the run.
 */
export function oddDurations(
  section: SongSection,
): Array<{ placementId: string; label: string; barIndex: number; beats: number }> {
  if (section.chordPlacements === undefined) return [];
  const arrangementId = activeArrangementIdFor(section);
  return section.chordPlacements
    .filter(p => p.arrangementId === arrangementId && p.beats % 2 !== 0)
    .map(p => ({
      placementId: p.id,
      label: chordLabel(p),
      barIndex: p.barIndex,
      beats: p.beats,
    }));
}

/**
 * Apply a whole-slot shift to selected placements and return a NEW
 * array. Pure — nothing is written, and the caller can feed the result
 * straight back into `analyseSectionTiling` to see whether a candidate
 * repair would actually tile.
 *
 * This exists so a repair can be TESTED rather than argued for. The
 * damage under investigation is a uniform parity shift, and the claim
 * "moving these back one slot fixes it" is checkable against every
 * affected bar before a single byte is written.
 */
export function shiftPlacementsBySlots(
  song: Pick<Song, 'timeSignature' | 'eighths'>,
  section: SongSection,
  deltaSlots: number,
  select: (p: ChordPlacement) => boolean,
): ChordPlacement[] {
  const placements = section.chordPlacements ?? [];
  const { beatsPerBar } = parseTimeSignature(
    effectiveTimeSignature(song as Song, section),
  );
  const perBar = slotsPerBar(beatsPerBar, song.eighths === true);
  const eighths = song.eighths === true;

  return placements.map(p => {
    if (!select(p)) return p;
    const absolute =
      p.barIndex * perBar + placementSlot(p, eighths) + deltaSlots;
    if (absolute < 0) return p;
    const newBar = Math.floor(absolute / perBar);
    const slot = absolute - newBar * perBar;
    const next: ChordPlacement = { ...p, barIndex: newBar, beatPos: 0 };
    if (eighths) {
      next.beatPos = Math.floor(slot / 2);
      if (slot % 2 === 1) next.offbeat = true;
      else delete next.offbeat;
    } else {
      next.beatPos = slot;
      delete next.offbeat;
    }
    return next;
  });
}

/** Problem-bar count for a section, after optionally substituting a
 *  candidate set of placements. Convenience for before/after dry runs. */
export function problemBarCount(
  song: Pick<Song, 'timeSignature' | 'eighths'>,
  section: SongSection,
  placements?: ChordPlacement[],
): number {
  const target =
    placements === undefined ? section : { ...section, chordPlacements: placements };
  return analyseSectionTiling(song, target)?.problemBars.length ?? 0;
}

export function looksUndoubled(bar: BarTiling): boolean {
  if (bar.isEmpty || bar.fillsBar) return false;
  if (bar.overlaps.length > 0) return false;
  if (bar.spans.length === 0) return false;
  // Every chord would tile the bar exactly if its duration doubled.
  const doubledCoverage = bar.spans.reduce((n, s) => n + s.beats * 2, 0);
  if (doubledCoverage !== bar.slotsPerBar) return false;
  // And each chord starts where the previous one would end once doubled.
  let cursor = 0;
  for (const s of bar.spans) {
    if (s.startSlot !== cursor) return false;
    cursor += s.beats * 2;
  }
  return true;
}
