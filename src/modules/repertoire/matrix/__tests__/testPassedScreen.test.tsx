// @vitest-environment jsdom
/**
 * The result screen, against the approved copy.
 *
 * =====================================================================
 * THESE ARE COPY TESTS, AND THAT IS THE POINT OF THEM.
 *
 * `docs/WHOLE_SONG_TEST_COPY.md` is the whole of what is approved, and
 * the failure mode it exists to prevent is a placeholder quietly
 * becoming a shipped string. A screenshot cannot catch that and a type
 * cannot either, so the sentences are asserted whole rather than by
 * fragment — a test that checks for "Comfortable" would pass on a
 * sentence nobody wrote.
 *
 * The two OMISSIONS are pinned as hard as the inclusions. "What set
 * it" on a whole-song pass and the Cross-key invitation on a section
 * pass are each wrong in a way that reads as helpful, which is exactly
 * the kind of line that gets added back by someone being thorough.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import TestPassedScreen from '../TestPassedScreen';

function render(node: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  const text = () => (host.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    text,
    buttons: () => [...host.querySelectorAll('button')],
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

const PREVIEW = <div data-testid="row">the matrix row</div>;

const wholeSong = (over: Record<string, unknown> = {}) => (
  <TestPassedScreen
    earned={{ kind: 'whole-song', songTitle: 'No Weapon', status: 'comfortable' }}
    keyName="A♭"
    preview={PREVIEW}
    onClose={() => {}}
    {...over}
  />
);

const section = (lowestFeel: 3 | 4 = 3, band: 'fluent' | 'mastered' = 'fluent') => (
  <TestPassedScreen
    earned={{ kind: 'section', sectionLabel: 'Verse 1', band, lowestFeel }}
    keyName="A♭"
    preview={PREVIEW}
    onClose={() => {}}
  />
);

describe('the headline and the single exit', () => {
  it('says the test is passed, in the approved words', () => {
    // TYPOGRAPHIC APOSTROPHE, and the difference is not a reword. The
    // copy file is plain text and writes a straight quote; every other
    // sentence in this app renders `&rsquo;`, so shipping the straight
    // one would put a different apostrophe on this screen than on the
    // one beside it. The WORDS are the copy file's; the glyph is the
    // app's, the same way the font is.
    const r = render(wholeSong());
    expect(r.text()).toContain('That\u2019s the test passed.');
    r.unmount();
  });

  it('offers exactly ONE exit, named Close And See It', () => {
    // Spec §4 asks for one and means it. A second button would make
    // the user choose between two ways of agreeing with the screen.
    const r = render(wholeSong());
    const labels = r.buttons().map(b => (b.textContent ?? '').trim());
    expect(labels).toEqual(['Close And See It']);
    r.unmount();
  });

  it('draws the caller\'s matrix row under the approved caption', () => {
    // The row is `KeyRow`, passed in. If this screen ever grows its
    // own row renderer there are two things drawing a matrix row and
    // they will disagree.
    const r = render(wholeSong());
    expect(r.text()).toContain('What the matrix says now');
    expect(r.text()).toContain('the matrix row');
    r.unmount();
  });
});

describe('a whole-song pass', () => {
  it('names the song, the status and the key', () => {
    const r = render(wholeSong());
    expect(r.text()).toContain(
      'No Weapon is now at Comfortable status in the key of A♭.',
    );
    r.unmount();
  });

  it('invites Cross-key without turning it into a to-do', () => {
    // The whole sentence, including the tail. "No rush, the song is
    // yours either way" is the half that keeps an invitation from
    // reading as an unfinished task bolted onto a celebration.
    expect(render(wholeSong()).text()).toContain(
      'If you want to take it further, Cross-key is next — this song at '
      + 'Comfortable status in a key from each of the other three quadrants. '
      + 'No rush, the song is yours in the key of A♭ either way.',
    );
  });

  it('DOES NOT say what set it', () => {
    // A whole-song test always lands on Comfortable, so a line
    // explaining which height was chosen explains a choice nobody
    // made. Omitted on purpose, and it reads as a helpful line to add.
    expect(render(wholeSong()).text()).not.toContain('Three in a row.');
    expect(render(wholeSong()).text()).not.toContain('Your lowest was');
  });
});

describe('a section pass', () => {
  it('names the section, the status and the key', () => {
    expect(render(section()).text()).toContain(
      'Verse 1 is now at Fluent status in the key of A♭.',
    );
  });

  it('says what set it, naming the lowest of the three winners', () => {
    expect(render(section(3, 'fluent')).text()).toContain(
      'Three in a row. Your lowest was Clean, so it lands on Fluent.',
    );
  });

  it('reports In flow when all three were In flow', () => {
    expect(render(section(4, 'mastered')).text()).toContain(
      'Three in a row. Your lowest was In flow, so it lands on Mastered.',
    );
  });

  it('DOES NOT invite Cross-key', () => {
    // Cross-key needs other keys, so it is not something one section
    // can be invited toward. Offering it here would promise a rung
    // this test cannot reach.
    expect(render(section()).text()).not.toContain('Cross-key');
  });
});

describe('the session time is NOT shown', () => {
  it('shows no clock, because no words for one were approved', () => {
    // Spec §4 asks for the session time and the copy file has no
    // string for it. Pinned so the omission is a recorded decision
    // rather than something that looks forgotten — and so that filling
    // it in with invented copy fails a test rather than shipping.
    const t = render(wholeSong()).text();
    expect(t).not.toMatch(/\d+:\d\d/);
  });
});
