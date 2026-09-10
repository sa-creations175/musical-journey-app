// @vitest-environment jsdom
import 'fake-indexeddb/auto';
/**
 * Unlocking Tiers of Difficulty — what it says, and what it derives.
 *
 * =====================================================================
 * EVERY NUMBER ON THIS SECTION IS CHECKABLE, SO EVERY NUMBER IS
 * DERIVED.
 *
 * The Tier descriptions are copy — "extended chords: 9ths, 11ths,
 * 13ths, 6ths" is a sentence for a person, not a list of item ids. The
 * COUNTS are not: a total that disagreed with the catalog would be the
 * page lying about something the reader can go and count.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import UnlockingSection from '../UnlockingSection';
import {
  DEFAULT_RATING_RULES, RATING_RULES_PREF_KEY, itemsToClear, ratingRules,
  setRatingRules,
} from '../../../lib/ratingRules';
import {
  CHORD_RECOGNITION_TIERS,
} from '../../../modules/ear-training/chord-recognition/chordRecognitionTiers';
import {
  modesForStage,
} from '../../../modules/ear-training/scales-modes/scaleModeTierUnlock';
import { tierTotalCells } from '../../../modules/shapes-and-patterns/spTiers';
import { db } from '../../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<UnlockingSection />); });
  await settle();
}

const byTestId = (id: string) =>
  document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const type = async (id: string, value: string) => {
  const el = byTestId(id) as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
};

beforeEach(async () => {
  setRatingRules(DEFAULT_RATING_RULES);
  await db.userPrefs.clear();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  setRatingRules(DEFAULT_RATING_RULES);
});

describe('the rule', () => {
  it('states the two editable numbers and the pass bar', async () => {
    await render();
    const text = host!.textContent!;
    expect(text).toContain('80% passed');
    expect(text).toContain('A pass is a right answer with no listening aid used.');
    expect(Number((byTestId('unlock-floor') as HTMLInputElement).value)).toBe(10);
    expect(Number((byTestId('unlock-share') as HTMLInputElement).value)).toBe(80);
  });

  it('ties the pass bar to Fluent and offers no second control for it', async () => {
    // ONE NUMBER FOR "GOOD ENOUGH", ACROSS THE APP. Offering it twice
    // would let a reader set two, and the last one typed would win.
    await render();
    expect(host!.textContent).toContain('the same as the Fluent proficiency rating');
    // Three fields on the page: attempts-to-clear, the Ear Training
    // Tier share, and the Shapes & Patterns cell share. No second Fluent.
    expect(host!.querySelectorAll('input[type="number"]')).toHaveLength(3);
  });

  it('moves the pass bar when Fluent moves', async () => {
    // THROUGH THE STORED PREF, which is the real path: the section
    // reads `useRatingRules`, and that hydrates from the row rather
    // than from whatever was last set in memory.
    await db.userPrefs.put({
      key: RATING_RULES_PREF_KEY,
      value: { ...DEFAULT_RATING_RULES, fluentFloor: 0.75 },
    });
    await render();
    expect(host!.textContent).toContain('75% passed');
  });
});

describe('the worked example', () => {
  it('counts the real Tier 1 and the real share', async () => {
    await render();
    const n = CHORD_RECOGNITION_TIERS[1].length;
    expect(host!.textContent)
      .toContain(`${itemsToClear(n)} of the ${n} Tier 1 chords`);
    expect(host!.textContent).toContain('at least 10 answers and 8 of every 10 passed');
  });

  it('says a different thing at 100%, where no chord may lag', async () => {
    await render();
    await type('unlock-share', '100');
    expect(ratingRules().tierOpenShare).toBe(1);
    const n = CHORD_RECOGNITION_TIERS[1].length;
    expect(host!.textContent).toContain(`each of the ${n} Tier 1 chords`);
    expect(host!.textContent).toContain('cannot open it for you');
  });
});

describe('the two ladders', () => {
  it('names each with its Tier count, in Title Case', async () => {
    await render();
    for (const [name, tiers] of [
      ['Chord Recognition', 5], ['Scales & Modes', 2],
    ] as const) {
      expect(host!.textContent, name).toContain(name);
      expect(host!.textContent, name).toContain(`${tiers} Tiers`);
    }
  });

  it('shows no Progressions ladder, because there is none', async () => {
    // Retired 10 Sep 2026. Its four Tiers described the old eight-entry
    // catalog, and the card a reader opens draws the fourteen
    // shared-list entries — none of which was ever in a Tier.
    await render();
    expect(host!.textContent).not.toContain('4 Tiers');
    expect(host!.textContent).not.toContain('bare diatonic loops');
  });

  it('derives the totals from the catalogs rather than typing them', async () => {
    await render();
    const rows = [...host!.querySelectorAll('tbody tr')];
    const totalsFor = (first: string) => rows
      .filter(r => r.textContent!.includes(first))
      .map(r => r.querySelectorAll('td')[2]?.textContent);
    // Two rows open with those words — Chord Recognition's Tier 1 and
    // Chord Shapes' Tier 1, which counts CELLS rather than qualities.
    expect(totalsFor('major, minor, diminished'))
      .toEqual([String(CHORD_RECOGNITION_TIERS[1].length), String(tierTotalCells(1))]);
    expect(totalsFor('Ionian (major)'))
      .toEqual([String(modesForStage(1).length)]);
    expect(totalsFor('Dorian, Mixolydian'))
      .toEqual([String(modesForStage(2).length)]);
  });

});

describe('the two sentences under the ladders', () => {
  it('states the cross-ladder gate and who has no Tiers', async () => {
    await render();
    expect(host!.textContent).toContain(
      "Scales & Modes opens only once Chord Recognition's Tier 1 has cleared");
    expect(host!.textContent).toContain(
      'Harmonic Fluency, Progressions, Reading and Intervals have no Tiers');
  });

  it('gives Shapes & Patterns its own block, under the Ear Training ones', async () => {
    // A SECOND MODULE'S LADDER, COUNTING SOMETHING ELSE. Ear Training's
    // Tiers count items and ask for 80%; this one counts cells — a
    // quality across twelve keys and every inversion state — and asks
    // for 50. Its own field, so moving one cannot move the other.
    await render();
    const text = host!.textContent!;
    expect(text).toContain('Shapes & Patterns · Chord Shapes');
    expect(text).toContain('core triads: major, minor, diminished, augmented, sus2, sus4');
    expect(text).toContain('essential sevenths: maj7, m7, 7, dim7, m7♭5, mMaj7');
    expect(text).toContain("of Tier 1's cells read Fluent or better");
    expect(text).toContain('This applies to generated practice sessions only.');
    expect(Number((byTestId('shapes-share') as HTMLInputElement).value)).toBe(50);
  });

  it('counts cells from the catalog rather than typing the totals', async () => {
    await render();
    const rows = [...host!.querySelectorAll('tbody tr')];
    const shapeRow = rows.find(r => r.textContent!.includes('essential sevenths'))!;
    expect(shapeRow.querySelectorAll('td')[2].textContent)
      .toBe(String(tierTotalCells(2)));
  });

  it('moves the Shapes share without touching the Ear Training one', async () => {
    await render();
    await type('shapes-share', '70');
    expect(ratingRules().shapesTierOpenShare).toBe(0.7);
    expect(ratingRules().tierOpenShare).toBe(DEFAULT_RATING_RULES.tierOpenShare);
  });
});
