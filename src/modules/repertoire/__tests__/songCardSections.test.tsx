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

function render(sections: SectionChipReading) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <SongCard
        song={SONG}
        lastPractisedAt={null}
        lastPractisedLabel="never"
        addedLabel="added today"
        freshness="stale"
        stage="learning"
        due={null}
        spelling="flat"
        sections={sections}
        accentHex="#a8556b"
        onOpen={() => {}}
        onOpenLeadSheet={() => {}}
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
