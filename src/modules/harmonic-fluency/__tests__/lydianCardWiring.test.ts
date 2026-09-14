/**
 * The chord rows are a REFERENCE, not a visual aid.
 *
 * ---------------------------------------------------------------
 * WHY THE SEAM IS ASSERTED AT SOURCE LEVEL.
 *
 * `FlashcardSession` gates `renderVisualAid` twice:
 *
 *   const showVisual = !!renderVisualAid && !isFaded
 *     && (visualMode ?? 'text') !== 'text';
 *
 * Both gates are right for a training wheel and wrong for this. A
 * scaffold should retreat as you improve; the shape a chord name
 * refers to should not. And the rows are not a third rendering of the
 * card's content — they are content the card never carried.
 *
 * Moving them to `renderVisualAid` would leave everything looking
 * correct: they would render, they would be right, and they would
 * silently vanish the moment the user got good at the category — which
 * is exactly when they were asked for. No render test would catch it,
 * because it only shows up on a streak.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { FLASHCARDS } from '../catalog';
import { LYDIAN_CHORD_CARDS, lydianRowsFor } from '../lydianCards';
import { QUADRANT_ROOTS } from '../lydianChords';
import { pitchClassOf } from '../../../lib/spelling';

const SOURCES: Record<string, string> = import.meta.glob(
  '../**/*.{ts,tsx}',
  { eager: true, query: '?raw', import: 'default' },
);

function read(suffix: string): string {
  const hit = Object.entries(SOURCES).find(([p]) => p.endsWith(suffix));
  if (!hit) throw new Error(`no source found for ${suffix}`);
  return hit[1];
}

/** Source with comments stripped, so an assertion that a name is
 *  ABSENT does not fail on the comment explaining why it is absent. */
function codeOf(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the rows render through renderFooter, not renderVisualAid', () => {
  const SESSION = () => codeOf(read('HarmonicFluencySession.tsx'));

  it('passes LydianChordRows through the ungated footer', () => {
    const src = SESSION();
    expect(src).toContain('renderFooter=');
    expect(src).toContain('<LydianChordRows');
  });

  it('does not reach the rows from the visual-aid dispatcher', () => {
    // VisualAid is the faded seam. The rows must not appear in it.
    const src = SESSION();
    const from = src.indexOf('function VisualAid');
    expect(from).toBeGreaterThan(-1);
    // Bounded to VisualAid's OWN body. Slicing to end of file would
    // sweep in CardReference below it and pass for the wrong reason —
    // the assertion would then be about the file, not the function.
    const after = src.slice(from + 1);
    const nextTopLevel = after.search(/\n(?:function |const |export )/);
    const visualAidBody = nextTopLevel === -1
      ? after
      : after.slice(0, nextTopLevel);
    expect(visualAidBody).toContain('switch (card.category)');
    expect(visualAidBody).not.toContain('LydianChordRows');
  });

  it('shows them only after the card is answered', () => {
    // Before answering they would hand over the ♯11 the card asks for.
    const src = SESSION();
    const from = src.indexOf('function CardReference');
    expect(from).toBeGreaterThan(-1);
    expect(src.slice(from, from + 400)).toContain('if (!answered) return null');
  });
});

describe('which cards carry them', () => {
  it('names the signature-chord card by hand, opening on the first of each quadrant', () => {
    expect(LYDIAN_CHORD_CARDS).toEqual({ 'mo-15': undefined });
    expect(lydianRowsFor(FLASHCARDS.find(c => c.id === 'mo-15')!)).toEqual({});
  });

  it('names cards that actually exist', () => {
    // A footer keyed on an id no card has is a feature that renders
    // nowhere and fails no test.
    const ids = new Set(FLASHCARDS.map(c => c.id));
    for (const id of Object.keys(LYDIAN_CHORD_CARDS)) expect(ids.has(id), id).toBe(true);
  });

  it('still asks what it asked', () => {
    const byId = new Map(FLASHCARDS.map(c => [c.id, c]));
    // In the app's numbers since 14 Sep 2026; it was 'I maj7#11'.
    expect(byId.get('mo-15')!.correctAnswer).toBe('the 1 as a maj7♯11 chord');
  });

  it('reaches the rows from the card reference', () => {
    const src = codeOf(read('HarmonicFluencySession.tsx'));
    const from = src.indexOf('function CardReference');
    expect(src.slice(from)).toContain('lydianRowsFor(card)');
  });
});

describe('the generated Lydian card in every key carries them too (Silas, 14 Sep 2026)', () => {
  const lydianCards = FLASHCARDS.filter(c => c.category === 'modes'
    && c.axis?.degree === 4 && c.correctAnswer.endsWith(' Lydian'));

  it('is thirteen cards, one per key', () => {
    expect(lydianCards).toHaveLength(13);
  });

  it('opens each one on its own Lydian root, spelled as the rows spell it', () => {
    const roots = QUADRANT_ROOTS.flat();
    for (const card of lydianCards) {
      const opened = lydianRowsFor(card);
      expect(opened?.openWith, card.id).toBeDefined();
      expect(roots, card.id).toContain(opened!.openWith);
      expect(pitchClassOf(opened!.openWith!), card.id)
        .toBe(pitchClassOf(card.correctAnswer.replace(/ Lydian$/, '')));
    }
    expect(lydianRowsFor(FLASHCARDS.find(c => c.id === 'mo-mode-C-4')!)).toEqual({ openWith: 'F' });
  });

  it('gives the other modes nothing', () => {
    expect(lydianRowsFor(FLASHCARDS.find(c => c.id === 'mo-mode-C-2')!)).toBeNull();
    expect(lydianRowsFor(FLASHCARDS.find(c => c.id === 'fh-4')!)).toBeNull();
  });
});
