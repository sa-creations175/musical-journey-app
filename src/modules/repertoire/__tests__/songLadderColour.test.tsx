// @vitest-environment jsdom
/**
 * The song ladder, one step above the cell ladder — and freshness off
 * the palette entirely.
 *
 * =====================================================================
 * IT BORROWED CELL COLOURS ARBITRARILY.
 *
 * Learning rendered in the Needs Work RED — a warning colour on a song
 * you had just started — and Comfortable in the Developing amber, so a
 * song that had cleared three clean run-throughs in one testing session
 * looked worse than a cell that had cleared the same bar and read
 * Fluent for it.
 *
 * The shift is one rung, and it is earned: Comfortable in a key IS the
 * Fluent bar. Red leaves the ladder entirely.
 *
 * =====================================================================
 * AND THE FRESHNESS DOT IS GONE.
 *
 * How recently you practised was painted in three of the four status
 * colours, as a dot in the corner of the song card — the only place
 * freshness appeared on a song. An amber dot beside amber cells meaning
 * something else. It is a bar in one neutral now.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { STAGES, STAGE_BADGE_CLASS, STAGE_LABEL } from '../stage';
import * as stageModule from '../stage';
import { statusColour } from '../../../lib/spacing/statusColour';
import { freshnessSixthsFor } from '../../../lib/spacing/bands';
import SongCard, { type SongCardProps } from '../SongCard';
import CrossKeyMarks from '../CrossKeyMarks';
import type { Song } from '../../../lib/db';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

/** Every source file, for the "nothing imports it" scan. */
const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  eager: true, query: '?raw', import: 'default',
}) as Record<string, string>;

describe('the ladder sits one step above the cells', () => {
  it('NO RUNG IS THE NEEDS WORK RED', () => {
    // Nothing about learning a song is a warning.
    const red = statusColour('needs-work');
    for (const stage of STAGES) {
      expect(STAGE_BADGE_CLASS[stage], stage).not.toBe(red.badge);
      expect(STAGE_BADGE_CLASS[stage], stage).not.toContain('needswork');
    }
  });

  it('the shift, rung by rung', () => {
    expect(STAGE_BADGE_CLASS.not_started).toBe(statusColour('not-started').badge);
    expect(STAGE_BADGE_CLASS.started).toBe(statusColour('started').badge);
    expect(STAGE_BADGE_CLASS.learning).toBe(statusColour('developing').badge);
    expect(STAGE_BADGE_CLASS.comfortable).toBe(statusColour('fluent').badge);
    expect(STAGE_BADGE_CLASS['cross-key']).toBe(statusColour('fluent').badge);
    expect(STAGE_BADGE_CLASS.internalized).toBe(statusColour('mastered').badge);
  });

  it('COMFORTABLE AND CROSS-KEY ARE THE SAME GREEN', () => {
    // Cross-key is Comfortable in more keys, not a different quality.
    expect(STAGE_BADGE_CLASS['cross-key']).toBe(STAGE_BADGE_CLASS.comfortable);
  });

  it('and Internalized is the same colour as Mastered', () => {
    // WHICH colour Mastered is is pinned in `statusColour.test.ts`, and
    // naming the hex again here would be a second place to change it.
    expect(STAGE_BADGE_CLASS.internalized).toBe(statusColour('mastered').badge);
    expect(STAGE_BADGE_CLASS.internalized).not.toBe(STAGE_BADGE_CLASS.comfortable);
  });

  it('stage.ts names no hex of its own', () => {
    const source = SOURCES['/src/modules/repertoire/stage.ts'];
    expect(source).toBeTruthy();
    expect(source).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

describe('CROSS-KEY ALONE CARRIES THE MARKS', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;

  afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null;
  });

  const render = (node: React.ReactNode) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(node); });
    return host;
  };

  it('four of them, one per quadrant', () => {
    const el = render(<CrossKeyMarks stage="cross-key" />);
    const marks = el.querySelector('[data-testid="cross-key-marks"]')!;
    expect(marks).not.toBeNull();
    expect(marks.children).toHaveLength(4);
    expect(marks.getAttribute('data-marks')).toBe('4');
  });

  it('and no other rung draws any', () => {
    for (const stage of STAGES.filter(s => s !== 'cross-key')) {
      const el = render(<CrossKeyMarks stage={stage} />);
      expect(el.querySelector('[data-testid="cross-key-marks"]'), stage).toBeNull();
      act(() => { root?.unmount(); });
      host?.remove();
      root = null; host = null;
    }
  });

  it('THEY ARE A MARK, NOT A STRING — no label beside them', () => {
    const el = render(<CrossKeyMarks stage="cross-key" />);
    expect(el.textContent).toBe('');
  });

  it('and they take the badge word colour rather than naming one', () => {
    const el = render(<CrossKeyMarks stage="cross-key" />);
    for (const mark of el.querySelector('[data-testid="cross-key-marks"]')!.children) {
      expect(mark.className).toContain('bg-current');
    }
  });
});

