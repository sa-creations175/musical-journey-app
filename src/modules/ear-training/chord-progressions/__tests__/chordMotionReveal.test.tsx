// @vitest-environment jsdom
/**
 * Chord Motion's reveal, read off the rendered card.
 *
 * THROUGH THE SEAM, NOT BESIDE IT. `motionResult` is a pure function and
 * has its own cases below, but the thing that can go wrong is what the
 * card hands it — a piano tap is a pitch class and has to arrive as a
 * degree, and a start that was given has to arrive as right. So the card
 * is rendered, answered, and the line is read off the screen.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { setPref } from '../../../../lib/userPrefs';
import { motionResult } from '../motionResult';
import { inKeyFill } from '../../../../lib/player/inKeyColour';
import { degreePalette } from '../../../repertoire/chordColors';
import { ALL_MOTIONS, motionId, parseMotionId } from '../chordMotionPool';
import { degreeChips, sameChordAt } from '../motionDegrees';
import { motionChords } from '../motionChords';

// NOTHING SOUNDS. The card plays on arrival; the test is about what it
// says afterwards.
vi.mock('../../../../lib/builtAnswers/play', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/builtAnswers/play')>()),
  // The first step "sounds" at once, so a caller following along by
  // `onStep` is told — which is how the ring follows a chord chip.
  playPanel: vi.fn(async (_c: unknown, _s: unknown, opts?: { onStep?: (i: number) => void }) => {
    opts?.onStep?.(0);
    return { stop() {} };
  }),
}));

const { default: ChordMotionTab } = await import('../ChordMotionTab');
const { InstrumentProvider } = await import('../../../../lib/instrumentContext');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  }
}

/**
 * The card, dealt.
 *
 * ONE MOTION IN FOCUS AND `Math.random` AT ZERO, so the card is 1 → 4 in
 * the key of **C** every time: the pool has one entry and the key is the
 * first of `KEYS`.
 */
async function deal(motion = 'motion:1-4-asc'): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <InstrumentProvider>
        <MemoryRouter>
          <ChordMotionTab attempts={[]} initialFocusKeys={[motion]} />
        </MemoryRouter>
      </InstrumentProvider>,
    );
  });
  await settle();
  await click(container, 'play-motion');
  return container;
}

async function click(el: HTMLElement, testId: string) {
  const b = el.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  if (!b) throw new Error(`no ${testId}`);
  await act(async () => { b.click(); });
  await settle();
}

