/**
 * The coverage-numerator filter.
 *
 * Practice data for qualities cut from the drill catalog on 20 Aug 2026
 * is deliberately KEPT — adding a quality back should restore its
 * history at the stage it was left. That means `spacingState` holds
 * `shapes-and-patterns` rows the 720-item denominator does not count,
 * and without this predicate on the numerator a coverage percentage can
 * read over 100%.
 *
 * Two independent exclusions are pinned here. The second one
 * (supplementary) was already wrong before the cut — the overall shapes
 * numerator never filtered it — so this is a fix, not just a follow-on.
 */
import { describe, expect, it } from 'vitest';
import { countsTowardShapesCoverage } from '../drillModel';

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

  it('ACCEPTS supplementary rows — shapes to own since 20 Aug 2026', () => {
    // 6 sevenths × 12 keys = 72 rows. They sat outside every
    // denominator until the two-handed LH-root + RH-triad voicing was
    // recognised as a shape to own rather than a way of practising the
    // other five.
    expect(countsTowardShapesCoverage('chord-shape:maj7:C:supplementary')).toBe(true);
    expect(countsTowardShapesCoverage('chord-shape:dom7:Ab:supplementary')).toBe(true);
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

  it('the surviving catalog is exactly 12 qualities / 720 cells', () => {
    // Guard against a quality quietly coming back without a decision.
    const catalogRefs: string[] = [];
    for (const q of ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4']) {
      for (const state of ['root', 'inv1', 'inv2', 'fluid']) {
        catalogRefs.push(`chord-shape:${q}:C:${state}`);
      }
    }
    for (const q of ['maj7', 'min7', 'dom7', 'm7b5', 'dim7', 'mmaj7']) {
      // Six states, `supplementary` included since 20 Aug 2026.
      for (const state of ['root', 'inv1', 'inv2', 'inv3', 'fluid', 'supplementary']) {
        catalogRefs.push(`chord-shape:${q}:C:${state}`);
      }
    }
    expect(catalogRefs.every(countsTowardShapesCoverage)).toBe(true);
    expect(catalogRefs.length * 12).toBe(720);
  });
});
