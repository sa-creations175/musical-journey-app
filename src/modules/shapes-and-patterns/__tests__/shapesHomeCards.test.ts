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
import type { DrillSession, SpacingState } from '../../../lib/db';
import { SHAPES_SECTIONS, isShapesSectionId, shapesCards } from '../homeCards';
import { shapesCounts } from '../../../lib/moduleItemCounts';
import { MENTAL_VIZ_ITEMS } from '../mentalVizLibrary';
import { SCALE_CELLS } from '../scaleSkills';
import { CHORD_QUALITIES, KEYS } from '../catalog';
import {
  chordCellTargets, itemCellTargets, rowsByRefHand, sectionCells, verdictForTargets,
} from '../cellTargets';
import { isFluentPlus } from '../../../lib/spacing/rollup';
import { sessionsByTarget, shapesTimeInvested } from '../timeInvested';
import { cellProgress, cellTime } from '../handProgress';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function row(itemRef: string, lastEngagedAt: number | null = NOW): SpacingState {
  return {
    id: `ss-${itemRef}`,
    itemRef,
    moduleRef: 'shapes-and-patterns',
    hand: 'both',
    memoryType: 'procedural',
    acquisitionStage: 'acquiring',
    currentIntervalDays: 3,
    lastEngagedAt,
    nextDueAt: null,
    performanceHistory: [],
  } as SpacingState;
}

/** A row with an explicit hand and stage.
 *
 *  KEPT TO PROVE THE STAGE IS IGNORED. The per-hand bars that used to
 *  read `acquisitionStage` are gone; nothing on a card counts it now,
 *  and the test below that says so needs a row carrying one. */
function stage(
  itemRef: string,
  hand: SpacingState['hand'],
  acquisitionStage: SpacingState['acquisitionStage'],
): SpacingState {
  return { ...row(itemRef), id: `ss-${itemRef}-${hand}`, hand, acquisitionStage };
}

/**
 * A row whose HISTORY earns a band — what the card reads now.
 *
 * The numerator is derived from `performanceHistory` through the same
 * banding rule the cells use, so a fixture that set `acquisitionStage`
 * and left the history empty would be describing the retired fact. A
 * passed test is three Clean-or-better runs in one session; three at
 * In flow lands on Mastered, three at Clean on Fluent.
 */
function tested(
  itemRef: string,
  hand: SpacingState['hand'],
  feel: 3 | 4,
): SpacingState {
  const rep = {
    t: 1, kind: 'rating', rating: feel === 4 ? 'flying' : 'cruising',
    feel, fromTest: true, sessionId: 's',
  };
  return {
    ...row(itemRef),
    id: `ss-${itemRef}-${hand}`,
    hand,
    performanceHistory: [rep, rep, rep],
  } as SpacingState;
}

/** Engaged once and unjudged — Started, which is not Fluent+. */
function touched(itemRef: string, hand: SpacingState['hand']): SpacingState {
  return {
    ...row(itemRef),
    id: `ss-${itemRef}-${hand}`,
    hand,
    performanceHistory: [
      { t: 1, kind: 'rating', rating: 'cruising', feel: 3, fromTest: false },
    ],
  } as SpacingState;
}

/** Every hand of a scale cell at Fluent — one Fluent+ cell. */
const fluentScale = (itemRef: string) =>
  (['left', 'right', 'both'] as const).map(h => tested(itemRef, h, 3));

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

  it('denominate in CELLS, which is what the grid draws', () => {
    const cards = byKey();
    for (const id of ['scales', 'chord-shapes', 'voice-leading', 'mental-viz'] as const) {
      expect(cards.get(id)!.itemCount, id).toBe(sectionCells(id).length);
    }
  });

  it('and a chord cell is one cell, not one per inversion state', () => {
    /**
     * THE NUMBER THAT CHANGED, AND THE ONE THAT DID NOT.
     *
     * `shapesCounts().chordShapeDrills` multiplies quality × key ×
     * inversion state, because a coverage GOAL counts every drillable
     * item. The grid draws quality × key and keeps the states inside a
     * cell. The card describes the grid, so it takes the smaller
     * number — and `shapesCounts` is left exactly as it was, because
     * the goals it feeds are not this commit's to move.
     */
    const cards = byKey();
    expect(cards.get('chord-shapes')!.itemCount)
      .toBe(CHORD_QUALITIES.length * KEYS.length);
    expect(cards.get('chord-shapes')!.itemCount)
      .toBeLessThan(shapesCounts().chordShapeDrills);

    // The other three are unchanged: for them a cell IS an item.
    expect(cards.get('scales')!.itemCount).toBe(shapesCounts().scaleDrills);
    expect(cards.get('voice-leading')!.itemCount).toBe(shapesCounts().voiceLeading);
    expect(cards.get('mental-viz')!.itemCount).toBe(MENTAL_VIZ_ITEMS.length);
  });
});

