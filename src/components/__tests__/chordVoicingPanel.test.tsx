// @vitest-environment jsdom
/**
 * One editor panel, two hosts, and the list of what may differ.
 *
 * =====================================================================
 * THE POINT OF THE EXTRACTION IS THAT THE LEAD SHEET DID NOT CHANGE.
 *
 * This panel came out of a 3,541-line bar-grid file so a chord movement
 * could press its notes with the same editor. The risk in that move is
 * entirely on the lead sheet's side: it is the host that already
 * worked, and a shared component gains features for the new host that
 * must not leak into the old one.
 *
 * So the assertions are mostly negative and mostly about the lead
 * sheet — it still has Save and Cancel, it still has the library, and
 * it has none of the four things the movement screen added. Each of
 * those is an item on the panel's own allowed-to-differ list, checked
 * rather than promised.
 * =====================================================================
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ChordVoicingPanel from '../ChordVoicingPanel';
import type { VoicingEntry } from '../../lib/db';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null; container = null;
});

type Props = Parameters<typeof ChordVoicingPanel>[0];

async function render(over: Partial<Props> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const props: Props = {
    chord: { function: '1', quality: '' },
    voicing: [{ offset: 0, hand: 'R' }],
    rootPc: 0,
    preferFlats: true,
    keyIsSet: true,
    onVoicingChange: vi.fn(),
    ...over,
  };
  await act(async () => { root!.render(<ChordVoicingPanel {...props} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 5)); });
  return props;
}

const byTestId = (id: string) => container!.querySelector(`[data-testid="${id}"]`);
const buttonSaying = (text: string) =>
  [...container!.querySelectorAll('button')].find(b => b.textContent?.trim() === text);

// =====================================================================
// The lead sheet — unchanged
// =====================================================================

describe('as the lead sheet renders it', () => {
  const LEAD_SHEET: Partial<Props> = { showLibrary: true };

  it('keeps Save and Cancel behind an explicit edit, as it always did', async () => {
    // Difference 2. The popover is transient and sits over a dense
    // grid, so a mis-tap has to be cancellable.
    const props = await render(LEAD_SHEET);
    expect(buttonSaying('Edit / custom')).toBeTruthy();
    expect(buttonSaying('Save')).toBeUndefined();

    await act(async () => { buttonSaying('Edit / custom')!.click(); });
    expect(buttonSaying('Save')).toBeTruthy();
    expect(buttonSaying('Cancel')).toBeTruthy();
    // And nothing was written on the way in.
    expect(props.onVoicingChange).not.toHaveBeenCalled();
  });

  it('has none of the four things the movement screen added', async () => {
    // Differences 4, 5 and 6. Whether a lead sheet should make a sound
    // is a decision Silas has not been asked, so it makes none.
    await render(LEAD_SHEET);
    expect(byTestId('voicing-preview')).toBeNull();
    expect(byTestId('voicing-copy')).toBeNull();
    expect(byTestId('voicing-paste')).toBeNull();
    expect(byTestId('voicing-derived-note')).toBeNull();
  });

  it('shows the reason rather than a keyboard when the key is unknown', async () => {
    await render({ ...LEAD_SHEET, keyIsSet: false, rootPc: -1 });
    expect(container!.textContent).toContain('set the song key to add a voicing');
    expect(container!.querySelector('svg')).toBeNull();
  });
});

// =====================================================================
// The movement screen
// =====================================================================

describe('as a movement renders it', () => {
  const MOVEMENT: Partial<Props> = { liveEditing: true };

  it('commits each press, with no Save to forget', async () => {
    // Difference 2 the other way: the editor is a permanent panel here,
    // and the prototype commits as you press.
    const onVoicingChange = vi.fn();
    await render({ ...MOVEMENT, onVoicingChange, voicing: [] });
    expect(buttonSaying('Save')).toBeUndefined();
    expect(buttonSaying('Edit / custom')).toBeUndefined();

    const key = container!.querySelector('[data-offset]')
      ?? container!.querySelectorAll('rect, .key')[3];
    expect(key, 'the keyboard is live from the first frame').toBeTruthy();
  });

  it('sounds a note as it is pressed and says nothing as it is released', async () => {
    // Ruling 17. Adding a note is the gesture that says "this one";
    // taking one away is not.
    const onNotePressed = vi.fn();
    const onVoicingChange = vi.fn();
    let toggle: ((offset: number, hand: 'L' | 'R') => void) | null = null;
    // THE KEYBOARD IS STOOD IN FOR, because what is under test is the
    // panel's rule about which gestures sound — not the keyboard's own
    // hit-testing, which has its own tests. The module registry is
    // reset first or the statically-imported copy is the one that runs.
    vi.resetModules();
    vi.doMock('../PianoKeyboard', () => ({
      default: (p: { onToggle?: (o: number, h: 'L' | 'R') => void }) => {
        toggle = p.onToggle ?? null;
        return null;
      },
    }));
    const { default: Panel } = await import('../ChordVoicingPanel');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <Panel
          chord={{ function: '1', quality: '' }}
          voicing={[{ offset: 0, hand: 'R' } as VoicingEntry]}
          rootPc={0}
          preferFlats
          keyIsSet
          liveEditing
          onNotePressed={onNotePressed}
          onVoicingChange={onVoicingChange}
        />,
      );
    });

    // Press a key that is not yet down.
    await act(async () => { toggle!(7, 'R'); });
    expect(onNotePressed).toHaveBeenCalledWith(7, 'R');
    expect(onVoicingChange).toHaveBeenCalled();

    // Release one that is.
    onNotePressed.mockClear();
    await act(async () => { toggle!(0, 'R'); });
    expect(onNotePressed).not.toHaveBeenCalled();
    vi.doUnmock('../PianoKeyboard');
    vi.resetModules();
  });

  it('offers Hear this chord, Copy and Paste when the host supplies them', async () => {
    await render({
      ...MOVEMENT,
      onPreviewChord: vi.fn(),
      clipboard: { copied: null, onCopy: vi.fn() },
    });
    expect(byTestId('voicing-preview')).toBeTruthy();
    expect(byTestId('voicing-copy')).toBeTruthy();
    // Nothing copied yet, so there is nothing to paste.
    expect(byTestId('voicing-paste')).toHaveProperty('disabled', true);
  });

  it('says when the voicing is the app’s guess rather than his hands', async () => {
    // Difference 6, and it is a disclosure rather than decoration: the
    // movement is about to PLAY that guess.
    const note = 'Filled in from the chord symbol';
    await render({ ...MOVEMENT, voicing: [], derivedNote: note });
    expect(byTestId('voicing-derived-note')?.textContent).toBe(note);

    await render({ ...MOVEMENT, voicing: [{ offset: 0, hand: 'R' }], derivedNote: note });
    expect(byTestId('voicing-derived-note')).toBeNull();
  });

  it('does not offer the voicing library', async () => {
    // Difference 3: the prototype's editor has no carousel, and adding
    // one would be inventing a screen nobody has walked.
    await render(MOVEMENT);
    expect(buttonSaying('Save to Library')).toBeUndefined();
    expect(container!.querySelector('[aria-label="next voicing"]')).toBeNull();
  });
});