async function tap(el: HTMLElement, midi: number) {
  // A KEY IS AN SVG RECT, which has no `.click()` of its own.
  const k = el.querySelector(`[data-midi="${midi}"]`);
  if (!k) throw new Error(`no key ${midi}`);
  await act(async () => {
    k.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

function resultOf(el: HTMLElement): { text: string; tone: string } {
  const r = el.querySelector('[data-testid="motion-result"]');
  if (!r) throw new Error('no result line');
  return { text: r.textContent ?? '', tone: r.getAttribute('data-tone') ?? '' };
}

/** The status colour the box is drawn in, by its text class. */
function resultColour(el: HTMLElement): string {
  const cls = el.querySelector('[data-testid="motion-result"]')?.className ?? '';
  return ['developing', 'fluent', 'needswork'].find(c => cls.includes(`text-${c}`)) ?? 'none';
}

beforeEach(async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  await setPref('chordProgressionsMotionAnswerWith', 'degrees');
  await setPref('chordProgressionsMotionStartingNote', 'find');
  await setPref('chordProgressionsMotionNoteContext', 'diatonic');
  await setPref('chordProgressionsMotionDistances', [1, 2, 3, 4, 5, 6, 7]);
  await setPref('chordProgressionsMotionDirections', ['asc', 'desc']);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe('the result line, on its own', () => {
  const base = { start: '1', dest: '4', arrow: '↑' };

  it('says Right. when both halves are', () => {
    expect(motionResult({ ...base, startOk: true, destOk: true, yourStart: '1', yourDest: '4' }))
      .toEqual({ tone: 'right', text: 'Right.' });
  });

  it('names the start when only the start was right', () => {
    expect(motionResult({ ...base, startOk: true, destOk: false, yourStart: '1', yourDest: '5' }))
      .toEqual({
        tone: 'half',
        text: 'Starting chord right (1). It landed on the 4, not the 5.',
      });
  });

  it('names the landing when only the landing was right', () => {
    expect(motionResult({ ...base, startOk: false, destOk: true, yourStart: '3m', yourDest: '4' }))
      .toEqual({
        tone: 'half',
        text: 'Landing right (4). It started on the 1, not the 3m.',
      });
  });

  it('gives the whole move when neither was', () => {
    expect(motionResult({ ...base, startOk: false, destOk: false, yourStart: '2m', yourDest: '5' }))
      .toEqual({ tone: 'wrong', text: 'Not quite. 1 ↑ 4.' });
  });
});

describe('the result line, on the card', () => {
  it('answered in degrees: start right, landing wrong, rated Working on it', async () => {
    const el = await deal();
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-5');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Starting chord right (1). It landed on the 4, not the 5.',
    });
    expect(el.querySelector('[data-testid="motion-feel"]')?.textContent)
      .toBe('Working on it');
    // HALF RIGHT WEARS WORKING ON IT, the colour it rates.
    expect(resultColour(el)).toBe('developing');
  });

  it('answered in degrees: landing right, start wrong, in the chip’s own spelling', async () => {
    const el = await deal();
    await click(el, 'motion-start-3');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    // "3m", the chip — not "3", the degree, and not "E", the letter.
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Landing right (4). It started on the 1, not the 3m.',
    });
  });

  it('answered in degrees: both right is Right.', async () => {
    const el = await deal();
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({ tone: 'right', text: 'Right.' });
    expect(resultColour(el)).toBe('fluent');
  });

  it('answered in degrees: neither, rated Struggled', async () => {
    const el = await deal();
    await click(el, 'motion-start-2');
    await click(el, 'motion-dest-5');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({ tone: 'wrong', text: 'Not quite. 1 ↑ 4.' });
    expect(el.querySelector('[data-testid="motion-feel"]')?.textContent)
      .toBe('Struggled');
    expect(resultColour(el)).toBe('needswork');
  });

  it('answered on the piano: a tapped key is named as a degree, never a letter', async () => {
    const el = await deal();
    await click(el, 'motion-answer-piano');
    // Key of C. Middle C is the 1; the G above it is the 5.
    await tap(el, 60);
    await tap(el, 67);
    const { text, tone } = resultOf(el);
    expect(tone).toBe('half');
    expect(text).toBe('Starting chord right (1). It landed on the 4, not the 5.');
    expect(text).not.toMatch(/\b[A-G]\b/);
  });

  it('answered on the piano: a chromatic tap takes its chromatic chip', async () => {
    const el = await deal();
    await click(el, 'motion-answer-piano');
    // E♭ in the key of C is the ♭3; the F is the 4.
    await tap(el, 63);
    await tap(el, 65);
    expect(resultOf(el).text).toBe('Landing right (4). It started on the 1, not the ♭3.');
  });

  it('a given start is right, so a missed landing is half right', async () => {
    await setPref('chordProgressionsMotionStartingNote', 'given');
    const el = await deal();
    await click(el, 'motion-dest-6');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Starting chord right (1). It landed on the 4, not the 6m.',
    });
  });
});

/** A hex as the DOM reports it back, so the two can be compared. */
function asDom(hex: string): string {
  const probe = document.createElement('b');
  probe.style.color = hex;
  return probe.style.color;
}

function token(el: HTMLElement, testId: string): HTMLElement {
  const t = el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!t) throw new Error(`no ${testId}`);
  return t;
}

