// @vitest-environment jsdom
/**
 * The accidentals in the sentence, in the colours on the keys.
 *
 * =====================================================================
 * TWO THINGS COULD GO WRONG QUIETLY.
 *
 * THE WRONG NOTES COLOURED. The key name sits in the same sentence as
 * the list — "The key of E♭ major has 3 flats: B♭ E♭ A♭" — and so does
 * a gloss on the end of the G♭ card. Colouring by search would reach
 * all of them.
 *
 * THE WRONG COLOURS. The interval is from the KEY ROOT, so B♭ is the
 * grey of a fifth in the key of E♭ major and would be something else
 * anywhere else. A colour that merely looks plausible is one nobody
 * checks.
 * =====================================================================
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { FLASHCARDS } from '../catalog';
import { intervalColor } from '../../../lib/voicingColors';
import CardExplanation from '../CardExplanation';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function draw(id: string) {
  const card = FLASHCARDS.find(c => c.id === id)!;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const mounted = root;
  act(() => {
    // A ROUTER, because a mode name becomes a `<Link>`. The count
    // cards do not need one; the cards this is compared against do.
    mounted.render(
      <MemoryRouter>
        <CardExplanation text={card.explanation ?? ''} card={card} />
      </MemoryRouter>,
    );
  });
  return card;
}

const coloured = () => [...host!.querySelectorAll('[data-testid^="accidental-"]')]
  .map(el => ({ note: el.textContent, colour: (el as HTMLElement).style.color }));

/** `style.color` comes back as `rgb(r, g, b)`; the palette is hex. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** Some cases assert nothing rendered, so tearing down is conditional. */
function teardown() {
  if (root !== null) act(() => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
}

afterEach(teardown);

describe('which cards it colours', () => {
  it('colours the thirteen count cards and no others', () => {
    const coloursSomething: string[] = [];
    for (const card of FLASHCARDS) {
      if (card.explanation === undefined) continue;
      draw(card.id);
      if (coloured().length > 0) coloursSomething.push(card.id);
      teardown();
    }
    // Twelve: the key of C major has none to colour.
    expect(coloursSomething).toHaveLength(12);
    for (const id of coloursSomething) {
      expect(id.startsWith('ks-count-'), id).toBe(true);
    }
  });

  it('leaves every other explanation to the linkifier, unchanged', () => {
    for (const id of ['ks-sig-major-Eb', 'ks-relminor-Ab', 'mo-7', 'pr-9']) {
      const card = draw(id);
      expect(coloured(), id).toHaveLength(0);
      expect(host!.textContent, id).toBe(card.explanation);
      teardown();
    }
  });
});

describe('it colours the list and nothing else', () => {
  it('colours the three flats of the key of E♭ major', () => {
    draw('ks-count-Eb');
    expect(coloured().map(c => c.note)).toEqual(['B♭', 'E♭', 'A♭']);
  });

  it('leaves the key name in the same sentence alone', () => {
    // "The key of E♭ major has 3 flats: B♭ E♭ A♭." — the first E♭ is
    // the KEY and is not one of the three.
    const card = draw('ks-count-Eb');
    expect(card.explanation).toContain('The key of E♭ major');
    expect(coloured()).toHaveLength(3);
    expect(host!.textContent).toBe(card.explanation);
  });

  it('leaves the gloss after the list alone', () => {
    // "…6 flats: B♭ E♭ A♭ D♭ G♭ C♭. C♭ is B on the keyboard." — six
    // coloured, and the seventh C♭ is prose.
    const card = draw('ks-count-Gb');
    expect(coloured()).toHaveLength(6);
    expect(host!.textContent).toBe(card.explanation);
  });

  it('colours nothing on the key with no accidentals', () => {
    const card = draw('ks-count-C');
    expect(coloured()).toHaveLength(0);
    expect(host!.textContent).toBe(card.explanation);
  });

  it('never changes a word of the text, on any of the thirteen', () => {
    // THE COPY IS THE COPY. Colour is an addition to the reveal and
    // not a new way of storing a sentence.
    for (const card of FLASHCARDS.filter(c => c.id.startsWith('ks-count-'))) {
      draw(card.id);
      expect(host!.textContent, card.id).toBe(card.explanation);
      teardown();
    }
  });
});

describe('the colour is the one the keyboard gives the note', () => {
  it('reads the interval from the key root', () => {
    draw('ks-count-Eb');
    // In the key of E♭ major: B♭ is the 5, E♭ the 1, A♭ the 4.
    expect(coloured()).toEqual([
      { note: 'B♭', colour: rgb(intervalColor(7)) },
      { note: 'E♭', colour: rgb(intervalColor(0)) },
      { note: 'A♭', colour: rgb(intervalColor(5)) },
    ]);
  });

  it('gives one note two colours in two keys', () => {
    // The claim that makes it worth doing: F♯ is the 7 of the key of G
    // major and the 1 of the key of F♯ major.
    draw('ks-count-G');
    expect(coloured()).toEqual([{ note: 'F♯', colour: rgb(intervalColor(11)) }]);
    teardown();
    draw('ks-count-F#');
    expect(coloured()[0]).toEqual({ note: 'F♯', colour: rgb(intervalColor(0)) });
  });

  it('matches what the reveal draws for the same note', () => {
    // The whole point: one fact, one colour. `scaleMarks` colours the
    // board by interval from the key root and this reads the same
    // palette the same way.
    draw('ks-count-G');
    expect(coloured()[0].colour).toBe(rgb(intervalColor(11)));
  });
});
