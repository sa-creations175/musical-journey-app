// @vitest-environment jsdom
/**
 * A drill started inside a generated session is the same drill.
 *
 * =====================================================================
 * IT WAS A DIFFERENT THING WEARING THE SAME NAME.
 *
 * Pressing start drill on a session block opened a pop-up that was a
 * second start screen — the metronome and the drill length, scrolled
 * past to reach a button also called Start Drill. Two presses of Start
 * before anything counted down.
 *
 * It also had NO TEST MODE, so every run it wrote said `fromTest:
 * false` whether or not that was true, and it recorded neither the
 * tempo nor the sitting. A run played inside a generated session was
 * therefore strictly less than the same run played from a grid, and
 * nothing on the row said so.
 *
 * The block now opens the session panel, which is the only way to run
 * a drill anywhere in the app.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SessionBlock from '../SessionBlock';
import type { ProposalBlock } from '../proposalTypes';
import { db } from '../../../lib/db';

vi.mock('../../../lib/userPrefs', () => ({
  getPref: async (_k: string, d: unknown) => d,
  setPref: async () => {},
}));

/**
 * The metronome, reported as sounding at 90.
 *
 * A test run cannot start with nothing sounding — that gate is the
 * same one every surface has and is covered where it lives. Starting
 * the real one needs an AudioContext jsdom does not have.
 */
const BPM = 90;
vi.mock('../../../lib/useMetronome', () => ({
  useMetronomeState: () => ({
    playing: true, bpm: 90, timeSig: '4/4', groove: 'straight', volume: 0.5,
  }),
}));
vi.mock('../../../lib/metronome', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/metronome')>();
  return {
    ...actual,
    metronome: {
      ...actual.metronome,
      state: { playing: true, bpm: 90, timeSig: '4/4', groove: 'straight', volume: 0.5 },
      start: async () => {}, stop: () => {}, forceStop: () => {},
      subscribe: () => () => {},
      onBeat: () => () => {},
    },
  };
});

const SCALE_REF = 'scale:major:C';

const block: ProposalBlock = {
  id: 'b1',
  moduleRef: 'shapes-and-patterns',
  moduleLabel: 'Shapes & Patterns',
  moduleAccentHex: '#7c3aed',
  activityDescription: 'Scale prep',
  plannedSeconds: 300,
  whySnippet: 'warming the key up',
  itemRefs: [SCALE_REF],
  inSessionDrillKind: 'scales',
};

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(async () => {
  // Dexie first: fake timers stall its awaits.
  await db.drillSessions.clear();
  await db.spacingState.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null;
  vi.useRealTimers();
});

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter>
        <SessionBlock block={block} />
      </MemoryRouter>,
    );
  });
  await settle();
  return host;
}

/** Let the resolvers and Dexie reads land. */
async function settle() {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

/** The whole document: the panel is a modal and renders in a portal,
 *  outside the host this block was mounted into. */
const text = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
/** Buttons AND the spans that act as them — the block's own
 *  quick-launch is a role="button" span. */
const buttons = () => [
  ...document.body.querySelectorAll('button, [role="button"]'),
];
const labels = () => buttons().map(b => (b.textContent ?? '').trim());

const pressStartingWith = async (prefix: string) => {
  const b = buttons().find(x => (x.textContent ?? '').trim().startsWith(prefix));
  if (!b) throw new Error(`no button starting "${prefix}" — have ${labels().join(' | ')}`);
  await act(async () => {
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await settle();
};

/** Open the block's body and start the walk. */
async function openTheDrill() {
  await render();
  const blockButton = buttons().find(
    b => (b.textContent ?? '').includes('Scale prep'),
  );
  if (!blockButton) throw new Error('no block to expand');
  await act(async () => {
    blockButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await settle();
  await pressStartingWith('▶');
}

describe('the block opens the session panel', () => {
  it('and asks Practice or Test — the pop-up could only ever be practice', async () => {
    await openTheDrill();
    expect(labels().some(l => l.startsWith('Practice'))).toBe(true);
    expect(labels().some(l => l.startsWith('Test'))).toBe(true);
  });

  it('THE TWO-STEP SCREEN IS GONE — no second Start Drill to scroll to', async () => {
    await openTheDrill();
    await pressStartingWith('Practice');
    // The settings are on the session screen, and the only Start is
    // the one that starts a run.
    expect(text()).toContain('How Long');
    expect(labels()).not.toContain('Start Drill');
    expect(labels()).toContain('Start A Practice Drill');
  });

  it('and the session doors read as they do everywhere else', async () => {
    await openTheDrill();
    await pressStartingWith('Practice');
    expect(labels()).toContain('Cancel Session');
    expect(labels()).toContain('Pause Session');
    expect(labels()).toContain('Log Session');
  });
});

describe('a run started here records what a run started from a grid records', () => {
  it('the tempo, the sitting, and that it was practice', async () => {
    await openTheDrill();
    await pressStartingWith('Practice');
    await pressStartingWith('Start A Practice Drill');
    await act(async () => { vi.advanceTimersByTime(61_000); });
    await settle();
    // Dexie's own awaits need a real clock, and the countdown has
    // already fired — nothing left here depends on the fake one.
    vi.useRealTimers();
    await pressStartingWith('Clean');
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });

    const rows = await db.drillSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].skillId).toBe(SCALE_REF);
    expect(rows[0].hand).toBe('left');
    expect(rows[0].fromTest).toBe(false);
    expect(rows[0].bpm).toBe(BPM);
    expect(typeof rows[0].sessionId).toBe('string');
  });

  it('AND IT CAN BE A TEST — which the pop-up could not express at all', async () => {
    // The gate is the same one every other surface has: a test run
    // cannot start with nothing sounding.
    await openTheDrill();
    await pressStartingWith('Test');
    await pressStartingWith('Start A Test Drill');
    await act(async () => { vi.advanceTimersByTime(61_000); });
    await settle();
    // Dexie's own awaits need a real clock, and the countdown has
    // already fired — nothing left here depends on the fake one.
    vi.useRealTimers();
    await pressStartingWith('Clean');
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });

    const rows = await db.drillSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].fromTest).toBe(true);
    expect(rows[0].bpm).toBe(BPM);
    expect(typeof rows[0].sessionId).toBe('string');
  });
});