describe('the verdict line wears the in-the-key colours', () => {
  it('colours the 1 and its chord green, the 4 and its chord purple', async () => {
    const el = await deal();
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    const green = asDom('#22c55e');
    const purple = asDom('#9333ea');
    // GUARD THE GUARD: the two colours are genuinely different, so a
    // line painted all one colour cannot pass.
    expect(green).not.toBe(purple);

    expect(token(el, 'verdict-start').textContent).toBe('1');
    expect(token(el, 'verdict-start').style.color).toBe(green);
    expect(token(el, 'verdict-start-chord').textContent).toBe('Cmaj7');
    expect(token(el, 'verdict-start-chord').style.color).toBe(green);

    expect(token(el, 'verdict-dest').textContent).toBe('4');
    expect(token(el, 'verdict-dest').style.color).toBe(purple);
    expect(token(el, 'verdict-dest-chord').textContent).toBe('Fmaj7');
    expect(token(el, 'verdict-dest-chord').style.color).toBe(purple);
  });

  it('bolds the four chord tokens and nothing else on the line', async () => {
    const el = await deal();
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    const verdict = token(el, 'motion-verdict');
    const coloured = [...verdict.querySelectorAll<HTMLElement>('[style*="color"]')];
    expect(coloured.map(b => b.tagName)).toEqual(['B', 'B', 'B', 'B']);
    expect(coloured.map(b => b.textContent)).toEqual(['1', '4', 'Cmaj7', 'Fmaj7']);
    // The arrows, the distance and the dots are in none of them.
    for (const b of coloured) expect(b.textContent).not.toMatch(/[→↑↓]|·|up|down|perfect/);
    // The bass climbs C to F: the interval with its quality.
    expect(verdict.textContent).toContain('up a perfect 4th');
  });

  it('gives a flattened degree the darker twin, as the lead sheet does', async () => {
    const el = await deal('motion:1-b7-asc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    const twin = asDom(degreePalette('♭7', false)!.border);
    // Guard: the twin is not the 7's own red.
    expect(twin).not.toBe(asDom('#ef4444'));
    expect(token(el, 'verdict-dest').textContent).toBe('♭7');
    expect(token(el, 'verdict-dest').style.color).toBe(twin);
    expect(token(el, 'verdict-dest-chord').style.color).toBe(twin);
  });
});

describe('the borrowed qualities: 4m, 2ø and 5m', () => {
  it('reads the chromatic chip row as ruled, at the card’s seventh-chord rung', () => {
    // 10 Sep: the diminished family spells by rung, so on this card —
    // seventh chords — the 7 is 7ø, and the ♯4 has two sevenths.
    expect(degreeChips(true).map(c => c.text).join(' · '))
      .toBe('1 · ♭2 · 2m · 2ø · ♭3 · 3m · 4 · 4m · ♯4ø · ♯4°7 · 5 · 5m · ♭6 · 6m · ♭7 · 7ø');
    expect(degreeChips(false).map(c => c.text).join(' · '))
      .toBe('1 · 2m · 3m · 4 · 5 · 6m · 7ø');
  });

  it('keeps every stored id meaning what it meant, and names both halves of a new one', () => {
    const legacy = parseMotionId('motion:1-4-asc')!;
    expect([legacy.destDegree, legacy.destQuality]).toEqual(['4', 'major']);
    const borrowed = parseMotionId('motion:1-4m-asc')!;
    expect([borrowed.destDegree, borrowed.destQuality]).toEqual(['4', 'minor']);
    expect(parseMotionId('motion:1-2m7b5-asc')!.destQuality).toBe('half-dim');
    expect(parseMotionId('motion:4m-b7-asc')).not.toBeNull();
    // Guard: a legacy id is not quietly read as the borrowed chord.
    expect(legacy.borrowed).toBe(false);
    expect(borrowed.borrowed).toBe(true);
  });

  it('adds borrowed motions only under Chromatic, and exactly the three ruled same-root moves', () => {
    const borrowed = ALL_MOTIONS.filter(m => m.borrowed);
    expect(borrowed.length).toBeGreaterThan(0);
    expect(borrowed.every(m => !m.isDiatonic)).toBe(true);
    // 7 × 6 diatonic pairs, both ways.
    expect(ALL_MOTIONS.filter(m => m.isDiatonic)).toHaveLength(84);
    const same = ALL_MOTIONS.filter(m => m.startSemi === m.destSemi);
    expect(same.map(motionId).sort())
      .toEqual(['motion:2-2m7b5-same', 'motion:4-4m-same', 'motion:5-5m-same']);
    expect(same.every(m => m.direction === 'same' && m.distance === 1)).toBe(true);
  });

  it('voices 1 → 4m as a minor chord on the 4', () => {
    // Key of C: the 4m is F minor, so an A♭ sounds and no A does.
    const { chords } = motionChords(0, '1', '4m', 'seventh');
    expect(chords[1].name).toBe('Fm7');
    const pcs = chords[1].hand.map(m => m % 12);
    expect(pcs).toContain(8);
    expect(pcs).not.toContain(9);
  });

  it('answered 4 when it was 4m: half right, rated Working on it', async () => {
    const el = await deal('motion:1-4m-asc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Starting chord right (1). It landed on the 4m, not the 4.',
    });
    expect(el.querySelector('[data-testid="motion-feel"]')?.textContent)
      .toBe('Working on it');
  });

  it('answered 4m when it was 4m: Right., with the 4m chip on offer under focus', async () => {
    // Note context is diatonic (beforeEach); the focus pool is not, so
    // the chip row has to carry the chip that answers it.
    const el = await deal('motion:1-4m-asc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4m');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({ tone: 'right', text: 'Right.' });
  });

  it('on the piano, the 4’s key answers a 4m: a key names a pitch, not a quality', async () => {
    const el = await deal('motion:1-4m-asc');
    await click(el, 'motion-answer-piano');
    await tap(el, 60);
    await tap(el, 65);
    expect(resultOf(el)).toEqual({ tone: 'right', text: 'Right.' });
  });

  it('says the 4m is the 4 of the key, and rings it in the 4’s purple', async () => {
    const el = await deal('motion:1-4m-asc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4m');
    await click(el, 'motion-submit');
    const line = el.querySelector('[data-testid="legend-ring-line"]');
    expect(line?.textContent).toMatch(/this chord is the 4 of the key/);
    expect(line?.textContent).not.toMatch(/4m/);
    const rings = [...el.querySelectorAll('[data-testid^="key-ring-"]')];
    expect(rings.length).toBeGreaterThan(0);
    for (const r of rings) expect(r.getAttribute('stroke')).toBe('#9333ea');
  });
});

