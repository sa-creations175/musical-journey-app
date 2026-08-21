// @vitest-environment jsdom
/**
 * The song-page guidance copy.
 *
 * Copy tests are worth writing only where a property can actually
 * break. These pin three: every surface answers both questions,
 * nothing is empty, and the copy does not restate rules that are
 * defined elsewhere. That last one is the real risk — a second
 * statement of the stage ladder or the gate would drift silently,
 * and the copy is the half nobody re-reads.
 */
import { describe, expect, it } from 'vitest';
import { SONG_PAGE_GUIDANCE, type SongGuidanceKey } from '../songPageGuidance';

const SURFACES = Object.keys(SONG_PAGE_GUIDANCE) as SongGuidanceKey[];

describe('every surface answers both questions', () => {
  it('covers the three surfaces that carry guidance', () => {
    // Guard the guard: a shrunken record would make every loop below
    // vacuous.
    expect(SURFACES).toEqual(['leadSheet', 'matrix', 'practiceHistory']);
  });

  for (const surface of SURFACES) {
    it(`${surface} says what it is for and how to use it`, () => {
      const groups = SONG_PAGE_GUIDANCE[surface];
      const headings = groups.map(g => g.heading);
      expect(headings).toContain('What this is for');
      expect(headings).toContain('How to use it');
    });

    it(`${surface} has no empty group or blank bullet`, () => {
      for (const group of SONG_PAGE_GUIDANCE[surface]) {
        expect(group.bullets.length).toBeGreaterThan(0);
        for (const b of group.bullets) expect(b.trim().length).toBeGreaterThan(0);
      }
    });
  }
});

describe('the copy does not become a second source', () => {
  const matrixText = SONG_PAGE_GUIDANCE.matrix
    .flatMap(g => g.bullets).join(' ');

  it('the matrix points at learning status rather than naming the stages', () => {
    // Stages are defined in exactly one place — the criteria panel —
    // for the same reason stageCriteria became the single definition
    // of the rules. Asserted positively (it names the panel) AND
    // negatively (it names no rung), because "does not mention
    // cross-key" alone would pass on copy that said nothing at all.
    expect(matrixText).toContain('learning status');
    for (const rung of ['Cross-key', 'Internalized', 'cross-key', 'internalized']) {
      expect(matrixText).not.toContain(rung);
    }
  });

  it('the matrix describes the test as available, not as unlocked', () => {
    // It stopped being gated. Copy describing a gate that no longer
    // exists is worse than no copy: it tells the reader they cannot
    // do something they can.
    //
    // The negative is aimed at the GATE phrasing specifically, not at
    // the word "unlocks" — the log-a-run bullet says it unlocks
    // nothing, which is both true and worth saying. A blanket ban on
    // the word would have failed on correct copy, which is a test
    // failing for a reason other than the one it means.
    expect(matrixText).toContain('available on every key');
    expect(matrixText).not.toContain('the whole-song test unlocks');
    expect(matrixText).not.toContain('When every section in a key is comfortable');
  });

  it('the matrix gets the axes the right way round', () => {
    // Sections are COLUMNS and keys are ROWS. The first draft had it
    // backwards, which inverts what a row means.
    expect(matrixText).toContain('Sections run across the top as columns');
    expect(matrixText).toContain('keys run down the side as rows');
  });

  it('the matrix calls them cells, not squares', () => {
    expect(matrixText).toContain('One cell per section per key');
    expect(matrixText).not.toContain('square');
  });
});

describe('the lead sheet claims only what the app does', () => {
  const leadSheetText = SONG_PAGE_GUIDANCE.leadSheet
    .flatMap(g => g.bullets).join(' ');

  it('points at the notation control, not at tapping a chord', () => {
    // VERIFIED AGAINST THE CODE. Tapping a chord opens the edit
    // choices row (break / new row / hide / note) and shows no
    // function at all — the draft's "tap a chord to see what it's
    // doing in the key" was false. `notationPref` is the real
    // mechanism and it is app-wide, which the copy also says.
    expect(leadSheetText).toContain('Switch **notation**');
    expect(leadSheetText).toContain('across the whole app');
    expect(leadSheetText).not.toContain('Tap a chord');
  });
});
