// @vitest-environment jsdom
import 'fake-indexeddb/auto';
/**
 * Understanding App Ratings — the numbers, and what they promise.
 *
 * =====================================================================
 * THE PAGE EXPLAINS THE RULE AND EDITS IT, SO IT HAS TO AGREE WITH IT.
 *
 * A settings screen stating a threshold the grader does not use is
 * worse than none: it is a confident, wrong account of a word the
 * reader can see on every grid. So the derived ends of each band are
 * checked against the editable starts, and the numbers are checked
 * against `ratingRules` rather than against literals typed here.
 * =====================================================================
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import RatingsSection from '../RatingsSection';
import {
  DEFAULT_RATING_RULES, ratingRules, setRatingRules,
} from '../../../lib/ratingRules';
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
  await act(async () => { root!.render(<RatingsSection />); });
  await settle();
}

const byTestId = (id: string) =>
  document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const type = async (id: string, value: string) => {
  const el = byTestId(id) as HTMLInputElement;
  await act(async () => {
    // React tracks the last value it wrote, so a bare `.value =` is
    // swallowed as "unchanged". This is the documented way round it.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
};

const click = async (el: Element | null) => {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
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

describe('the three parts', () => {
  it('names all three, with the four words in their colours', async () => {
    await render();
    const text = host!.textContent!;
    expect(text).toContain('Measured on accuracy');
    expect(text).toContain('Self-rated: judged by your own rating of each exercise');
    expect(text).toContain('Ear Training uses the same four words, but the app assigns them');

    // Every rating word carries its status, so it takes the same colour
    // here that it takes on a grid.
    for (const status of ['needs-work', 'developing', 'fluent', 'mastered']) {
      expect(host!.querySelector(`[data-status="${status}"]`), status).not.toBeNull();
    }
    expect(host!.querySelector('[data-status="started"]')).not.toBeNull();
  });

  it('runs every table low to high', async () => {
    await render();
    const orders = [...host!.querySelectorAll('tbody')].map(body =>
      [...body.querySelectorAll('tr')]
        .map(tr => tr.querySelector('td:last-child [data-status]')
          ?.getAttribute('data-status'))
        .filter(Boolean));
    // The bands table, the self-rated table and the ear-training table.
    expect(orders).toHaveLength(3);
    for (const order of orders) {
      expect(order).toEqual(['needs-work', 'developing', 'fluent', 'mastered']);
    }
  });
});

describe('the numbers are the rules', () => {
  it('shows what is in force rather than a literal', async () => {
    await render();
    const val = (id: string) => Number((byTestId(id) as HTMLInputElement).value);
    expect(val('rules-floor-measured')).toBe(DEFAULT_RATING_RULES.measuredFloor);
    expect(val('rules-window')).toBe(DEFAULT_RATING_RULES.window);
    expect(val('rules-t-dev')).toBe(60);
    expect(val('rules-t-flu')).toBe(80);
    expect(val('rules-t-mas')).toBe(95);
    expect(val('rules-floor-self')).toBe(DEFAULT_RATING_RULES.selfRatedFloor);
  });

  it('computes the closing end of each band from the next one along', async () => {
    await render();
    // THE FAILURE THIS PREVENTS: a table reading "80 – 94" beside a
    // grader that calls 95 Fluent. The ends are derived, never typed.
    expect(host!.textContent).toContain('– 79%');
    expect(host!.textContent).toContain('– 94%');
    expect(host!.textContent).toContain('under 60%');
  });

  it('moves the derived end when the next threshold moves', async () => {
    await render();
    await type('rules-t-mas', '90');
    await click(byTestId('rules-confirm-yes'));
    expect(host!.textContent).toContain('– 89%');
    expect(ratingRules().masteredFloor).toBeCloseTo(0.9, 5);
  });

  it('writes a floor straight through, with no confirm', async () => {
    // Only a BAND number is a decision with a reason behind it. The
    // floor and the window are how much evidence you want first.
    await render();
    await type('rules-floor-measured', '8');
    expect(byTestId('rules-confirm')).toBeNull();
    expect(ratingRules().measuredFloor).toBe(8);
  });
});

describe('changing a band asks first', () => {
  it('shows the notice and holds the change until it is confirmed', async () => {
    await render();
    await type('rules-t-flu', '75');
    expect(byTestId('rules-confirm')).not.toBeNull();
    expect(byTestId('rules-confirm')!.textContent)
      .toContain('will be re-graded the moment you do');
    // Not yet in force.
    expect(ratingRules().fluentFloor).toBe(DEFAULT_RATING_RULES.fluentFloor);
  });

  it('puts it in force on Change it', async () => {
    await render();
    await type('rules-t-flu', '75');
    await click(byTestId('rules-confirm-yes'));
    expect(byTestId('rules-confirm')).toBeNull();
    expect(ratingRules().fluentFloor).toBeCloseTo(0.75, 5);
  });

  it('puts the old number back on Keep it', async () => {
    await render();
    await type('rules-t-flu', '75');
    await click(byTestId('rules-confirm-no'));
    expect(byTestId('rules-confirm')).toBeNull();
    expect(ratingRules().fluentFloor).toBe(DEFAULT_RATING_RULES.fluentFloor);
    expect((byTestId('rules-t-flu') as HTMLInputElement).value).toBe('80');
  });
});

describe('the example follows the numbers', () => {
  it('names the floor it is describing, not a hard-coded five', async () => {
    await render();
    expect(host!.textContent).toContain('At 4 answers it would still read');
    await type('rules-floor-measured', '9');
    expect(host!.textContent).toContain('At 8 answers it would still read');
  });
});
