/**
 * The approved copy file is the source, and this reads it.
 *
 * =====================================================================
 * A TEST THAT RESTATES THE STRINGS IS A THIRD COPY.
 *
 * `docs/HARMONIC_FLUENCY_COPY.md` is what Silas approved. A test that
 * hard-coded "Maj/Min Key Relation" beside the code's own constant
 * would pass just as happily when both had drifted from the document,
 * and the document is the only one of the three anybody reads before
 * writing new copy.
 *
 * So the file is parsed. Every table in it is a claim about what the
 * app says, checked against what the app says. Editing the document
 * without editing the code fails here, and so does the reverse — which
 * is what "approved" has to mean if it is to mean anything.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
// The document itself, as text. `?raw` rather than `readFileSync`
// because this file is type-checked by the app's own tsconfig, which
// has no node types — and because a bundler import fails loudly if the
// document is ever moved, where a path string would fail at runtime.
import COPY from '../../../../docs/HARMONIC_FLUENCY_COPY.md?raw';
import { CATEGORY_LABELS } from '../catalog';
import {
  FACET_ROW, MOVEMENT_LABELS, facetValueLabel,
} from '../facetDisplay';
import { CLEAR_FILTERS_LABEL, FILTERS_LABEL } from '../FacetFilterRow';
import { DEGREE_MATH_CATEGORY_NAME } from '../scaleDegreeQualityCards';
import { DEGREE_NOTE_CATEGORY_NAME, placeItCards } from '../degreeNoteCards';


/**
 * The two-column table under a heading, as `[left, right]` pairs.
 *
 * The header row and the `|---|---|` rule are dropped; everything else
 * under that heading until the next one is a claim.
 */
function tableUnder(heading: string): Array<[string, string]> {
  const lines = COPY.split('\n');
  const start = lines.findIndex((l: string) => l.trim() === `## ${heading}`);
  expect(start, `heading "${heading}" is in the copy file`).toBeGreaterThan(-1);
  const rows: Array<[string, string]> = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c: string) => c.trim());
    if (cells.length !== 2) continue;
    if (/^-+$/.test(cells[0])) continue;
    rows.push([cells[0], cells[1]]);
  }
  // The header row of the table itself.
  return rows.slice(1);
}

describe('the file says what it is', () => {
  it('is dated and attributed', () => {
    expect(COPY).toContain('Approved by Silas, 8 Sep 2026');
  });
});

describe('the filter row — what each line is called', () => {
  const rows = tableUnder('The filter row — what each line is called');

  it('names every row the app offers, in the app\'s own order', () => {
    expect(rows.map(([facet]) => facet)).toEqual(FACET_ROW.map(f => f.name));
  });

  it('and calls each one what the app calls it', () => {
    expect(rows.map(([, label]) => label)).toEqual(FACET_ROW.map(f => f.label));
  });

  it('says which two facets the row does not offer', () => {
    // Ruling 25. Named rather than merely absent: a facet quietly
    // missing from a list looks like an oversight, and these are a
    // decision.
    expect(COPY).toContain('`semitones`');
    expect(COPY).toContain('`enharmonicGroup`');
    for (const dropped of ['semitones', 'enharmonicGroup']) {
      expect(FACET_ROW.map(f => String(f.name))).not.toContain(dropped);
    }
  });
});

describe('the filter row — the controls', () => {
  const rows = new Map(tableUnder('The filter row — the controls'));

  it('names the toggle and the reset', () => {
    expect(rows.get('filters')).toBe(FILTERS_LABEL);
    expect(rows.get('clear')).toBe(CLEAR_FILTERS_LABEL);
  });

  it('shows the folded form with its count', () => {
    // The separator is load-bearing — the document spells it out, so
    // the string the component builds has to match character for
    // character.
    expect(COPY).toContain('`Filters · 2`');
    expect(`${FILTERS_LABEL} · 2`).toBe('Filters · 2');
  });
});

describe('the Progression chips', () => {
  it('reads each stored value the way the file says', () => {
    for (const [stored, chip] of tableUnder('The Progression chips')) {
      expect(facetValueLabel('progression', stored), stored).toBe(chip);
    }
  });

  it('covers every progression the deck holds', () => {
    const listed = tableUnder('The Progression chips').map(([stored]) => stored);
    expect(listed.sort()).toEqual(['1-5-6-4', 'V/V', 'V/vi', 'ii-V-I'].sort());
  });
});

describe('the Distance chips', () => {
  const rows = tableUnder('The Distance chips');

  it('reads each movement the way the file says', () => {
    for (const [stored, chip] of rows) {
      expect(facetValueLabel('movement', stored), stored).toBe(chip);
    }
  });

  it('covers every movement the deck can produce', () => {
    // 24 — twelve qualities each way. A quality added to the theory
    // table without a chip in this file fails here rather than
    // printing its coordinate on screen.
    expect(rows.length).toBe(MOVEMENT_LABELS.size);
    expect(rows.map(([stored]) => stored).sort())
      .toEqual([...MOVEMENT_LABELS.keys()].sort());
  });

  it('never prints a half-step count', () => {
    for (const [, chip] of rows) expect(chip).not.toMatch(/\d/);
  });
});

describe('category names', () => {
  const rows = new Map(tableUnder('Category names'));

  it('titles the two categories ruling 29 renames', () => {
    expect(rows.get('scale-degree-math')).toBe(DEGREE_MATH_CATEGORY_NAME);
    expect(rows.get('degree-notes')).toBe(DEGREE_NOTE_CATEGORY_NAME);
    expect(CATEGORY_LABELS['scale-degree-math']).toBe(rows.get('scale-degree-math'));
    expect(CATEGORY_LABELS['degree-notes']).toBe(rows.get('degree-notes'));
  });

  it('says Number and not Degree', () => {
    for (const title of rows.values()) {
      expect(title.toLowerCase(), title).not.toContain('degree');
      expect(title.toLowerCase(), title).toContain('number');
    }
  });
});

describe('the four question types', () => {
  it('records the names without claiming they are on screen', () => {
    const rows = new Map(tableUnder(
      'The four question types in Notes of the Number System',
    ));
    expect(rows.get('nameItCards')).toBe('Name the Note');
    expect(rows.get('placeItCards')).toBe('Name the Number');
    expect(rows.get('pressItCards')).toBe('Press the Number');
    expect(rows.get('findKeyCards')).toBe('Name the Key');
    expect(COPY).toContain('These names surface nowhere in the app today');
  });
});

describe('card text', () => {
  it('asks which NUMBER, in every card of the type', () => {
    const cards = placeItCards();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.question, card.id).toContain('is which number?');
      expect(card.question, card.id).not.toContain('degree');
    }
  });
});

describe('what is still unwritten', () => {
  it('is a list rather than a discovery', () => {
    const start = COPY.indexOf('## Unruled');
    expect(start).toBeGreaterThan(-1);
    const unruled = COPY.slice(start);
    for (const item of ['Tile labels', 'Presets', 'Sort controls', 'Layout',
      'Apply to every key']) {
      expect(unruled, item).toContain(item);
    }
  });
});