describe('the song card draws freshness as a length', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;

  afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null;
  });

  const song = { id: 's1', title: 'No Weapon', artist: 'Fred Hammond', addedDate: NOW } as Song;

  /** The card takes SIXTHS, not a clock — the list derives them, with
   *  every other time-dependent value a card shows. This walks the same
   *  pipeline: an age, through `freshnessSixthsFor`, onto the card. */
  const cardAged = (daysAgo: number | null) => card({
    freshnessSixths: freshnessSixthsFor(
      daysAgo === null ? null : NOW - daysAgo * DAY, NOW,
    ),
  });

  const card = (over: Partial<SongCardProps> = {}) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const props: SongCardProps = {
      song,
      lastPractisedAt: NOW,
      freshnessSixths: 6,
      lastPractisedLabel: 'today',
      addedLabel: 'added today',
      stage: 'comfortable',
      retest: null,
      practiceStale: false,
      sectionsNeedingChords: 0,
      accentHex: '#a8556b',
      onOpen: () => {},
      onOpenLeadSheet: () => {},
      ...over,
    };
    act(() => { root!.render(<SongCard {...props} />); });
    return host;
  };

  const sixthsOn = (el: HTMLElement) =>
    el.querySelector('[data-testid="freshness-bar"]')!.getAttribute('data-sixths');

  it('THE RIGHT NUMBER OF SIXTHS FOR A GIVEN AGE', () => {
    // FRESHNESS_LADDER's own rungs: today is six, then five within a
    // week, four within two, three within three, two within four, one
    // beyond. The bar and the ladder are one scale.
    const cases: Array<[number, string]> = [
      [0, '6'], [3, '5'], [7, '5'], [10, '4'], [14, '4'],
      [17, '3'], [21, '3'], [25, '2'], [28, '2'], [40, '1'],
    ];
    for (const [daysAgo, sixths] of cases) {
      const el = cardAged(daysAgo);
      expect(sixthsOn(el), `${daysAgo}d ago`).toBe(sixths);
      act(() => { root?.unmount(); });
      host?.remove();
      root = null; host = null;
    }
  });

  it('never practised reads as the emptiest rung, not as an error', () => {
    expect(sixthsOn(cardAged(null))).toBe('1');
  });

  it('AND IN NO STATUS COLOUR', () => {
    const bar = card().querySelector('[data-testid="freshness-bar"]')!;
    const markup = bar.outerHTML;
    for (const token of ['needswork', 'developing', 'fluent', 'mastered', 'started', 'info']) {
      expect(markup, token).not.toContain(token);
    }
    // One neutral, and a dark variant for the surface it sits on.
    expect(markup).toContain('bg-neutral-200');
    expect(markup).toContain('dark:bg-neutral-700');
    expect(markup).toContain('bg-neutral-500');
  });

  it('the dot is gone from the card', () => {
    expect(card().querySelector('.rounded-full.w-2.h-2')).toBeNull();
  });
});

describe('FRESHNESS_DOT_CLASS is gone', () => {
  it('stage.ts does not export it', () => {
    expect('FRESHNESS_DOT_CLASS' in stageModule).toBe(false);
  });

  it('and nothing anywhere names it', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([file, text]) =>
        !file.endsWith('songLadderColour.test.tsx')
        && text.includes('FRESHNESS_DOT_CLASS'))
      // stage.ts's own note records that it was deleted and why; a
      // gravestone is not a reference.
      .filter(([file]) => file !== '/src/modules/repertoire/stage.ts')
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('the sort key SURVIVES — a sort key is not a colour', () => {
    // "Stalest first" in the repertoire list still needs to know.
    expect(typeof stageModule.freshnessFor).toBe('function');
    expect(stageModule.freshnessFor(null)).toBe('stale');
  });
});

describe('the ladder label is untouched', () => {
  it('every rung still says its own word', () => {
    for (const stage of STAGES) expect(STAGE_LABEL[stage]).toBeTruthy();
  });
});
