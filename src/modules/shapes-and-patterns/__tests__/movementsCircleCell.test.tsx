// @vitest-environment jsdom
/**
 * The Circle of 4ths cell on Chord Movements & Passes (Silas, 13 Sep 2026).
 *
 * A thirteenth cell after G on every row, built-in and captured alike;
 * the word `circle` where a key stands in the ref; its own one target;
 * the row's label with the key replaced; the player in C; and, while a
 * drill runs, the shared Circle row with the row's chords in the current
 * key.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));
vi.mock('../../../components/Toaster', () => ({
  useToast: () => ({ toast: () => {} }),
}));

import { InstrumentProvider } from '../../../lib/instrumentContext';
import VoiceLeadingDrills from '../VoiceLeadingDrills';
import {
  db, MOVEMENT_ARRANGEMENT_ID, type ChordMovement, type SpacingState,
} from '../../../lib/db';
import { newMovement } from '../movements/movementStore';
import { movementCellLabel, movementItemRef } from '../movements/movementCells';
import { CIRCLE_KEY, parseVoiceLeadingItemRef } from '../catalog';
import { cellForPlayer } from '../cellForPlayer';
import { itemCellTargets } from '../cellTargets';
import { labelFor } from '../drillModel';
import { circleChordNames } from '../circleChordNames';
import { voiceLeadingSurface } from '../practiceTest/makeSurfaces';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/** Major 2-5-1, Guide tones, Position 1 — in a key, and round the circle. */
const TWO_FIVE_ONE = 'vl:major-251:guide-tones:A:C';
const TWO_FIVE_ONE_CIRCLE = 'vl:major-251:guide-tones:A:circle';

/** A captured 2-5-1, written on its lead sheet in degrees. */
const MOVEMENT: ChordMovement = {
  ...newMovement('4/4'),
  id: 'mv-251',
  name: 'Walk-up',
  key: 'C',
  placements: [
    { id: 'p3', arrangementId: MOVEMENT_ARRANGEMENT_ID, barIndex: 1, beatPos: 0, beats: 4, chord: { function: '1', quality: 'maj7' } },
    { id: 'p1', arrangementId: MOVEMENT_ARRANGEMENT_ID, barIndex: 0, beatPos: 0, beats: 2, chord: { function: '2', quality: 'm7' } },
    { id: 'p2', arrangementId: MOVEMENT_ARRANGEMENT_ID, barIndex: 0, beatPos: 2, beats: 2, chord: { function: '5', quality: '7' } },
  ],
} as ChordMovement;

describe('the ref and what reads it', () => {
  it('parses with `circle` where the key stands, and plays its row in C', () => {
    expect(parseVoiceLeadingItemRef(TWO_FIVE_ONE_CIRCLE)).toMatchObject({
      patternId: 'major-251', type: 'guide-tones', position: 'A', keyName: CIRCLE_KEY,
    });
    expect(cellForPlayer(TWO_FIVE_ONE_CIRCLE)).toEqual({ ...cellForPlayer(TWO_FIVE_ONE)!, keyName: 'C' });
  });

  it('has one target, both hands, like every cell on the page', () => {
    for (const ref of [TWO_FIVE_ONE_CIRCLE, movementItemRef('mv-251', CIRCLE_KEY)]) {
      expect(itemCellTargets(ref)).toEqual([{ itemRef: ref, hand: 'both' }]);
    }
  });

  it('is named with the Circle where the key would be, and never spells `circle`', () => {
    expect(movementCellLabel(MOVEMENT, CIRCLE_KEY, 'flat')).toBe('Walk-up · Circle of 4ths');
    const label = labelFor({ kind: 'voice-leading', patternId: 'major-251', keyName: CIRCLE_KEY });
    expect(label.endsWith(' · Circle of 4ths')).toBe(true);
    expect(label).not.toContain(' in ');
  });
});

