/**
 * Shapes & patterns' four cards.
 *
 * THE ABSENCE IS THE POINT. This module records a duration and a
 * three-way self-rating, so a card here has no tier and no bar. The
 * adapter says so by passing `accuracy: null`, and a future change that
 * quietly handed it an empty window instead would produce a badge
 * reading `untouched` forever — measured-looking, unmeasured.
 */
import { describe, expect, it } from 'vitest';
import type { SpacingState } from '../../../lib/db';
import { SHAPES_SECTIONS, isShapesSectionId, shapesCards } from '../homeCards';
import { shapesCounts } from '../../../lib/moduleItemCounts';
import { MENTAL_VIZ_ITEMS } from '../mentalVizLibrary';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function row(itemRef: string, lastEngagedAt: number | null = NOW): SpacingState {
  return {
    id: `ss-${itemRef}`,
    itemRef,
    moduleRef: 'shapes-and-patterns',
    hand: 'both',
    style: 'solid',
    memoryType: 'procedural',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 3,
    lastEngagedAt,
    nextDueAt: null,
    performanceHistory: [],
  } as SpacingState;
}

/** A row with an explicit hand and stage — what the acquisition rule
 *  actually reads. */
function stage(
  itemRef: string,
  hand: SpacingState['hand'],
  acquisitionStage: SpacingState['acquisitionStage'],
): SpacingState {
  return { ...row(itemRef), id: `ss-${itemRef}-${hand}`, hand, acquisitionStage };
}

const byKey = (rows: SpacingState[] = [], mv: SpacingState[] = []) =>
  new Map(shapesCards(rows, mv, NOW).map(c => [c.key, c]));

describe('the four cards', () => {
  it('are the four sections, in the tab strip’s order', () => {
    const cards = shapesCards([], [], NOW);
    expect(cards.map(c => c.key))
      .toEqual(['scales', 'chord-shapes', 'voice-leading', 'mental-viz']);
    // Labels come from the section list, not from this test.
    expect(cards.map(c => c.label)).toEqual(SHAPES_SECTIONS.map(s => s.label));
  });

  it('carry no accuracy at all', () => {
    for (const card of shapesCards([row('scale:major:C')], [], NOW)) {
      expect(card.accuracy).toBeNull();
    }
  });

  it('denominate from the catalog, not from a written number', () => {
    const counts = shapesCounts();
    const cards = byKey();
    expect(cards.get('scales')!.itemCount).toBe(counts.scaleDrills);
    expect(cards.get('chord-shapes')!.itemCount).toBe(counts.chordShapeDrills);
    expect(cards.get('voice-leading')!.itemCount).toBe(counts.voiceLeading);
    // Mental viz is excluded from `shapesCounts` by the coverage rules,
    // so its denominator is its own library.
    expect(cards.get('mental-viz')!.itemCount).toBe(MENTAL_VIZ_ITEMS.length);
  });
});

describe('what has been touched', () => {
  it('counts distinct rows into the section their itemRef names', () => {
    const cards = byKey([
      row('scale:major:C'),
      row('scale:major:G'),
      row('chord-shape:maj7:C:root'),
      row('vl:aba-251:Bb'),
    ]);
    expect(cards.get('scales')!.itemsSeen).toBe(2);
    expect(cards.get('chord-shapes')!.itemsSeen).toBe(1);
    expect(cards.get('voice-leading')!.itemsSeen).toBe(1);
  });

  it('counts ACQUIRED by the module\u2019s one rule, not by touched', () => {
    /**
     * The card used to show `itemsSeen` — a cell counted the moment any
     * hand was touched — while the matrix under it counted all three
     * hands. Same cell, two numbers. The card carries `acquired` now
     * and `itemsSeen` still means what it says.
     */
    const cards = byKey([
      // Fully acquired: all three hands.
      stage('scale:major:C', 'left', 'acquired'),
      stage('scale:major:C', 'right', 'acquired'),
      stage('scale:major:C', 'both', 'mastered'),
      // Two hands in and never played together — NOT acquired.
      stage('scale:major:G', 'left', 'acquired'),
      stage('scale:major:G', 'right', 'acquired'),
    ]);
    const scales = cards.get('scales')!;
    expect(scales.itemsSeen, 'both cells have been touched').toBe(2);
    expect(scales.acquired, 'only one is acquired').toBe(1);
  });

  it('acquires a voice-leading cell from its one hand', () => {
    // VL is two-handed by nature and only ever writes `both`; waiting
    // on left and right would leave every cell unacquirable forever.
    const cards = byKey([stage('vl:aba-251:Bb', 'both', 'acquired')]);
    expect(cards.get('voice-leading')!.acquired).toBe(1);
  });

  it('keeps mental viz separate — a different moduleRef entirely', () => {
    const mv = MENTAL_VIZ_ITEMS.slice(0, 2).map(i => row(i.itemRef));
    const cards = byKey([row('scale:major:C')], mv);
    expect(cards.get('mental-viz')!.itemsSeen).toBe(2);
    expect(cards.get('scales')!.itemsSeen).toBe(1);
  });

  it('excludes rows for shapes the catalog no longer carries', () => {
    // Practice data for the qualities cut on 20 Aug 2026 is KEPT, so
    // without the filter the numerator would outrun the denominator.
    const cards = byKey([
      row('chord-shape:maj7:C:root'),
      row('chord-shape:notaquality:C:root'),
    ]);
    expect(cards.get('chord-shapes')!.itemsSeen).toBe(1);
  });

  it('reports the most recent engagement, in days', () => {
    const cards = byKey([
      row('scale:major:C', NOW - 5 * DAY),
      row('scale:major:G', NOW - 2 * DAY),
    ]);
    expect(cards.get('scales')!.lastPracticedDaysAgo).toBe(2);
  });

  it('says nothing rather than zero when a section is untouched', () => {
    expect(byKey().get('scales')!.lastPracticedDaysAgo).toBeNull();
    expect(byKey().get('scales')!.itemsSeen).toBe(0);
  });
});

describe('the card keys are the tab ids', () => {
  it('so a tap can set the tab the URL already uses', () => {
    for (const section of SHAPES_SECTIONS) {
      expect(isShapesSectionId(section.id)).toBe(true);
    }
    expect(isShapesSectionId('not-a-section')).toBe(false);
  });
});
