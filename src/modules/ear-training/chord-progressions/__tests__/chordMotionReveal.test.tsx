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
import { degreePalette } from '../../../repertoire/chordColors';
import { ALL_MOTIONS, parseMotionId } from '../chordMotionPool';
import { degreeChips } from '../motionDegrees';
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
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe('the result line, on its own', () => {
  const base = { start: '1', dest: '4' };

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
      .toEqual({ tone: 'wrong', text: 'Not quite. 1 → 4.' });
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
    expect(resultOf(el)).toEqual({ tone: 'wrong', text: 'Not quite. 1 → 4.' });
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
    for (const b of coloured) expect(b.textContent).not.toMatch(/→|·|up|down|perfect/);
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
  it('reads the chromatic chip row as ruled, and the diatonic one unchanged', () => {
    expect(degreeChips(true).map(c => c.text).join(' · '))
      .toBe('1 · ♭2 · 2m · 2ø · ♭3 · 3m · 4 · 4m · ♯4° · 5 · 5m · ♭6 · 6m · ♭7 · 7°');
    expect(degreeChips(false).map(c => c.text).join(' · '))
      .toBe('1 · 2m · 3m · 4 · 5 · 6m · 7°');
  });

  it('keeps every stored id meaning what it meant, and names both halves of a new one', () => {
    const legacy = parseMotionId('motion:1-4-asc')!;
    expect([legacy.destDegree, legacy.destQuality]).toEqual(['4', 'major']);
    const borrowed = parseMotionId('motion:1-4m-asc')!;
    expect([borrowed.destDegree, borrowed.destQuality]).toEqual(['4', 'minor']);
    expect(parseMotionId('motion:1-2m7b5-asc')!.destQuality).toBe('diminished');
    expect(parseMotionId('motion:4m-b7-asc')).not.toBeNull();
    // Guard: a legacy id is not quietly read as the borrowed chord.
    expect(legacy.borrowed).toBe(false);
    expect(borrowed.borrowed).toBe(true);
  });

  it('adds borrowed motions only under Chromatic, and none that keep their root', () => {
    const borrowed = ALL_MOTIONS.filter(m => m.borrowed);
    expect(borrowed.length).toBeGreaterThan(0);
    expect(borrowed.every(m => !m.isDiatonic)).toBe(true);
    expect(ALL_MOTIONS.filter(m => m.isDiatonic)).toHaveLength(42);
    expect(ALL_MOTIONS.some(m => m.startSemi === m.destSemi)).toBe(false);
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
  it('1 → 6m in the key of C: down a minor 3rd, not the pool’s up a 6th', async () => {
    const el = await deal('motion:1-6-asc');
    await click(el, 'motion-start-1');
    await click(el, 'motion-dest-6');
    await click(el, 'motion-submit');
    const verdict = token(el, 'motion-verdict').textContent ?? '';
    expect(token(el, 'verdict-bass-move').textContent).toBe('down a minor 3rd');
    expect(verdict).toContain('1 → 6m · down a minor 3rd · Cmaj7 → Am7');
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
    expect(text).toContain('Ascending');
    expect(text).toContain('1 → 2ø');
    expect(text).toContain('♭2 → 3m');
    expect(text).not.toMatch(/→ \S*m7b5|b\d →|→ b\d/);
  });
});
