// @vitest-environment jsdom
/**
 * A running reading drill can be left.
 *
 * It could not be. Harmonic fluency's drill carries "end session" in
 * the flashcard shell; reading's drill is its own component and had
 * nothing — so the only way out was the nav, which leaves the page as
 * well as the run.
 *
 * The mechanism is what is asserted here: the control the two drills
 * share calls back to the page that started the run. Where it sits on
 * screen is not something jsdom can see.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ReadingDrill from '../ReadingDrill';
import { noteItemRef } from '../catalog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('reading drill — end session', () => {
  it('a served card offers the control, and pressing it calls back', async () => {
    let ended = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <ReadingDrill
          skills={['note']}
          focusRefs={[noteItemRef('treble', 0)]}
          onEnd={() => { ended += 1; }}
          autoStart
        />,
      );
    });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    const end = container.querySelector<HTMLButtonElement>('[data-testid="end-session"]');
    expect(end).not.toBeNull();

    await act(async () => { end!.click(); });
    expect(ended).toBe(1);
  });

  it('an un-started drill offers nothing to end', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<ReadingDrill skills={['note']} onEnd={() => {}} />);
    });
    expect(container.querySelector('[data-testid="end-session"]')).toBeNull();
  });
});