describe('the ring follows a chord chip', () => {
  it('tapping the 1 after the reveal drops the 4’s ring and says so', async () => {
    const el = await deal();
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    // Guard: the reveal opens on the 4, ringed.
    expect(el.querySelectorAll('[data-testid^="key-ring-"]').length).toBeGreaterThan(0);
    await click(el, 'hear-one-0');
    // The 1 carries no ring, and the legend says it is home — not
    // "the 4 of the key" left over from the chord before.
    expect(el.querySelectorAll('[data-testid^="key-ring-"]')).toHaveLength(0);
    expect(el.querySelector('[data-testid="legend-home-line"]')).not.toBeNull();
  });
});

describe('the verdict names what the bass did', () => {
  it('1 → 6m down, in the key of C: down a minor 3rd', async () => {
    const el = await deal('motion:1-6-desc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-6');
    await click(el, 'motion-submit');
    const verdict = token(el, 'motion-verdict').textContent ?? '';
    expect(token(el, 'verdict-bass-move').textContent).toBe('down a minor 3rd');
    // THE ARROW IS THE BASS'S: down, so ↓ — on the degrees and the chords.
    expect(verdict).toContain('1 ↓ 6m · down a minor 3rd · Cmaj7 ↓ Am7');
    expect(verdict).not.toContain('up a 6th');
  });
});

