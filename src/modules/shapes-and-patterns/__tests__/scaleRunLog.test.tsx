// @vitest-environment jsdom
/**
 * The run log line, as the signed-off grid prototype draws it.
 *
 * =====================================================================
 * RATING · LENGTH · TEMPO · WHEN · SITTING, AND NOTHING FOR WHAT IS
 * NOT THERE.
 *
 * The tempo and the sitting only just started being recorded, so most
 * of the history has neither and always will. A row that cannot say
 * what it was played at shows no tempo — not a zero, not a dash that
 * reads like a value, and not the target it was aiming at.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ScaleDrills from '../ScaleDrills';
import { db, type DrillSession } from '../../../lib/db';

/** The first cell on the page: major, in the key of C. */
const ITEM = 'scale:major:C';

let root: Root | null = null;
let host: HTMLElement | null = null;

const row = (over: Partial<DrillSession>): DrillSession => ({
  id: `dses-${Math.random().toString(36).slice(2, 8)}`,
  drillTypeId: ITEM,
  skillId: ITEM,
  hand: 'left',
  durationSeconds: 60,
  timestamp: Date.now(),
  ...over,
} as DrillSession);

beforeEach(async () => {
  await db.drillSessions.clear();
  // jsdom has no layout, so the page's scroll-to-the-band has nothing
  // to call. Stubbed rather than branched around in the component.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
});

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<ScaleDrills />); });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
  return host;
}

const text = () => (host?.textContent ?? '').replace(/\s+/g, ' ');
const buttons = () => [...(host?.querySelectorAll('button') ?? [])];
const cells = () => buttons().filter(b => b.hasAttribute('aria-pressed')
  && /Not Started|Started|Needs Work|Developing|Fluent|Mastered/.test(b.textContent ?? ''));

/** Open the first cell, then its left-hand row. */
async function openLeftHand() {
  await render();
  await act(async () => {
    cells()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const hand = buttons().find(
    b => (b.textContent ?? '').replace(/\s+/g, ' ').includes('Left hand'),
  );
  if (!hand) throw new Error('no left-hand row');
  await act(async () => {
    hand.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('a run shows what it recorded', () => {
  it('tempo and sitting, where the row has them', async () => {
    await db.drillSessions.bulkAdd([
      row({ durationSeconds: 60, feelRating: 3, bpm: 96, sessionId: 'ss-1' }),
      row({ durationSeconds: 120, feelRating: 4, bpm: 96, sessionId: 'ss-1' }),
    ]);
    await openLeftHand();
    // The whole line, in the prototype's order. The sitting is its
    // size — 60 + 120 seconds of drilling, to the nearest minute.
    expect(text()).toContain('In flow2m \u00b7 96 bpm \u00b7 today \u00b7 session 3m');
    expect(text()).toContain('Clean1m \u00b7 96 bpm \u00b7 today \u00b7 session 3m');
  });

  it('NO TEMPO WHERE THE RUN WAS SILENT, and no stand-in for it', async () => {
    await db.drillSessions.add(
      row({ durationSeconds: 60, feelRating: 3, sessionId: 'ss-1' }),
    );
    await openLeftHand();
    // No bpm segment, and no separator standing in for one.
    expect(text()).toContain('Clean1m \u00b7 today \u00b7 session 1m');
  });

  it('A LEGACY ROW WITH NEITHER STILL RENDERS', async () => {
    await db.drillSessions.add(row({ durationSeconds: 90, feelRating: 2 }));
    await openLeftHand();
    // The run is there and says the three things it can: rating,
    // length, when. Nothing stands in for the two it cannot.
    expect(text()).toContain('Working on it2m \u00b7 today');
    expect(text()).not.toContain('bpm');
  });

  it('and an unrated run keeps its place in the log', async () => {
    await db.drillSessions.add(
      row({ durationSeconds: 60, bpm: 80, sessionId: 'ss-9' }),
    );
    await openLeftHand();
    expect(text()).toContain('Not rated1m \u00b7 80 bpm \u00b7 today \u00b7 session 1m');
  });
});
