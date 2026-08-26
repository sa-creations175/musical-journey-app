// @vitest-environment jsdom
/**
 * What the card says about a song's sections.
 *
 * The derivation has its own suite (`sectionChips.test.ts`); this one
 * is about what reaches the screen — that the two axes arrive as two
 * separate attributes, that a song with no lead sheet gets words
 * rather than a "0 of 0", and that a zero never becomes a clause.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Song } from '../../../lib/db';
import SongCard from '../SongCard';
import { STAGE_LABEL } from '../stage';
import type { SongRetestState } from '../songRetestState';
import type { SectionChipReading } from '../sectionChips';

const SONG: Song = {
  id: 'song-1',
  title: 'No Weapon',
  artist: 'Fred Hammond',
  addedDate: Date.now(),
  learningOrder: 1,
} as Song;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(sections: SectionChipReading, over: Partial<{
  stage: Song['stage'];
  lastPractisedLabel: string;
  retest: SongRetestState | null;
  onOpen: () => void;
  onOpenLeadSheet: () => void;
}> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <SongCard
        song={SONG}
        lastPractisedAt={null}
        addedLabel="added today"
        freshness="stale"
        stage={over.stage ?? 'learning'}
        retest={over.retest ?? null}
        sections={sections}
        accentHex="#a8556b"
        lastPractisedLabel={over.lastPractisedLabel ?? 'never'}
        onOpen={over.onOpen ?? (() => {})}
        onOpenLeadSheet={over.onOpenLeadSheet ?? (() => {})}
      />,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const reading = (over: Partial<SectionChipReading> = {}): SectionChipReading => ({
  chips: [], needChords: 0, passed: 0, inProgress: 0, ...over,
});

describe('the section chip row', () => {
  it('renders each chip with its two axes separately', () => {
    const el = render(reading({
      chips: [
        // The combination a four-state implementation collapses:
        // played, but the chart is not called finished.
        { sectionId: 's1', name: 'Verse 1', chartComplete: false, fill: 'practised' },
        { sectionId: 's2', name: 'Chorus', chartComplete: true, fill: 'passed' },
        { sectionId: 's3', name: 'Bridge', chartComplete: true, fill: 'empty' },
      ],
      needChords: 1,
      passed: 1,
      inProgress: 1,
    }));

    const chips = [...el.querySelectorAll('[data-testid="song-card-section-chip"]')];
    expect(chips).toHaveLength(3);
    expect(chips.map(c => c.getAttribute('data-chart')))
      .toEqual(['incomplete', 'complete', 'complete']);
    expect(chips.map(c => c.getAttribute('data-fill')))
      .toEqual(['practised', 'passed', 'empty']);
    // The dashed one really is dashed, and it is filled all the same.
    expect(chips[0].className).toContain('border-dashed');
    expect(chips[0].className).toContain('bg-developing/25');
    expect(chips[1].className).toContain('border-solid');
  });

  it('names how many charts are still unwritten', () => {
    const el = render(reading({
      chips: [
        { sectionId: 's1', name: 'Verse 1', chartComplete: false, fill: 'empty' },
        { sectionId: 's2', name: 'Chorus', chartComplete: false, fill: 'empty' },
      ],
      needChords: 2,
    }));
    expect(el.querySelector('[data-testid="song-card-needs-chords"]')?.textContent)
      .toBe('2 sections still need chords');
  });

  it('says nothing when every chart is ticked', () => {
    const el = render(reading({
      chips: [{ sectionId: 's1', name: 'Verse 1', chartComplete: true, fill: 'empty' }],
    }));
    expect(el.querySelector('[data-testid="song-card-needs-chords"]')).toBeNull();
  });
});

describe('the footer count', () => {
  it('drops the clauses whose number is zero', () => {
    const el = render(reading({
      chips: [
        { sectionId: 's1', name: 'A', chartComplete: true, fill: 'empty' },
        { sectionId: 's2', name: 'B', chartComplete: true, fill: 'empty' },
      ],
    }));
    const footer = el.querySelector('[data-testid="song-card-section-footer"]');
    expect(footer?.textContent).toBe('2 sections');
    expect(footer?.textContent).not.toContain('0');
  });

  it('names passed and in-progress when there are some', () => {
    const el = render(reading({
      chips: [
        { sectionId: 's1', name: 'A', chartComplete: true, fill: 'passed' },
        { sectionId: 's2', name: 'B', chartComplete: true, fill: 'practised' },
        { sectionId: 's3', name: 'C', chartComplete: true, fill: 'empty' },
      ],
      passed: 1,
      inProgress: 1,
    }));
    expect(el.querySelector('[data-testid="song-card-section-footer"]')?.textContent)
      .toBe('3 sections · 1 passed · 1 in progress');
  });
});

describe('a song with no lead sheet', () => {
  it('says so in words, with no chips and no count', () => {
    const el = render(reading());
    expect(el.querySelector('[data-testid="song-card-no-sections"]')?.textContent)
      .toBe('No sections in this lead sheet');
    expect(el.querySelector('[data-testid="song-card-section-chips"]')).toBeNull();
    // THE LINE IS RESERVED, AND SAYS NOTHING. It holds its height so a
    // song with no sections and one with six split at the same place;
    // what matters is that it makes no claim, not that it is absent.
    expect(el.querySelector('[data-testid="song-card-section-footer"]')?.textContent)
      .toBe('');
    // And nothing anywhere claims a zero.
    expect(el.textContent).not.toContain('0 of 0');
    expect(el.textContent).not.toContain('0 sections');
  });

  it('still renders the rest of the card', () => {
    const el = render(reading());
    expect(el.textContent).toContain('No Weapon');
    expect(el.textContent).toContain('Fred Hammond');
    expect(el.textContent).toContain('not practised yet');
    expect(el.textContent).toContain('added today');
  });
});

/**
 * What a song card carries, item by item.
 *
 * Each of these is one line of the specification the card was built to.
 * They are worth pinning separately because the card is the one place
 * six different readings meet — a stage derived from every key, a chart
 * tick per section, a cell test per section, a practice log, and two
 * navigations — and any one of them could be dropped without the others
 * noticing.
 */
