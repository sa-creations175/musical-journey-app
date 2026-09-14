/**
 * One scroll for "bring the detail panel into view", everywhere.
 *
 * =====================================================================
 * A SOURCE SWEEP, BECAUSE WHAT IT ASSERTS IS AN ABSENCE.
 *
 * The bug was never in one place. `scrollSectionToTop` existed, was
 * correct, and was called by three pages; every other surface kept the
 * bare `scrollIntoView`, which aligns with the top of the scrollport —
 * underneath the sticky header — and stops as soon as the element is
 * visible by its own reckoning. So the same press behaved one way on
 * the scales grid and another way on a module home.
 *
 * "No surface still does it the old way" is a statement about what the
 * code does NOT contain, and rendering proves only the positive case: a
 * new page written next month with the old call would sail past every
 * behavioural test in the repo.
 *
 * SO THE EXCEPTIONS ARE NAMED, WITH REASONS. Each one below is a
 * `scrollIntoView` doing something genuinely different from putting a
 * detail panel at the top of the screen. Adding a file to this list is
 * meant to be a moment of thought, not a formality.
 * =====================================================================
 */
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../../**/*.{ts,tsx}', {
  eager: true, query: '?raw', import: 'default',
}) as Record<string, string>;

/** An actual call, not a mention of one in a comment. */
const CALL = /\.scrollIntoView\s*(\?\.)?\s*\(/;

/**
 * Where `scrollIntoView` is still the right call, and why.
 *
 * None of these is "bring the detail panel into view". If one of them
 * ever becomes that, it should move to `scrollSectionToTop` and leave
 * this list.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'components/settings/SettingsSection.tsx':
    'Inside the Settings MODAL, not the page, and the thing it brings '
    + 'into view is the section a chip just opened — eight down the list, '
    + 'a tap that opened something off-screen looks like a tap that did '
    + 'nothing. The modal body is its own scrollport with its own header, '
    + 'which the app-level helper knows nothing about.',
  'modules/goals/yearlyAnchorDimensions.tsx':
    'Inside a MODAL, not the page. It scrolls within the modal body and '
    + 'clears the modal\'s own header with `scroll-mt-20` — a different '
    + 'container with different chrome, which the app-level helper knows '
    + 'nothing about.',
  'modules/repertoire/SequenceChoices.tsx':
    '`block: "nearest"`, to keep the option you are arrowing through in '
    + 'view inside a scrolling list. Nothing is being put at the top of '
    + 'anything.',
  'modules/repertoire/useScrollHighlight.ts':
    '`block: "center"`, to put a highlighted row in the middle of the '
    + 'screen where the eye is. Centring is the point; the top is not.',
  'modules/repertoire/SongDetailView.tsx':
    'Jumps to the lead sheet on the song page. It is the same FAMILY of '
    + 'problem — it can land under the sticky header too — but it is not '
    + 'a detail panel, it is a walked flow of its own, and converting it '
    + 'was not asked for. Raised in the report as a candidate.',
};

function shortPath(key: string): string {
  return key.replace(/^\.\.\/\.\.\//, '');
}

describe('the app has one scroll for a detail panel', () => {
  it('reads its own source', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(200);
  });

  it('leaves `scrollIntoView` only where it is doing something else', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([key]) => !key.includes('__tests__'))
      .filter(([, src]) => CALL.test(src))
      .map(([key]) => shortPath(key))
      .sort();
    expect(offenders).toEqual(Object.keys(ALLOWED).sort());
  });

  it('gives every exception a reason worth reading', () => {
    for (const [file, why] of Object.entries(ALLOWED)) {
      expect(why.length, file).toBeGreaterThan(40);
    }
  });

  it('has the surfaces that WERE converted reaching the shared scroll', () => {
    // The positive half. A file that stopped calling either one would
    // pass the sweep above and scroll nothing at all.
    //
    // TWO WAYS IN, AND BOTH ARE THE SAME SCROLL. A page that scrolls in
    // response to a navigation calls it directly; a grid that scrolls
    // in response to picking a cell goes through `useSectionScroll`,
    // which defers the same call by one render so the room the panel
    // reserves exists by the time it lands.
    const converted = [
      'components/moduleHome/CategoryDetailStack.tsx',
      'modules/reading/ReadingSkill.tsx',
      'modules/shapes-and-patterns/ShapesAndPatternsSection.tsx',
      // The three that were already right, and must stay right.
      'modules/shapes-and-patterns/ScaleDrills.tsx',
      'modules/shapes-and-patterns/ChordShapeDrills.tsx',
      'modules/shapes-and-patterns/VoiceLeadingDrills.tsx',
      // The verdict, to the top the moment a flashcard is answered.
      'lib/flashcards/FlashcardSession.tsx',
    ];
    for (const file of converted) {
      // The glob keys a file under `lib/` from here, one level up, and
      // everything else from `src/`.
      const src = SOURCES[`../../${file}`] ?? SOURCES[`../${file.replace(/^lib\//, '')}`];
      expect(src, file).toBeTypeOf('string');
      expect(
        src.includes('scrollSectionToTop(') || src.includes('useSectionScroll('),
        file,
      ).toBe(true);
    }
  });

  it('has every grid that picks a cell deferring the scroll by a render', () => {
    // Called in the click handler, the scroll landed before the panel
    // had reserved its room and the browser clamped it — on chord
    // shapes, to no movement at all. See `useSectionScroll`.
    const grids = [
      'modules/shapes-and-patterns/ScaleDrills.tsx',
      'modules/shapes-and-patterns/ChordShapeDrills.tsx',
      'modules/shapes-and-patterns/VoiceLeadingDrills.tsx',
    ];
    for (const file of grids) {
      const src = SOURCES[`../../${file}`];
      expect(src, file).toContain('useSectionScroll(');
      expect(src, `${file} no longer scrolls straight from the handler`)
        .not.toContain('scrollSectionToTop(');
    }
  });
});
