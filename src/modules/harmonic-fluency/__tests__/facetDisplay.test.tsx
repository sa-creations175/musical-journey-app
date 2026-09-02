// @vitest-environment jsdom
/**
 * A facet value reads as music and stays what it is.
 *
 * =====================================================================
 * BOTH HALVES, ON THE SAME VALUE, IN THE SAME ASSERTION.
 *
 * The screen has to say A♭ and ♭6. The URL has to carry `Ab` and `b6`,
 * because that is what `cardMatchesFacets` compares against and what a
 * saved link resolves.
 *
 * Asserting only the first would be passed by re-spelling storage —
 * which would make the screen right and break every saved filter link
 * and every card match at once. So each test names one value and holds
 * the label and the identity together: the rendered text, and the
 * string `onChange` actually sends.
 * =====================================================================
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import FacetFilterRow from '../FacetFilterRow';
import { facetValueLabel } from '../facetDisplay';
import { FLASHCARDS } from '../catalog';
import { availableValues } from '../facetFilter';
import type { FacetName } from '../facets';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** The row, over every card, with nothing chosen. */
function renderRow(onChange = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <FacetFilterRow cards={FLASHCARDS} filter={{}} onChange={onChange} />,
    );
  });
  return { onChange };
}

/** The button for one stored value. Found BY THE STORED VALUE — the
 *  test id is part of the identity claim, not a convenience. */
function buttonFor(name: FacetName, stored: string): HTMLButtonElement {
  // Matched by reading the attribute rather than by a selector: a
  // stored value can contain `#`, and the point of this file is that
  // the value reaches the DOM exactly as stored.
  const wanted = `facet-value-${name}-${stored}`;
  const all = [...container!.querySelectorAll<HTMLButtonElement>('button')];
  const el = all.find(b => b.getAttribute('data-testid') === wanted);
  expect(el, `no button for ${name}=${stored}`).not.toBeUndefined();
  return el!;
}

describe('a facet value renders with the glyph and stays what it is', () => {
  // name, stored value, what a reader should see.
  const CASES: ReadonlyArray<[FacetName, string, string]> = [
    ['key', 'Ab', 'A♭'],
    ['key', 'F#', 'F♯'],
    ['note', 'Bb', 'B♭'],
    ['note', 'Db', 'D♭'],
    ['slashDegrees', '6-b7', '6-♭7'],
    ['enharmonicGroup', '#4/b5/#11', '♯4/♭5/♯11'],
  ];

  for (const [name, stored, shown] of CASES) {
    it(`${name}=${stored} reads ${shown} and still filters on ${stored}`, () => {
      const { onChange } = renderRow();
      const button = buttonFor(name, stored);

      // What a reader sees.
      expect(button.textContent).toBe(shown);
      // What the app uses. Same value, same button, same test.
      act(() => { button.click(); });
      expect(onChange).toHaveBeenCalledWith(name, [stored]);
    });
  }

  it('the two spellings of one sound stay two buttons', () => {
    // The reason no spelling PREFERENCE is applied: `spellKey` would
    // print both of these G♭ and the reader could not tell which set
    // of cards each one selects.
    renderRow();
    expect(buttonFor('note', 'F#').textContent).toBe('F♯');
    expect(buttonFor('note', 'Gb').textContent).toBe('G♭');
  });

  it('a value with no accidental is untouched', () => {
    // Nothing invents a glyph where the stored value has none — and
    // the facets whose wording is still Silas's to write print exactly
    // as stored.
    expect(facetValueLabel('cadence', 'ii-V-I')).toBe('ii-V-I');
    expect(facetValueLabel('keyRelation', 'relative')).toBe('relative');
    expect(facetValueLabel('movement', 'up:M3')).toBe('up:M3');
    expect(facetValueLabel('key', 'C')).toBe('C');
  });

  it('every offered value renders without losing a character', () => {
    // A blanket guard: whatever the deck grows, a label may swap an
    // accidental for its glyph and may not shorten, empty or reorder
    // a value. `Bb` becoming `♭♭` is the failure this catches.
    const names = Object.keys(
      { key: 0, note: 0, degree: 0, slashDegrees: 0, enharmonicGroup: 0 },
    ) as FacetName[];
    for (const name of names) {
      for (const value of availableValues(FLASHCARDS, name)) {
        const label = facetValueLabel(name, value);
        expect(label.length, `${name}=${value}`).toBe(value.length);
        expect(
          label.replace(/♭/g, 'b').replace(/♯/g, '#'),
          `${name}=${value}`,
        ).toBe(value);
      }
    }
  });
});