describe('the chords under the twelve', () => {
  it('a captured movement: its lead sheet\'s chords in order, in letters, in the key', () => {
    expect(circleChordNames(movementItemRef('mv-251', CIRCLE_KEY), 'F', 'flat', MOVEMENT))
      .toEqual(['Gm7', 'C7', 'Fmaj7']);
    expect(circleChordNames(movementItemRef('mv-251', CIRCLE_KEY), 'Bb', 'flat', MOVEMENT))
      .toEqual(['Cm7', 'F7', 'B♭maj7']);
  });

  it('a built-in row: the chords the cell player names, moved to the key', () => {
    const inF = circleChordNames(TWO_FIVE_ONE_CIRCLE, 'F', 'flat');
    expect(inF).toHaveLength(3);
    expect(inF.map(n => n[0])).toEqual(['G', 'C', 'F']);
  });

  it('only a Circle cell\'s drill shows the row, and a key lasts the row\'s chords times the Rate', () => {
    const circle = voiceLeadingSurface({
      cellLabel: 'Walk-up · Circle of 4ths', skillLabel: '', itemRef: movementItemRef('mv-251', CIRCLE_KEY),
      rowLabel: 'Walk-up', movement: MOVEMENT,
    });
    expect(circle.renderDuringDrill).toBeTypeOf('function');
    const row = circle.renderDuringDrill!({ per: 2 }) as { props: { per: number; smallLine: string } };
    expect(row.props.per).toBe(6);
    expect(row.props.smallLine).toBe('Walk-up');
    const key = voiceLeadingSurface({ cellLabel: '', skillLabel: '', itemRef: TWO_FIVE_ONE });
    expect(key.renderDuringDrill ?? null).toBeNull();
  });
});

// =====================================================================
// On the page
// =====================================================================

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function tested(itemRef: string): SpacingState {
  const at = Date.now();
  return {
    id: `ss-${itemRef}`, itemRef, moduleRef: 'shapes-and-patterns', hand: 'both',
    memoryType: 'procedural', acquisitionStage: 'acquiring', currentIntervalDays: 3,
    lastEngagedAt: at, nextDueAt: null,
    performanceHistory: [1, 2, 3].map(() => ({
      kind: 'rating', rating: 'flying', feel: 4, fromTest: true, sessionId: 'ss-1', at,
    })),
  } as unknown as SpacingState;
}

beforeEach(async () => {
  await db.chordMovements.clear();
  await db.spacingState.clear();
  await db.drillSessions.clear();
  await db.drillSkills.clear();
  Element.prototype.scrollIntoView = () => {};
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });

async function open() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemoryRouter><InstrumentProvider><VoiceLeadingDrills /></InstrumentProvider></MemoryRouter>);
  });
  for (let i = 0; i < 6; i++) await settle();
  return container!;
}

const cellsIn = (el: Element) => [...el.querySelectorAll('[data-testid="band-cell"]')] as HTMLElement[];
const circleCells = (el: Element) => cellsIn(el).filter(c => (c.getAttribute('title') ?? '').includes('Circle of 4ths'));

describe('the Circle of 4ths cell on the page', () => {
  it('a captured movement\'s row has thirteen cells, the last the Circle', async () => {
    await db.chordMovements.add(MOVEMENT);
    const el = await open();
    const section = el.querySelector('[data-testid="movement-section-mv-251"]')!;
    expect(cellsIn(section)).toHaveLength(13);
    expect(circleCells(section)).toHaveLength(1);
    expect(cellsIn(section)[12]).toBe(circleCells(section)[0]);
    await act(async () => { circleCells(section)[0].click(); });
    await settle();
    expect(el.textContent).toContain('Walk-up · Circle of 4ths');
  });

  it('every built-in row ends on the Circle, and its cell plays the row in C', async () => {
    const el = await open();
    const all = cellsIn(el);
    const circles = circleCells(el);
    expect(circles.length).toBeGreaterThan(0);
    expect(all.length).toBe(circles.length * 13);
    const twoFiveOne = circles.find(c => (c.getAttribute('title') ?? '').startsWith('Guide Tones · Position 1'))
      ?? circles[0];
    await act(async () => { twoFiveOne.click(); });
    await settle();
    expect(el.textContent).toContain('· Circle of 4ths');
    expect(el.querySelector('[data-testid="cell-player-title"]')?.textContent).toContain('the key of C major');
  });

  it('rates on its own target: the Circle cell moves and no key cell does', async () => {
    await db.chordMovements.add(MOVEMENT);
    await db.spacingState.add(tested(movementItemRef('mv-251', CIRCLE_KEY)));
    const el = await open();
    const section = el.querySelector('[data-testid="movement-section-mv-251"]')!;
    expect(circleCells(section)[0].textContent).not.toContain('Not Started');
    const keys = cellsIn(section).slice(0, 12);
    expect(keys.every(c => (c.textContent ?? '').includes('Not Started'))).toBe(true);
  });
});