describe('the card and the grid are one count', () => {
  /**
   * =====================================================================
   * THE REASON THIS COMMIT EXISTS.
   *
   * The card walked spacing ROWS and asked about distinct itemRefs; the
   * grid rolls up CELLS. For chord shapes that was four numbers for
   * every one the grid drew, and neither was wrong — they were answers
   * to different questions printed as though they were the same one.
   *
   * Each test below counts the way the GRID does — one
   * `verdictForTargets` per cell, exactly the call `HeatGrid`,
   * `ScaleDrills` and `VoiceLeadingPatternGrid` make — and demands the
   * card's figure equal it.
   * =====================================================================
   */
  const gridCount = (
    cells: ReturnType<typeof sectionCells>,
    rows: SpacingState[],
  ) => {
    const byRefHand = rowsByRefHand(rows);
    return cells.filter(t => isFluentPlus(verdictForTargets(t, byRefHand))).length;
  };

  it('agrees on scales', () => {
    const rows = [
      ...fluentScale(SCALE_CELLS[0].itemRef),
      ...fluentScale(SCALE_CELLS[1].itemRef),
      // One hand short — the grid shows Started, so the card must not
      // count it.
      ...(['left', 'right'] as const).map(h => tested(SCALE_CELLS[2].itemRef, h, 3)),
    ];
    const card = byKey(rows).get('scales')!;
    expect(card.fluentPlus).toBe(gridCount(sectionCells('scales'), rows));
    expect(card.fluentPlus).toBe(2);
  });

  it('agrees on chord shapes, where the two used to differ by the states', () => {
    const q = CHORD_QUALITIES[0].id;
    const k = KEYS[0];
    // Every target of ONE cell — four inversion states across three
    // hands for a triad.
    const rows = chordCellTargets(q, k).map(t => tested(t.itemRef, t.hand, 4));
    const card = byKey(rows).get('chord-shapes')!;
    expect(card.fluentPlus).toBe(gridCount(sectionCells('chord-shapes'), rows));
    // ONE cell, not the four itemRefs underneath it.
    expect(card.fluentPlus, 'a chord cell counts once').toBe(1);
  });

  it('agrees on voice leading, which has one target per cell', () => {
    const cells = sectionCells('voice-leading');
    const rows = [
      ...cells[0].map(t => tested(t.itemRef, t.hand, 3)),
      ...cells[1].map(t => tested(t.itemRef, t.hand, 4)),
    ];
    const card = byKey(rows).get('voice-leading')!;
    expect(card.fluentPlus).toBe(gridCount(cells, rows));
    expect(card.fluentPlus).toBe(2);
  });

  it('counts a MIXED cell once, and only when all of it is Fluent+', () => {
    const q = CHORD_QUALITIES[0].id;
    const k = KEYS[0];
    const targets = chordCellTargets(q, k);
    // Eleven of twelve at Mastered, one merely Started.
    const nearly = [
      ...targets.slice(0, -1).map(t => tested(t.itemRef, t.hand, 4)),
      touched(targets[targets.length - 1].itemRef, targets[targets.length - 1].hand),
    ];
    expect(byKey(nearly).get('chord-shapes')!.fluentPlus,
      'one unjudged target holds the whole cell back').toBe(0);

    // Finish that last target and the cell counts — once.
    const whole = targets.map(t => tested(t.itemRef, t.hand, 4));
    expect(byKey(whole).get('chord-shapes')!.fluentPlus).toBe(1);
  });

  it('counts an untouched cell as one cell that is not Fluent+', () => {
    // The old numerator could only walk rows that existed, so a cell
    // was counted by whether the database happened to hold it. The
    // enumeration comes from the catalog now.
    const cards = byKey();
    expect(cards.get('scales')!.fluentPlus).toBe(0);
    expect(cards.get('scales')!.itemCount).toBe(SCALE_CELLS.length);
  });

  it('ignores an acquisition stage entirely', () => {
    // A row carrying `acquired` with no history earns no band, so it
    // is Started. If this ever returns 1, the retired counting is back.
    const rows = [
      stage('scale:major:C', 'left', 'mastered'),
      stage('scale:major:C', 'right', 'mastered'),
      stage('scale:major:C', 'both', 'mastered'),
    ];
    expect(byKey(rows).get('scales')!.fluentPlus).toBe(0);
  });

  it('a voice-leading cell needs only its one hand', () => {
    // VL is two-handed by nature and only ever writes `both`; waiting
    // on left and right would leave every cell unreachable forever.
    const ref = sectionCells('voice-leading')[0][0].itemRef;
    expect(itemCellTargets(ref)).toHaveLength(1);
    expect(byKey([tested(ref, 'both', 3)]).get('voice-leading')!.fluentPlus).toBe(1);
  });

  it('counts mental visualisation from its own moduleRef', () => {
    const mv = MENTAL_VIZ_ITEMS.slice(0, 2)
      .map(i => tested(i.itemRef, 'both', 4));
    expect(byKey([], mv).get('mental-viz')!.fluentPlus).toBe(2);
  });
});

