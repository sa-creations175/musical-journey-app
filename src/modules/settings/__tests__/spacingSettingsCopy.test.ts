/**
 * The screen's wording, pinned.
 *
 * ---------------------------------------------------------------
 * SOURCE, NOT A RENDER. What matters here is which words the file
 * commits to, and rendering the page to read them back would pull in
 * Dexie, the router and the whole settings tree to assert a string.
 * ---------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import source from '../SpacingSettings.tsx?raw';

describe('the fixed vocabulary', () => {
  it('says "comes back in" and never gap, interval or spacing', () => {
    expect(source).toContain('Comes back in');
    // The words that must not appear as a name for the wait. "Spacing"
    // is allowed in the page title and in import paths, so this checks
    // the phrases a label would actually use.
    for (const banned of ['the interval', 'Interval between', 'the gap', 'Gap ']) {
      expect(source, banned).not.toContain(banned);
    }
  });

  it('names the two stages Acquiring and Maintaining', () => {
    expect(source).toContain('Acquiring');
    expect(source).toContain('Maintaining');
  });

  it('reads the tally as "5 over 4 days", never as its day offsets', () => {
    // `acquiringSummary` is the only thing that renders it, and it is
    // built from the counts rather than from `tallyExposureDays`.
    expect(source).toContain('over ${tallyDistinctDays(tally)} days');
    expect(source).not.toContain('tallyExposureDays');
  });

  it('keeps due soon next to grace, as a window before rather than a wait', () => {
    expect(source).toContain('Due soon');
    expect(source).toContain('A window before it is due');
  });

  it('says the warnings never block', () => {
    expect(source).toContain('never block, and never prevent saving');
  });

  it('marks Acquiring inert for songs rather than hiding it', () => {
    expect(source).toContain('Songs do not go through Acquiring');
  });

  it('keeps recalculation separate from normal editing', () => {
    expect(source).toContain('recalculate everything now');
    expect(source).toContain('apply from the next time you answer');
  });
});

describe('the detail panel names its own columns', () => {
  it('heads the multiplier column "Then grows by", not "Comes back in"', () => {
    // The spec's detail panel headed a column of × 1.5 values "Comes
    // back in", disagreeing with its own table. What sits there is the
    // growth multiplier; the first wait has its own field above it.
    // The detail panel's two column headings, as markup — a count of
    // the phrase would also match the paragraph explaining the fix.
    expect(source).toContain('<span className="min-w-[188px] text-right">Then grows by</span>');
    expect(source).not.toContain('<span className="min-w-[96px] text-right">Comes back in</span>');
  });

  it('keeps back-to-start selectable rather than a one-way door', () => {
    expect(source).toContain('back to start');
    expect(source).toContain('multiply by');
    expect(source).toContain('A MODE, NOT A NUMBER, AND IT HAS TO BE REVERSIBLE');
  });

  it('lays the table out fixed so nothing overflows sideways', () => {
    expect(source).toContain('table-fixed');
    expect(source).toContain('<colgroup>');
  });
});
