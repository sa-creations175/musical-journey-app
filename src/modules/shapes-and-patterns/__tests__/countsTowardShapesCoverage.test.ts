/**
 * The coverage-numerator filter.
 *
 * Practice data for qualities cut from the drill catalog on 20 Aug 2026
 * is deliberately KEPT — adding a quality back should restore its
 * history at the stage it was left. That means `spacingState` holds
 * `shapes-and-patterns` rows the denominator does not count, and
 * without this predicate on the numerator a coverage percentage can
 * read over 100%.
 *
 * Two independent exclusions are pinned here: cut qualities, and the
 * `supplementary` state. BOTH SIDES OR NEITHER is the whole rule — a
 * thing that leaves the denominator has to leave the numerator with it.
 */
import { describe, expect, it } from 'vitest';
import { countsTowardShapesCoverage } from '../drillModel';
import { shapesTargetUniverse } from '../cellTargets';
import { shapesCounts } from '../../../lib/moduleItemCounts';

describe('countsTowardShapesCoverage', () => {
  it('counts in-catalog triad and seventh inversion rows', () => {
    expect(countsTowardShapesCoverage('chord-shape:maj:C:root')).toBe(true);
    expect(countsTowardShapesCoverage('chord-shape:min:Eb:inv1')).toBe(true);
    expect(countsTowardShapesCoverage('chord-shape:maj7:F#:inv3')).toBe(true);
    expect(countsTowardShapesCoverage('chord-shape:mmaj7:Bb:fluid')).toBe(true);
  });

  it('rejects qualities cut from the catalog, in every key and state', () => {
    for (const quality of [
      'maj9', 'min9', 'dom9', 'maj11', 'min11', 'dom11',
      'maj13', 'min13', 'dom13', 'add9', 'maj7s11',
      'dom7b9', 'dom7s9', 'dom7b13', 'maj6', 'min6', 'maj6_9',
    ]) {
      expect(
        countsTowardShapesCoverage(`chord-shape:${quality}:C`),
        `${quality} should not count`,
      ).toBe(false);
    }
  });

  it('REJECTS supplementary rows — not a shape to own, from 31 Aug 2026', () => {
    /**
     * 6 sevenths × 12 keys = 72 rows.
     *
     * The left-hand root under a right-hand triad is not a distinct
     * shape: the triad is already drilled on its own and the left hand
     * is one note, so it is a combination of two things already
     * counted. A real voicing — root, third and flat seven in the left
     * hand — IS different, and belongs with voice leading.
     *
     * This reverses the 20 Aug 2026 ruling, which counted them in on
     * the grounds that the two-handed voicing is how the chord gets
     * played. The rows are KEPT on disk either way.
     */
    expect(countsTowardShapesCoverage('chord-shape:maj7:C:supplementary')).toBe(false);
    expect(countsTowardShapesCoverage('chord-shape:dom7:Ab:supplementary')).toBe(false);
  });

  it('and it is out of the ENUMERATION too, which is where it counts', () => {
    // The predicate guards the numerator; `chordCellTargets` decides
    // the denominator. A rule enforced on one side only is how a
    // percentage goes over 100.
    expect(shapesTargetUniverse().some(t => t.itemRef.endsWith(':supplementary')))
      .toBe(false);
  });

  it('A COVERAGE GOAL CANNOT EXCEED 100% WITH ALL THREE HANDS DRILLED', () => {
    /**
     * The bug this closes. The numerator counts spacingState rows,
     * which are `(itemRef, hand)`. The denominator had no hand axis, so
     * drilling every triad in every key on all three hands put 864
     * against 288.
     *
     * Both sides count targets now. Every row a fully-drilled catalog
     * would produce is in the universe, and nothing else is.
     */
    const universe = shapesTargetUniverse();
    const covered = universe.filter(t => countsTowardShapesCoverage(t.itemRef));
    expect(covered.length).toBe(universe.length);
    expect(covered.length).toBe(shapesCounts().total);
  });

  it('passes scales and voice-leading through untouched', () => {
    // Same moduleRef, same coverage total — the predicate is only
    // about chord shapes.
    expect(countsTowardShapesCoverage('scale:major:C')).toBe(true);
    expect(countsTowardShapesCoverage('scale:major-pentatonic:5:Eb')).toBe(true);
    expect(countsTowardShapesCoverage('vl:major-251:guide-tones:A:C')).toBe(true);
  });

  it('rejects unparseable refs rather than counting them', () => {
    expect(countsTowardShapesCoverage('nonsense')).toBe(false);
    expect(countsTowardShapesCoverage('')).toBe(false);
  });

  it('the surviving catalog is exactly 12 qualities / 2106 drills', () => {
    // Guard against a quality quietly coming back without a decision.
    const catalogRefs: string[] = [];
    for (const q of ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4']) {
      for (const state of ['root', 'inv1', 'inv2', 'fluid']) {
        catalogRefs.push(`chord-shape:${q}:C:${state}`);
      }
    }
    for (const q of ['maj7', 'min7', 'dom7', 'm7b5', 'dim7', 'mmaj7']) {
      // FIVE states. `supplementary` is the sixth and is out of the
      // score — see the test above.
      for (const state of ['root', 'inv1', 'inv2', 'inv3', 'fluid']) {
        catalogRefs.push(`chord-shape:${q}:C:${state}`);
      }
    }
    expect(catalogRefs.every(countsTowardShapesCoverage)).toBe(true);
    // 54 refs in one cell × 13 cells (twelve keys and the Circle of
    // 4ths, 14 Sep 2026) × 3 hands = 2106 drills.
    expect(catalogRefs.length).toBe(54);
    expect(catalogRefs.length * 13 * 3).toBe(2106);
    expect(shapesCounts().chordShapeDrills).toBe(2106);
  });
});
