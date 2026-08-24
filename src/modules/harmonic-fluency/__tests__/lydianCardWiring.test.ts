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
  it('is the two Lydian cards, opening on the key each is about', () => {
    const src = codeOf(read('HarmonicFluencySession.tsx'));
    const from = src.indexOf('LYDIAN_CHORD_CARDS');
    const table = src.slice(from, src.indexOf('}', from));
    expect(table).toContain("'mo-15': undefined");
    expect(table).toContain("'mo-3': 'F'");
  });

  it('names cards that actually exist', () => {
    // A footer keyed on an id no card has is a feature that renders
    // nowhere and fails no test.
    const ids = new Set(FLASHCARDS.map(c => c.id));
    expect(ids.has('mo-15')).toBe(true);
    expect(ids.has('mo-3')).toBe(true);
  });

  it('still asks what it asked', () => {
    const byId = new Map(FLASHCARDS.map(c => [c.id, c]));
    expect(byId.get('mo-15')!.correctAnswer).toBe('I maj7#11');
    expect(byId.get('mo-3')!.correctAnswer).toBe('4');
  });
});

describe('the mo-3 explanation names the ♯11', () => {
  const mo3 = () => FLASHCARDS.find(c => c.id === 'mo-3')!;

  it('says which note the raised 4th IS', () => {
    // It used to say "the raised 4th (B natural over an F chord)" and
    // stop — never connecting that B natural to the ♯11 the signature
    // chord is named after. That is the riddle this removes.
    const text = mo3().explanation ?? '';
    expect(text).toContain('♯11');
    expect(text).toContain('Fmaj7♯11');
  });

  it('names both notes it contrasts', () => {
    // F major's 4th is B♭; F Lydian's is B natural. Naming only the
    // second describes a relationship without giving a key to find.
    const text = mo3().explanation ?? '';
    expect(text).toContain('B♭');
    expect(text).toContain('B natural');
  });

  it('uses the app’s glyphs, not ASCII', () => {
    const text = mo3().explanation ?? '';
    expect(text).not.toContain('#11');
    expect(text).not.toContain('Bb');
  });
});