describe('the Focus panel names motions as the chips do', () => {
  it('lists 1 → 2ø and ♭2 → 3m, and no raw id', async () => {
    const el = await deal();
    const open = [...el.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Focus on Specific Motions'));
    if (!open) throw new Error('no focus button');
    await act(async () => { open.click(); });
    await settle();
    const text = document.body.textContent ?? '';
    // Guard: the panel is open and listing motions.
    expect(text).toContain('Up');
    expect(text).toContain('1 ↑ 2ø');
    expect(text).toContain('♭2 ↑ 3m');
    expect(text).not.toMatch(/[→↑↓] \S*m7b5|b\d [→↑↓]|[→↑↓] b\d/);
  });
});

describe('same-root moves: 4 → 4m, 5 → 5m, 2m → 2ø', () => {
  it('reads "same root" with no direction and no interval', async () => {
    const el = await deal('motion:4-4m-same');
    await click(el, 'motion-start-4');
    await click(el, 'motion-dest-4m');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({ tone: 'right', text: 'Right.' });
    const verdict = token(el, 'motion-verdict').textContent ?? '';
    expect(verdict).toContain('4 → 4m · same root · Fmaj7 → Fm7');
    expect(verdict).not.toMatch(/\b(up|down)\b|unison|octave/);
    // The ring and legend as for any borrowed chord: the 4 of the key.
    expect(el.querySelector('[data-testid="legend-ring-line"]')?.textContent)
      .toMatch(/this chord is the 4 of the key/);
  });

  it('answered 4 → 4 is half right, and says so', async () => {
    const el = await deal('motion:4-4m-same');
    await click(el, 'motion-start-4');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Starting chord right (4). It landed on the 4m, not the 4.',
    });
  });

  it('puts Same Root first on the Distance row, and neither Direction chip excludes it', async () => {
    await setPref('chordProgressionsMotionNoteContext', 'chromatic');
    await setPref('chordProgressionsMotionDistances', [1]);
    await setPref('chordProgressionsMotionDirections', ['asc']);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <InstrumentProvider><MemoryRouter><ChordMotionTab attempts={[]} /></MemoryRouter></InstrumentProvider>,
      );
    });
    await settle();
    const chips = [...container.querySelectorAll('[data-testid^="motion-dist-"]')]
      .map(c => c.textContent);
    expect(chips.slice(0, 3)).toEqual(['Same Root', '2nd', '3rd']);
    // Up, Same Root, Chromatic: all three same-root moves are in play.
    expect(container.textContent).toContain('ascending · same root · 3 motions');
  });

  it('gives them a section of their own in the Focus panel', async () => {
    const el = await deal();
    const open = [...el.querySelectorAll('button')]
      .find(b => b.textContent?.includes('Focus on Specific Motions'));
    await act(async () => { open!.click(); });
    await settle();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Same Root');
    expect(text).toContain('4 → 4m');
    expect(text).toContain('2m → 2ø');
  });
});