describe('the card\u2019s minutes and Progress Details\u2019 minutes are one call', () => {
  /**
   * =====================================================================
   * THE CARD SUMMED BY PREFIX. PROGRESS DETAILS SUMMED PER TARGET.
   *
   * Two walks over the same rows, agreeing by luck — a drill row naming
   * a scale that is not in the catalog landed on the card and in no
   * cell, so the card could hold more minutes than everything under it
   * added up to. One grouping now, and both are readings of it.
   * =====================================================================
   */
  const drill = (
    skillId: string, hand: SpacingState['hand'], seconds: number, fromTest = false,
  ): DrillSession => ({
    id: `dses-${skillId}-${hand}-${seconds}-${fromTest ? 't' : 'p'}`,
    drillTypeId: skillId,
    skillId,
    hand,
    durationSeconds: seconds,
    feelRating: 3,
    ...(fromTest ? { fromTest: true } : {}),
    timestamp: NOW,
  });

  it('the section total equals the cells under it, added up', () => {
    const sessions = [
      drill(SCALE_CELLS[0].itemRef, 'left', 300),
      drill(SCALE_CELLS[0].itemRef, 'both', 120, true),
      drill(SCALE_CELLS[1].itemRef, 'right', 60),
    ];
    const byTarget = sessionsByTarget(sessions, []);
    const card = shapesCards([], [], NOW, shapesTimeInvested(sessions, []))
      .find(c => c.key === 'scales')!;

    // What Progress Details shows for each cell, added up.
    const perCell = SCALE_CELLS.map(cell => cellTime(
      cellProgress(itemCellTargets(cell.itemRef), [], byTarget),
    ));
    const practice = perCell.reduce((n, t) => n + t.practiceSeconds, 0);
    const testing = perCell.reduce((n, t) => n + t.testSeconds, 0);

    expect(card.timeInvested).toEqual({
      practiceSeconds: practice, testingSeconds: testing,
    });
    expect(card.timeInvested).toEqual({ practiceSeconds: 360, testingSeconds: 120 });
  });

  it('a row naming nothing in the catalog is on neither', () => {
    // It used to land on the card, by prefix, and in no cell.
    const sessions = [drill('scale:not-a-scale:C', 'both', 999)];
    const cards = shapesCards([], [], NOW, shapesTimeInvested(sessions, []));
    expect(cards.find(c => c.key === 'scales')!.timeInvested).toBeUndefined();
  });

  it('and the split is the run row\u2019s own, not an estimate', () => {
    const sessions = [
      drill(SCALE_CELLS[0].itemRef, 'left', 90),
      drill(SCALE_CELLS[0].itemRef, 'left', 30, true),
    ];
    const card = shapesCards([], [], NOW, shapesTimeInvested(sessions, []))
      .find(c => c.key === 'scales')!;
    expect(card.timeInvested)
      .toEqual({ practiceSeconds: 90, testingSeconds: 30 });
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

  it('counts Fluent+ by every hand, not by touched', () => {
    /**
     * The card used to show `itemsSeen` — a cell counted the moment any
     * hand was touched — while the matrix under it counted all three.
     * Same cell, two numbers. `itemsSeen` still means what it says and
     * the Fluent+ figure is the grid's.
     */
    const cards = byKey([
      ...fluentScale('scale:major:C'),
      // Two hands in and never played together. Lowest wins, so the
      // cell is Started.
      tested('scale:major:G', 'left', 3),
      tested('scale:major:G', 'right', 3),
    ]);
    const scales = cards.get('scales')!;
    expect(scales.itemsSeen, 'both cells have been touched').toBe(2);
    expect(scales.fluentPlus, 'only one is Fluent+').toBe(1);
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
