// @vitest-environment jsdom
/**
 * A signature card is an atomic pair.
 *
 * =====================================================================
 * PART TWO WAS A DRAWABLE ITEM, AND SO IT COULD BE SERVED ALONE.
 *
 * "which ones, in order" with no count before it and no key named is
 * an unanswerable question, and a mixed pool served it that way.
 *
 * What is pinned here: the pool holds no such item, a link that names
 * one is refused, and drawing the card runs part one and then part two
 * — with a wrong count ending the card instead, which is the rule that
 * was already there and still stands.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ReadingDrill from '../ReadingDrill';
import {
  SIGNATURES, SIGNATURE_DIRECTIONS, enumerateSignatureItems,
  isDrawableReadingItem, parseReadingItemRef, signatureItemRef,
} from '../catalog';
import { accidentalCountOptions, correctAccidentalSequence } from '../answerModels';
import { pickCardFromSkills } from '../pickCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** A signature with a real count, so both halves exist to ask. */
const SIG = SIGNATURES.find(s => s.count > 1)!;
const PAIR = signatureItemRef(SIG.id, 'major', 'count');

async function mount(focusRef: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ReadingDrill skills={['sig']} focusRefs={[focusRef]} onEnd={() => {}} autoStart />,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return container;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

const click = async (el: Element) => {
  await act(async () => { (el as HTMLElement).click(); });
};

/**
 * The count picker's button for a signature.
 *
 * Found by POSITION in `accidentalCountOptions()`, which is the list
 * the picker renders, rather than by a typed label — a test that
 * matched "2 sharps" would be asserting the copy.
 */
function countOption(el: HTMLElement, signatureId: string) {
  const options = accidentalCountOptions();
  const at = options.findIndex(o => o.id === signatureId);
  const buttons = el.querySelectorAll<HTMLButtonElement>('[data-picker="how many?"] button');
  return buttons[at];
}

const partTwo = (el: HTMLElement) =>
  el.querySelector('[data-testid="accidental-sequence"]');

describe('the pool', () => {
  it('holds no part-two item to draw', () => {
    expect(SIGNATURE_DIRECTIONS).not.toContain('which');
    expect(enumerateSignatureItems().filter(r => r.endsWith(':which'))).toEqual([]);
  });

  it('refuses one by name, even though it still parses', () => {
    const ref = signatureItemRef(SIG.id, 'major', 'which');
    // It parses — old attempts carry refs like this and must still
    // read — and it is not a card.
    expect(parseReadingItemRef(ref)).not.toBeNull();
    expect(isDrawableReadingItem(ref)).toBe(false);
    expect(isDrawableReadingItem(PAIR)).toBe(true);
  });

  it('never picks one over many draws', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(pickCardFromSkills(['sig']).itemRef.endsWith(':which')).toBe(false);
    }
  });
});

describe('drawing the card', () => {
  it('asks the count first, and part two only after it is right', async () => {
    const el = await mount(PAIR);
    expect(partTwo(el), 'part two before part one is answered').toBeNull();

    await click(countOption(el, SIG.id)!);
    expect(partTwo(el), 'part two after a right count').not.toBeNull();

    // And it asks for THIS signature's accidentals, in written order.
    expect(correctAccidentalSequence(SIG.id).length).toBe(SIG.count);
  });

  it('ends the card on a wrong count rather than going on', async () => {
    // The existing rule, unchanged: finishing would rehearse a number
    // the card does not have.
    const wrong = SIGNATURES.find(s => s.count !== SIG.count)!;
    const el = await mount(PAIR);
    await click(countOption(el, wrong.id)!);
    expect(partTwo(el)).toBeNull();
  });
});