describe('what the card carries', () => {
  const chip = (over: Partial<SectionChipReading['chips'][number]> = {}) => ({
    sectionId: 's1', name: 'Verse', chartComplete: true, fill: 'empty' as const, ...over,
  });

  it('names the song and its artist', () => {
    const el = render(reading());
    expect(el.textContent).toContain('No Weapon');
    expect(el.querySelector('[data-testid="song-card-artist"]')?.textContent)
      .toBe('Fred Hammond');
  });

  it('shows the stage it is handed, at the song grain', () => {
    // THE DERIVED RUNG, not the watermark on the song row and not a
    // section's cell state. The list derives it once from
    // `stageCriteria` and hands it down; the card renders what it is
    // given and computes no rung of its own.
    const el = render(reading(), { stage: 'comfortable' });
    expect(el.querySelector('[data-testid="song-card-stage"]')?.textContent)
      .toBe(STAGE_LABEL.comfortable);
  });

  it('draws the two chip axes independently, all six combinations', () => {
    // THE PAIR THAT PROVES THEY ARE NOT ONE ENUM: a section practised
    // whose chart is not written, and a section charted but untouched.
    const el = render(reading({
      chips: [
        chip({ sectionId: 'a', chartComplete: false, fill: 'practised' }),
        chip({ sectionId: 'b', chartComplete: true, fill: 'empty' }),
        chip({ sectionId: 'c', chartComplete: false, fill: 'passed' }),
      ],
      inProgress: 1, passed: 1, needChords: 2,
    }));
    const chips = [...el.querySelectorAll('[data-testid="song-card-section-chip"]')];
    expect(chips.map(c => [c.getAttribute('data-chart'), c.getAttribute('data-fill')]))
      .toEqual([
        ['incomplete', 'practised'],
        ['complete', 'empty'],
        ['incomplete', 'passed'],
      ]);
  });

  it('says when it was last practised', () => {
    const el = render(reading(), { lastPractisedLabel: '3 days ago' });
    expect(el.querySelector('[data-testid="song-card-last-practised"]')?.textContent)
      .toContain('last 3 days ago');
  });

  it('says so plainly when it never has been', () => {
    const el = render(reading());
    expect(el.querySelector('[data-testid="song-card-last-practised"]')?.textContent)
      .toContain('not practised yet');
  });

  it('offers Open and Lead Sheet, and each goes somewhere', () => {
    const opened: string[] = [];
    const el = render(reading(), {
      onOpen: () => opened.push('open'),
      onOpenLeadSheet: () => opened.push('lead-sheet'),
    });
    const open = el.querySelector('[data-testid="song-card-open"]') as HTMLButtonElement;
    const chart = el.querySelector('[data-testid="song-card-lead-sheet"]') as HTMLButtonElement;
    // Capital O, the label every other module home's primary carries.
    expect(open.textContent).toBe('Open');
    expect(chart.textContent).toBe('Lead Sheet');
    act(() => { open.click(); });
    act(() => { chart.click(); });
    expect(opened).toEqual(['open', 'lead-sheet']);
  });

  it('offers no Progress Detail', () => {
    // The matrix on the song page IS this song's progress detail. A
    // third button here would be a second door to the page Open opens.
    const el = render(reading());
    expect(el.querySelector('[data-testid="category-card-progress-detail"]')).toBeNull();
    expect(el.textContent).not.toContain('Progress Detail');
  });
});

describe('the badge carries the retest state', () => {
  const badge = (el: HTMLElement) =>
    el.querySelector('[data-testid="song-card-stage"]') as HTMLElement;

  it('says the rung and stops when there is nothing to add', () => {
    const el = render(reading(), { stage: 'comfortable', retest: null });
    expect(badge(el).textContent).toBe(STAGE_LABEL.comfortable);
    expect(badge(el).getAttribute('data-retest')).toBe('held');
    expect(el.querySelector('[data-testid="song-card-retest"]')).toBeNull();
  });

  it('appends due to the rung, in the same pill', () => {
    // ONE PILL, not two. The rung and whether it still stands cannot be
    // half-read when they are the same badge.
    const el = render(reading(), { stage: 'comfortable', retest: { state: 'due' } });
    expect(badge(el).textContent).toContain(STAGE_LABEL.comfortable);
    expect(el.querySelector('[data-testid="song-card-retest"]')?.textContent).toBe('due');
    expect(el.querySelectorAll('[data-testid="song-card-stage"]')).toHaveLength(1);
  });

  it('appends overdue with the days past grace', () => {
    const el = render(reading(), {
      stage: 'internalized', retest: { state: 'overdue', days: 9 },
    });
    expect(badge(el).textContent).toContain(STAGE_LABEL.internalized);
    expect(el.querySelector('[data-testid="song-card-retest"]')?.textContent)
      .toBe('overdue 9d');
    expect(badge(el).getAttribute('data-retest')).toBe('overdue');
  });

  it('has no separate due chip left beside it', () => {
    // It used to be a second pill naming the key that was due. The key
    // is on the matrix row the reader acts on; the card says whether
    // there is anything to act on at all.
    const el = render(reading(), { stage: 'comfortable', retest: { state: 'due' } });
    expect(el.textContent).not.toContain('key of');
  });
});