describe('the diminished family spells as Settings says, and the ♯4 has two sevenths', () => {
  const DIM_WORDS = {
    separator: 'hyphen', qualities: 'all', halfDimTriad: 'dim', halfDimSeventh: 'm7♭5',
  } as const;

  it('spells ° / ø by rung, and dim / m7♭5 when Settings says so', () => {
    const at = (s: typeof DIM_WORDS | undefined, rung: 'triads' | 'seventh') =>
      Object.fromEntries(degreeChips(true, s, rung).map(c => [c.label, c.text]));
    expect(at(undefined, 'seventh')).toMatchObject({ '7': '7ø', '2m7b5': '2ø', '#4': '♯4ø', '#4dim7': '♯4°7' });
    expect(at(undefined, 'triads')).toMatchObject({ '7': '7°', '2m7b5': '2°', '#4': '♯4°' });
    expect(at(DIM_WORDS, 'seventh')).toMatchObject({ '7': '7m7♭5', '#4': '♯4m7♭5', '#4dim7': '♯4dim7' });
    expect(at(DIM_WORDS, 'triads')).toMatchObject({ '7': '7dim', '2m7b5': '2dim', '#4': '♯4dim' });
  });

  it('collapses the ♯4’s two sevenths to one chip at Triads, which answers either', () => {
    const triads = degreeChips(true, undefined, 'triads').map(c => c.text);
    expect(triads.filter(t => t.startsWith('♯4'))).toEqual(['♯4°']);
    expect(triads).toHaveLength(15);
    // Guard the guard: at seventh chords they really are two chips.
    expect(degreeChips(true).filter(c => c.text.startsWith('♯4'))).toHaveLength(2);
    expect(sameChordAt('#4', '#4dim7', 'triads')).toBe(true);
    expect(sameChordAt('#4', '#4dim7', 'seventh')).toBe(false);
    // Only the ♯4 collapses: 2m and 2ø stay two chords at Triads.
    expect(sameChordAt('2', '2m7b5', 'triads')).toBe(false);
  });

  it('voices the ♯4°7 as a dim7 — in the key of C, F♯ A C E♭', () => {
    const { chords } = motionChords(0, '1', '#4dim7', 'seventh');
    const pcs = new Set([...chords[1].hand, chords[1].bass!].map(m => m % 12));
    expect(pcs).toEqual(new Set([6, 9, 0, 3]));
    expect(chords[1].name).toMatch(/dim7$/);
    // And the ♯4ø still the m7♭5 it always was: F♯ A C E.
    const half = motionChords(0, '1', '#4', 'seventh').chords[1];
    expect(new Set([...half.hand, half.bass!].map(m => m % 12))).toEqual(new Set([6, 9, 0, 4]));
  });

  it('on the card: ♯4ø answered for a ♯4°7 is half right, and the verdict names the dim7', async () => {
    const el = await deal('motion:1-#4dim7-asc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-#4');
    await click(el, 'motion-submit');
    expect(resultOf(el)).toEqual({
      tone: 'half',
      text: 'Starting chord right (1). It landed on the ♯4°7, not the ♯4ø.',
    });
    expect(token(el, 'verdict-dest').textContent).toBe('♯4°7');
    expect(token(el, 'verdict-dest-chord').textContent).toMatch(/dim7$/);
  });

  it('on the card: follows the spelling setting', async () => {
    await setPref('progressionSpelling', DIM_WORDS);
    const el = await deal('motion:1-7-asc');
    const chipTexts = [...el.querySelectorAll('[data-testid^="motion-dest-"]')]
      .map(c => c.textContent);
    expect(chipTexts).toContain('7m7♭5');
    expect(chipTexts).not.toContain('7°');
    await setPref('progressionSpelling', { ...DIM_WORDS, halfDimTriad: '°', halfDimSeventh: 'ø' });
  });
});

describe('Direction and Distance read the card’s own move', () => {
  async function scope(dirs: string[], dists: number[]): Promise<string> {
    await setPref('chordProgressionsMotionDirections', dirs);
    await setPref('chordProgressionsMotionDistances', dists);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <InstrumentProvider><MemoryRouter><ChordMotionTab attempts={[]} /></MemoryRouter></InstrumentProvider>,
      );
    });
    await settle();
    const text = container.textContent ?? '';
    await act(async () => root!.unmount());
    container.remove();
    root = null;
    container = null;
    return text;
  }

  it('deals up cards under Up and down cards under Down, bucketed by the card’s interval', async () => {
    const diatonic = ALL_MOTIONS.filter(m => m.isDiatonic);
    const upSixths = diatonic.filter(m => m.semitones > 0 && m.distance === 6).length;
    const downSixths = diatonic.filter(m => m.semitones < 0 && m.distance === 6).length;
    // Guard: 1 → 6m up is a 6th and its twin down is a 3rd.
    const find = (id: string) => ALL_MOTIONS.find(m => motionId(m) === id)!;
    expect(find('motion:1-6-asc').distance).toBe(6);
    expect(find('motion:1-6-desc').distance).toBe(3);
    const all = [1, 2, 3, 4, 5, 6, 7];
    expect(await scope(['asc', 'desc'], all)).toContain('84 motions');
    expect(await scope(['asc'], all)).toContain('42 motions');
    expect(await scope(['asc'], [6])).toContain(`${upSixths} motion`);
    expect(await scope(['desc'], [6])).toContain(`${downSixths} motion`);
    // Many-choice: any subset, and the count is the sum of its parts.
    const thirds = diatonic.filter(m => m.distance === 3).length;
    const sixths = diatonic.filter(m => m.distance === 6).length;
    expect(await scope(['asc', 'desc'], [3, 6])).toContain(`${thirds + sixths} motions`);
  });
});

describe('the starter-association line names the move as the verdict does', () => {
  it('says "up a major 2nd", not "a 2th up", and the twin "down a minor 7th"', async () => {
    for (const [id, words] of [
      ['motion:1-2-asc', 'up a major 2nd from the 1 to the 2m'],
      ['motion:1-2-desc', 'down a minor 7th from the 1 to the 2m'],
    ] as const) {
      const el = await deal(id);
      await click(el, 'motion-start-1');
      await click(el, 'motion-dest-2');
      await click(el, 'motion-submit');
      const text = el.textContent ?? '';
      // And the verdict says the same words for the same move.
      expect(token(el, 'verdict-bass-move').textContent).toBe(words.split(' from')[0]);
      expect(text).toContain(words);
      expect(text).not.toMatch(/\d(th|nd|rd) (up|down)/);
      await act(async () => root!.unmount());
      container!.remove();
      root = null;
      container = null;
    }
  });
});

describe('the verdict tokens are pills', () => {
  it('draws all four as one pill: the degree colour on a pale tint of itself', async () => {
    const el = await deal('motion:1-5-asc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-5');
    await click(el, 'motion-submit');
    const ids = ['verdict-start', 'verdict-dest', 'verdict-start-chord', 'verdict-dest-chord'];
    const pills = ids.map(id => token(el, id));
    // All four the same treatment.
    expect(new Set(pills.map(p => p.className)).size).toBe(1);
    expect(pills[0].className).toMatch(/rounded/);
    // The 5 keeps its gold; the pill is a tint of that same gold.
    const gold = '#f59e0b';
    for (const p of [pills[1], pills[3]]) {
      expect(p.style.color).toBe(asDom(gold));
      expect(p.style.backgroundColor).toBe(asDom(`${gold}1A`));
      expect(p.style.borderColor).toBe(asDom(`${gold}4D`));
    }
    // Guard: the tint really is pale, not the colour itself.
    expect(asDom(`${gold}1A`)).not.toBe(asDom(gold));
  });

  it('every degree colour is a six-digit hex, so the tint can be appended', () => {
    for (let semi = 0; semi < 12; semi++) {
      expect(inKeyFill(semi, 0), String(semi)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('Distance and Direction are many-choice rows', () => {
  async function tab(): Promise<HTMLDivElement> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <InstrumentProvider><MemoryRouter><ChordMotionTab attempts={[]} /></MemoryRouter></InstrumentProvider>,
      );
    });
    await settle();
    return container;
  }
  const on = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`)!.getAttribute('aria-pressed') === 'true';

  it('opens with every chip on and no All chip', async () => {
    const el = await tab();
    for (const d of [1, 2, 3, 4, 5, 6, 7]) expect(on(el, `motion-dist-${d}`)).toBe(true);
    expect(on(el, 'motion-dir-asc') && on(el, 'motion-dir-desc')).toBe(true);
    expect(el.querySelector('[data-testid="motion-dist-all"]')).toBeNull();
    expect(el.querySelector('[data-testid="motion-dir-both"]')).toBeNull();
  });

  it('turns chips off one at a time, and never the last one', async () => {
    const el = await tab();
    for (const d of [1, 2, 3, 4, 5, 6]) await click(el, `motion-dist-${d}`);
    // Only 7ths left on; tapping it does nothing.
    await click(el, 'motion-dist-7');
    expect(on(el, 'motion-dist-7')).toBe(true);
    expect([1, 2, 3, 4, 5, 6].some(d => on(el, `motion-dist-${d}`))).toBe(false);
    await click(el, 'motion-dir-asc');
    await click(el, 'motion-dir-desc');
    expect(on(el, 'motion-dir-desc')).toBe(true);
    expect(on(el, 'motion-dir-asc')).toBe(false);
  });

  it('starts from an old single-choice setting when the new one was never saved', async () => {
    await setPref('chordProgressionsMotionDistances', null);
    await setPref('chordProgressionsMotionDirections', null);
    await setPref('chordProgressionsMotionDistance', 3);
    await setPref('chordProgressionsMotionDirection', 'desc');
    const el = await tab();
    expect(on(el, 'motion-dist-3')).toBe(true);
    expect(on(el, 'motion-dist-2')).toBe(false);
    expect(on(el, 'motion-dir-desc') && !on(el, 'motion-dir-asc')).toBe(true);
    await setPref('chordProgressionsMotionDistance', 'all');
    await setPref('chordProgressionsMotionDirection', 'both');
  });
});

describe('the ladder gains Triads', () => {
  it('offers Triads / Guide Tones / Seventh Chords / Full Voicing, opening on Seventh Chords', async () => {
    const el = await deal();
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-4');
    await click(el, 'motion-submit');
    const rungs = [...el.querySelectorAll('[data-testid^="thickness-"]')];
    expect(rungs.map(r => r.getAttribute('data-testid'))).toEqual([
      'thickness-triads', 'thickness-guide', 'thickness-seventh', 'thickness-full',
    ]);
    expect(el.querySelector('[data-testid="thickness-seventh"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('at Triads names the triad, spells the diminished family °, and keeps the result line as answered', async () => {
    const el = await deal('motion:1-#4dim7-asc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-#4');
    await click(el, 'motion-submit');
    const line = 'Starting chord right (1). It landed on the ♯4°7, not the ♯4ø.';
    expect(resultOf(el).text).toBe(line);
    await click(el, 'thickness-triads');
    expect(token(el, 'verdict-dest').textContent).toBe('♯4°');
    expect(token(el, 'verdict-dest-chord').textContent).toBe('F♯°');
    expect(token(el, 'verdict-start-chord').textContent).toBe('C');
    // The answer was given at Seventh Chords, so its line stands.
    expect(resultOf(el).text).toBe(line);
  });

  it('voices a triad at Triads: three chord tones over the bass', () => {
    const { chords } = motionChords(0, '1', '#4dim7', 'triads');
    const pcs = new Set([...chords[1].hand, chords[1].bass!].map(m => m % 12));
    expect(pcs).toEqual(new Set([6, 9, 0]));
    expect(chords[1].name).toBe('F♯°');
    expect(motionChords(0, '1', '#4dim7', 'triads', 'flat', 'asc', 'dim').chords[1].name).toBe('F♯dim');
  });
});

describe('the hand-written starter hints are gone', () => {
  it('shows the plain line where a hint used to be, and keeps what the reader saved', async () => {
    const { db } = await import('../../../../lib/db');
    // A card that carried "the authentic cadence, but leaping up".
    let el = await deal('motion:5-1-asc');
    await click(el, 'motion-start-5');
    await click(el, 'motion-dest-1');
    await click(el, 'motion-submit');
    expect(el.textContent).toContain('up a perfect 4th from the 5 to the 1');
    expect(el.textContent).not.toMatch(/authentic cadence|leaping up|leading tone|plagal/);
    await act(async () => root!.unmount());
    container!.remove();

    // An association the reader has saved on it stays, word for word.
    await db.progressionAssociations.put({
      progressionId: 'motion:5-1-asc', text: 'my own words', updatedAt: Date.now(),
    });
    el = await deal('motion:5-1-asc');
    await click(el, 'motion-start-5');
    await click(el, 'motion-dest-1');
    await click(el, 'motion-submit');
    const saved = [...el.querySelectorAll('textarea')].map(t => (t as HTMLTextAreaElement).value);
    expect(saved).toContain('my own words');
    await db.progressionAssociations.delete('motion:5-1-asc');
  });
});

describe('the arrow on the card', () => {
  it('writes 1 ↑ 5 on the verdict, the starter line and a wrong answer’s line when the bass went up', async () => {
    const el = await deal('motion:1-5-asc');
    await click(el, 'motion-start-2');
    await click(el, 'motion-dest-3');
    await click(el, 'motion-submit');
    expect(resultOf(el).text).toBe('Not quite. 1 ↑ 5.');
    expect(token(el, 'motion-verdict').textContent).toContain('1 ↑ 5 · up a perfect 5th · Cmaj7 ↑ G7');
    expect(el.textContent).toContain('1 ↑ 5 · up a perfect 5th from the 1 to the 5');
    expect(el.textContent).not.toMatch(/[↗↘]/);
  });
});
